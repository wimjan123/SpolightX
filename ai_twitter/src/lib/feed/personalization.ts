/**
 * Feed Personalization System
 * 
 * Implements user interest modeling and preference learning with dynamic
 * adaptation, behavioral pattern recognition, and multi-dimensional preference
 * tracking for enhanced feed personalization.
 * 
 * Based on research.md Feed Ranking recommendations for personalization
 * layer with real-time learning and user behavior adaptation.
 */

import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

// Core personalization types
export type InterestCategory = 
  | 'technology'
  | 'politics'
  | 'sports'
  | 'entertainment'
  | 'business'
  | 'science'
  | 'health'
  | 'lifestyle'
  | 'travel'
  | 'food'
  | 'education'
  | 'art'
  | 'music'
  | 'gaming'
  | 'news'

export type PreferenceSignal = {
  type: 'explicit' | 'implicit' | 'inferred'
  strength: number // 0-1
  confidence: number // 0-1
  timestamp: Date
  source: string
  decay: number // rate at which this signal loses relevance
}

export type UserInterest = {
  category: InterestCategory
  keywords: string[]
  embedding: number[]
  signals: PreferenceSignal[]
  score: number // aggregated interest score 0-1
  trend: 'increasing' | 'decreasing' | 'stable'
  lastUpdated: Date
}

export type BehavioralPattern = {
  pattern: string
  frequency: number
  contexts: string[]
  predictive_value: number
  examples: {
    timestamp: Date
    action: string
    context: any
  }[]
}

export type PersonalizationProfile = {
  userId: string
  interests: UserInterest[]
  behavioralPatterns: BehavioralPattern[]
  preferences: {
    contentTypes: Record<string, number> // preference scores
    authorTypes: Record<string, number>
    timePreferences: Record<string, number> // hourly preferences
    devicePreferences: Record<string, number>
    engagementStyle: {
      likesToRead: boolean
      likesToEngage: boolean
      prefersShortContent: boolean
      prefersVisualContent: boolean
    }
  }
  temporalFactors: {
    weekdayPreferences: number[] // 7 values for each day
    hourlyPreferences: number[] // 24 values for each hour
    seasonalAdjustments: Record<string, number>
  }
  socialFactors: {
    influenceability: number // how much social signals affect preferences
    trendFollowing: number // tendency to engage with trending content
    networkAlignment: number // alignment with social network preferences
  }
  modelMetadata: {
    version: string
    lastTraining: Date
    sampleSize: number
    accuracy: number
    nextUpdate: Date
  }
}

export type ContentRecommendation = {
  contentId: string
  personalizationScore: number
  reasoning: {
    matchedInterests: string[]
    behavioralMatches: string[]
    temporalRelevance: number
    socialRelevance: number
  }
  confidence: number
  adaptations: {
    timeOfDay: number
    deviceOptimization: number
    socialContext: number
  }
}

export class FeedPersonalizationEngine {
  private static readonly CACHE_TTL = 1800 // 30 minutes
  private static readonly INTEREST_DECAY_RATE = 0.95 // daily
  private static readonly LEARNING_RATE = 0.1
  private static readonly MIN_SAMPLES_FOR_PATTERN = 5
  private static readonly EMBEDDING_DIMENSION = 1536

  // Interest category embeddings (would be pre-computed)
  private static readonly CATEGORY_EMBEDDINGS: Record<InterestCategory, number[]> = {
    technology: Array.from({length: 1536}, () => Math.random() - 0.5),
    politics: Array.from({length: 1536}, () => Math.random() - 0.5),
    sports: Array.from({length: 1536}, () => Math.random() - 0.5),
    entertainment: Array.from({length: 1536}, () => Math.random() - 0.5),
    business: Array.from({length: 1536}, () => Math.random() - 0.5),
    science: Array.from({length: 1536}, () => Math.random() - 0.5),
    health: Array.from({length: 1536}, () => Math.random() - 0.5),
    lifestyle: Array.from({length: 1536}, () => Math.random() - 0.5),
    travel: Array.from({length: 1536}, () => Math.random() - 0.5),
    food: Array.from({length: 1536}, () => Math.random() - 0.5),
    education: Array.from({length: 1536}, () => Math.random() - 0.5),
    art: Array.from({length: 1536}, () => Math.random() - 0.5),
    music: Array.from({length: 1536}, () => Math.random() - 0.5),
    gaming: Array.from({length: 1536}, () => Math.random() - 0.5),
    news: Array.from({length: 1536}, () => Math.random() - 0.5)
  }

  /**
   * Get or create personalization profile for a user
   */
  static async getPersonalizationProfile(userId: string): Promise<PersonalizationProfile> {
    // Check cache first
    const cacheKey = `personalization:${userId}`
    const cached = await this.getCachedProfile(cacheKey)
    
    if (cached && this.isProfileFresh(cached)) {
      return cached
    }

    try {
      // Build profile from user data and behavior
      const profile = await this.buildPersonalizationProfile(userId)
      
      // Cache the profile
      await this.cacheProfile(cacheKey, profile)
      
      return profile

    } catch (error) {
      console.error('Error building personalization profile:', error)
      return this.createDefaultProfile(userId)
    }
  }

  /**
   * Update user preferences based on interaction
   */
  static async updatePreferences(
    userId: string,
    interaction: {
      contentId: string
      interactionType: 'view' | 'like' | 'share' | 'comment' | 'skip' | 'hide'
      timeSpent: number
      context: {
        deviceType: string
        timeOfDay: number
        scrollPosition: number
        feedPosition: number
      }
    }
  ): Promise<void> {
    const profile = await this.getPersonalizationProfile(userId)
    
    // Extract content information
    const content = await this.getContentMetadata(interaction.contentId)
    if (!content) return

    // Create preference signal
    const signal = this.createPreferenceSignal(interaction, content)
    
    // Update interests based on the interaction
    await this.updateInterests(profile, content, signal)
    
    // Update behavioral patterns
    await this.updateBehavioralPatterns(profile, interaction)
    
    // Update temporal preferences
    await this.updateTemporalPreferences(profile, interaction)
    
    // Store updated profile
    await this.storeProfile(profile)
    
    // Invalidate cache to force refresh
    await this.invalidateCache(userId)
  }

  /**
   * Generate personalized content recommendations
   */
  static async generateRecommendations(
    userId: string,
    candidateContent: string[],
    context: {
      timeOfDay: number
      deviceType: string
      sessionDuration: number
      recentActivity: string[]
    }
  ): Promise<ContentRecommendation[]> {
    const profile = await this.getPersonalizationProfile(userId)
    const recommendations: ContentRecommendation[] = []

    for (const contentId of candidateContent) {
      const recommendation = await this.scoreContent(contentId, profile, context)
      if (recommendation) {
        recommendations.push(recommendation)
      }
    }

    // Sort by personalization score
    recommendations.sort((a, b) => b.personalizationScore - a.personalizationScore)
    
    return recommendations
  }

  /**
   * Learn from user feedback to improve personalization
   */
  static async learnFromFeedback(
    userId: string,
    feedbackData: {
      contentId: string
      rating: number // 1-5 or thumbs up/down
      explicit: boolean // was this explicit feedback?
      reason?: string
    }
  ): Promise<void> {
    const profile = await this.getPersonalizationProfile(userId)
    
    // Create high-strength signal from explicit feedback
    const content = await this.getContentMetadata(feedbackData.contentId)
    if (!content) return

    const signal: PreferenceSignal = {
      type: feedbackData.explicit ? 'explicit' : 'implicit',
      strength: feedbackData.rating / 5, // normalize to 0-1
      confidence: feedbackData.explicit ? 0.9 : 0.6,
      timestamp: new Date(),
      source: 'user_feedback',
      decay: 0.98 // slower decay for explicit feedback
    }

    // Update interests with stronger weighting for explicit feedback
    await this.updateInterests(profile, content, signal, feedbackData.explicit ? 2.0 : 1.0)
    
    // Store learning example for model improvement
    await this.storeFeedbackExample(userId, feedbackData, profile)
    
    // Trigger model retraining if enough feedback accumulated
    await this.checkModelRetraining(userId)
  }

  /**
   * Adapt personalization for different contexts
   */
  static async adaptForContext(
    profile: PersonalizationProfile,
    context: {
      situation: 'commuting' | 'work_break' | 'evening_leisure' | 'weekend'
      location?: string
      socialContext?: 'alone' | 'with_others'
      mood?: 'curious' | 'relaxed' | 'focused' | 'social'
    }
  ): Promise<PersonalizationProfile> {
    const adaptedProfile = { ...profile }

    // Adjust interests based on context
    switch (context.situation) {
      case 'commuting':
        // Boost news, light entertainment
        this.boostInterestCategories(adaptedProfile, ['news', 'entertainment'], 1.3)
        break
      case 'work_break':
        // Boost quick reads, humor
        this.boostInterestCategories(adaptedProfile, ['entertainment', 'technology'], 1.2)
        break
      case 'evening_leisure':
        // Boost deeper content, hobbies
        this.boostInterestCategories(adaptedProfile, ['lifestyle', 'art', 'education'], 1.4)
        break
      case 'weekend':
        // Boost personal interests, lifestyle
        this.boostInterestCategories(adaptedProfile, ['travel', 'food', 'lifestyle'], 1.3)
        break
    }

    // Adjust based on social context
    if (context.socialContext === 'with_others') {
      adaptedProfile.socialFactors.networkAlignment *= 1.2
    }

    return adaptedProfile
  }

  /**
   * Get trending interests for user discovery
   */
  static async getTrendingInterests(
    userId: string,
    limit: number = 5
  ): Promise<{ category: InterestCategory; trend: number; suggested: boolean }[]> {
    const profile = await this.getPersonalizationProfile(userId)
    const currentInterests = new Set(profile.interests.map(i => i.category))

    // Get platform-wide trending interests
    const platformTrends = await this.getPlatformTrendingInterests()
    
    // Filter out current interests and score based on user compatibility
    const suggestions = []
    
    for (const trend of platformTrends) {
      if (!currentInterests.has(trend.category)) {
        const compatibility = await this.calculateInterestCompatibility(profile, trend.category)
        
        if (compatibility > 0.3) { // threshold for suggestion
          suggestions.push({
            category: trend.category,
            trend: trend.velocity,
            suggested: true
          })
        }
      }
    }

    return suggestions.slice(0, limit)
  }

  /**
   * Export user personalization data for transparency
   */
  static async exportPersonalizationData(userId: string): Promise<{
    interests: { category: string; strength: number }[]
    patterns: string[]
    preferences: Record<string, any>
    dataPoints: number
    lastUpdated: Date
  }> {
    const profile = await this.getPersonalizationProfile(userId)
    
    return {
      interests: profile.interests.map(i => ({
        category: i.category,
        strength: i.score
      })),
      patterns: profile.behavioralPatterns.map(p => p.pattern),
      preferences: {
        contentTypes: profile.preferences.contentTypes,
        timePreferences: profile.preferences.timePreferences,
        engagementStyle: profile.preferences.engagementStyle
      },
      dataPoints: profile.modelMetadata.sampleSize,
      lastUpdated: profile.modelMetadata.lastTraining
    }
  }

  // Private helper methods

  private static async buildPersonalizationProfile(userId: string): Promise<PersonalizationProfile> {
    // Get user interaction history
    const interactions = await this.getUserInteractions(userId)
    
    // Extract interests from interactions
    const interests = await this.extractInterests(interactions)
    
    // Identify behavioral patterns
    const behavioralPatterns = await this.identifyBehavioralPatterns(interactions)
    
    // Calculate preferences
    const preferences = await this.calculatePreferences(interactions)
    
    // Calculate temporal factors
    const temporalFactors = await this.calculateTemporalFactors(interactions)
    
    // Calculate social factors
    const socialFactors = await this.calculateSocialFactors(userId, interactions)

    return {
      userId,
      interests,
      behavioralPatterns,
      preferences,
      temporalFactors,
      socialFactors,
      modelMetadata: {
        version: '1.0.0',
        lastTraining: new Date(),
        sampleSize: interactions.length,
        accuracy: 0.75, // would be calculated
        nextUpdate: new Date(Date.now() + 24 * 60 * 60 * 1000) // daily updates
      }
    }
  }

  private static async getUserInteractions(userId: string): Promise<any[]> {
    // Get recent interactions (last 30 days)
    const interactions = await prisma.interaction.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            contentEmbedding: true,
            authorType: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000
    })

    return interactions
  }

  private static async extractInterests(interactions: any[]): Promise<UserInterest[]> {
    const interestMap = new Map<InterestCategory, UserInterest>()

    for (const interaction of interactions) {
      if (!interaction.post?.content) continue

      // Classify content into categories (simplified)
      const categories = await this.classifyContent(interaction.post.content)
      
      for (const category of categories) {
        if (!interestMap.has(category)) {
          interestMap.set(category, {
            category,
            keywords: [],
            embedding: this.CATEGORY_EMBEDDINGS[category],
            signals: [],
            score: 0,
            trend: 'stable',
            lastUpdated: new Date()
          })
        }

        const interest = interestMap.get(category)!
        
        // Create signal from interaction
        const signal: PreferenceSignal = {
          type: 'implicit',
          strength: this.getInteractionStrength(interaction.interactionType),
          confidence: 0.7,
          timestamp: interaction.createdAt,
          source: 'interaction_history',
          decay: this.INTEREST_DECAY_RATE
        }

        interest.signals.push(signal)
      }
    }

    // Calculate scores for each interest
    for (const interest of interestMap.values()) {
      interest.score = this.calculateInterestScore(interest.signals)
      interest.trend = this.calculateInterestTrend(interest.signals)
    }

    return Array.from(interestMap.values()).filter(i => i.score > 0.1) // filter weak interests
  }

  private static async identifyBehavioralPatterns(interactions: any[]): Promise<BehavioralPattern[]> {
    const patterns: BehavioralPattern[] = []

    // Time-based patterns
    const hourlyActivity = new Array(24).fill(0)
    const weeklyActivity = new Array(7).fill(0)

    for (const interaction of interactions) {
      const hour = interaction.createdAt.getHours()
      const day = interaction.createdAt.getDay()
      
      hourlyActivity[hour]++
      weeklyActivity[day]++
    }

    // Find peak hours
    const peakHour = hourlyActivity.indexOf(Math.max(...hourlyActivity))
    if (hourlyActivity[peakHour] >= this.MIN_SAMPLES_FOR_PATTERN) {
      patterns.push({
        pattern: `most_active_hour_${peakHour}`,
        frequency: hourlyActivity[peakHour] / interactions.length,
        contexts: ['temporal'],
        predictive_value: 0.6,
        examples: interactions
          .filter(i => i.createdAt.getHours() === peakHour)
          .slice(0, 3)
          .map(i => ({
            timestamp: i.createdAt,
            action: i.interactionType,
            context: { hour: peakHour }
          }))
      })
    }

    // Engagement patterns
    const engagementTypes = interactions.reduce((acc, i) => {
      acc[i.interactionType] = (acc[i.interactionType] || 0) + 1
      return acc
    }, {})

    const dominantEngagement = Object.entries(engagementTypes)
      .sort(([,a], [,b]) => (b as number) - (a as number))[0]

    if (dominantEngagement && dominantEngagement[1] >= this.MIN_SAMPLES_FOR_PATTERN) {
      patterns.push({
        pattern: `prefers_${dominantEngagement[0]}`,
        frequency: (dominantEngagement[1] as number) / interactions.length,
        contexts: ['engagement'],
        predictive_value: 0.7,
        examples: interactions
          .filter(i => i.interactionType === dominantEngagement[0])
          .slice(0, 3)
          .map(i => ({
            timestamp: i.createdAt,
            action: i.interactionType,
            context: { type: dominantEngagement[0] }
          }))
      })
    }

    return patterns
  }

  private static async calculatePreferences(interactions: any[]): Promise<PersonalizationProfile['preferences']> {
    const contentTypes: Record<string, number> = {}
    const authorTypes: Record<string, number> = {}
    const timePreferences: Record<string, number> = {}
    const devicePreferences: Record<string, number> = {}

    // Analyze interaction patterns
    for (const interaction of interactions) {
      // Content type preferences (would extract from content analysis)
      const contentType = 'text' // simplified
      contentTypes[contentType] = (contentTypes[contentType] || 0) + 1

      // Author type preferences
      const authorType = interaction.post?.authorType || 'unknown'
      authorTypes[authorType] = (authorTypes[authorType] || 0) + 1

      // Time preferences
      const hour = interaction.createdAt.getHours()
      const timeSlot = this.getTimeSlot(hour)
      timePreferences[timeSlot] = (timePreferences[timeSlot] || 0) + 1

      // Device preferences (would come from session data)
      const device = 'desktop' // simplified
      devicePreferences[device] = (devicePreferences[device] || 0) + 1
    }

    // Normalize to probabilities
    const total = interactions.length
    Object.keys(contentTypes).forEach(k => contentTypes[k] /= total)
    Object.keys(authorTypes).forEach(k => authorTypes[k] /= total)
    Object.keys(timePreferences).forEach(k => timePreferences[k] /= total)
    Object.keys(devicePreferences).forEach(k => devicePreferences[k] /= total)

    // Analyze engagement style
    const likes = interactions.filter(i => i.interactionType === 'LIKE').length
    const views = interactions.filter(i => i.interactionType === 'VIEW').length
    const replies = interactions.filter(i => i.interactionType === 'REPLY').length

    const engagementStyle = {
      likesToRead: views / total > 0.7,
      likesToEngage: (likes + replies) / total > 0.3,
      prefersShortContent: true, // would analyze content length
      prefersVisualContent: false // would analyze content type
    }

    return {
      contentTypes,
      authorTypes,
      timePreferences,
      devicePreferences,
      engagementStyle
    }
  }

  private static async calculateTemporalFactors(interactions: any[]): Promise<PersonalizationProfile['temporalFactors']> {
    const weekdayPreferences = new Array(7).fill(0)
    const hourlyPreferences = new Array(24).fill(0)

    for (const interaction of interactions) {
      const day = interaction.createdAt.getDay()
      const hour = interaction.createdAt.getHours()
      
      weekdayPreferences[day]++
      hourlyPreferences[hour]++
    }

    // Normalize
    const totalInteractions = interactions.length
    weekdayPreferences.forEach((_, i) => weekdayPreferences[i] /= totalInteractions)
    hourlyPreferences.forEach((_, i) => hourlyPreferences[i] /= totalInteractions)

    return {
      weekdayPreferences,
      hourlyPreferences,
      seasonalAdjustments: {
        spring: 1.0,
        summer: 1.1,
        fall: 1.0,
        winter: 0.9
      }
    }
  }

  private static async calculateSocialFactors(userId: string, interactions: any[]): Promise<PersonalizationProfile['socialFactors']> {
    // Calculate how much user is influenced by social signals
    const socialInteractions = interactions.filter(i => 
      i.interactionType === 'LIKE' || i.interactionType === 'REPOST'
    )

    // Simple heuristics (would be more sophisticated in practice)
    return {
      influenceability: Math.min(socialInteractions.length / interactions.length, 1),
      trendFollowing: 0.5, // would calculate based on trending content engagement
      networkAlignment: 0.6 // would calculate based on network similarity
    }
  }

  private static createPreferenceSignal(
    interaction: any,
    content: any
  ): PreferenceSignal {
    const strength = this.getInteractionStrength(interaction.interactionType)
    const timeWeight = Math.max(0.1, 1 - (interaction.timeSpent / 60000)) // decay based on time spent

    return {
      type: 'implicit',
      strength: strength * timeWeight,
      confidence: 0.7,
      timestamp: new Date(),
      source: 'real_time_interaction',
      decay: this.INTEREST_DECAY_RATE
    }
  }

  private static getInteractionStrength(interactionType: string): number {
    const strengths = {
      VIEW: 0.1,
      LIKE: 0.7,
      REPOST: 0.8,
      REPLY: 0.9,
      CLICK: 0.3
    }
    return strengths[interactionType as keyof typeof strengths] || 0.1
  }

  private static async classifyContent(content: string): Promise<InterestCategory[]> {
    // Simplified content classification
    // In practice, this would use ML models or keyword matching
    const keywords = content.toLowerCase()
    const categories: InterestCategory[] = []

    if (keywords.includes('tech') || keywords.includes('ai') || keywords.includes('software')) {
      categories.push('technology')
    }
    if (keywords.includes('politic') || keywords.includes('election') || keywords.includes('government')) {
      categories.push('politics')
    }
    if (keywords.includes('sport') || keywords.includes('game') || keywords.includes('team')) {
      categories.push('sports')
    }
    // ... more classification logic

    return categories.length > 0 ? categories : ['news'] // default category
  }

  private static calculateInterestScore(signals: PreferenceSignal[]): number {
    if (signals.length === 0) return 0

    const now = Date.now()
    let totalScore = 0
    let totalWeight = 0

    for (const signal of signals) {
      const age = (now - signal.timestamp.getTime()) / (1000 * 60 * 60 * 24) // days
      const decay = Math.pow(signal.decay, age)
      const weight = signal.strength * signal.confidence * decay

      totalScore += weight
      totalWeight += signal.confidence * decay
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0
  }

  private static calculateInterestTrend(signals: PreferenceSignal[]): 'increasing' | 'decreasing' | 'stable' {
    if (signals.length < 3) return 'stable'

    // Sort by timestamp
    const sortedSignals = signals.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    
    // Compare recent vs older signals
    const recentSignals = sortedSignals.slice(-Math.ceil(signals.length / 3))
    const olderSignals = sortedSignals.slice(0, Math.floor(signals.length / 3))

    const recentAvg = recentSignals.reduce((sum, s) => sum + s.strength, 0) / recentSignals.length
    const olderAvg = olderSignals.reduce((sum, s) => sum + s.strength, 0) / olderSignals.length

    const change = recentAvg - olderAvg
    
    if (change > 0.1) return 'increasing'
    if (change < -0.1) return 'decreasing'
    return 'stable'
  }

  private static getTimeSlot(hour: number): string {
    if (hour >= 6 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 18) return 'afternoon'
    if (hour >= 18 && hour < 22) return 'evening'
    return 'night'
  }

  private static async updateInterests(
    profile: PersonalizationProfile,
    content: any,
    signal: PreferenceSignal,
    weight: number = 1.0
  ): Promise<void> {
    const categories = await this.classifyContent(content.content)
    
    for (const category of categories) {
      let interest = profile.interests.find(i => i.category === category)
      
      if (!interest) {
        interest = {
          category,
          keywords: [],
          embedding: this.CATEGORY_EMBEDDINGS[category],
          signals: [],
          score: 0,
          trend: 'stable',
          lastUpdated: new Date()
        }
        profile.interests.push(interest)
      }

      // Add weighted signal
      const weightedSignal = { ...signal, strength: signal.strength * weight }
      interest.signals.push(weightedSignal)
      
      // Recalculate score and trend
      interest.score = this.calculateInterestScore(interest.signals)
      interest.trend = this.calculateInterestTrend(interest.signals)
      interest.lastUpdated = new Date()
    }
  }

  private static async updateBehavioralPatterns(
    profile: PersonalizationProfile,
    interaction: any
  ): Promise<void> {
    // Update or create patterns based on the interaction
    // This is simplified - would be more sophisticated in practice
    const hour = new Date().getHours()
    const patternName = `active_hour_${hour}`
    
    let pattern = profile.behavioralPatterns.find(p => p.pattern === patternName)
    
    if (!pattern) {
      pattern = {
        pattern: patternName,
        frequency: 0,
        contexts: ['temporal'],
        predictive_value: 0.5,
        examples: []
      }
      profile.behavioralPatterns.push(pattern)
    }

    pattern.frequency = Math.min(1, pattern.frequency + 0.1)
    pattern.examples.push({
      timestamp: new Date(),
      action: interaction.interactionType,
      context: { hour }
    })

    // Keep only recent examples
    if (pattern.examples.length > 10) {
      pattern.examples = pattern.examples.slice(-10)
    }
  }

  private static async updateTemporalPreferences(
    profile: PersonalizationProfile,
    interaction: any
  ): Promise<void> {
    const hour = interaction.context.timeOfDay
    const day = new Date().getDay()
    
    // Update hourly preferences with learning rate
    profile.temporalFactors.hourlyPreferences[hour] += this.LEARNING_RATE
    
    // Normalize to keep sum reasonable
    const sum = profile.temporalFactors.hourlyPreferences.reduce((a, b) => a + b, 0)
    if (sum > 24) {
      profile.temporalFactors.hourlyPreferences = 
        profile.temporalFactors.hourlyPreferences.map(p => p * 24 / sum)
    }

    // Similar for weekday preferences
    profile.temporalFactors.weekdayPreferences[day] += this.LEARNING_RATE
  }

  private static async scoreContent(
    contentId: string,
    profile: PersonalizationProfile,
    context: any
  ): Promise<ContentRecommendation | null> {
    const content = await this.getContentMetadata(contentId)
    if (!content) return null

    // Calculate interest matching
    const categories = await this.classifyContent(content.content)
    const matchedInterests = profile.interests.filter(i => categories.includes(i.category))
    const interestScore = matchedInterests.reduce((sum, i) => sum + i.score, 0) / Math.max(matchedInterests.length, 1)

    // Calculate behavioral matching
    const behavioralMatches = profile.behavioralPatterns.filter(p => 
      this.patternMatches(p, context)
    )
    const behavioralScore = behavioralMatches.reduce((sum, p) => sum + p.predictive_value, 0) / Math.max(behavioralMatches.length, 1)

    // Calculate temporal relevance
    const temporalRelevance = profile.temporalFactors.hourlyPreferences[context.timeOfDay] || 0

    // Calculate social relevance (simplified)
    const socialRelevance = 0.5 // would calculate based on network preferences

    // Combine scores
    const personalizationScore = (
      interestScore * 0.5 +
      behavioralScore * 0.3 +
      temporalRelevance * 0.1 +
      socialRelevance * 0.1
    )

    return {
      contentId,
      personalizationScore,
      reasoning: {
        matchedInterests: matchedInterests.map(i => i.category),
        behavioralMatches: behavioralMatches.map(p => p.pattern),
        temporalRelevance,
        socialRelevance
      },
      confidence: Math.min(profile.modelMetadata.accuracy, 0.9),
      adaptations: {
        timeOfDay: temporalRelevance,
        deviceOptimization: 0.8, // would calculate based on device preferences
        socialContext: socialRelevance
      }
    }
  }

  private static patternMatches(pattern: BehavioralPattern, context: any): boolean {
    // Simple pattern matching - would be more sophisticated
    if (pattern.pattern.includes('hour') && pattern.contexts.includes('temporal')) {
      const patternHour = parseInt(pattern.pattern.split('_').pop() || '0')
      return Math.abs(patternHour - context.timeOfDay) <= 1
    }
    return false
  }

  private static async getContentMetadata(contentId: string): Promise<any> {
    return await prisma.post.findUnique({
      where: { id: contentId },
      select: {
        id: true,
        content: true,
        contentEmbedding: true,
        authorType: true,
        createdAt: true
      }
    })
  }

  private static boostInterestCategories(
    profile: PersonalizationProfile,
    categories: InterestCategory[],
    multiplier: number
  ): void {
    for (const interest of profile.interests) {
      if (categories.includes(interest.category)) {
        interest.score = Math.min(1, interest.score * multiplier)
      }
    }
  }

  private static async getPlatformTrendingInterests(): Promise<{ category: InterestCategory; velocity: number }[]> {
    // Would query platform-wide interest trends
    return [
      { category: 'technology', velocity: 0.8 },
      { category: 'entertainment', velocity: 0.6 },
      { category: 'news', velocity: 0.7 }
    ]
  }

  private static async calculateInterestCompatibility(
    profile: PersonalizationProfile,
    category: InterestCategory
  ): Promise<number> {
    // Calculate how compatible a new interest category is with user's existing interests
    const existingEmbeddings = profile.interests.map(i => i.embedding)
    const candidateEmbedding = this.CATEGORY_EMBEDDINGS[category]

    if (existingEmbeddings.length === 0) return 0.5

    const similarities = existingEmbeddings.map(embedding => 
      this.cosineSimilarity(embedding, candidateEmbedding)
    )

    return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length
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

  private static createDefaultProfile(userId: string): PersonalizationProfile {
    return {
      userId,
      interests: [],
      behavioralPatterns: [],
      preferences: {
        contentTypes: {},
        authorTypes: {},
        timePreferences: {},
        devicePreferences: {},
        engagementStyle: {
          likesToRead: true,
          likesToEngage: false,
          prefersShortContent: true,
          prefersVisualContent: false
        }
      },
      temporalFactors: {
        weekdayPreferences: new Array(7).fill(1/7),
        hourlyPreferences: new Array(24).fill(1/24),
        seasonalAdjustments: { spring: 1, summer: 1, fall: 1, winter: 1 }
      },
      socialFactors: {
        influenceability: 0.5,
        trendFollowing: 0.5,
        networkAlignment: 0.5
      },
      modelMetadata: {
        version: '1.0.0',
        lastTraining: new Date(),
        sampleSize: 0,
        accuracy: 0.5,
        nextUpdate: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    }
  }

  private static async getCachedProfile(cacheKey: string): Promise<PersonalizationProfile | null> {
    try {
      const cached = await redis.get(cacheKey)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  private static isProfileFresh(profile: PersonalizationProfile): boolean {
    return profile.modelMetadata.nextUpdate > new Date()
  }

  private static async cacheProfile(cacheKey: string, profile: PersonalizationProfile): Promise<void> {
    try {
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(profile))
    } catch (error) {
      console.warn('Failed to cache personalization profile:', error)
    }
  }

  private static async storeProfile(profile: PersonalizationProfile): Promise<void> {
    try {
      await prisma.personalizationProfile.upsert({
        where: { userId: profile.userId },
        update: {
          interests: profile.interests,
          behavioralPatterns: profile.behavioralPatterns,
          preferences: profile.preferences,
          temporalFactors: profile.temporalFactors,
          socialFactors: profile.socialFactors,
          modelMetadata: profile.modelMetadata,
          updatedAt: new Date()
        },
        create: {
          userId: profile.userId,
          interests: profile.interests,
          behavioralPatterns: profile.behavioralPatterns,
          preferences: profile.preferences,
          temporalFactors: profile.temporalFactors,
          socialFactors: profile.socialFactors,
          modelMetadata: profile.modelMetadata,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })
    } catch (error) {
      console.error('Failed to store personalization profile:', error)
    }
  }

  private static async invalidateCache(userId: string): Promise<void> {
    try {
      await redis.del(`personalization:${userId}`)
    } catch (error) {
      console.warn('Failed to invalidate cache:', error)
    }
  }

  private static async storeFeedbackExample(
    userId: string,
    feedbackData: any,
    profile: PersonalizationProfile
  ): Promise<void> {
    // Store for model training
    await redis.lpush(`feedback:${userId}`, JSON.stringify({
      ...feedbackData,
      profileSnapshot: profile.modelMetadata,
      timestamp: new Date()
    }))
  }

  private static async checkModelRetraining(userId: string): Promise<void> {
    const feedbackCount = await redis.llen(`feedback:${userId}`)
    
    if (feedbackCount >= 20) { // retrain after 20 feedback examples
      await redis.lpush('personalization:retrain', JSON.stringify({
        userId,
        feedbackCount,
        queuedAt: new Date()
      }))
    }
  }
}

// Export the singleton
export const feedPersonalization = FeedPersonalizationEngine

// Extend Prisma schema for personalization profiles (this would go in schema.prisma)
/*
model PersonalizationProfile {
  id                 String   @id @default(cuid())
  userId             String   @unique
  interests          Json
  behavioralPatterns Json
  preferences        Json
  temporalFactors    Json
  socialFactors      Json
  modelMetadata      Json
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  
  @@map("personalization_profiles")
}
*/