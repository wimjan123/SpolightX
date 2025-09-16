/**
 * Persona Relationships Management System
 * 
 * Implements social graph management for inter-persona relationships with dynamic
 * relationship modeling, interaction influence, and social network analysis.
 * 
 * Based on GABM (Generative Agent-Based Modeling) principles from research.md
 * Supports realistic social dynamics including friendship paradox and network effects.
 */

import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

// Core relationship types and structures
export type RelationshipType = 
  | 'friend' 
  | 'follower' 
  | 'acquaintance' 
  | 'rival' 
  | 'mentor'
  | 'blocked'
  | 'ignored'

export type RelationshipStrength = 'weak' | 'moderate' | 'strong' | 'very_strong'

export interface PersonaRelationship {
  targetPersonaId: string
  relationshipType: RelationshipType
  strength: RelationshipStrength
  createdAt: Date
  lastInteraction: Date
  interactionCount: number
  sentimentScore: number // -1.0 to 1.0
  mutualFriends: string[] // shared connections
  commonInterests: string[] // shared topics/categories
  influenceWeight: number // 0.0 to 1.0, how much this relationship affects behavior
}

export interface SocialNetworkMetrics {
  totalConnections: number
  mutualConnections: number
  networkCentrality: number // betweenness centrality score
  clusteringCoefficient: number // how interconnected are connections
  reachability: number // average degrees of separation
  influenceScore: number // overall network influence
}

export interface RelationshipInfluence {
  contentPreference: number // how much this relationship affects content choices
  toneModification: number // how much this relationship affects tone
  topicRelevance: number // how much this relationship affects topic selection
  postingTiming: number // how much this relationship affects when to post
}

export interface SocialContext {
  activeConnections: PersonaRelationship[]
  recentInteractions: {
    personaId: string
    type: 'like' | 'reply' | 'repost' | 'mention'
    timestamp: Date
    sentimentChange: number
  }[]
  networkTrends: {
    trendingTopics: string[]
    emergingConnections: string[]
    networkGossip: string[] // what the network is discussing
  }
}

export class PersonaRelationshipManager {
  private static readonly CACHE_TTL = 3600 // 1 hour
  private static readonly MAX_RELATIONSHIPS = 150 // Dunbar's number
  private static readonly INTERACTION_DECAY = 0.95 // daily interaction value decay

  /**
   * Initialize or update a relationship between two personas
   */
  async createOrUpdateRelationship(
    sourcePersonaId: string,
    targetPersonaId: string,
    relationshipType: RelationshipType,
    initialStrength: RelationshipStrength = 'weak'
  ): Promise<PersonaRelationship> {
    if (sourcePersonaId === targetPersonaId) {
      throw new Error('Cannot create self-relationship')
    }

    // Get current persona data
    const sourcePersona = await prisma.persona.findUnique({
      where: { id: sourcePersonaId },
      select: { relationships: true }
    })

    if (!sourcePersona) {
      throw new Error('Source persona not found')
    }

    const relationships = (sourcePersona.relationships as any) || {}
    const existingRelationship = relationships[targetPersonaId]

    // Calculate common interests and mutual friends
    const commonInterests = await this.findCommonInterests(sourcePersonaId, targetPersonaId)
    const mutualFriends = await this.findMutualConnections(sourcePersonaId, targetPersonaId)

    const newRelationship: PersonaRelationship = {
      targetPersonaId,
      relationshipType,
      strength: existingRelationship?.strength || initialStrength,
      createdAt: existingRelationship?.createdAt || new Date(),
      lastInteraction: new Date(),
      interactionCount: (existingRelationship?.interactionCount || 0) + 1,
      sentimentScore: existingRelationship?.sentimentScore || 0.1,
      mutualFriends,
      commonInterests,
      influenceWeight: this.calculateInfluenceWeight(relationshipType, initialStrength, commonInterests.length)
    }

    // Update relationships in database
    relationships[targetPersonaId] = newRelationship

    await prisma.persona.update({
      where: { id: sourcePersonaId },
      data: { relationships }
    })

    // Cache the relationship for quick access
    await this.cacheRelationship(sourcePersonaId, targetPersonaId, newRelationship)

    return newRelationship
  }

  /**
   * Process an interaction between personas and update relationship accordingly
   */
  async processInteraction(
    sourcePersonaId: string,
    targetPersonaId: string,
    interactionType: 'like' | 'reply' | 'repost' | 'mention' | 'follow',
    sentiment: number = 0.1 // -1.0 to 1.0
  ): Promise<void> {
    const relationship = await this.getRelationship(sourcePersonaId, targetPersonaId)
    
    if (!relationship) {
      // Create new relationship based on interaction type
      const relationshipType = this.inferRelationshipType(interactionType, sentiment)
      await this.createOrUpdateRelationship(sourcePersonaId, targetPersonaId, relationshipType)
      return
    }

    // Update relationship based on interaction
    const strengthChange = this.calculateStrengthChange(interactionType, sentiment)
    const newSentimentScore = this.updateSentimentScore(relationship.sentimentScore, sentiment)
    const newStrength = this.updateRelationshipStrength(relationship.strength, strengthChange)

    // Update relationship in database
    const sourcePersona = await prisma.persona.findUnique({
      where: { id: sourcePersonaId },
      select: { relationships: true }
    })

    if (sourcePersona) {
      const relationships = (sourcePersona.relationships as any) || {}
      relationships[targetPersonaId] = {
        ...relationship,
        lastInteraction: new Date(),
        interactionCount: relationship.interactionCount + 1,
        sentimentScore: newSentimentScore,
        strength: newStrength,
        influenceWeight: this.calculateInfluenceWeight(
          relationship.relationshipType, 
          newStrength, 
          relationship.commonInterests.length
        )
      }

      await prisma.persona.update({
        where: { id: sourcePersonaId },
        data: { relationships }
      })

      // Cache updated relationship
      await this.cacheRelationship(sourcePersonaId, targetPersonaId, relationships[targetPersonaId])
    }
  }

  /**
   * Get social network metrics for a persona
   */
  async getSocialNetworkMetrics(personaId: string): Promise<SocialNetworkMetrics> {
    const cacheKey = `social_metrics:${personaId}`
    const cached = await redis.get(cacheKey)
    
    if (cached) {
      return JSON.parse(cached)
    }

    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { relationships: true }
    })

    if (!persona) {
      throw new Error('Persona not found')
    }

    const relationships = (persona.relationships as any) || {}
    const connections = Object.values(relationships) as PersonaRelationship[]

    // Calculate network metrics
    const totalConnections = connections.length
    const mutualConnections = await this.calculateMutualConnections(personaId, connections)
    const networkCentrality = await this.calculateNetworkCentrality(personaId)
    const clusteringCoefficient = await this.calculateClusteringCoefficient(personaId, connections)
    const reachability = await this.calculateNetworkReachability(personaId)
    const influenceScore = this.calculateInfluenceScore(connections)

    const metrics: SocialNetworkMetrics = {
      totalConnections,
      mutualConnections,
      networkCentrality,
      clusteringCoefficient,
      reachability,
      influenceScore
    }

    // Cache metrics for 1 hour
    await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(metrics))

    return metrics
  }

  /**
   * Get relationship influence on persona behavior
   */
  async getRelationshipInfluence(
    personaId: string,
    context: 'posting' | 'replying' | 'reacting'
  ): Promise<RelationshipInfluence> {
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { relationships: true }
    })

    if (!persona) {
      throw new Error('Persona not found')
    }

    const relationships = (persona.relationships as any) || {}
    const connections = Object.values(relationships) as PersonaRelationship[]

    // Calculate weighted influence based on relationship strength and recent activity
    const activeConnections = connections.filter(rel => 
      rel.lastInteraction > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
    )

    const totalInfluenceWeight = activeConnections.reduce((sum, rel) => sum + rel.influenceWeight, 0)

    if (totalInfluenceWeight === 0) {
      return {
        contentPreference: 0,
        toneModification: 0,
        topicRelevance: 0,
        postingTiming: 0
      }
    }

    // Weight influence by relationship type and context
    const influence: RelationshipInfluence = {
      contentPreference: this.calculateContextualInfluence(activeConnections, 'content', context),
      toneModification: this.calculateContextualInfluence(activeConnections, 'tone', context),
      topicRelevance: this.calculateContextualInfluence(activeConnections, 'topic', context),
      postingTiming: this.calculateContextualInfluence(activeConnections, 'timing', context)
    }

    return influence
  }

  /**
   * Get current social context for a persona
   */
  async getSocialContext(personaId: string): Promise<SocialContext> {
    const [relationships, recentInteractions, networkTrends] = await Promise.all([
      this.getActiveRelationships(personaId),
      this.getRecentInteractions(personaId),
      this.getNetworkTrends(personaId)
    ])

    return {
      activeConnections: relationships,
      recentInteractions,
      networkTrends
    }
  }

  // Private helper methods

  private async getRelationship(
    sourcePersonaId: string, 
    targetPersonaId: string
  ): Promise<PersonaRelationship | null> {
    const cacheKey = `relationship:${sourcePersonaId}:${targetPersonaId}`
    const cached = await redis.get(cacheKey)
    
    if (cached) {
      return JSON.parse(cached)
    }

    const persona = await prisma.persona.findUnique({
      where: { id: sourcePersonaId },
      select: { relationships: true }
    })

    if (!persona) return null

    const relationships = (persona.relationships as any) || {}
    return relationships[targetPersonaId] || null
  }

  private async cacheRelationship(
    sourcePersonaId: string,
    targetPersonaId: string,
    relationship: PersonaRelationship
  ): Promise<void> {
    const cacheKey = `relationship:${sourcePersonaId}:${targetPersonaId}`
    await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(relationship))
  }

  private async findCommonInterests(
    personaId1: string,
    personaId2: string
  ): Promise<string[]> {
    // Query persona memories for common topics/interests
    const [persona1Memories, persona2Memories] = await Promise.all([
      prisma.personaMemory.findMany({
        where: { personaId: personaId1, type: 'interest' },
        select: { details: true }
      }),
      prisma.personaMemory.findMany({
        where: { personaId: personaId2, type: 'interest' },
        select: { details: true }
      })
    ])

    const interests1 = persona1Memories.map(m => (m.details as any).topic).filter(Boolean)
    const interests2 = persona2Memories.map(m => (m.details as any).topic).filter(Boolean)

    return interests1.filter(interest => interests2.includes(interest))
  }

  private async findMutualConnections(
    personaId1: string,
    personaId2: string
  ): Promise<string[]> {
    const [persona1, persona2] = await Promise.all([
      prisma.persona.findUnique({
        where: { id: personaId1 },
        select: { relationships: true }
      }),
      prisma.persona.findUnique({
        where: { id: personaId2 },
        select: { relationships: true }
      })
    ])

    if (!persona1 || !persona2) return []

    const connections1 = Object.keys((persona1.relationships as any) || {})
    const connections2 = Object.keys((persona2.relationships as any) || {})

    return connections1.filter(id => connections2.includes(id))
  }

  private calculateInfluenceWeight(
    relationshipType: RelationshipType,
    strength: RelationshipStrength,
    commonInterestsCount: number
  ): number {
    const typeWeights = {
      friend: 0.8,
      mentor: 0.9,
      follower: 0.3,
      acquaintance: 0.4,
      rival: 0.2,
      blocked: 0.0,
      ignored: 0.0
    }

    const strengthWeights = {
      weak: 0.3,
      moderate: 0.6,
      strong: 0.8,
      very_strong: 1.0
    }

    const baseWeight = typeWeights[relationshipType] * strengthWeights[strength]
    const interestBonus = Math.min(commonInterestsCount * 0.1, 0.3)

    return Math.min(baseWeight + interestBonus, 1.0)
  }

  private inferRelationshipType(
    interactionType: string,
    sentiment: number
  ): RelationshipType {
    if (sentiment < -0.5) return 'rival'
    if (sentiment > 0.7) return 'friend'
    if (interactionType === 'follow') return 'follower'
    return 'acquaintance'
  }

  private calculateStrengthChange(interactionType: string, sentiment: number): number {
    const baseChanges = {
      like: 0.05,
      reply: 0.1,
      repost: 0.15,
      mention: 0.08,
      follow: 0.2
    }

    const baseChange = baseChanges[interactionType as keyof typeof baseChanges] || 0.05
    return baseChange * (1 + sentiment) // sentiment modifier
  }

  private updateSentimentScore(currentScore: number, newSentiment: number): number {
    // Exponential moving average with 0.7 weight on existing sentiment
    return Math.max(-1.0, Math.min(1.0, currentScore * 0.7 + newSentiment * 0.3))
  }

  private updateRelationshipStrength(
    currentStrength: RelationshipStrength,
    strengthChange: number
  ): RelationshipStrength {
    const strengthLevels = ['weak', 'moderate', 'strong', 'very_strong'] as const
    const currentIndex = strengthLevels.indexOf(currentStrength)
    
    // Simple threshold-based strength progression
    if (strengthChange > 0.3 && currentIndex < 3) {
      return strengthLevels[currentIndex + 1]
    } else if (strengthChange < -0.2 && currentIndex > 0) {
      return strengthLevels[currentIndex - 1]
    }
    
    return currentStrength
  }

  private async calculateMutualConnections(
    personaId: string,
    connections: PersonaRelationship[]
  ): Promise<number> {
    let mutualCount = 0
    
    for (const connection of connections) {
      const mutualFriends = await this.findMutualConnections(personaId, connection.targetPersonaId)
      mutualCount += mutualFriends.length
    }
    
    return mutualCount
  }

  private async calculateNetworkCentrality(personaId: string): Promise<number> {
    // Simplified betweenness centrality calculation
    // In a full implementation, this would use graph algorithms
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { relationships: true }
    })

    if (!persona) return 0

    const relationships = (persona.relationships as any) || {}
    const connectionCount = Object.keys(relationships).length

    // Normalize by theoretical maximum (simplified)
    return Math.min(connectionCount / this.MAX_RELATIONSHIPS, 1.0)
  }

  private async calculateClusteringCoefficient(
    personaId: string,
    connections: PersonaRelationship[]
  ): Promise<number> {
    if (connections.length < 2) return 0

    let interconnectedPairs = 0
    const totalPossiblePairs = (connections.length * (connections.length - 1)) / 2

    // Check how many of this persona's connections are also connected to each other
    for (let i = 0; i < connections.length; i++) {
      for (let j = i + 1; j < connections.length; j++) {
        const areConnected = await this.getRelationship(
          connections[i].targetPersonaId,
          connections[j].targetPersonaId
        )
        if (areConnected) interconnectedPairs++
      }
    }

    return totalPossiblePairs > 0 ? interconnectedPairs / totalPossiblePairs : 0
  }

  private async calculateNetworkReachability(personaId: string): Promise<number> {
    // Simplified average path length calculation
    // In a full implementation, this would use BFS/DFS algorithms
    const directConnections = await this.getActiveRelationships(personaId)
    const avgPathLength = directConnections.length > 0 ? 2.5 : 0 // simplified assumption
    
    return Math.max(0, 1 - (avgPathLength / 6)) // normalize against 6 degrees of separation
  }

  private calculateInfluenceScore(connections: PersonaRelationship[]): number {
    const totalInfluence = connections.reduce((sum, rel) => sum + rel.influenceWeight, 0)
    return Math.min(totalInfluence / 10, 1.0) // normalize
  }

  private calculateContextualInfluence(
    connections: PersonaRelationship[],
    influenceType: 'content' | 'tone' | 'topic' | 'timing',
    context: string
  ): number {
    const typeWeights = {
      content: { posting: 0.8, replying: 0.6, reacting: 0.4 },
      tone: { posting: 0.7, replying: 0.9, reacting: 0.5 },
      topic: { posting: 0.9, replying: 0.7, reacting: 0.6 },
      timing: { posting: 0.6, replying: 0.3, reacting: 0.2 }
    }

    const contextWeight = typeWeights[influenceType][context as keyof typeof typeWeights[typeof influenceType]] || 0.5
    const totalInfluence = connections.reduce((sum, rel) => sum + rel.influenceWeight, 0)
    
    return Math.min((totalInfluence * contextWeight) / connections.length, 1.0)
  }

  private async getActiveRelationships(personaId: string): Promise<PersonaRelationship[]> {
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { relationships: true }
    })

    if (!persona) return []

    const relationships = (persona.relationships as any) || {}
    const connections = Object.values(relationships) as PersonaRelationship[]

    // Filter for relationships that are active (recent interaction)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    return connections.filter(rel => rel.lastInteraction > sevenDaysAgo)
  }

  private async getRecentInteractions(personaId: string): Promise<SocialContext['recentInteractions']> {
    // Query interaction records from the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    const interactions = await prisma.interaction.findMany({
      where: {
        userId: personaId,
        createdAt: { gte: oneDayAgo }
      },
      select: {
        targetId: true,
        interactionType: true,
        createdAt: true,
        metadata: true
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    return interactions.map(interaction => ({
      personaId: interaction.targetId,
      type: interaction.interactionType.toLowerCase() as any,
      timestamp: interaction.createdAt,
      sentimentChange: ((interaction.metadata as any)?.sentimentChange || 0)
    }))
  }

  private async getNetworkTrends(personaId: string): Promise<SocialContext['networkTrends']> {
    // Get trending topics from connections' recent activities
    const activeConnections = await this.getActiveRelationships(personaId)
    const connectionIds = activeConnections.map(rel => rel.targetPersonaId)

    if (connectionIds.length === 0) {
      return {
        trendingTopics: [],
        emergingConnections: [],
        networkGossip: []
      }
    }

    // Query recent posts from connections to identify trending topics
    const recentPosts = await prisma.post.findMany({
      where: {
        authorId: { in: connectionIds },
        authorType: 'PERSONA',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      select: { content: true },
      take: 100
    })

    // Simple keyword extraction for trending topics (in production, use NLP)
    const allWords = recentPosts.flatMap(post => 
      post.content.toLowerCase().split(/\s+/).filter(word => word.length > 4)
    )
    
    const wordCounts = allWords.reduce((counts, word) => {
      counts[word] = (counts[word] || 0) + 1
      return counts
    }, {} as Record<string, number>)

    const trendingTopics = Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word)

    return {
      trendingTopics,
      emergingConnections: [], // TODO: implement new connection detection
      networkGossip: trendingTopics.slice(0, 3) // simplified network discussion topics
    }
  }
}

// Export the singleton instance
export const relationshipManager = new PersonaRelationshipManager()