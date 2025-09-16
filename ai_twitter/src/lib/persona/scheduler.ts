/**
 * Persona Posting Scheduler System
 * 
 * Implements realistic posting schedule management for AI personas with temporal
 * behavior modeling, activity pattern generation, and social context awareness.
 * 
 * Based on GABM (Generative Agent-Based Modeling) principles from research.md
 * Supports natural posting rhythms, event-driven posting, and social influence.
 */

import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { PersonaRelationshipManager } from './relationships'

// Core scheduling types and structures
export type ActivityLevel = 'low' | 'moderate' | 'high' | 'very_high'
export type PostingTrigger = 'scheduled' | 'news_event' | 'social_response' | 'trending_topic' | 'random'
export type TimeSlot = 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'late_night'

export interface PostingPattern {
  baseFrequency: number // posts per day baseline
  activityLevel: ActivityLevel
  preferredTimeSlots: TimeSlot[]
  weekdayMultiplier: number // modifier for weekday vs weekend activity
  seasonalPattern: {
    spring: number
    summer: number
    fall: number
    winter: number
  }
  personalityModifier: number // based on personality traits like extraversion
}

export interface SchedulingEvent {
  id: string
  personaId: string
  scheduledTime: Date
  triggerType: PostingTrigger
  priority: number // 0-10, higher = more important
  content?: string
  context: {
    newsEventId?: string
    respondingToPostId?: string
    trendingTopic?: string
    socialTrigger?: string
  }
  isFlexible: boolean // can be moved if needed
  retryCount: number
  maxRetries: number
}

export interface ActivityWindow {
  start: Date
  end: Date
  expectedPosts: number
  actualPosts: number
  energyLevel: number // 0-1, persona's current energy/motivation
  socialInfluence: number // 0-1, how much social context affects posting
}

export interface PostingMetrics {
  averagePostsPerDay: number
  peakActivityHours: number[]
  responseTime: number // average time to respond to social events
  consistencyScore: number // how well persona follows their pattern
  socialReactivity: number // how much persona responds to network activity
  contentDiversity: number // variety in posting topics/types
}

export class PersonaScheduler {
  private static readonly SCHEDULE_HORIZON_DAYS = 7
  private static readonly MIN_POST_INTERVAL = 300000 // 5 minutes minimum between posts
  private static readonly MAX_DAILY_POSTS = 50
  private static readonly ENERGY_DECAY_RATE = 0.02 // energy depletes with posting

  private relationshipManager: PersonaRelationshipManager

  constructor() {
    this.relationshipManager = new PersonaRelationshipManager()
  }

  /**
   * Generate posting schedule for a persona based on their activity pattern
   */
  async generatePostingSchedule(
    personaId: string,
    startDate: Date = new Date(),
    daysAhead: number = this.SCHEDULE_HORIZON_DAYS
  ): Promise<SchedulingEvent[]> {
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { 
        activityPattern: true,
        personality: true,
        isActive: true
      }
    })

    if (!persona || !persona.isActive) {
      return []
    }

    const activityPattern = persona.activityPattern as any
    const personality = persona.personality as any
    const pattern = this.parsePostingPattern(activityPattern, personality)

    const schedule: SchedulingEvent[] = []
    const endDate = new Date(startDate.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    for (let date = new Date(startDate); date < endDate; date.setDate(date.getDate() + 1)) {
      const dailySchedule = await this.generateDailySchedule(personaId, date, pattern)
      schedule.push(...dailySchedule)
    }

    // Sort by scheduled time and store in cache
    schedule.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime())
    await this.cacheSchedule(personaId, schedule)

    return schedule
  }

  /**
   * Dynamically adjust schedule based on real-time events
   */
  async adjustScheduleForEvent(
    personaId: string,
    eventType: PostingTrigger,
    context: SchedulingEvent['context'],
    urgency: number = 0.5 // 0-1, how urgent the response should be
  ): Promise<SchedulingEvent | null> {
    const currentSchedule = await this.getSchedule(personaId)
    const socialContext = await this.relationshipManager.getSocialContext(personaId)
    
    // Calculate response probability based on personality and social context
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { personality: true, activityPattern: true }
    })

    if (!persona) return null

    const personality = persona.personality as any
    const responseProb = this.calculateResponseProbability(
      eventType,
      urgency,
      personality,
      socialContext.activeConnections.length
    )

    // Decide whether to respond
    if (Math.random() > responseProb) {
      return null
    }

    // Find optimal insertion time
    const responseTime = this.calculateResponseTime(eventType, urgency, personality)
    const scheduledTime = new Date(Date.now() + responseTime * 1000)

    // Check for conflicts and adjust if necessary
    const adjustedTime = await this.findAvailableTimeSlot(
      personaId,
      scheduledTime,
      currentSchedule
    )

    const newEvent: SchedulingEvent = {
      id: `${personaId}_${Date.now()}_${eventType}`,
      personaId,
      scheduledTime: adjustedTime,
      triggerType: eventType,
      priority: Math.ceil(urgency * 10),
      context,
      isFlexible: urgency < 0.7,
      retryCount: 0,
      maxRetries: eventType === 'news_event' ? 3 : 1
    }

    // Insert into schedule and update cache
    currentSchedule.push(newEvent)
    currentSchedule.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime())
    await this.cacheSchedule(personaId, currentSchedule)

    return newEvent
  }

  /**
   * Process a scheduled posting event
   */
  async processScheduledEvent(eventId: string): Promise<boolean> {
    const event = await this.getEventById(eventId)
    if (!event) return false

    try {
      // Check if persona is still active and conditions are met
      const persona = await prisma.persona.findUnique({
        where: { id: event.personaId },
        select: { isActive: true, activityPattern: true }
      })

      if (!persona?.isActive) {
        await this.removeEventFromSchedule(event.personaId, eventId)
        return false
      }

      // Validate posting conditions (rate limits, energy levels, etc.)
      const canPost = await this.validatePostingConditions(event)
      if (!canPost) {
        if (event.retryCount < event.maxRetries) {
          await this.rescheduleEvent(event, 300000) // retry in 5 minutes
          return false
        } else {
          await this.removeEventFromSchedule(event.personaId, eventId)
          return false
        }
      }

      // Generate content if not provided
      if (!event.content) {
        event.content = await this.generateContextualContent(event)
      }

      // Create the actual post
      await this.createScheduledPost(event)

      // Update persona energy and activity metrics
      await this.updatePersonaActivity(event.personaId, event.triggerType)

      // Remove completed event from schedule
      await this.removeEventFromSchedule(event.personaId, eventId)

      return true
    } catch (error) {
      console.error(`Error processing scheduled event ${eventId}:`, error)
      
      // Retry if within limits
      if (event.retryCount < event.maxRetries) {
        await this.rescheduleEvent(event, 600000) // retry in 10 minutes
      } else {
        await this.removeEventFromSchedule(event.personaId, eventId)
      }
      
      return false
    }
  }

  /**
   * Get current activity metrics for a persona
   */
  async getPostingMetrics(personaId: string, days: number = 30): Promise<PostingMetrics> {
    const cacheKey = `posting_metrics:${personaId}:${days}`
    const cached = await redis.get(cacheKey)
    
    if (cached) {
      return JSON.parse(cached)
    }

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    
    const posts = await prisma.post.findMany({
      where: {
        authorId: personaId,
        authorType: 'PERSONA',
        createdAt: { gte: startDate }
      },
      select: {
        createdAt: true,
        content: true,
        generationSource: true
      },
      orderBy: { createdAt: 'asc' }
    })

    const metrics = this.calculatePostingMetrics(posts, days)
    
    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(metrics))
    
    return metrics
  }

  /**
   * Get upcoming schedule for a persona
   */
  async getUpcomingSchedule(
    personaId: string,
    hoursAhead: number = 24
  ): Promise<SchedulingEvent[]> {
    const schedule = await this.getSchedule(personaId)
    const cutoffTime = new Date(Date.now() + hoursAhead * 60 * 60 * 1000)
    
    return schedule.filter(event => 
      event.scheduledTime <= cutoffTime && 
      event.scheduledTime > new Date()
    )
  }

  // Private helper methods

  private parsePostingPattern(activityPattern: any, personality: any): PostingPattern {
    return {
      baseFrequency: activityPattern.postsPerDay || 3,
      activityLevel: activityPattern.activityLevel || 'moderate',
      preferredTimeSlots: activityPattern.preferredHours?.map(this.hourToTimeSlot) || ['morning', 'afternoon', 'evening'],
      weekdayMultiplier: activityPattern.weekdayMultiplier || 1.2,
      seasonalPattern: activityPattern.seasonalPattern || {
        spring: 1.1,
        summer: 1.2,
        fall: 1.0,
        winter: 0.9
      },
      personalityModifier: this.calculatePersonalityModifier(personality)
    }
  }

  private hourToTimeSlot(hour: number): TimeSlot {
    if (hour >= 5 && hour < 8) return 'early_morning'
    if (hour >= 8 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 14) return 'midday'
    if (hour >= 14 && hour < 18) return 'afternoon'
    if (hour >= 18 && hour < 22) return 'evening'
    return 'late_night'
  }

  private calculatePersonalityModifier(personality: any): number {
    const extraversion = personality.traits?.extraversion || 0.5
    const openness = personality.traits?.openness || 0.5
    const neuroticism = personality.traits?.neuroticism || 0.5
    
    // More extraverted personas post more, openness adds variety, neuroticism adds volatility
    return (extraversion * 0.4 + openness * 0.3 + neuroticism * 0.2 + 0.5)
  }

  private async generateDailySchedule(
    personaId: string,
    date: Date,
    pattern: PostingPattern
  ): Promise<SchedulingEvent[]> {
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const seasonMultiplier = this.getSeasonMultiplier(date, pattern.seasonalPattern)
    
    // Calculate expected posts for this day
    let expectedPosts = pattern.baseFrequency * seasonMultiplier
    if (!isWeekend) {
      expectedPosts *= pattern.weekdayMultiplier
    }
    expectedPosts *= pattern.personalityModifier
    
    // Add some randomness
    expectedPosts = Math.max(1, Math.floor(expectedPosts + (Math.random() - 0.5) * 2))
    expectedPosts = Math.min(expectedPosts, this.MAX_DAILY_POSTS)

    const dailyEvents: SchedulingEvent[] = []
    
    for (let i = 0; i < expectedPosts; i++) {
      const timeSlot = this.selectRandomTimeSlot(pattern.preferredTimeSlots)
      const scheduledTime = this.generateTimeInSlot(date, timeSlot)
      
      const event: SchedulingEvent = {
        id: `${personaId}_${date.toISOString().split('T')[0]}_${i}`,
        personaId,
        scheduledTime,
        triggerType: 'scheduled',
        priority: 3,
        context: {},
        isFlexible: true,
        retryCount: 0,
        maxRetries: 2
      }
      
      dailyEvents.push(event)
    }

    // Ensure minimum intervals between posts
    this.adjustForMinimumIntervals(dailyEvents)
    
    return dailyEvents
  }

  private selectRandomTimeSlot(preferredSlots: TimeSlot[]): TimeSlot {
    return preferredSlots[Math.floor(Math.random() * preferredSlots.length)]
  }

  private generateTimeInSlot(date: Date, timeSlot: TimeSlot): Date {
    const slotRanges = {
      early_morning: [5, 8],
      morning: [8, 12],
      midday: [12, 14],
      afternoon: [14, 18],
      evening: [18, 22],
      late_night: [22, 26] // 26 = 2 AM next day
    }

    const [startHour, endHour] = slotRanges[timeSlot]
    const randomHour = startHour + Math.random() * (endHour - startHour)
    const randomMinute = Math.random() * 60

    const scheduledTime = new Date(date)
    scheduledTime.setHours(Math.floor(randomHour) % 24, Math.floor(randomMinute), 0, 0)
    
    // Handle late night overflow to next day
    if (randomHour >= 24) {
      scheduledTime.setDate(scheduledTime.getDate() + 1)
    }

    return scheduledTime
  }

  private adjustForMinimumIntervals(events: SchedulingEvent[]): void {
    events.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime())
    
    for (let i = 1; i < events.length; i++) {
      const prevTime = events[i - 1].scheduledTime.getTime()
      const currentTime = events[i].scheduledTime.getTime()
      
      if (currentTime - prevTime < this.MIN_POST_INTERVAL) {
        events[i].scheduledTime = new Date(prevTime + this.MIN_POST_INTERVAL)
      }
    }
  }

  private getSeasonMultiplier(date: Date, seasonalPattern: PostingPattern['seasonalPattern']): number {
    const month = date.getMonth()
    if (month >= 2 && month <= 4) return seasonalPattern.spring
    if (month >= 5 && month <= 7) return seasonalPattern.summer
    if (month >= 8 && month <= 10) return seasonalPattern.fall
    return seasonalPattern.winter
  }

  private calculateResponseProbability(
    eventType: PostingTrigger,
    urgency: number,
    personality: any,
    socialConnections: number
  ): number {
    const baseProbs = {
      news_event: 0.3,
      social_response: 0.6,
      trending_topic: 0.4,
      random: 0.1,
      scheduled: 1.0
    }

    let probability = baseProbs[eventType] * (0.5 + urgency * 0.5)
    
    // Personality modifiers
    const extraversion = personality.traits?.extraversion || 0.5
    const openness = personality.traits?.openness || 0.5
    
    probability *= (0.5 + extraversion * 0.5) // more extraverted = more responsive
    probability *= (0.7 + openness * 0.3) // more open = more willing to engage
    
    // Social influence
    const socialInfluence = Math.min(socialConnections / 20, 1) // normalize by expected max connections
    probability *= (0.8 + socialInfluence * 0.2)
    
    return Math.min(probability, 0.95) // cap at 95%
  }

  private calculateResponseTime(
    eventType: PostingTrigger,
    urgency: number,
    personality: any
  ): number {
    const baseResponseTimes = {
      news_event: 1800, // 30 minutes
      social_response: 600, // 10 minutes
      trending_topic: 3600, // 1 hour
      random: 0,
      scheduled: 0
    }

    let responseTime = baseResponseTimes[eventType]
    
    // Urgency modifier - higher urgency = faster response
    responseTime *= (1 - urgency * 0.7)
    
    // Personality modifier - more neurotic = faster response
    const neuroticism = personality.traits?.neuroticism || 0.5
    responseTime *= (1 - neuroticism * 0.3)
    
    // Add some randomness
    responseTime *= (0.5 + Math.random())
    
    return Math.max(responseTime, 60) // minimum 1 minute delay
  }

  private async findAvailableTimeSlot(
    personaId: string,
    preferredTime: Date,
    currentSchedule: SchedulingEvent[]
  ): Promise<Date> {
    const conflicts = currentSchedule.filter(event => 
      Math.abs(event.scheduledTime.getTime() - preferredTime.getTime()) < this.MIN_POST_INTERVAL
    )

    if (conflicts.length === 0) {
      return preferredTime
    }

    // Find next available slot
    let adjustedTime = new Date(preferredTime.getTime() + this.MIN_POST_INTERVAL)
    
    while (true) {
      const hasConflict = currentSchedule.some(event =>
        Math.abs(event.scheduledTime.getTime() - adjustedTime.getTime()) < this.MIN_POST_INTERVAL
      )
      
      if (!hasConflict) {
        return adjustedTime
      }
      
      adjustedTime = new Date(adjustedTime.getTime() + this.MIN_POST_INTERVAL)
    }
  }

  private async validatePostingConditions(event: SchedulingEvent): Promise<boolean> {
    // Check rate limits
    const recentPosts = await prisma.post.count({
      where: {
        authorId: event.personaId,
        authorType: 'PERSONA',
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } // last hour
      }
    })

    if (recentPosts >= 10) { // max 10 posts per hour
      return false
    }

    // Check energy levels (simplified)
    const dailyPosts = await prisma.post.count({
      where: {
        authorId: event.personaId,
        authorType: 'PERSONA',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // last 24 hours
      }
    })

    if (dailyPosts >= this.MAX_DAILY_POSTS) {
      return false
    }

    return true
  }

  private async generateContextualContent(event: SchedulingEvent): Promise<string> {
    // This would integrate with the content generation system
    // For now, return a placeholder
    switch (event.triggerType) {
      case 'news_event':
        return `Interesting news about ${event.context.newsEventId}...`
      case 'social_response':
        return `Responding to ${event.context.respondingToPostId}...`
      case 'trending_topic':
        return `My thoughts on ${event.context.trendingTopic}...`
      default:
        return `Just thinking about life...`
    }
  }

  private async createScheduledPost(event: SchedulingEvent): Promise<void> {
    if (!event.content) {
      throw new Error('No content provided for scheduled post')
    }

    await prisma.post.create({
      data: {
        id: `post_${event.id}`,
        authorId: event.personaId,
        authorType: 'PERSONA',
        content: event.content,
        threadId: `thread_${event.id}`,
        generationSource: {
          trigger: event.triggerType,
          scheduled: true,
          priority: event.priority,
          context: event.context
        }
      }
    })
  }

  private async updatePersonaActivity(personaId: string, triggerType: PostingTrigger): Promise<void> {
    // Update activity patterns and energy levels
    // This would be expanded to track posting patterns and adjust future scheduling
    const cacheKey = `persona_energy:${personaId}`
    const currentEnergy = parseFloat(await redis.get(cacheKey) || '1.0')
    
    // Reduce energy based on posting activity
    const energyCost = {
      scheduled: 0.02,
      news_event: 0.05,
      social_response: 0.03,
      trending_topic: 0.04,
      random: 0.01
    }

    const newEnergy = Math.max(0.1, currentEnergy - energyCost[triggerType])
    await redis.setex(cacheKey, 86400, newEnergy.toString()) // cache for 24 hours
  }

  private calculatePostingMetrics(posts: any[], days: number): PostingMetrics {
    if (posts.length === 0) {
      return {
        averagePostsPerDay: 0,
        peakActivityHours: [],
        responseTime: 0,
        consistencyScore: 0,
        socialReactivity: 0,
        contentDiversity: 0
      }
    }

    const averagePostsPerDay = posts.length / days

    // Calculate peak activity hours
    const hourCounts = new Array(24).fill(0)
    posts.forEach(post => {
      const hour = new Date(post.createdAt).getHours()
      hourCounts[hour]++
    })
    
    const maxCount = Math.max(...hourCounts)
    const peakActivityHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(({ count }) => count >= maxCount * 0.8)
      .map(({ hour }) => hour)

    // Calculate other metrics (simplified)
    const socialPosts = posts.filter(p => p.generationSource?.trigger === 'social_response').length
    const socialReactivity = socialPosts / posts.length

    const responsePosts = posts.filter(p => p.generationSource?.trigger !== 'scheduled')
    const averageResponseTime = responsePosts.length > 0 ? 1800 : 0 // simplified

    return {
      averagePostsPerDay,
      peakActivityHours,
      responseTime: averageResponseTime,
      consistencyScore: 0.8, // simplified
      socialReactivity,
      contentDiversity: 0.7 // simplified
    }
  }

  private async getSchedule(personaId: string): Promise<SchedulingEvent[]> {
    const cacheKey = `schedule:${personaId}`
    const cached = await redis.get(cacheKey)
    
    if (cached) {
      return JSON.parse(cached)
    }
    
    return []
  }

  private async cacheSchedule(personaId: string, schedule: SchedulingEvent[]): Promise<void> {
    const cacheKey = `schedule:${personaId}`
    await redis.setex(cacheKey, 86400, JSON.stringify(schedule)) // cache for 24 hours
  }

  private async getEventById(eventId: string): Promise<SchedulingEvent | null> {
    // Extract persona ID from event ID
    const personaId = eventId.split('_')[0]
    const schedule = await this.getSchedule(personaId)
    
    return schedule.find(event => event.id === eventId) || null
  }

  private async removeEventFromSchedule(personaId: string, eventId: string): Promise<void> {
    const schedule = await this.getSchedule(personaId)
    const filteredSchedule = schedule.filter(event => event.id !== eventId)
    await this.cacheSchedule(personaId, filteredSchedule)
  }

  private async rescheduleEvent(event: SchedulingEvent, delayMs: number): Promise<void> {
    event.scheduledTime = new Date(event.scheduledTime.getTime() + delayMs)
    event.retryCount++
    
    const schedule = await this.getSchedule(event.personaId)
    const eventIndex = schedule.findIndex(e => e.id === event.id)
    
    if (eventIndex >= 0) {
      schedule[eventIndex] = event
      schedule.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime())
      await this.cacheSchedule(event.personaId, schedule)
    }
  }
}

// Export the singleton instance
export const personaScheduler = new PersonaScheduler()