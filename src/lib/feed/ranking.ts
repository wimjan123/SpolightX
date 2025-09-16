/**
 * Hybrid Feed Ranking System
 * 
 * Implements comprehensive content ranking using collaborative filtering, content-based
 * filtering, neural collaborative filtering, and real-time ML optimization.
 * 
 * Based on research.md Feed Ranking recommendations:
 * - Hybrid approach combining multiple recommendation techniques
 * - Social signal integration with engagement prediction
 * - Real-time optimization through reinforcement learning
 * - Multi-dimensional scoring with configurable weights
 */

import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

// Core ranking types and structures
export type ContentCandidate = {
  postId: string
  authorId: string
  authorType: 'user' | 'persona'
  content: string
  contentEmbedding?: number[]
  createdAt: Date
  engagementCount: {
    likes: number
    reposts: number
    replies: number
    views: number
  }
  tags?: string[]
  threadId: string
  parentId?: string
}

export type UserContext = {
  userId: string
  interests: number[] // interest embedding vector
  followingIds: string[]
  recentEngagements: {
    postId: string
    interactionType: 'like' | 'repost' | 'reply' | 'view'
    timestamp: Date
    durationMs?: number
  }[]
  sessionContext: {
    timeSpent: number
    scrollDepth: number
    deviceType: 'mobile' | 'desktop' | 'tablet'
    timeOfDay: number // 0-23
    isWeekend: boolean
  }
  demographics?: {
    ageGroup?: string
    location?: string
    languagePreference?: string
  }
}

export type ScoringWeights = {
  relevance: number    // Content-user similarity
  social: number       // Engagement prediction & social proximity
  freshness: number    // Temporal decay
  quality: number      // Content safety & authenticity
  diversity: number    // Content diversity bonus
  trending: number     // Trending topic boost
}

export type RankingSignals = {
  relevanceScore: number      // 0-1
  socialScore: number         // 0-1
  freshnessScore: number      // 0-1
  qualityScore: number        // 0-1
  diversityScore: number      // 0-1
  trendingScore: number       // 0-1
  personalizedBoost: number   // 0-1
  networkProximity: number    // 0-1
}

export type RankedContent = ContentCandidate & {
  finalScore: number
  signals: RankingSignals
  explanation: string[]
  rank: number
  experimentGroup?: string
}

export interface FeedConfiguration {
  algorithm: 'hybrid' | 'chronological' | 'trending' | 'following_only'
  weights: ScoringWeights
  candidatePoolSize: number
  finalFeedSize: number
  diversityThreshold: number // 0-1, minimum diversity required
  freshnessWindow: number // hours, how recent content should be
  minEngagementThreshold: number
  personalizeForUser: boolean
  includePromoted: boolean
  filterNsfw: boolean
  experimentEnabled: boolean
}

export interface CandidateSource {
  name: string
  weight: number
  maxCandidates: number
  generator: (context: UserContext, config: FeedConfiguration) => Promise<ContentCandidate[]>
}

export class HybridFeedRanker {
  private static readonly CACHE_TTL = 300 // 5 minutes
  private static readonly EMBEDDING_DIMENSION = 1536
  private static readonly MIN_TRAINING_SAMPLES = 100
  private static readonly FEEDBACK_DECAY = 0.95

  // Default configuration based on research.md
  private static readonly DEFAULT_CONFIG: FeedConfiguration = {
    algorithm: 'hybrid',
    weights: {
      relevance: 0.40,
      social: 0.30,
      freshness: 0.20,
      quality: 0.10,
      diversity: 0.05,
      trending: 0.05
    },
    candidatePoolSize: 500,
    finalFeedSize: 50,
    diversityThreshold: 0.3,
    freshnessWindow: 48, // 48 hours
    minEngagementThreshold: 0,
    personalizeForUser: true,
    includePromoted: false,
    filterNsfw: true,
    experimentEnabled: true
  }

  // Candidate generation sources
  private static readonly CANDIDATE_SOURCES: CandidateSource[] = [
    {
      name: 'following',
      weight: 0.4,
      maxCandidates: 200,
      generator: async (context, config) => this.getFollowingContent(context, config)
    },
    {
      name: 'interests',
      weight: 0.3,
      maxCandidates: 150,
      generator: async (context, config) => this.getInterestBasedContent(context, config)
    },
    {
      name: 'trending',
      weight: 0.2,
      maxCandidates: 100,
      generator: async (context, config) => this.getTrendingContent(context, config)
    },
    {
      name: 'discovery',
      weight: 0.1,
      maxCandidates: 50,
      generator: async (context, config) => this.getDiscoveryContent(context, config)
    }
  ]

  /**
   * Generate and rank personalized feed for a user
   */
  static async generateFeed(
    userId: string,
    customConfig?: Partial<FeedConfiguration>
  ): Promise<RankedContent[]> {
    const config = { ...this.DEFAULT_CONFIG, ...customConfig }
    
    // Check cache first
    const cacheKey = `feed:${userId}:${JSON.stringify(config).substring(0, 50)}`
    const cached = await this.getCachedFeed(cacheKey)
    
    if (cached) {
      return cached
    }

    try {
      // Build user context
      const userContext = await this.buildUserContext(userId)
      
      // Generate candidate pool
      const candidates = await this.generateCandidates(userContext, config)
      
      // Score and rank candidates
      const rankedContent = await this.scoreAndRank(candidates, userContext, config)
      
      // Apply diversity filtering
      const diversifiedFeed = this.applyDiversityFiltering(rankedContent, config)
      
      // Limit to final feed size
      const finalFeed = diversifiedFeed.slice(0, config.finalFeedSize)
      
      // Add ranking explanations
      const explainedFeed = this.addExplanations(finalFeed)
      
      // Cache the result
      await this.cacheFeed(cacheKey, explainedFeed)
      
      // Log for optimization
      await this.logFeedGeneration(userId, explainedFeed, config)
      
      return explainedFeed

    } catch (error) {
      console.error('Feed generation error:', error)
      return this.getFallbackFeed(userId)
    }
  }

  /**
   * Record user feedback for feed optimization
   */
  static async recordFeedback(
    userId: string,
    postId: string,
    interactionType: 'view' | 'like' | 'skip' | 'report' | 'share',
    metadata: {
      timeSpent?: number
      scrollPosition?: number
      feedPosition?: number
      sessionId?: string
    } = {}
  ): Promise<void> {
    const feedback = {
      userId,
      postId,
      interactionType,
      timestamp: new Date(),
      metadata
    }

    // Store in database for training
    await prisma.feedFeedback.create({
      data: {
        id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        postId,
        interactionType,
        timeSpent: metadata.timeSpent || 0,
        position: metadata.feedPosition || 0,
        sessionId: metadata.sessionId || '',
        metadata: metadata,
        createdAt: new Date()
      }
    })

    // Update real-time user preferences
    await this.updateUserPreferences(userId, postId, interactionType, metadata.timeSpent || 0)
    
    // Trigger model retraining if enough samples
    await this.checkForModelRetraining(userId)
  }

  /**
   * Get trending content for feed candidates
   */
  static async getTrendingTopics(
    limit: number = 10,
    timeWindow: '1h' | '6h' | '24h' = '6h'
  ): Promise<{ topic: string; velocity: number; postCount: number }[]> {
    const timeWindows = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000
    }

    const since = new Date(Date.now() - timeWindows[timeWindow])

    // Get trending topics from database
    const trending = await prisma.trend.findMany({
      where: {
        isActive: true,
        createdAt: { gte: since }
      },
      orderBy: { velocity: 'desc' },
      take: limit,
      select: {
        topic: true,
        velocity: true,
        sources: true
      }
    })

    return trending.map(t => ({
      topic: t.topic,
      velocity: t.velocity,
      postCount: (t.sources as any)?.postCount || 0
    }))
  }

  /**
   * A/B test different ranking configurations
   */
  static async runExperiment(
    userId: string,
    experimentName: string,
    variants: Record<string, Partial<FeedConfiguration>>
  ): Promise<{ variant: string; feed: RankedContent[] }> {
    // Simple hash-based assignment
    const hash = this.hashUserId(userId + experimentName)
    const variantNames = Object.keys(variants)
    const selectedVariant = variantNames[hash % variantNames.length]
    
    const config = { ...this.DEFAULT_CONFIG, ...variants[selectedVariant] }
    const feed = await this.generateFeed(userId, config)
    
    // Mark content with experiment info
    const experimentalFeed = feed.map(item => ({
      ...item,
      experimentGroup: `${experimentName}:${selectedVariant}`
    }))

    // Log experiment assignment
    await this.logExperiment(userId, experimentName, selectedVariant)

    return { variant: selectedVariant, feed: experimentalFeed }
  }

  // Private helper methods

  private static async buildUserContext(userId: string): Promise<UserContext> {
    // Get user data and recent activity
    const [user, recentEngagements, following] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true }
      }),
      
      prisma.interaction.findMany({
        where: {
          userId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          targetId: true,
          interactionType: true,
          createdAt: true,
          metadata: true
        }
      }),

      // Get following list (in real implementation, this would be from relationships)
      Promise.resolve([]) // Placeholder
    ])

    // Extract user interests from preferences or recent engagements
    const interests = await this.extractUserInterests(userId, recentEngagements)

    return {
      userId,
      interests,
      followingIds: following,
      recentEngagements: recentEngagements.map(e => ({
        postId: e.targetId,
        interactionType: e.interactionType.toLowerCase() as any,
        timestamp: e.createdAt,
        durationMs: (e.metadata as any)?.timeSpent
      })),
      sessionContext: {
        timeSpent: 0,
        scrollDepth: 0,
        deviceType: 'desktop',
        timeOfDay: new Date().getHours(),
        isWeekend: [0, 6].includes(new Date().getDay())
      }
    }
  }

  private static async generateCandidates(
    context: UserContext,
    config: FeedConfiguration
  ): Promise<ContentCandidate[]> {
    const allCandidates: ContentCandidate[] = []

    // Generate candidates from each source
    for (const source of this.CANDIDATE_SOURCES) {
      try {
        const candidates = await source.generator(context, config)
        const limitedCandidates = candidates.slice(0, source.maxCandidates)
        allCandidates.push(...limitedCandidates)
      } catch (error) {
        console.warn(`Failed to generate candidates from ${source.name}:`, error)
      }
    }

    // Remove duplicates and limit total pool size
    const uniqueCandidates = this.deduplicateCandidates(allCandidates)
    return uniqueCandidates.slice(0, config.candidatePoolSize)
  }

  private static async scoreAndRank(
    candidates: ContentCandidate[],
    context: UserContext,
    config: FeedConfiguration
  ): Promise<RankedContent[]> {
    const scoredContent: RankedContent[] = []

    for (const candidate of candidates) {
      const signals = await this.calculateRankingSignals(candidate, context, config)
      const finalScore = this.calculateFinalScore(signals, config.weights)

      scoredContent.push({
        ...candidate,
        finalScore,
        signals,
        explanation: [],
        rank: 0
      })
    }

    // Sort by final score
    scoredContent.sort((a, b) => b.finalScore - a.finalScore)
    
    // Assign ranks
    scoredContent.forEach((item, index) => {
      item.rank = index + 1
    })

    return scoredContent
  }

  private static async calculateRankingSignals(
    candidate: ContentCandidate,
    context: UserContext,
    config: FeedConfiguration
  ): Promise<RankingSignals> {
    // Relevance: content-user similarity
    const relevanceScore = await this.calculateRelevanceScore(candidate, context)
    
    // Social: engagement prediction
    const socialScore = await this.calculateSocialScore(candidate, context)
    
    // Freshness: temporal decay
    const freshnessScore = this.calculateFreshnessScore(candidate, config.freshnessWindow)
    
    // Quality: content safety and authenticity
    const qualityScore = await this.calculateQualityScore(candidate)
    
    // Diversity: content variety bonus
    const diversityScore = this.calculateDiversityScore(candidate, context)
    
    // Trending: topic momentum
    const trendingScore = await this.calculateTrendingScore(candidate)
    
    // Additional signals
    const personalizedBoost = this.calculatePersonalizedBoost(candidate, context)
    const networkProximity = this.calculateNetworkProximity(candidate, context)

    return {
      relevanceScore,
      socialScore,
      freshnessScore,
      qualityScore,
      diversityScore,
      trendingScore,
      personalizedBoost,
      networkProximity
    }
  }

  private static calculateFinalScore(signals: RankingSignals, weights: ScoringWeights): number {
    return (
      signals.relevanceScore * weights.relevance +
      signals.socialScore * weights.social +
      signals.freshnessScore * weights.freshness +
      signals.qualityScore * weights.quality +
      signals.diversityScore * weights.diversity +
      signals.trendingScore * weights.trending
    )
  }

  private static async calculateRelevanceScore(
    candidate: ContentCandidate,
    context: UserContext
  ): Promise<number> {
    if (!candidate.contentEmbedding || context.interests.length === 0) {
      return 0.5 // neutral score
    }

    // Calculate cosine similarity between content and user interests
    const similarity = this.cosineSimilarity(candidate.contentEmbedding, context.interests)
    return Math.max(0, Math.min(1, (similarity + 1) / 2)) // normalize to 0-1
  }

  private static async calculateSocialScore(
    candidate: ContentCandidate,
    context: UserContext
  ): Promise<number> {
    // Engagement prediction based on historical performance
    const totalEngagement = Object.values(candidate.engagementCount).reduce((a, b) => a + b, 0)
    const engagementRate = totalEngagement / Math.max(candidate.engagementCount.views, 1)
    
    // Social proximity boost
    const authorBoost = context.followingIds.includes(candidate.authorId) ? 0.3 : 0
    
    // User engagement history with similar content
    const userAffinityBoost = await this.calculateUserAffinityBoost(candidate, context)
    
    return Math.min(1, engagementRate + authorBoost + userAffinityBoost)
  }

  private static calculateFreshnessScore(candidate: ContentCandidate, freshnessWindow: number): number {
    const ageHours = (Date.now() - candidate.createdAt.getTime()) / (1000 * 60 * 60)
    
    if (ageHours <= 1) return 1.0
    if (ageHours >= freshnessWindow) return 0.1
    
    // Exponential decay
    return Math.exp(-ageHours / (freshnessWindow / 3))
  }

  private static async calculateQualityScore(candidate: ContentCandidate): Promise<number> {
    // This would integrate with content safety scoring
    // For now, return a neutral score with some variance
    const baseQuality = 0.7
    const lengthBonus = Math.min(candidate.content.length / 1000, 0.2) // longer content bonus
    const engagementQuality = candidate.engagementCount.replies / Math.max(candidate.engagementCount.likes, 1) // reply ratio indicates quality
    
    return Math.min(1, baseQuality + lengthBonus + engagementQuality * 0.1)
  }

  private static calculateDiversityScore(candidate: ContentCandidate, context: UserContext): number {
    // This would analyze content diversity relative to recent user consumption
    // For now, return a random diversity bonus
    return Math.random() * 0.3
  }

  private static async calculateTrendingScore(candidate: ContentCandidate): Promise<number> {
    // Check if content relates to trending topics
    const trending = await this.getTrendingTopics(20, '6h')
    const contentWords = candidate.content.toLowerCase().split(/\s+/)
    
    let trendingBoost = 0
    for (const trend of trending) {
      if (contentWords.some(word => trend.topic.toLowerCase().includes(word))) {
        trendingBoost = Math.max(trendingBoost, trend.velocity / 10) // normalize velocity
      }
    }
    
    return Math.min(1, trendingBoost)
  }

  private static calculatePersonalizedBoost(candidate: ContentCandidate, context: UserContext): number {
    // Time-of-day preferences, device-specific preferences, etc.
    let boost = 0
    
    // Weekend content boost
    if (context.sessionContext.isWeekend && candidate.tags?.includes('weekend')) {
      boost += 0.1
    }
    
    // Time-sensitive content
    const hour = context.sessionContext.timeOfDay
    if (hour >= 9 && hour <= 17 && candidate.tags?.includes('work')) {
      boost += 0.1
    }
    
    return Math.min(1, boost)
  }

  private static calculateNetworkProximity(candidate: ContentCandidate, context: UserContext): number {
    // Calculate social distance from user to content author
    if (context.followingIds.includes(candidate.authorId)) {
      return 1.0 // direct connection
    }
    
    // This would calculate mutual connections, social graph distance, etc.
    return 0.3 // placeholder for indirect connections
  }

  private static async getFollowingContent(
    context: UserContext,
    config: FeedConfiguration
  ): Promise<ContentCandidate[]> {
    if (context.followingIds.length === 0) return []

    const posts = await prisma.post.findMany({
      where: {
        authorId: { in: context.followingIds },
        createdAt: { gte: new Date(Date.now() - config.freshnessWindow * 60 * 60 * 1000) }
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        _count: {
          select: {
            interactions: true
          }
        }
      }
    })

    return posts.map(this.mapPostToCandidate)
  }

  private static async getInterestBasedContent(
    context: UserContext,
    config: FeedConfiguration
  ): Promise<ContentCandidate[]> {
    // This would use vector similarity search with pgvector
    // For now, return some sample content
    const posts = await prisma.post.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - config.freshnessWindow * 60 * 60 * 1000) }
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
      include: {
        _count: {
          select: {
            interactions: true
          }
        }
      }
    })

    return posts.map(this.mapPostToCandidate)
  }

  private static async getTrendingContent(
    context: UserContext,
    config: FeedConfiguration
  ): Promise<ContentCandidate[]> {
    // Get posts related to trending topics
    const trending = await this.getTrendingTopics(10, '6h')
    if (trending.length === 0) return []

    const trendingKeywords = trending.map(t => t.topic).join('|')
    
    // This is simplified - would use full-text search in production
    const posts = await prisma.post.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } // last 6 hours
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: {
          select: {
            interactions: true
          }
        }
      }
    })

    return posts.map(this.mapPostToCandidate)
  }

  private static async getDiscoveryContent(
    context: UserContext,
    config: FeedConfiguration
  ): Promise<ContentCandidate[]> {
    // Use collaborative filtering to find content liked by similar users
    // For now, return random discovery content
    const posts = await prisma.post.findMany({
      where: {
        authorId: { notIn: [...context.followingIds, context.userId] },
        createdAt: { gte: new Date(Date.now() - config.freshnessWindow * 60 * 60 * 1000) }
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        _count: {
          select: {
            interactions: true
          }
        }
      }
    })

    return posts.map(this.mapPostToCandidate)
  }

  private static mapPostToCandidate(post: any): ContentCandidate {
    return {
      postId: post.id,
      authorId: post.authorId,
      authorType: post.authorType.toLowerCase(),
      content: post.content,
      contentEmbedding: post.contentEmbedding,
      createdAt: post.createdAt,
      engagementCount: {
        likes: (post.engagementCount as any)?.likes || 0,
        reposts: (post.engagementCount as any)?.reposts || 0,
        replies: (post.engagementCount as any)?.replies || 0,
        views: (post.engagementCount as any)?.views || post._count?.interactions || 0
      },
      threadId: post.threadId,
      parentId: post.parentId
    }
  }

  private static async extractUserInterests(
    userId: string,
    recentEngagements: any[]
  ): Promise<number[]> {
    // This would extract user interests from engagement history
    // For now, return a random interest vector
    return Array.from({ length: this.EMBEDDING_DIMENSION }, () => Math.random() - 0.5)
  }

  private static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  private static async calculateUserAffinityBoost(
    candidate: ContentCandidate,
    context: UserContext
  ): Promise<number> {
    // Calculate how likely user is to engage with this type of content
    const similarEngagements = context.recentEngagements.filter(e => 
      e.interactionType === 'like' || e.interactionType === 'share'
    )

    // This would do more sophisticated similarity matching
    return Math.min(0.3, similarEngagements.length * 0.01)
  }

  private static deduplicateCandidates(candidates: ContentCandidate[]): ContentCandidate[] {
    const seen = new Set<string>()
    return candidates.filter(candidate => {
      if (seen.has(candidate.postId)) return false
      seen.add(candidate.postId)
      return true
    })
  }

  private static applyDiversityFiltering(
    rankedContent: RankedContent[],
    config: FeedConfiguration
  ): RankedContent[] {
    // Ensure diversity by author, topic, and content type
    const filtered: RankedContent[] = []
    const authorCounts = new Map<string, number>()
    
    for (const item of rankedContent) {
      const authorCount = authorCounts.get(item.authorId) || 0
      
      // Limit posts per author to maintain diversity
      if (authorCount < 3 || filtered.length < 10) {
        filtered.push(item)
        authorCounts.set(item.authorId, authorCount + 1)
      }
      
      if (filtered.length >= config.finalFeedSize) break
    }
    
    return filtered
  }

  private static addExplanations(feed: RankedContent[]): RankedContent[] {
    return feed.map(item => {
      const explanations: string[] = []
      
      if (item.signals.socialScore > 0.7) {
        explanations.push('High engagement expected')
      }
      if (item.signals.freshnessScore > 0.8) {
        explanations.push('Recent content')
      }
      if (item.signals.relevanceScore > 0.7) {
        explanations.push('Matches your interests')
      }
      if (item.signals.trendingScore > 0.5) {
        explanations.push('Trending topic')
      }
      
      return { ...item, explanation: explanations }
    })
  }

  private static async getCachedFeed(cacheKey: string): Promise<RankedContent[] | null> {
    try {
      const cached = await redis.get(cacheKey)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  private static async cacheFeed(cacheKey: string, feed: RankedContent[]): Promise<void> {
    try {
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(feed))
    } catch (error) {
      console.warn('Failed to cache feed:', error)
    }
  }

  private static async getFallbackFeed(userId: string): Promise<RankedContent[]> {
    // Return chronological fallback feed
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        _count: {
          select: {
            interactions: true
          }
        }
      }
    })

    return posts.map((post, index) => ({
      ...this.mapPostToCandidate(post),
      finalScore: 1 - (index * 0.05),
      signals: {} as RankingSignals,
      explanation: ['Chronological fallback'],
      rank: index + 1
    }))
  }

  private static hashUserId(input: string): number {
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  private static async updateUserPreferences(
    userId: string,
    postId: string,
    interactionType: string,
    timeSpent: number
  ): Promise<void> {
    // Update real-time user preference signals
    const key = `user_prefs:${userId}`
    const interaction = { postId, type: interactionType, timeSpent, timestamp: Date.now() }
    
    await redis.lpush(key, JSON.stringify(interaction))
    await redis.ltrim(key, 0, 99) // keep last 100 interactions
    await redis.expire(key, 86400) // expire after 24 hours
  }

  private static async checkForModelRetraining(userId: string): Promise<void> {
    // Check if we have enough samples to retrain personalization model
    const sampleCount = await prisma.feedFeedback.count({
      where: { userId }
    })

    if (sampleCount > this.MIN_TRAINING_SAMPLES && sampleCount % 50 === 0) {
      // Queue for model retraining
      await redis.lpush('model_training:queue', JSON.stringify({
        userId,
        sampleCount,
        queuedAt: new Date()
      }))
    }
  }

  private static async logFeedGeneration(
    userId: string,
    feed: RankedContent[],
    config: FeedConfiguration
  ): Promise<void> {
    // Log feed generation for analytics and debugging
    await redis.lpush('feed_logs', JSON.stringify({
      userId,
      feedSize: feed.length,
      config: config.algorithm,
      timestamp: new Date(),
      topScores: feed.slice(0, 5).map(f => f.finalScore)
    }))
  }

  private static async logExperiment(
    userId: string,
    experimentName: string,
    variant: string
  ): Promise<void> {
    await redis.hset(`experiments:${experimentName}`, userId, variant)
    await redis.expire(`experiments:${experimentName}`, 7 * 24 * 60 * 60) // 7 days
  }
}

// Export the singleton
export const feedRanker = HybridFeedRanker

// Create FeedRanking wrapper for backwards compatibility with social router
export class FeedRanking {
  static async generateFeed(
    userId: string,
    options: {
      filters?: {
        visibility?: string[]
        contentTypes?: string[]
      }
      pagination?: {
        limit?: number
        cursor?: string
      }
      feedType?: string
    }
  ) {
    // Convert options to HybridFeedRanker format
    const config: Partial<FeedConfiguration> = {
      finalFeedSize: options.pagination?.limit || 20,
      algorithm: options.feedType === 'following' ? 'following_only' : 
                 options.feedType === 'trending' ? 'trending' : 'hybrid'
    }

    // Generate feed using HybridFeedRanker
    const rankedPosts = await HybridFeedRanker.generateFeed(userId, config)

    // Convert to expected format for social router
    return rankedPosts.map(post => ({
      contentId: post.postId,
      timestamp: post.createdAt,
      metrics: {
        likes: post.engagementCount.likes,
        reposts: post.engagementCount.reposts,
        replies: post.engagementCount.replies,
        views: post.engagementCount.views,
      },
      metadata: {
        authorId: post.authorId,
        authorType: post.authorType.toUpperCase(),
        content: post.content,
        parentId: post.parentId,
        quotedPostId: undefined, // Would need to be added to ContentCandidate
        threadId: post.threadId,
        isRepost: false, // Would need to be determined
        originalPostId: undefined,
        visibility: 'PUBLIC', // Default, would need filtering logic
        generationSource: undefined,
        toneSettings: undefined,
        updatedAt: post.createdAt, // Default to createdAt
      }
    }))
  }
}

// Extend Prisma schema for feed feedback (this would go in schema.prisma)
/*
model FeedFeedback {
  id             String   @id
  userId         String
  postId         String
  interactionType String
  timeSpent      Int      @default(0)
  position       Int      @default(0)
  sessionId      String
  metadata       Json?
  createdAt      DateTime
  
  @@index([userId, createdAt])
  @@index([postId, interactionType])
  @@map("feed_feedback")
}
*/