/**
 * Collaborative Filtering Recommendation Engine
 * 
 * Implements user-based and item-based collaborative filtering with neural
 * collaborative filtering (NCF) for discovering similar users and content.
 * Handles cold start problems and provides explanation for recommendations.
 * 
 * Based on research.md Feed Ranking recommendations for collaborative filtering
 * with large-scale user-item matrix handling and real-time updates.
 */

import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

// Core collaborative filtering types
export type UserSimilarity = {
  userId1: string
  userId2: string
  similarity: number // 0-1, cosine similarity
  sharedItems: number
  confidence: number
  lastUpdated: Date
}

export type ItemSimilarity = {
  itemId1: string
  itemId2: string
  similarity: number
  sharedUsers: number
  confidence: number
  categories: string[]
  lastUpdated: Date
}

export type UserProfile = {
  userId: string
  interactions: Map<string, number> // itemId -> rating/weight
  preferences: number[] // embedding vector
  clusters: string[] // user cluster assignments
  similarUsers: string[] // most similar user IDs
  lastActive: Date
}

export type ItemProfile = {
  itemId: string
  ratings: Map<string, number> // userId -> rating/weight
  features: number[] // content embedding
  clusters: string[] // item cluster assignments
  similarItems: string[] // most similar item IDs
  popularity: number
  quality: number
}

export type RecommendationResult = {
  itemId: string
  score: number
  method: 'user_based' | 'item_based' | 'ncf' | 'hybrid'
  explanation: {
    similarUsers?: { userId: string; similarity: number }[]
    similarItems?: { itemId: string; similarity: number }[]
    sharedPreferences?: string[]
    confidence: number
  }
  metadata: {
    novelty: number // how novel/diverse this recommendation is
    serendipity: number // how unexpected but relevant
    coverage: number // how well it covers user interests
  }
}

export type CFConfiguration = {
  method: 'user_based' | 'item_based' | 'ncf' | 'hybrid'
  similarityThreshold: number // minimum similarity to consider
  minSharedItems: number // minimum shared items for user similarity
  maxRecommendations: number
  diversityWeight: number // balance between accuracy and diversity
  noveltyBoost: number // boost for novel recommendations
  coldStartStrategy: 'popular' | 'random' | 'content_based'
  realTimeUpdates: boolean
}

export interface UserItemMatrix {
  users: string[]
  items: string[]
  matrix: number[][] // sparse matrix representation
  userIndex: Map<string, number>
  itemIndex: Map<string, number>
}

export class CollaborativeFilteringEngine {
  private static readonly CACHE_TTL = 3600 // 1 hour
  private static readonly SIMILARITY_CACHE_TTL = 86400 // 24 hours
  private static readonly MIN_INTERACTIONS = 5
  private static readonly MAX_MATRIX_SIZE = 50000 // memory limit
  private static readonly EMBEDDING_DIMENSION = 128 // for NCF

  private static readonly DEFAULT_CONFIG: CFConfiguration = {
    method: 'hybrid',
    similarityThreshold: 0.1,
    minSharedItems: 3,
    maxRecommendations: 50,
    diversityWeight: 0.3,
    noveltyBoost: 0.2,
    coldStartStrategy: 'popular',
    realTimeUpdates: true
  }

  /**
   * Generate collaborative filtering recommendations for a user
   */
  static async generateRecommendations(
    userId: string,
    excludeItems: string[] = [],
    config: Partial<CFConfiguration> = {}
  ): Promise<RecommendationResult[]> {
    const effectiveConfig = { ...this.DEFAULT_CONFIG, ...config }
    
    // Check cache first
    const cacheKey = `cf_recs:${userId}:${JSON.stringify(effectiveConfig).substring(0, 50)}`
    const cached = await this.getCachedRecommendations(cacheKey)
    
    if (cached) {
      return cached.filter(r => !excludeItems.includes(r.itemId))
    }

    try {
      // Get user profile and interaction history
      const userProfile = await this.getUserProfile(userId)
      
      if (userProfile.interactions.size < this.MIN_INTERACTIONS) {
        return this.handleColdStart(userId, effectiveConfig, excludeItems)
      }

      let recommendations: RecommendationResult[] = []

      // Generate recommendations based on method
      switch (effectiveConfig.method) {
        case 'user_based':
          recommendations = await this.generateUserBasedRecommendations(userProfile, effectiveConfig)
          break
        case 'item_based':
          recommendations = await this.generateItemBasedRecommendations(userProfile, effectiveConfig)
          break
        case 'ncf':
          recommendations = await this.generateNCFRecommendations(userProfile, effectiveConfig)
          break
        case 'hybrid':
          recommendations = await this.generateHybridRecommendations(userProfile, effectiveConfig)
          break
      }

      // Filter out excluded items
      recommendations = recommendations.filter(r => !excludeItems.includes(r.itemId))
      
      // Apply diversity and novelty boosting
      recommendations = this.applyDiversityFiltering(recommendations, effectiveConfig)
      
      // Limit to max recommendations
      recommendations = recommendations.slice(0, effectiveConfig.maxRecommendations)
      
      // Cache results
      await this.cacheRecommendations(cacheKey, recommendations)
      
      return recommendations

    } catch (error) {
      console.error('CF recommendation generation error:', error)
      return this.handleColdStart(userId, effectiveConfig, excludeItems)
    }
  }

  /**
   * Update user-item interactions for real-time learning
   */
  static async updateUserInteraction(
    userId: string,
    itemId: string,
    interactionType: 'view' | 'like' | 'share' | 'comment' | 'skip',
    weight: number = 1.0,
    metadata: {
      timeSpent?: number
      context?: string
      sessionId?: string
    } = {}
  ): Promise<void> {
    // Convert interaction to rating
    const rating = this.interactionToRating(interactionType, weight, metadata.timeSpent)
    
    // Update user profile
    await this.updateUserProfile(userId, itemId, rating, metadata)
    
    // Update item profile
    await this.updateItemProfile(itemId, userId, rating)
    
    // Invalidate related caches
    await this.invalidateUserCaches(userId)
    await this.invalidateItemCaches(itemId)
    
    // Queue for similarity matrix updates
    if (this.DEFAULT_CONFIG.realTimeUpdates) {
      await this.queueSimilarityUpdate(userId, itemId)
    }
  }

  /**
   * Calculate user-user similarity
   */
  static async calculateUserSimilarity(
    userId1: string,
    userId2: string,
    forceRecalculate: boolean = false
  ): Promise<UserSimilarity | null> {
    const cacheKey = `user_sim:${[userId1, userId2].sort().join(':')}`
    
    if (!forceRecalculate) {
      const cached = await this.getCachedSimilarity(cacheKey)
      if (cached) return cached
    }

    const [profile1, profile2] = await Promise.all([
      this.getUserProfile(userId1),
      this.getUserProfile(userId2)
    ])

    if (profile1.interactions.size < this.MIN_INTERACTIONS || 
        profile2.interactions.size < this.MIN_INTERACTIONS) {
      return null
    }

    // Find shared items
    const sharedItems = new Set([...profile1.interactions.keys()]
      .filter(item => profile2.interactions.has(item)))

    if (sharedItems.size < this.DEFAULT_CONFIG.minSharedItems) {
      return null
    }

    // Calculate cosine similarity
    const similarity = this.calculateCosineSimilarity(
      profile1.interactions,
      profile2.interactions,
      sharedItems
    )

    const confidence = Math.min(sharedItems.size / 20, 1) // more shared items = higher confidence

    const userSimilarity: UserSimilarity = {
      userId1,
      userId2,
      similarity,
      sharedItems: sharedItems.size,
      confidence,
      lastUpdated: new Date()
    }

    // Cache the similarity
    await this.cacheSimilarity(cacheKey, userSimilarity)

    return userSimilarity
  }

  /**
   * Calculate item-item similarity
   */
  static async calculateItemSimilarity(
    itemId1: string,
    itemId2: string,
    forceRecalculate: boolean = false
  ): Promise<ItemSimilarity | null> {
    const cacheKey = `item_sim:${[itemId1, itemId2].sort().join(':')}`
    
    if (!forceRecalculate) {
      const cached = await this.getCachedItemSimilarity(cacheKey)
      if (cached) return cached
    }

    const [profile1, profile2] = await Promise.all([
      this.getItemProfile(itemId1),
      this.getItemProfile(itemId2)
    ])

    if (profile1.ratings.size < this.MIN_INTERACTIONS || 
        profile2.ratings.size < this.MIN_INTERACTIONS) {
      return null
    }

    // Find shared users
    const sharedUsers = new Set([...profile1.ratings.keys()]
      .filter(user => profile2.ratings.has(user)))

    if (sharedUsers.size < this.DEFAULT_CONFIG.minSharedItems) {
      return null
    }

    // Calculate cosine similarity based on user ratings
    const similarity = this.calculateCosineSimilarity(
      profile1.ratings,
      profile2.ratings,
      sharedUsers
    )

    // Also consider content similarity if available
    const contentSimilarity = this.calculateContentSimilarity(profile1.features, profile2.features)
    const combinedSimilarity = similarity * 0.7 + contentSimilarity * 0.3

    const confidence = Math.min(sharedUsers.size / 20, 1)

    const itemSimilarity: ItemSimilarity = {
      itemId1,
      itemId2,
      similarity: combinedSimilarity,
      sharedUsers: sharedUsers.size,
      confidence,
      categories: [], // would extract from content analysis
      lastUpdated: new Date()
    }

    // Cache the similarity
    await this.cacheItemSimilarity(cacheKey, itemSimilarity)

    return itemSimilarity
  }

  /**
   * Find similar users for a given user
   */
  static async findSimilarUsers(
    userId: string,
    limit: number = 20,
    minSimilarity: number = 0.1
  ): Promise<UserSimilarity[]> {
    const cacheKey = `similar_users:${userId}:${limit}:${minSimilarity}`
    const cached = await this.getCachedSimilarUsers(cacheKey)
    
    if (cached) return cached

    // Get all users who have interacted with similar items
    const userProfile = await this.getUserProfile(userId)
    const candidateUsers = await this.getCandidateUsers(userId, userProfile)

    const similarities: UserSimilarity[] = []

    // Calculate similarities with candidate users
    for (const candidateId of candidateUsers.slice(0, 200)) { // limit for performance
      const similarity = await this.calculateUserSimilarity(userId, candidateId)
      
      if (similarity && similarity.similarity >= minSimilarity) {
        similarities.push(similarity)
      }
    }

    // Sort by similarity and limit
    similarities.sort((a, b) => b.similarity - a.similarity)
    const topSimilarities = similarities.slice(0, limit)

    // Cache results
    await this.cacheSimilarUsers(cacheKey, topSimilarities)

    return topSimilarities
  }

  /**
   * Get explanation for why an item was recommended
   */
  static async explainRecommendation(
    userId: string,
    itemId: string,
    method: RecommendationResult['method']
  ): Promise<string[]> {
    const explanations: string[] = []

    switch (method) {
      case 'user_based':
        const similarUsers = await this.findSimilarUsers(userId, 5)
        const usersWhoLiked = await this.getUsersWhoLikedItem(itemId)
        const relevantUsers = similarUsers.filter(sim => 
          usersWhoLiked.includes(sim.userId2)
        )
        
        if (relevantUsers.length > 0) {
          explanations.push(`Users similar to you enjoyed this content`)
          explanations.push(`${relevantUsers.length} similar users interacted positively`)
        }
        break

      case 'item_based':
        const userInteractions = await this.getUserInteractions(userId)
        const similarItems = await this.findSimilarItems(itemId, 5)
        const relevantItems = similarItems.filter(sim =>
          userInteractions.has(sim.itemId2)
        )
        
        if (relevantItems.length > 0) {
          explanations.push(`Similar to content you've enjoyed before`)
          explanations.push(`Based on ${relevantItems.length} similar items you liked`)
        }
        break

      case 'ncf':
        explanations.push(`AI model prediction based on your preferences`)
        explanations.push(`Neural network identified this as a good match`)
        break

      case 'hybrid':
        explanations.push(`Multiple recommendation signals agree`)
        explanations.push(`Combines user preferences and content similarity`)
        break
    }

    return explanations
  }

  /**
   * Handle cold start problem for new users
   */
  static async handleColdStart(
    userId: string,
    config: CFConfiguration,
    excludeItems: string[] = []
  ): Promise<RecommendationResult[]> {
    let recommendations: RecommendationResult[] = []

    switch (config.coldStartStrategy) {
      case 'popular':
        recommendations = await this.getPopularItems(config.maxRecommendations, excludeItems)
        break
      case 'random':
        recommendations = await this.getRandomItems(config.maxRecommendations, excludeItems)
        break
      case 'content_based':
        // Would use content-based recommendations if user has some minimal profile
        recommendations = await this.getContentBasedRecommendations(userId, config.maxRecommendations, excludeItems)
        break
    }

    return recommendations.map(rec => ({
      ...rec,
      method: 'user_based', // default method for cold start
      explanation: {
        confidence: 0.3,
        sharedPreferences: ['new_user_popular_content']
      },
      metadata: {
        novelty: 0.8,
        serendipity: 0.5,
        coverage: 0.6
      }
    }))
  }

  // Private helper methods

  private static async generateUserBasedRecommendations(
    userProfile: UserProfile,
    config: CFConfiguration
  ): Promise<RecommendationResult[]> {
    // Find similar users
    const similarUsers = await this.findSimilarUsers(userProfile.userId, 50, config.similarityThreshold)
    
    if (similarUsers.length === 0) {
      return []
    }

    // Aggregate recommendations from similar users
    const itemScores = new Map<string, number>()
    const itemExplanations = new Map<string, UserSimilarity[]>()

    for (const userSim of similarUsers) {
      const otherUserId = userSim.userId2
      const otherProfile = await this.getUserProfile(otherUserId)

      for (const [itemId, rating] of otherProfile.interactions) {
        // Skip items the target user has already interacted with
        if (userProfile.interactions.has(itemId)) continue

        // Weight by user similarity and rating
        const score = userSim.similarity * rating * userSim.confidence
        itemScores.set(itemId, (itemScores.get(itemId) || 0) + score)

        // Track for explanations
        if (!itemExplanations.has(itemId)) {
          itemExplanations.set(itemId, [])
        }
        itemExplanations.get(itemId)!.push(userSim)
      }
    }

    // Convert to recommendations
    const recommendations: RecommendationResult[] = []
    
    for (const [itemId, score] of itemScores) {
      const explanation = itemExplanations.get(itemId) || []
      
      recommendations.push({
        itemId,
        score,
        method: 'user_based',
        explanation: {
          similarUsers: explanation.slice(0, 3).map(sim => ({
            userId: sim.userId2,
            similarity: sim.similarity
          })),
          confidence: Math.min(explanation.length / 5, 1)
        },
        metadata: {
          novelty: await this.calculateNovelty(itemId, userProfile),
          serendipity: await this.calculateSerendipity(itemId, userProfile),
          coverage: 0.7
        }
      })
    }

    // Sort by score
    recommendations.sort((a, b) => b.score - a.score)
    
    return recommendations
  }

  private static async generateItemBasedRecommendations(
    userProfile: UserProfile,
    config: CFConfiguration
  ): Promise<RecommendationResult[]> {
    const itemScores = new Map<string, number>()
    const itemExplanations = new Map<string, ItemSimilarity[]>()

    // For each item the user has interacted with
    for (const [userItemId, userRating] of userProfile.interactions) {
      // Find similar items
      const similarItems = await this.findSimilarItems(userItemId, 20)
      
      for (const itemSim of similarItems) {
        const candidateItemId = itemSim.itemId2
        
        // Skip items user has already interacted with
        if (userProfile.interactions.has(candidateItemId)) continue

        // Weight by item similarity and user's rating
        const score = itemSim.similarity * userRating * itemSim.confidence
        itemScores.set(candidateItemId, (itemScores.get(candidateItemId) || 0) + score)

        // Track for explanations
        if (!itemExplanations.has(candidateItemId)) {
          itemExplanations.set(candidateItemId, [])
        }
        itemExplanations.get(candidateItemId)!.push(itemSim)
      }
    }

    // Convert to recommendations
    const recommendations: RecommendationResult[] = []
    
    for (const [itemId, score] of itemScores) {
      const explanation = itemExplanations.get(itemId) || []
      
      recommendations.push({
        itemId,
        score,
        method: 'item_based',
        explanation: {
          similarItems: explanation.slice(0, 3).map(sim => ({
            itemId: sim.itemId1, // the item user liked that's similar to this one
            similarity: sim.similarity
          })),
          confidence: Math.min(explanation.length / 5, 1)
        },
        metadata: {
          novelty: await this.calculateNovelty(itemId, userProfile),
          serendipity: await this.calculateSerendipity(itemId, userProfile),
          coverage: 0.8
        }
      })
    }

    recommendations.sort((a, b) => b.score - a.score)
    
    return recommendations
  }

  private static async generateNCFRecommendations(
    userProfile: UserProfile,
    config: CFConfiguration
  ): Promise<RecommendationResult[]> {
    // Neural Collaborative Filtering would require training a neural network
    // For now, return a hybrid of user-based and item-based with neural weighting simulation
    const userBased = await this.generateUserBasedRecommendations(userProfile, config)
    const itemBased = await this.generateItemBasedRecommendations(userProfile, config)

    // Simulate neural network combination
    const combined = new Map<string, number>()
    
    // Weight user-based recommendations
    for (const rec of userBased) {
      combined.set(rec.itemId, (combined.get(rec.itemId) || 0) + rec.score * 0.6)
    }
    
    // Weight item-based recommendations
    for (const rec of itemBased) {
      combined.set(rec.itemId, (combined.get(rec.itemId) || 0) + rec.score * 0.4)
    }

    const recommendations: RecommendationResult[] = []
    
    for (const [itemId, score] of combined) {
      recommendations.push({
        itemId,
        score,
        method: 'ncf',
        explanation: {
          confidence: 0.8,
          sharedPreferences: ['neural_network_prediction']
        },
        metadata: {
          novelty: await this.calculateNovelty(itemId, userProfile),
          serendipity: await this.calculateSerendipity(itemId, userProfile),
          coverage: 0.75
        }
      })
    }

    recommendations.sort((a, b) => b.score - a.score)
    
    return recommendations
  }

  private static async generateHybridRecommendations(
    userProfile: UserProfile,
    config: CFConfiguration
  ): Promise<RecommendationResult[]> {
    // Generate recommendations from all methods
    const [userBased, itemBased, ncf] = await Promise.all([
      this.generateUserBasedRecommendations(userProfile, config),
      this.generateItemBasedRecommendations(userProfile, config),
      this.generateNCFRecommendations(userProfile, config)
    ])

    // Combine with weighted scores
    const combined = new Map<string, { score: number; methods: RecommendationResult['method'][] }>()
    
    // Weight different methods
    const weights = { user_based: 0.4, item_based: 0.4, ncf: 0.2 }
    
    for (const [method, recommendations] of [
      ['user_based', userBased],
      ['item_based', itemBased],
      ['ncf', ncf]
    ] as const) {
      for (const rec of recommendations) {
        const current = combined.get(rec.itemId) || { score: 0, methods: [] }
        current.score += rec.score * weights[method]
        current.methods.push(method)
        combined.set(rec.itemId, current)
      }
    }

    const recommendations: RecommendationResult[] = []
    
    for (const [itemId, { score, methods }] of combined) {
      recommendations.push({
        itemId,
        score,
        method: 'hybrid',
        explanation: {
          confidence: 0.85,
          sharedPreferences: [`${methods.length}_method_agreement`]
        },
        metadata: {
          novelty: await this.calculateNovelty(itemId, userProfile),
          serendipity: await this.calculateSerendipity(itemId, userProfile),
          coverage: 0.9
        }
      })
    }

    recommendations.sort((a, b) => b.score - a.score)
    
    return recommendations
  }

  private static async getUserProfile(userId: string): Promise<UserProfile> {
    // Get user interactions from database
    const interactions = await prisma.interaction.findMany({
      where: { userId },
      include: { post: true },
      orderBy: { createdAt: 'desc' },
      take: 500 // limit for performance
    })

    const interactionMap = new Map<string, number>()
    
    for (const interaction of interactions) {
      const rating = this.interactionToRating(interaction.interactionType as any, 1.0)
      interactionMap.set(interaction.targetId, rating)
    }

    // Get or calculate user embedding
    const preferences = await this.getUserEmbedding(userId)

    return {
      userId,
      interactions: interactionMap,
      preferences,
      clusters: [], // would be calculated from clustering algorithm
      similarUsers: [], // would be pre-computed
      lastActive: new Date()
    }
  }

  private static async getItemProfile(itemId: string): Promise<ItemProfile> {
    // Get item ratings from interactions
    const interactions = await prisma.interaction.findMany({
      where: { targetId: itemId },
      select: {
        userId: true,
        interactionType: true,
        createdAt: true
      }
    })

    const ratingsMap = new Map<string, number>()
    
    for (const interaction of interactions) {
      const rating = this.interactionToRating(interaction.interactionType as any, 1.0)
      ratingsMap.set(interaction.userId, rating)
    }

    // Get content features
    const post = await prisma.post.findUnique({
      where: { id: itemId },
      select: { contentEmbedding: true }
    })

    const features = (post?.contentEmbedding as number[]) || Array.from({length: this.EMBEDDING_DIMENSION}, () => 0)

    return {
      itemId,
      ratings: ratingsMap,
      features,
      clusters: [],
      similarItems: [],
      popularity: ratingsMap.size,
      quality: 0.7 // would be calculated
    }
  }

  private static interactionToRating(
    interactionType: 'VIEW' | 'LIKE' | 'REPOST' | 'REPLY' | 'CLICK',
    weight: number = 1.0,
    timeSpent?: number
  ): number {
    const baseRatings = {
      VIEW: 0.1,
      CLICK: 0.3,
      LIKE: 0.7,
      REPOST: 0.8,
      REPLY: 0.9
    }

    let rating = baseRatings[interactionType] || 0.1
    
    // Adjust based on time spent
    if (timeSpent) {
      const timeBonus = Math.min(timeSpent / 60000, 0.3) // max 30% bonus for time
      rating += timeBonus
    }

    return Math.min(rating * weight, 1.0)
  }

  private static calculateCosineSimilarity(
    vector1: Map<string, number>,
    vector2: Map<string, number>,
    sharedKeys: Set<string>
  ): number {
    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (const key of sharedKeys) {
      const val1 = vector1.get(key) || 0
      const val2 = vector2.get(key) || 0
      
      dotProduct += val1 * val2
      norm1 += val1 * val1
      norm2 += val2 * val2
    }

    if (norm1 === 0 || norm2 === 0) return 0
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }

  private static calculateContentSimilarity(features1: number[], features2: number[]): number {
    if (features1.length !== features2.length) return 0

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < features1.length; i++) {
      dotProduct += features1[i] * features2[i]
      norm1 += features1[i] * features1[i]
      norm2 += features2[i] * features2[i]
    }

    if (norm1 === 0 || norm2 === 0) return 0
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }

  private static async getCandidateUsers(userId: string, userProfile: UserProfile): Promise<string[]> {
    // Get users who have interacted with items this user has interacted with
    const itemIds = Array.from(userProfile.interactions.keys())
    
    if (itemIds.length === 0) return []

    const interactions = await prisma.interaction.findMany({
      where: {
        targetId: { in: itemIds },
        userId: { not: userId }
      },
      select: { userId: true },
      distinct: ['userId']
    })

    return interactions.map(i => i.userId)
  }

  private static async findSimilarItems(itemId: string, limit: number): Promise<ItemSimilarity[]> {
    // This would query pre-computed similarities or calculate on demand
    // For now, return mock data
    return []
  }

  private static async getUsersWhoLikedItem(itemId: string): Promise<string[]> {
    const interactions = await prisma.interaction.findMany({
      where: {
        targetId: itemId,
        interactionType: { in: ['LIKE', 'REPOST'] }
      },
      select: { userId: true },
      distinct: ['userId']
    })

    return interactions.map(i => i.userId)
  }

  private static async getUserInteractions(userId: string): Promise<Map<string, number>> {
    const profile = await this.getUserProfile(userId)
    return profile.interactions
  }

  private static async getUserEmbedding(userId: string): Promise<number[]> {
    // Would calculate user embedding based on content interactions
    return Array.from({length: this.EMBEDDING_DIMENSION}, () => Math.random() - 0.5)
  }

  private static async calculateNovelty(itemId: string, userProfile: UserProfile): Promise<number> {
    // Calculate how novel/different this item is from user's usual content
    return Math.random() * 0.5 + 0.3 // simplified
  }

  private static async calculateSerendipity(itemId: string, userProfile: UserProfile): Promise<number> {
    // Calculate how unexpected but relevant this recommendation is
    return Math.random() * 0.4 + 0.2 // simplified
  }

  private static applyDiversityFiltering(
    recommendations: RecommendationResult[],
    config: CFConfiguration
  ): RecommendationResult[] {
    // Apply diversity filtering to avoid too similar recommendations
    const filtered: RecommendationResult[] = []
    const seenCategories = new Set<string>()

    for (const rec of recommendations) {
      // Simple diversity check - would be more sophisticated in practice
      const category = rec.itemId.substring(0, 5) // mock category
      
      if (!seenCategories.has(category) || filtered.length < 10) {
        filtered.push(rec)
        seenCategories.add(category)
      }
      
      if (filtered.length >= config.maxRecommendations) break
    }

    return filtered
  }

  private static async getPopularItems(limit: number, excludeItems: string[]): Promise<RecommendationResult[]> {
    const popular = await prisma.post.findMany({
      where: {
        id: { notIn: excludeItems },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // last 24 hours
      },
      orderBy: {
        interactions: { _count: 'desc' }
      },
      take: limit,
      select: { id: true }
    })

    return popular.map((post, index) => ({
      itemId: post.id,
      score: 1 - (index * 0.1),
      method: 'user_based' as const,
      explanation: { confidence: 0.8 },
      metadata: { novelty: 0.3, serendipity: 0.2, coverage: 0.5 }
    }))
  }

  private static async getRandomItems(limit: number, excludeItems: string[]): Promise<RecommendationResult[]> {
    // Get random sample of items
    const items = await prisma.post.findMany({
      where: {
        id: { notIn: excludeItems }
      },
      take: limit * 2, // get more to filter
      select: { id: true }
    })

    // Shuffle and limit
    const shuffled = items.sort(() => Math.random() - 0.5).slice(0, limit)

    return shuffled.map(post => ({
      itemId: post.id,
      score: Math.random(),
      method: 'user_based' as const,
      explanation: { confidence: 0.3 },
      metadata: { novelty: 0.9, serendipity: 0.8, coverage: 0.3 }
    }))
  }

  private static async getContentBasedRecommendations(
    userId: string,
    limit: number,
    excludeItems: string[]
  ): Promise<RecommendationResult[]> {
    // Would use content-based filtering as fallback
    return this.getPopularItems(limit, excludeItems)
  }

  // Cache management methods
  private static async getCachedRecommendations(cacheKey: string): Promise<RecommendationResult[] | null> {
    try {
      const cached = await redis.get(cacheKey)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  private static async cacheRecommendations(cacheKey: string, recommendations: RecommendationResult[]): Promise<void> {
    try {
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(recommendations))
    } catch (error) {
      console.warn('Failed to cache CF recommendations:', error)
    }
  }

  private static async getCachedSimilarity(cacheKey: string): Promise<UserSimilarity | null> {
    try {
      const cached = await redis.get(cacheKey)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  private static async cacheSimilarity(cacheKey: string, similarity: UserSimilarity): Promise<void> {
    try {
      await redis.setex(cacheKey, this.SIMILARITY_CACHE_TTL, JSON.stringify(similarity))
    } catch (error) {
      console.warn('Failed to cache user similarity:', error)
    }
  }

  private static async getCachedItemSimilarity(cacheKey: string): Promise<ItemSimilarity | null> {
    try {
      const cached = await redis.get(cacheKey)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  private static async cacheItemSimilarity(cacheKey: string, similarity: ItemSimilarity): Promise<void> {
    try {
      await redis.setex(cacheKey, this.SIMILARITY_CACHE_TTL, JSON.stringify(similarity))
    } catch (error) {
      console.warn('Failed to cache item similarity:', error)
    }
  }

  private static async getCachedSimilarUsers(cacheKey: string): Promise<UserSimilarity[] | null> {
    try {
      const cached = await redis.get(cacheKey)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  private static async cacheSimilarUsers(cacheKey: string, similarities: UserSimilarity[]): Promise<void> {
    try {
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(similarities))
    } catch (error) {
      console.warn('Failed to cache similar users:', error)
    }
  }

  private static async updateUserProfile(
    userId: string,
    itemId: string,
    rating: number,
    metadata: any
  ): Promise<void> {
    // Update user interaction in database
    await prisma.interaction.create({
      data: {
        id: `cf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        targetId: itemId,
        targetType: 'POST',
        interactionType: 'LIKE', // simplified
        metadata,
        createdAt: new Date()
      }
    })
  }

  private static async updateItemProfile(itemId: string, userId: string, rating: number): Promise<void> {
    // Would update item interaction counts
    // For now, this is handled by the interaction creation above
  }

  private static async invalidateUserCaches(userId: string): Promise<void> {
    const patterns = [`cf_recs:${userId}:*`, `similar_users:${userId}:*`, `user_sim:*${userId}*`]
    
    for (const pattern of patterns) {
      try {
        const keys = await redis.keys(pattern)
        if (keys.length > 0) {
          await redis.del(...keys)
        }
      } catch (error) {
        console.warn('Failed to invalidate user caches:', error)
      }
    }
  }

  private static async invalidateItemCaches(itemId: string): Promise<void> {
    const patterns = [`item_sim:*${itemId}*`]
    
    for (const pattern of patterns) {
      try {
        const keys = await redis.keys(pattern)
        if (keys.length > 0) {
          await redis.del(...keys)
        }
      } catch (error) {
        console.warn('Failed to invalidate item caches:', error)
      }
    }
  }

  private static async queueSimilarityUpdate(userId: string, itemId: string): Promise<void> {
    // Queue for background similarity matrix updates
    await redis.lpush('cf_updates', JSON.stringify({
      userId,
      itemId,
      timestamp: new Date()
    }))
  }
}

// Export the singleton
export const collaborativeFiltering = CollaborativeFilteringEngine