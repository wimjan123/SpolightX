/**
 * Persona Behavior Generator Tests
 * 
 * Tests for GABM persona simulation and behavior generation.
 * Following TDD - these tests should FAIL FIRST before implementation.
 */

import { PersonaSimulator } from '@/lib/persona/simulator'
import { PersonalityProcessor } from '@/lib/persona/personality'
import { PersonaMemory } from '@/lib/persona/memory'
import { PersonaScheduler } from '@/lib/persona/scheduler'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

// Mock dependencies
jest.mock('@/lib/prisma')
jest.mock('@/lib/redis')
jest.mock('@/lib/ai/client')
jest.mock('@/lib/ai/content-generator')

describe('PersonaSimulator Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initializePersona', () => {
    it('should create persona with GABM behavioral patterns', async () => {
      const personaConfig = {
        personality: {
          openness: 0.8,
          conscientiousness: 0.7,
          extraversion: 0.6,
          agreeableness: 0.5,
          neuroticism: 0.3,
        },
        archetype: 'INNOVATOR',
        postingStyle: {
          frequency: 0.7,
          topics: ['technology', 'innovation'],
          tonePreferences: {
            humor: 0.6,
            formality: 0.4,
          },
        },
      }

      // This should FAIL initially because PersonaSimulator.initializePersona might not exist
      const result = await PersonaSimulator.initializePersona(personaConfig)

      expect(result).toEqual({
        activityPattern: expect.objectContaining({
          peakHours: expect.any(Array),
          postFrequency: expect.any(Number),
          responseDelay: expect.objectContaining({
            min: expect.any(Number),
            max: expect.any(Number),
          }),
          socialBehavior: expect.objectContaining({
            followProbability: expect.any(Number),
            likeProbability: expect.any(Number),
            replyProbability: expect.any(Number),
          }),
        }),
        conversationStyle: expect.objectContaining({
          verbosity: expect.any(Number),
          emotionalRange: expect.any(Number),
          opinionStrength: expect.any(Number),
        }),
        socialGraph: expect.objectContaining({
          preferredConnections: expect.any(Array),
          influenceRadius: expect.any(Number),
          networkRole: expect.stringMatching(/influencer|connector|observer|creator/),
        }),
      })
    })

    it('should generate realistic activity patterns based on personality', async () => {
      const extrovertPersona = {
        personality: { extraversion: 0.9, openness: 0.8 },
        archetype: 'SOCIAL_BUTTERFLY',
      }

      const introvertPersona = {
        personality: { extraversion: 0.2, openness: 0.4 },
        archetype: 'LURKER',
      }

      const extrovertResult = await PersonaSimulator.initializePersona(extrovertPersona)
      const introvertResult = await PersonaSimulator.initializePersona(introvertPersona)

      // Extrovert should be more active
      expect(extrovertResult.activityPattern.postFrequency).toBeGreaterThan(
        introvertResult.activityPattern.postFrequency
      )

      expect(extrovertResult.activityPattern.socialBehavior.likeProbability).toBeGreaterThan(
        introvertResult.activityPattern.socialBehavior.likeProbability
      )
    })

    it('should create appropriate social behavior patterns', async () => {
      const agreeablePersona = {
        personality: { agreeableness: 0.9, openness: 0.7 },
        archetype: 'SUPPORTIVE',
      }

      const result = await PersonaSimulator.initializePersona(agreeablePersona)

      expect(result.activityPattern.socialBehavior).toEqual({
        followProbability: expect.any(Number),
        likeProbability: expect.any(Number),
        replyProbability: expect.any(Number),
        shareContent: expect.any(Number),
        supportiveLanguage: expect.any(Number),
      })

      // Agreeable personas should have higher social engagement
      expect(result.activityPattern.socialBehavior.likeProbability).toBeGreaterThan(0.6)
      expect(result.activityPattern.socialBehavior.supportiveLanguage).toBeGreaterThan(0.7)
    })
  })

  describe('generateBehavior', () => {
    it('should generate context-aware behaviors', async () => {
      const persona = {
        id: 'persona-1',
        personality: { openness: 0.8, extraversion: 0.7 },
        activityPattern: {
          postFrequency: 0.6,
          socialBehavior: { replyProbability: 0.5 },
        },
      }

      const context = {
        triggerType: 'reactive' as const,
        socialContext: {
          recentInteractions: [
            {
              personaId: 'other-persona',
              type: 'mention',
              timestamp: new Date(),
              content: '@persona-1 what do you think about AI?',
            },
          ],
          networkPosition: {
            connections: 50,
            influence: 0.3,
            centrality: 0.4,
          },
        },
      }

      // This should FAIL initially because generateBehavior might not exist
      const behaviors = await PersonaSimulator.generateBehavior(persona, context)

      expect(behaviors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            behaviorType: expect.stringMatching(/post|reply|like|repost|dm/),
            personaId: 'persona-1',
            context: expect.objectContaining({
              triggerType: 'reactive',
            }),
            parameters: expect.objectContaining({
              urgency: expect.any(Number),
              confidence: expect.any(Number),
              socialWeight: expect.any(Number),
            }),
            scheduledAt: expect.any(Date),
          }),
        ])
      )
    })

    it('should respond to trending topics appropriately', async () => {
      const techEnthusiastPersona = {
        id: 'tech-persona',
        personality: { openness: 0.9, conscientiousness: 0.7 },
        postingStyle: {
          topics: ['technology', 'innovation', 'AI'],
        },
      }

      const trendingContext = {
        triggerType: 'trend' as const,
        triggerData: {
          topic: 'AI Breakthrough',
          velocity: 0.8,
          relevance: 0.9,
        },
      }

      const behaviors = await PersonaSimulator.generateBehavior(
        techEnthusiastPersona,
        trendingContext
      )

      // Should generate post behavior about trending topic
      const postBehavior = behaviors.find(b => b.behaviorType === 'post')
      expect(postBehavior).toBeDefined()
      expect(postBehavior?.parameters.urgency).toBeGreaterThan(0.6)
      expect(postBehavior?.parameters.confidence).toBeGreaterThan(0.7)
    })

    it('should handle social interactions based on relationships', async () => {
      const socialPersona = {
        id: 'social-persona',
        personality: { extraversion: 0.8, agreeableness: 0.9 },
        relationships: {
          'friend-persona': { strength: 0.8, type: 'friend' },
          'rival-persona': { strength: -0.3, type: 'rival' },
        },
      }

      const socialContext = {
        triggerType: 'social' as const,
        socialContext: {
          recentInteractions: [
            {
              personaId: 'friend-persona',
              type: 'post',
              content: 'Just had an amazing day!',
              timestamp: new Date(),
            },
          ],
        },
      }

      const behaviors = await PersonaSimulator.generateBehavior(
        socialPersona,
        socialContext
      )

      // Should be more likely to engage positively with friends
      const likeBehavior = behaviors.find(b => b.behaviorType === 'like')
      expect(likeBehavior?.parameters.confidence).toBeGreaterThan(0.7)
    })

    it('should schedule behaviors based on persona activity patterns', async () => {
      const nightOwlPersona = {
        id: 'night-owl',
        activityPattern: {
          peakHours: [22, 23, 0, 1, 2], // Night hours
          timeZone: 'America/New_York',
        },
      }

      const behaviors = await PersonaSimulator.generateBehavior(
        nightOwlPersona,
        { triggerType: 'scheduled' }
      )

      // Behaviors should be scheduled during peak hours
      const scheduledHour = behaviors[0].scheduledAt.getHours()
      expect(nightOwlPersona.activityPattern.peakHours).toContain(scheduledHour)
    })
  })

  describe('executeBehavior', () => {
    it('should execute post behavior with content generation', async () => {
      const behavior = {
        id: 'behavior-1',
        personaId: 'persona-1',
        behaviorType: 'post' as const,
        context: {
          triggerType: 'trend' as const,
          triggerData: { topic: 'Climate Change' },
        },
        parameters: {
          urgency: 0.7,
          confidence: 0.8,
          socialWeight: 0.5,
        },
        scheduledAt: new Date(),
      }

      const persona = {
        id: 'persona-1',
        name: 'Eco Activist',
        personality: { openness: 0.9, agreeableness: 0.8 },
        postingStyle: {
          topics: ['environment', 'sustainability'],
          tonePreferences: { formality: 0.6, passion: 0.8 },
        },
      }

      // This should FAIL initially because executeBehavior might not exist
      const result = await PersonaSimulator.executeBehavior(behavior, persona)

      expect(result).toEqual({
        success: true,
        contentId: expect.any(String),
        generatedContent: expect.objectContaining({
          text: expect.any(String),
          metadata: expect.objectContaining({
            personaId: 'persona-1',
            behaviorId: 'behavior-1',
            triggerContext: behavior.context,
          }),
        }),
        executedAt: expect.any(Date),
      })

      // Should create post in database
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authorId: 'persona-1',
            authorType: 'PERSONA',
            content: expect.any(String),
          }),
        })
      )
    })

    it('should execute reply behavior to specific posts', async () => {
      const replyBehavior = {
        id: 'reply-behavior',
        personaId: 'persona-1',
        behaviorType: 'reply' as const,
        targetId: 'original-post-id',
        context: {
          triggerType: 'reactive' as const,
          triggerData: {
            originalPost: {
              content: 'What do you think about renewable energy?',
              authorId: 'other-user',
            },
          },
        },
        parameters: { urgency: 0.6, confidence: 0.7, socialWeight: 0.8 },
      }

      const result = await PersonaSimulator.executeBehavior(replyBehavior, {
        id: 'persona-1',
        personality: { openness: 0.8 },
        postingStyle: { topics: ['environment'] },
      })

      expect(result.success).toBe(true)
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentId: 'original-post-id',
            authorType: 'PERSONA',
          }),
        })
      )
    })

    it('should handle behavior execution failures gracefully', async () => {
      const failingBehavior = {
        id: 'fail-behavior',
        personaId: 'persona-1',
        behaviorType: 'post' as const,
        context: { triggerType: 'scheduled' as const },
        parameters: { urgency: 0.5, confidence: 0.5, socialWeight: 0.5 },
      }

      // Mock content generation failure
      jest.spyOn(PersonaSimulator, 'executeBehavior').mockRejectedValueOnce(
        new Error('Content generation failed')
      )

      const result = await PersonaSimulator.executeBehavior(failingBehavior, {
        id: 'persona-1',
      })

      expect(result).toEqual({
        success: false,
        error: 'Content generation failed',
        executedAt: expect.any(Date),
      })
    })

    it('should respect content safety and moderation', async () => {
      const riskyBehavior = {
        id: 'risky-behavior',
        personaId: 'controversial-persona',
        behaviorType: 'post' as const,
        context: {
          triggerType: 'trend' as const,
          triggerData: { topic: 'Controversial Topic' },
        },
        parameters: { urgency: 0.9, confidence: 0.8, socialWeight: 0.3 },
      }

      const result = await PersonaSimulator.executeBehavior(riskyBehavior, {
        id: 'controversial-persona',
        riskLevel: 0.8,
        postingStyle: { riskiness: 0.7 },
      })

      // Should either block content or apply safety measures
      if (!result.success) {
        expect(result.error).toMatch(/content blocked|moderation/i)
      } else {
        expect(result.moderationApplied).toBe(true)
      }
    })
  })

  describe('simulateNetworkEffects', () => {
    it('should simulate viral content spread', async () => {
      const viralPost = {
        id: 'viral-post',
        content: 'Highly engaging viral content',
        authorId: 'influencer-persona',
        engagementScore: 0.95,
        timestamp: new Date(),
      }

      const networkPersonas = Array.from({ length: 10 }, (_, i) => ({
        id: `persona-${i}`,
        personality: { extraversion: Math.random(), openness: Math.random() },
        connections: ['influencer-persona'],
        activityLevel: Math.random(),
      }))

      // This should FAIL initially because simulateNetworkEffects might not exist
      const spreadResult = await PersonaSimulator.simulateNetworkEffects({
        initialPost: viralPost,
        networkPersonas,
        timeHorizon: '6h',
        spreadModel: 'exponential',
      })

      expect(spreadResult).toEqual({
        timeline: expect.arrayContaining([
          expect.objectContaining({
            timestamp: expect.any(Date),
            action: expect.stringMatching(/like|repost|reply|view/),
            personaId: expect.any(String),
            cumulativeReach: expect.any(Number),
          }),
        ]),
        finalMetrics: expect.objectContaining({
          totalReach: expect.any(Number),
          totalEngagements: expect.any(Number),
          virality: expect.any(Number),
          peakMoment: expect.any(Date),
        }),
        influenceMap: expect.any(Object),
      })
    })

    it('should model information cascade effects', async () => {
      const seedPersonas = [
        { id: 'influencer-1', influence: 0.9, followers: 1000 },
        { id: 'influencer-2', influence: 0.7, followers: 500 },
      ]

      const information = {
        content: 'Important breaking news',
        credibility: 0.8,
        urgency: 0.9,
      }

      const cascade = await PersonaSimulator.simulateInformationCascade({
        seedPersonas,
        information,
        networkTopology: 'scale_free',
        timeSteps: 24, // 24 hours
      })

      expect(cascade).toEqual({
        stages: expect.arrayContaining([
          expect.objectContaining({
            stage: expect.any(Number),
            timestamp: expect.any(Date),
            activePersonas: expect.any(Array),
            informationFidelity: expect.any(Number),
            reach: expect.any(Number),
          }),
        ]),
        finalOutcome: expect.objectContaining({
          totalInformed: expect.any(Number),
          informationAccuracy: expect.any(Number),
          cascadeSuccess: expect.any(Boolean),
        }),
      })
    })

    it('should simulate echo chamber formation', async () => {
      const personas = Array.from({ length: 20 }, (_, i) => ({
        id: `persona-${i}`,
        personality: { openness: i < 10 ? 0.2 : 0.8 }, // Two distinct groups
        politicalLean: i < 10 ? 'conservative' : 'liberal',
        topics: i < 10 ? ['traditional', 'stability'] : ['progressive', 'change'],
      }))

      const simulation = await PersonaSimulator.simulateEchoChambers({
        personas,
        contentTopics: ['politics', 'social issues'],
        simulationDuration: '30d',
        polarizationFactor: 0.7,
      })

      expect(simulation).toEqual({
        chambers: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            members: expect.any(Array),
            cohesion: expect.any(Number),
            isolation: expect.any(Number),
            dominantTopics: expect.any(Array),
          }),
        ]),
        crossPollination: expect.objectContaining({
          frequency: expect.any(Number),
          effectiveness: expect.any(Number),
          bridgePersonas: expect.any(Array),
        }),
        polarizationMetrics: expect.objectContaining({
          initial: expect.any(Number),
          final: expect.any(Number),
          trend: expect.stringMatching(/increasing|decreasing|stable/),
        }),
      })
    })
  })

  describe('PersonaMemory integration', () => {
    it('should update persona memory after interactions', async () => {
      const behavior = {
        behaviorType: 'reply' as const,
        personaId: 'persona-1',
        targetId: 'post-123',
        context: {
          triggerType: 'reactive' as const,
          socialContext: {
            recentInteractions: [
              {
                personaId: 'other-persona',
                type: 'mention',
                content: 'Great insight!',
              },
            ],
          },
        },
      }

      await PersonaSimulator.executeBehavior(behavior, {
        id: 'persona-1',
        memoryConfig: { maxEvents: 1000, decayFactor: 0.95 },
      })

      // Should update persona memory with the interaction
      expect(PersonaMemory.addEvent).toHaveBeenCalledWith(
        'persona-1',
        expect.objectContaining({
          type: 'interaction',
          subtype: 'reply',
          targetId: 'post-123',
          timestamp: expect.any(Date),
          importance: expect.any(Number),
        })
      )
    })

    it('should use memory to influence future behaviors', async () => {
      const persona = {
        id: 'persona-1',
        personality: { openness: 0.7 },
      }

      // Mock memory with previous positive interaction
      jest.spyOn(PersonaMemory, 'getRelevantMemories').mockResolvedValueOnce([
        {
          type: 'interaction',
          targetId: 'friendly-persona',
          sentiment: 0.8,
          timestamp: new Date(Date.now() - 86400000), // 1 day ago
          importance: 0.7,
        },
      ])

      const context = {
        triggerType: 'social' as const,
        socialContext: {
          recentInteractions: [
            {
              personaId: 'friendly-persona',
              type: 'post',
              content: 'Looking forward to the weekend!',
            },
          ],
        },
      }

      const behaviors = await PersonaSimulator.generateBehavior(persona, context)

      // Should be more likely to engage positively due to positive memory
      const engagement = behaviors.find(b => 
        ['like', 'reply'].includes(b.behaviorType)
      )
      expect(engagement?.parameters.confidence).toBeGreaterThan(0.6)
    })
  })

  describe('personality-driven behavior patterns', () => {
    it('should generate behaviors consistent with Big Five traits', async () => {
      const conscientiousPersona = {
        id: 'conscientious-persona',
        personality: {
          conscientiousness: 0.9,
          neuroticism: 0.2,
          openness: 0.6,
        },
      }

      const behaviors = await PersonaSimulator.generateBehavior(
        conscientiousPersona,
        { triggerType: 'scheduled' }
      )

      // Conscientious personas should have regular, planned behaviors
      expect(behaviors.length).toBeGreaterThan(0)
      expect(behaviors.every(b => b.parameters.confidence > 0.6)).toBe(true)
      
      // Should prefer scheduled over reactive behaviors
      const scheduledBehaviors = behaviors.filter(b => 
        b.context.triggerType === 'scheduled'
      )
      expect(scheduledBehaviors.length).toBeGreaterThan(0)
    })

    it('should handle neurotic persona behaviors', async () => {
      const neuroticPersona = {
        id: 'neurotic-persona',
        personality: {
          neuroticism: 0.9,
          extraversion: 0.3,
          agreeableness: 0.4,
        },
      }

      const stressfulContext = {
        triggerType: 'reactive' as const,
        triggerData: {
          negativeFeedback: true,
          socialPressure: 0.8,
        },
      }

      const behaviors = await PersonaSimulator.generateBehavior(
        neuroticPersona,
        stressfulContext
      )

      // Neurotic personas should show more cautious behaviors under stress
      expect(behaviors.some(b => b.parameters.confidence < 0.5)).toBe(true)
      expect(behaviors.some(b => b.parameters.urgency < 0.4)).toBe(true)
    })

    it('should create distinct behavioral signatures for different archetypes', async () => {
      const archetypes = [
        { type: 'INFLUENCER', expectedBehaviors: ['post', 'repost'] },
        { type: 'LURKER', expectedBehaviors: ['like', 'view'] },
        { type: 'DEBATER', expectedBehaviors: ['reply', 'quote'] },
        { type: 'SUPPORTER', expectedBehaviors: ['like', 'repost', 'reply'] },
      ]

      for (const archetype of archetypes) {
        const persona = {
          id: `${archetype.type.toLowerCase()}-persona`,
          archetype: archetype.type,
          personality: { openness: 0.5 }, // Neutral baseline
        }

        const behaviors = await PersonaSimulator.generateBehavior(
          persona,
          { triggerType: 'scheduled' }
        )

        const behaviorTypes = behaviors.map(b => b.behaviorType)
        const hasExpectedBehaviors = archetype.expectedBehaviors.some(expected =>
          behaviorTypes.includes(expected as any)
        )

        expect(hasExpectedBehaviors).toBe(true)
      }
    })
  })
})

describe('PersonaSimulator Analytics and Monitoring', () => {
  it('should track persona behavior metrics', async () => {
    const metrics = await PersonaSimulator.getPersonaMetrics('persona-1', {
      timeRange: '7d',
      includeNetwork: true,
    })

    expect(metrics).toEqual({
      behaviorStats: expect.objectContaining({
        totalBehaviors: expect.any(Number),
        behaviorBreakdown: expect.any(Object),
        averageConfidence: expect.any(Number),
        responseTime: expect.any(Number),
      }),
      socialMetrics: expect.objectContaining({
        interactions: expect.any(Number),
        networkGrowth: expect.any(Number),
        influenceScore: expect.any(Number),
      }),
      contentMetrics: expect.objectContaining({
        postsCreated: expect.any(Number),
        averageEngagement: expect.any(Number),
        topicDistribution: expect.any(Object),
      }),
    })
  })

  it('should provide simulation health monitoring', async () => {
    const health = await PersonaSimulator.getSimulationHealth()

    expect(health).toEqual({
      overallHealth: expect.any(Number),
      metrics: expect.objectContaining({
        activePersonas: expect.any(Number),
        behaviorExecutionRate: expect.any(Number),
        networkConnectivity: expect.any(Number),
        contentQuality: expect.any(Number),
      }),
      issues: expect.any(Array),
      recommendations: expect.any(Array),
    })
  })

  it('should detect unusual behavior patterns', async () => {
    const anomalies = await PersonaSimulator.detectBehaviorAnomalies({
      personaId: 'persona-1',
      timeWindow: '24h',
      sensitivity: 0.8,
    })

    expect(anomalies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: expect.stringMatching(/frequency|pattern|content|social/),
          severity: expect.any(Number),
          description: expect.any(String),
          timestamp: expect.any(Date),
          evidence: expect.any(Object),
        }),
      ])
    )
  })
})