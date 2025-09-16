/**
 * Real-Time Feed Optimization System
 * 
 * Implements live feed optimization with real-time learning, A/B testing,
 * performance monitoring, and adaptive algorithms. Handles streaming updates
 * and dynamic ranking adjustments based on user behavior.
 * 
 * Based on research.md recommendations for real-time optimization with
 * reinforcement learning and contextual bandits for continuous improvement.
 */

import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { feedRanker, type RankedContent, type ScoringWeights } from './ranking'
import { feedPersonalization } from './personalization'
import { collaborativeFiltering } from './collaborative-filtering'

// Core real-time optimization types
export type PerformanceMetric = {
  name: string
  value: number
  target: number
  trend: 'improving' | 'degrading' | 'stable'
  timestamp: Date
}

export type FeedExperiment = {
  id: string
  name: string
  description: string
  variants: {
    [variant: string]: {
      weights: ScoringWeights
      algorithm: string
      parameters: Record<string, any>
    }
  }
  userAssignments: Map<string, string> // userId -> variant
  metrics: {
    [variant: string]: {
      engagement: number
      retention: number
      satisfaction: number
      performance: number
    }
  }
  status: 'draft' | 'running' | 'paused' | 'completed'
  startDate: Date
  endDate?: Date
  sampleSize: number
  confidenceLevel: number
}

export type RealtimeUpdate = {
  type: 'new_content' | 'engagement_spike' | 'user_action' | 'trending_topic' | 'system_event'
  timestamp: Date
  data: any
  priority: 'low' | 'medium' | 'high' | 'critical'
  affectedUsers?: string[]
  processingTime?: number
}

export type AdaptiveParameters = {
  learningRate: number // how quickly to adapt to new data
  explorationRate: number // balance between exploitation and exploration
  windowSize: number // time window for recent data
  decayFactor: number // how much to discount old data
  adaptationThreshold: number // minimum change to trigger adaptation
  stabilityPeriod: number // minimum time between major changes
}

export type UserSession = {
  userId: string
  sessionId: string
  startTime: Date
  lastActivity: Date
  actions: {
    type: string
    timestamp: Date
    data: any
  }[]
  context: {
    device: string
    location?: string
    timeOfDay: number
    feedPosition: number
    totalScrolled: number
  }
  engagement: {
    clickThroughRate: number
    timePerItem: number
    interactionRate: number
    satisfactionScore: number
  }
  adaptations: {
    algorithmAdjustments: Record<string, number>
    personalizedWeights: ScoringWeights
    experimentVariant?: string
  }
}

export interface RealtimeOptimizer {
  updateFeedWeights(userId: string, feedback: any): Promise<ScoringWeights>
  handleRealtimeEvent(event: RealtimeUpdate): Promise<void>
  optimizeForUser(userId: string, context: any): Promise<RankedContent[]>
  runExperiment(experiment: FeedExperiment): Promise<void>
  getPerformanceMetrics(timeframe: string): Promise<PerformanceMetric[]>
}

export class RealtimeFeedOptimizer implements RealtimeOptimizer {
  private static readonly CACHE_TTL = 300 // 5 minutes
  private static readonly UPDATE_THRESHOLD = 0.05
  private static readonly MIN_SESSION_LENGTH = 30000 // 30 seconds
  private static readonly PERFORMANCE_WINDOW = 3600000 // 1 hour

  private static readonly DEFAULT_ADAPTIVE_PARAMS: AdaptiveParameters = {
    learningRate: 0.1,
    explorationRate: 0.2,
    windowSize: 3600000, // 1 hour
    decayFactor: 0.95,
    adaptationThreshold: 0.05,
    stabilityPeriod: 300000 // 5 minutes
  }

  private static activeSessions = new Map<string, UserSession>()
  private static runningExperiments = new Map<string, FeedExperiment>()
  private static performanceBuffer: PerformanceMetric[] = []

  /**
   * Initialize real-time optimization for a user session
   */
  static async initializeSession(
    userId: string,
    sessionId: string,
    context: {
      device: string
      location?: string
      userAgent?: string
    }
  ): Promise<UserSession> {
    const session: UserSession = {
      userId,
      sessionId,
      startTime: new Date(),
      lastActivity: new Date(),
      actions: [],
      context: {
        device: context.device,
        location: context.location,
        timeOfDay: new Date().getHours(),
        feedPosition: 0,
        totalScrolled: 0
      },
      engagement: {
        clickThroughRate: 0,
        timePerItem: 0,
        interactionRate: 0,
        satisfactionScore: 0.5
      },
      adaptations: {
        algorithmAdjustments: {},
        personalizedWeights: {
          relevance: 0.40,
          social: 0.30,
          freshness: 0.20,
          quality: 0.10,
          diversity: 0.05,
          trending: 0.05
        }
      }
    }

    // Check for running experiments
    const experiment = await this.getActiveExperiment(userId)
    if (experiment) {
      session.adaptations.experimentVariant = this.assignExperimentVariant(userId, experiment)
      session.adaptations.personalizedWeights = this.getExperimentWeights(experiment, session.adaptations.experimentVariant!)
    }

    this.activeSessions.set(sessionId, session)
    
    // Cache session
    await this.cacheSession(session)
    
    return session
  }

  /**
   * Update feed weights based on real-time user feedback
   */
  async updateFeedWeights(userId: string, feedback: {
    itemId: string
    action: 'view' | 'like' | 'skip' | 'share' | 'hide'
    timeSpent: number
    position: number
    sessionId: string
  }): Promise<ScoringWeights> {
    const session = this.activeSessions.get(feedback.sessionId)
    if (!session) {
      throw new Error('Session not found')
    }

    // Record the action
    session.actions.push({
      type: feedback.action,
      timestamp: new Date(),
      data: feedback
    })

    // Update engagement metrics
    this.updateEngagementMetrics(session, feedback)

    // Get current content metadata for learning
    const content = await this.getContentMetadata(feedback.itemId)
    if (!content) return session.adaptations.personalizedWeights

    // Calculate reward signal
    const reward = this.calculateReward(feedback, content)

    // Update algorithm weights using reinforcement learning
    const updatedWeights = await this.updateWeightsWithRL(
      session.adaptations.personalizedWeights,
      content,
      reward,
      this.DEFAULT_ADAPTIVE_PARAMS
    )

    session.adaptations.personalizedWeights = updatedWeights
    session.lastActivity = new Date()

    // Cache updated session
    await this.cacheSession(session)

    // Update personalization profile
    await feedPersonalization.updatePreferences(userId, {
      contentId: feedback.itemId,
      interactionType: feedback.action,
      timeSpent: feedback.timeSpent,
      context: {
        deviceType: session.context.device,
        timeOfDay: session.context.timeOfDay,
        scrollPosition: session.context.totalScrolled,
        feedPosition: feedback.position
      }
    })

    // Update collaborative filtering
    await collaborativeFiltering.updateUserInteraction(
      userId,
      feedback.itemId,
      feedback.action,
      1.0,
      { timeSpent: feedback.timeSpent, sessionId: feedback.sessionId }
    )

    return updatedWeights
  }

  /**
   * Handle real-time events that affect the feed
   */
  async handleRealtimeEvent(event: RealtimeUpdate): Promise<void> {
    const startTime = Date.now()

    try {
      switch (event.type) {
        case 'new_content':
          await this.handleNewContent(event)
          break
        case 'engagement_spike':
          await this.handleEngagementSpike(event)
          break
        case 'trending_topic':
          await this.handleTrendingTopic(event)
          break
        case 'user_action':
          await this.handleUserAction(event)
          break
        case 'system_event':
          await this.handleSystemEvent(event)
          break
      }

      // Record processing time
      event.processingTime = Date.now() - startTime
      
      // Update performance metrics
      await this.updatePerformanceMetrics('event_processing_time', event.processingTime)

    } catch (error) {
      console.error('Error handling real-time event:', error)
      await this.updatePerformanceMetrics('event_processing_errors', 1)
    }
  }

  /**
   * Optimize feed for specific user with real-time adaptations
   */
  async optimizeForUser(userId: string, context: {
    sessionId: string
    requestTime: Date
    lastSeen?: string[]
    feedSize?: number
  }): Promise<RankedContent[]> {
    const session = this.activeSessions.get(context.sessionId)
    if (!session) {
      // Fallback to standard ranking
      return feedRanker.generateFeed(userId)
    }

    // Use personalized weights from session
    const personalizedConfig = {
      weights: session.adaptations.personalizedWeights,
      diversityThreshold: 0.3 + (session.engagement.satisfactionScore - 0.5) * 0.2 // adjust based on satisfaction
    }

    // Get base feed
    let feed = await feedRanker.generateFeed(userId, personalizedConfig)

    // Apply real-time optimizations
    feed = await this.applyRealtimeOptimizations(feed, session)

    // Filter out recently seen content
    if (context.lastSeen && context.lastSeen.length > 0) {
      feed = feed.filter(item => !context.lastSeen!.includes(item.postId))
    }

    // Limit to requested size
    if (context.feedSize) {
      feed = feed.slice(0, context.feedSize)
    }

    // Update session context
    session.context.feedPosition += feed.length
    session.lastActivity = new Date()

    return feed
  }

  /**
   * Run A/B test experiments on feed algorithms
   */
  async runExperiment(experiment: FeedExperiment): Promise<void> {
    // Validate experiment configuration
    this.validateExperiment(experiment)

    // Store experiment
    this.runningExperiments.set(experiment.id, experiment)
    
    // Cache experiment for quick access
    await redis.setex(
      `experiment:${experiment.id}`,
      86400, // 24 hours
      JSON.stringify(experiment)
    )

    // Initialize metrics tracking
    for (const variant of Object.keys(experiment.variants)) {
      experiment.metrics[variant] = {
        engagement: 0,
        retention: 0,
        satisfaction: 0,
        performance: 0
      }
    }

    experiment.status = 'running'
    experiment.startDate = new Date()

    console.log(`Started experiment: ${experiment.name} with ${Object.keys(experiment.variants).length} variants`)
  }

  /**
   * Get current performance metrics
   */
  async getPerformanceMetrics(timeframe: '1h' | '24h' | '7d' = '1h'): Promise<PerformanceMetric[]> {
    const timeframes = {
      '1h': 3600000,
      '24h': 86400000,
      '7d': 604800000
    }

    const since = new Date(Date.now() - timeframes[timeframe])
    
    // Get cached metrics
    const cached = await redis.get(`metrics:${timeframe}`)
    if (cached) {
      return JSON.parse(cached)
    }

    // Calculate metrics from active sessions and stored data
    const metrics = await this.calculatePerformanceMetrics(since)
    
    // Cache metrics
    await redis.setex(`metrics:${timeframe}`, 300, JSON.stringify(metrics))
    
    return metrics
  }

  /**
   * End user session and collect final metrics
   */
  static async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session) return

    // Calculate final engagement metrics
    const sessionDuration = Date.now() - session.startTime.getTime()
    
    if (sessionDuration >= this.MIN_SESSION_LENGTH) {
      // Store session data for analysis
      await this.storeSessionData(session)
      
      // Update experiment metrics if applicable
      if (session.adaptations.experimentVariant) {
        await this.updateExperimentMetrics(session)
      }
    }

    // Remove from active sessions
    this.activeSessions.delete(sessionId)
    
    // Clean up cache
    await redis.del(`session:${sessionId}`)
  }

  // Private helper methods

  private static updateEngagementMetrics(session: UserSession, feedback: any): void {
    const actions = session.actions
    const recentActions = actions.filter(a => 
      Date.now() - a.timestamp.getTime() < 300000 // last 5 minutes
    )

    // Update click-through rate
    const clicks = recentActions.filter(a => a.type === 'like' || a.type === 'share').length
    const views = recentActions.filter(a => a.type === 'view').length
    session.engagement.clickThroughRate = views > 0 ? clicks / views : 0

    // Update interaction rate
    const interactions = recentActions.filter(a => a.type !== 'view' && a.type !== 'skip').length
    session.engagement.interactionRate = recentActions.length > 0 ? interactions / recentActions.length : 0

    // Update time per item
    const viewActions = recentActions.filter(a => a.type === 'view')
    if (viewActions.length > 0) {
      const totalTime = viewActions.reduce((sum, a) => sum + (a.data.timeSpent || 0), 0)
      session.engagement.timePerItem = totalTime / viewActions.length
    }

    // Update satisfaction score based on actions
    const positiveActions = recentActions.filter(a => a.type === 'like' || a.type === 'share').length
    const negativeActions = recentActions.filter(a => a.type === 'skip' || a.type === 'hide').length
    
    if (positiveActions + negativeActions > 0) {
      session.engagement.satisfactionScore = positiveActions / (positiveActions + negativeActions)
    }
  }

  private static calculateReward(feedback: any, content: any): number {
    const actionRewards = {
      view: 0.1,
      like: 1.0,
      share: 1.5,
      skip: -0.3,
      hide: -1.0
    }

    let reward = actionRewards[feedback.action as keyof typeof actionRewards] || 0

    // Time-based bonus
    const timeBonus = Math.min(feedback.timeSpent / 30000, 0.5) // max 0.5 bonus for 30s+
    reward += timeBonus

    // Position penalty (lower positions should be more relevant)
    const positionPenalty = feedback.position * 0.01 // small penalty for lower positions
    reward -= positionPenalty

    return Math.max(-1, Math.min(1, reward)) // clamp to [-1, 1]
  }

  private static async updateWeightsWithRL(
    currentWeights: ScoringWeights,
    content: any,
    reward: number,
    params: AdaptiveParameters
  ): Promise<ScoringWeights> {
    // Simplified reinforcement learning update
    // In practice, this would use more sophisticated algorithms like Q-learning or policy gradients
    
    const updatedWeights = { ...currentWeights }
    const learningRate = params.learningRate
    
    // Determine which features were most relevant for this content
    const featureRelevance = {
      relevance: Math.random(), // would calculate based on content analysis
      social: Math.random(),
      freshness: Math.random(),
      quality: Math.random(),
      diversity: Math.random(),
      trending: Math.random()
    }

    // Update weights based on reward and feature relevance
    for (const [feature, relevance] of Object.entries(featureRelevance)) {
      const key = feature as keyof ScoringWeights
      const update = learningRate * reward * relevance
      updatedWeights[key] = Math.max(0, Math.min(1, updatedWeights[key] + update))
    }

    // Normalize weights to sum to 1
    const totalWeight = Object.values(updatedWeights).reduce((sum, w) => sum + w, 0)
    if (totalWeight > 0) {
      for (const key of Object.keys(updatedWeights) as (keyof ScoringWeights)[]) {
        updatedWeights[key] /= totalWeight
      }
    }

    return updatedWeights
  }

  private static async applyRealtimeOptimizations(
    feed: RankedContent[],
    session: UserSession
  ): Promise<RankedContent[]> {
    // Apply session-specific optimizations
    const optimizedFeed = [...feed]

    // Boost content based on current engagement patterns
    if (session.engagement.satisfactionScore > 0.7) {
      // User is highly engaged, can show more diverse content
      this.boostDiverseContent(optimizedFeed)
    } else if (session.engagement.satisfactionScore < 0.3) {
      // User is not engaged, show safer/popular content
      this.boostPopularContent(optimizedFeed)
    }

    // Time-of-day adjustments
    this.applyTemporalAdjustments(optimizedFeed, session.context.timeOfDay)

    // Re-sort based on adjusted scores
    optimizedFeed.sort((a, b) => b.finalScore - a.finalScore)

    return optimizedFeed
  }

  private static boostDiverseContent(feed: RankedContent[]): void {
    const authors = new Set<string>()
    
    for (const item of feed) {
      if (!authors.has(item.authorId)) {
        item.finalScore *= 1.1 // boost diverse authors
        authors.add(item.authorId)
      }
    }
  }

  private static boostPopularContent(feed: RankedContent[]): void {
    for (const item of feed) {
      const engagement = Object.values(item.engagementCount).reduce((a, b) => a + b, 0)
      if (engagement > 10) { // popular content threshold
        item.finalScore *= 1.15
      }
    }
  }

  private static applyTemporalAdjustments(feed: RankedContent[], hour: number): void {
    for (const item of feed) {
      // Boost fresh content during peak hours
      if (hour >= 9 && hour <= 17) { // work hours
        const age = (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60) // hours
        if (age < 1) {
          item.finalScore *= 1.1
        }
      }
    }
  }

  private static async handleNewContent(event: RealtimeUpdate): Promise<void> {
    // Invalidate relevant caches when new content is added
    const contentData = event.data
    
    if (contentData.authorId) {
      // Invalidate feeds for followers of this author
      await this.invalidateFeedsForFollowers(contentData.authorId)
    }

    if (contentData.trending) {
      // Invalidate all feeds if this is trending content
      await this.invalidateAllFeeds()
    }
  }

  private static async handleEngagementSpike(event: RealtimeUpdate): Promise<void> {
    // Boost content that's getting sudden engagement
    const contentId = event.data.contentId
    const engagementIncrease = event.data.increase

    if (engagementIncrease > 10) { // significant spike
      // Update trending boost for this content
      await redis.setex(`trending_boost:${contentId}`, 3600, engagementIncrease.toString())
    }
  }

  private static async handleTrendingTopic(event: RealtimeUpdate): Promise<void> {
    // Update trending weights globally
    const topic = event.data.topic
    const velocity = event.data.velocity

    await redis.setex(`trending_topic:${topic}`, 7200, velocity.toString())
    
    // Trigger feed updates for users interested in this topic
    await this.updateFeedsForTopic(topic)
  }

  private static async handleUserAction(event: RealtimeUpdate): Promise<void> {
    // Process user action for real-time learning
    const userId = event.data.userId
    const action = event.data.action

    // Update user's real-time preference signals
    await this.updateUserSignals(userId, action)
  }

  private static async handleSystemEvent(event: RealtimeUpdate): Promise<void> {
    // Handle system-level events like algorithm updates
    const eventType = event.data.type

    switch (eventType) {
      case 'algorithm_update':
        await this.reloadAlgorithmParameters()
        break
      case 'cache_invalidation':
        await this.performCacheInvalidation(event.data.pattern)
        break
      case 'performance_alert':
        await this.handlePerformanceAlert(event.data)
        break
    }
  }

  private static async getActiveExperiment(userId: string): Promise<FeedExperiment | null> {
    // Check if user is in any active experiments
    for (const experiment of this.runningExperiments.values()) {
      if (experiment.status === 'running' && this.isUserEligible(userId, experiment)) {
        return experiment
      }
    }
    return null
  }

  private static assignExperimentVariant(userId: string, experiment: FeedExperiment): string {
    // Consistent hash-based assignment
    const hash = this.hashString(userId + experiment.id)
    const variants = Object.keys(experiment.variants)
    return variants[hash % variants.length]
  }

  private static getExperimentWeights(experiment: FeedExperiment, variant: string): ScoringWeights {
    return experiment.variants[variant]?.weights || {
      relevance: 0.40,
      social: 0.30,
      freshness: 0.20,
      quality: 0.10,
      diversity: 0.05,
      trending: 0.05
    }
  }

  private static isUserEligible(userId: string, experiment: FeedExperiment): boolean {
    // Simple eligibility check - would be more sophisticated in practice
    return experiment.userAssignments.size < experiment.sampleSize
  }

  private static validateExperiment(experiment: FeedExperiment): void {
    if (!experiment.name || Object.keys(experiment.variants).length < 2) {
      throw new Error('Invalid experiment configuration')
    }

    if (experiment.sampleSize <= 0 || experiment.confidenceLevel <= 0 || experiment.confidenceLevel >= 1) {
      throw new Error('Invalid experiment parameters')
    }
  }

  private static async calculatePerformanceMetrics(since: Date): Promise<PerformanceMetric[]> {
    const metrics: PerformanceMetric[] = []

    // Calculate various performance metrics
    const activeSessions = Array.from(this.activeSessions.values())
    const recentSessions = activeSessions.filter(s => s.startTime >= since)

    if (recentSessions.length > 0) {
      // Average engagement rate
      const avgEngagement = recentSessions.reduce((sum, s) => sum + s.engagement.interactionRate, 0) / recentSessions.length
      metrics.push({
        name: 'engagement_rate',
        value: avgEngagement,
        target: 0.15,
        trend: avgEngagement > 0.15 ? 'improving' : 'degrading',
        timestamp: new Date()
      })

      // Average satisfaction score
      const avgSatisfaction = recentSessions.reduce((sum, s) => sum + s.engagement.satisfactionScore, 0) / recentSessions.length
      metrics.push({
        name: 'satisfaction_score',
        value: avgSatisfaction,
        target: 0.7,
        trend: avgSatisfaction > 0.7 ? 'improving' : 'degrading',
        timestamp: new Date()
      })

      // Session duration
      const avgDuration = recentSessions.reduce((sum, s) => {
        return sum + (s.lastActivity.getTime() - s.startTime.getTime())
      }, 0) / recentSessions.length / 1000 / 60 // minutes
      
      metrics.push({
        name: 'session_duration_minutes',
        value: avgDuration,
        target: 15,
        trend: avgDuration > 15 ? 'improving' : 'degrading',
        timestamp: new Date()
      })
    }

    return metrics
  }

  private static async getContentMetadata(itemId: string): Promise<any> {
    return await prisma.post.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        content: true,
        contentEmbedding: true,
        authorType: true,
        createdAt: true,
        engagementCount: true
      }
    })
  }

  private static async cacheSession(session: UserSession): Promise<void> {
    try {
      await redis.setex(`session:${session.sessionId}`, this.CACHE_TTL, JSON.stringify(session))
    } catch (error) {
      console.warn('Failed to cache session:', error)
    }
  }

  private static async storeSessionData(session: UserSession): Promise<void> {
    try {
      await prisma.userSession.create({
        data: {
          id: session.sessionId,
          userId: session.userId,
          startTime: session.startTime,
          endTime: session.lastActivity,
          actions: session.actions,
          engagement: session.engagement,
          adaptations: session.adaptations,
          context: session.context
        }
      })
    } catch (error) {
      console.error('Failed to store session data:', error)
    }
  }

  private static async updateExperimentMetrics(session: UserSession): Promise<void> {
    if (!session.adaptations.experimentVariant) return

    // Find the experiment
    const experiment = Array.from(this.runningExperiments.values())
      .find(exp => exp.userAssignments.get(session.userId) === session.adaptations.experimentVariant)

    if (!experiment) return

    const variant = session.adaptations.experimentVariant
    const metrics = experiment.metrics[variant]

    // Update metrics based on session data
    metrics.engagement = (metrics.engagement + session.engagement.interactionRate) / 2
    metrics.satisfaction = (metrics.satisfaction + session.engagement.satisfactionScore) / 2
    
    // Calculate retention (simplified)
    const sessionDuration = session.lastActivity.getTime() - session.startTime.getTime()
    const retentionScore = Math.min(sessionDuration / (15 * 60 * 1000), 1) // normalize to 15 minutes
    metrics.retention = (metrics.retention + retentionScore) / 2
  }

  private static async updatePerformanceMetrics(metricName: string, value: number): Promise<void> {
    this.performanceBuffer.push({
      name: metricName,
      value,
      target: 0, // would be configured
      trend: 'stable',
      timestamp: new Date()
    })

    // Keep buffer size manageable
    if (this.performanceBuffer.length > 1000) {
      this.performanceBuffer = this.performanceBuffer.slice(-500)
    }
  }

  private static async invalidateFeedsForFollowers(authorId: string): Promise<void> {
    // Would query followers and invalidate their feed caches
    await redis.del(`feed:*`) // simplified - would be more targeted
  }

  private static async invalidateAllFeeds(): Promise<void> {
    await redis.del(`feed:*`)
  }

  private static async updateFeedsForTopic(topic: string): Promise<void> {
    // Would update feeds for users interested in this topic
    console.log(`Updating feeds for trending topic: ${topic}`)
  }

  private static async updateUserSignals(userId: string, action: any): Promise<void> {
    // Update real-time user preference signals
    await redis.lpush(`user_signals:${userId}`, JSON.stringify({
      action,
      timestamp: new Date()
    }))
    
    await redis.ltrim(`user_signals:${userId}`, 0, 99) // keep last 100 signals
  }

  private static async reloadAlgorithmParameters(): Promise<void> {
    // Reload algorithm parameters from configuration
    console.log('Reloading algorithm parameters')
  }

  private static async performCacheInvalidation(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  }

  private static async handlePerformanceAlert(data: any): Promise<void> {
    console.warn('Performance alert:', data)
    // Would implement alerting logic
  }

  private static hashString(input: string): number {
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // convert to 32-bit integer
    }
    return Math.abs(hash)
  }
}

// Export the singleton
export const realtimeFeedOptimizer = RealtimeFeedOptimizer

// Extend Prisma schema for sessions (this would go in schema.prisma)
/*
model UserSession {
  id          String   @id
  userId      String
  startTime   DateTime
  endTime     DateTime
  actions     Json
  engagement  Json
  adaptations Json
  context     Json
  createdAt   DateTime @default(now())
  
  @@index([userId, startTime])
  @@map("user_sessions")
}
*/