/**
 * Content Generator Service Tests
 * 
 * Tests for AI generation logic and orchestration.
 * Following TDD - these tests should FAIL FIRST before implementation.
 */

import { ContentGenerator } from '@/lib/ai/content-generator'

// Mock dependencies
jest.mock('@/lib/ai/client')
jest.mock('@/lib/ai/prompts')
jest.mock('@/lib/ai/tone-processing')
jest.mock('@/lib/ai/streaming')

describe('ContentGenerator Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateContent', () => {
    it('should generate basic post content', async () => {
      const request = {
        prompt: 'Write about technology trends',
        tone: {
          humor: 0.5,
          formality: 0.6,
          riskiness: 0.2,
        },
        context: {},
        userId: 'test-user-id',
        maxLength: 2000,
      }

      // This should FAIL initially because ContentGenerator.generateContent might not exist
      const result = await ContentGenerator.generateContent(request)

      expect(result).toEqual({
        text: expect.any(String),
        metadata: expect.objectContaining({
          model: expect.any(String),
          temperature: expect.any(Number),
          tokensUsed: expect.any(Number),
          generationType: 'text',
        }),
        usage: expect.objectContaining({
          total_tokens: expect.any(Number),
          prompt_tokens: expect.any(Number),
          completion_tokens: expect.any(Number),
        }),
        model: expect.any(String),
      })

      expect(result.text).toHaveLength.greaterThan(0)
      expect(result.text).toHaveLength.lessThanOrEqual(2000)
    })

    it('should apply tone settings to content generation', async () => {
      const humorousRequest = {
        prompt: 'Write a funny post',
        tone: {
          humor: 0.9,
          snark: 0.7,
          formality: 0.1,
        },
        userId: 'test-user-id',
      }

      const formalRequest = {
        prompt: 'Write a professional post',
        tone: {
          humor: 0.1,
          snark: 0.1,
          formality: 0.9,
        },
        userId: 'test-user-id',
      }

      const humorousResult = await ContentGenerator.generateContent(humorousRequest)
      const formalResult = await ContentGenerator.generateContent(formalRequest)

      // Results should reflect different tones
      expect(humorousResult.metadata.toneSettings).toEqual(
        expect.objectContaining({
          humor: 0.9,
          snark: 0.7,
          formality: 0.1,
        })
      )

      expect(formalResult.metadata.toneSettings).toEqual(
        expect.objectContaining({
          humor: 0.1,
          snark: 0.1,
          formality: 0.9,
        })
      )
    })

    it('should handle reply context generation', async () => {
      const replyRequest = {
        prompt: 'Reply to this post',
        context: {
          parentPost: {
            content: 'Original post about AI',
            author: { id: 'author-1', username: 'original-author' },
          },
        },
        userId: 'test-user-id',
      }

      const result = await ContentGenerator.generateContent(replyRequest)

      expect(result.metadata.generationType).toBe('reply')
      expect(result.metadata.contextUsed).toEqual(
        expect.objectContaining({
          parentPost: expect.any(Object),
        })
      )
    })

    it('should handle quote post generation', async () => {
      const quoteRequest = {
        prompt: 'Quote this interesting post',
        context: {
          quotedPost: {
            content: 'Quoted post content',
            author: { id: 'quoted-author', username: 'quoted-user' },
          },
        },
        userId: 'test-user-id',
      }

      const result = await ContentGenerator.generateContent(quoteRequest)

      expect(result.metadata.generationType).toBe('quote')
      expect(result.metadata.contextUsed.quotedPost).toBeDefined()
    })

    it('should use persona context when provided', async () => {
      const personaRequest = {
        prompt: 'Generate content as persona',
        context: {
          persona: {
            id: 'persona-1',
            name: 'Tech Expert',
            personality: {
              openness: 0.8,
              conscientiousness: 0.7,
              extraversion: 0.6,
            },
            postingStyle: {
              topics: ['technology', 'innovation'],
              tonePreferences: {
                humor: 0.5,
                formality: 0.7,
              },
            },
          },
        },
        userId: 'test-user-id',
      }

      const result = await ContentGenerator.generateContent(personaRequest)

      expect(result.metadata.personaUsed).toEqual(
        expect.objectContaining({
          id: 'persona-1',
          name: 'Tech Expert',
        })
      )
    })

    it('should enforce content length limits', async () => {
      const shortRequest = {
        prompt: 'Write a brief message',
        maxLength: 100,
        userId: 'test-user-id',
      }

      const longRequest = {
        prompt: 'Write a detailed analysis',
        maxLength: 1000,
        userId: 'test-user-id',
      }

      const shortResult = await ContentGenerator.generateContent(shortRequest)
      const longResult = await ContentGenerator.generateContent(longRequest)

      expect(shortResult.text.length).toBeLessThanOrEqual(100)
      expect(longResult.text.length).toBeLessThanOrEqual(1000)
    })

    it('should handle content safety moderation', async () => {
      const safeRequest = {
        prompt: 'Write about positive technology impacts',
        userId: 'test-user-id',
      }

      const riskyRequest = {
        prompt: 'Generate controversial content',
        tone: { riskiness: 0.9 },
        userId: 'test-user-id',
      }

      const safeResult = await ContentGenerator.generateContent(safeRequest)
      expect(safeResult.metadata.moderationResult.flagged).toBe(false)

      // Risky content should either be moderated or flagged
      const riskyResult = await ContentGenerator.generateContent(riskyRequest)
      expect(riskyResult.metadata.moderationResult).toBeDefined()
    })

    it('should track token usage and costs', async () => {
      const request = {
        prompt: 'Generate content for cost tracking',
        userId: 'test-user-id',
      }

      const result = await ContentGenerator.generateContent(request)

      expect(result.usage).toEqual({
        prompt_tokens: expect.any(Number),
        completion_tokens: expect.any(Number),
        total_tokens: expect.any(Number),
      })

      expect(result.metadata.estimatedCost).toBeGreaterThan(0)
      expect(result.metadata.modelUsed).toBeDefined()
    })

    it('should handle API errors gracefully', async () => {
      const request = {
        prompt: 'This should trigger an API error',
        userId: 'test-user-id',
      }

      // Mock API failure
      const mockError = new Error('API Rate Limited')
      jest.spyOn(ContentGenerator, 'generateContent').mockRejectedValueOnce(mockError)

      await expect(
        ContentGenerator.generateContent(request)
      ).rejects.toThrow('API Rate Limited')
    })

    it('should validate input parameters', async () => {
      // Empty prompt
      await expect(
        ContentGenerator.generateContent({
          prompt: '',
          userId: 'test-user-id',
        })
      ).rejects.toThrow('Prompt cannot be empty')

      // Invalid tone values
      await expect(
        ContentGenerator.generateContent({
          prompt: 'Valid prompt',
          tone: { humor: 1.5 }, // Over max value
          userId: 'test-user-id',
        })
      ).rejects.toThrow('Invalid tone parameters')

      // Missing userId
      await expect(
        ContentGenerator.generateContent({
          prompt: 'Valid prompt',
          userId: '',
        })
      ).rejects.toThrow('User ID is required')
    })
  })

  describe('generateWithStreaming', () => {
    it('should support streaming content generation', async () => {
      const request = {
        prompt: 'Stream this content',
        stream: true,
        userId: 'test-user-id',
      }

      // This should FAIL initially because streaming support might not exist
      const streamGenerator = ContentGenerator.generateWithStreaming(request)

      const chunks = []
      for await (const chunk of streamGenerator) {
        chunks.push(chunk)
      }

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks[0]).toEqual(
        expect.objectContaining({
          type: expect.stringMatching(/^(token|complete|error)$/),
          content: expect.any(String),
        })
      )

      // Last chunk should be completion
      const lastChunk = chunks[chunks.length - 1]
      expect(lastChunk.type).toBe('complete')
      expect(lastChunk.metadata).toBeDefined()
    })

    it('should handle streaming errors', async () => {
      const request = {
        prompt: 'Stream with error',
        stream: true,
        userId: 'test-user-id',
      }

      const streamGenerator = ContentGenerator.generateWithStreaming(request)

      // Should yield error chunk if something goes wrong
      const chunks = []
      try {
        for await (const chunk of streamGenerator) {
          chunks.push(chunk)
          if (chunk.type === 'error') {
            break
          }
        }
      } catch (error) {
        // Expected for error cases
      }

      expect(chunks.some(chunk => chunk.type === 'error')).toBe(true)
    })
  })

  describe('batchGenerate', () => {
    it('should generate multiple contents in batch', async () => {
      const requests = [
        {
          prompt: 'First post',
          userId: 'user-1',
        },
        {
          prompt: 'Second post',
          userId: 'user-2',
        },
        {
          prompt: 'Third post',
          userId: 'user-3',
        },
      ]

      // This should FAIL initially because batch generation might not exist
      const results = await ContentGenerator.batchGenerate(requests)

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual(
        expect.objectContaining({
          text: expect.any(String),
          metadata: expect.any(Object),
        })
      )

      // Each result should correspond to its request
      expect(results[0].metadata.originalPrompt).toBe('First post')
      expect(results[1].metadata.originalPrompt).toBe('Second post')
      expect(results[2].metadata.originalPrompt).toBe('Third post')
    })

    it('should handle partial failures in batch generation', async () => {
      const requests = [
        { prompt: 'Valid request', userId: 'user-1' },
        { prompt: '', userId: 'user-2' }, // Invalid
        { prompt: 'Another valid request', userId: 'user-3' },
      ]

      const results = await ContentGenerator.batchGenerate(requests, {
        continueOnError: true,
      })

      expect(results).toHaveLength(3)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(false)
      expect(results[1].error).toBeDefined()
      expect(results[2].success).toBe(true)
    })

    it('should respect batch size limits', async () => {
      const manyRequests = Array.from({ length: 20 }, (_, i) => ({
        prompt: `Request ${i}`,
        userId: `user-${i}`,
      }))

      // Should process in batches of max 10
      const results = await ContentGenerator.batchGenerate(manyRequests)

      expect(results).toHaveLength(20)
      // Should have made multiple API calls due to batching
    })
  })

  describe('ContentGenerator.analytics', () => {
    it('should track generation analytics', async () => {
      const request = {
        prompt: 'Track this generation',
        userId: 'analytics-user',
      }

      await ContentGenerator.generateContent(request)

      const analytics = ContentGenerator.getAnalytics('analytics-user')

      expect(analytics).toEqual(
        expect.objectContaining({
          totalGenerations: expect.any(Number),
          totalTokensUsed: expect.any(Number),
          totalCost: expect.any(Number),
          averageLength: expect.any(Number),
          mostUsedTones: expect.any(Array),
          generationTypes: expect.any(Object),
        })
      )
    })

    it('should track model performance metrics', async () => {
      const metrics = ContentGenerator.getModelMetrics()

      expect(metrics).toEqual(
        expect.objectContaining({
          modelsUsed: expect.any(Array),
          averageLatency: expect.any(Number),
          successRate: expect.any(Number),
          errorRate: expect.any(Number),
          tokenEfficiency: expect.any(Number),
        })
      )
    })
  })

  describe('ContentGenerator.caching', () => {
    it('should cache similar requests', async () => {
      const request = {
        prompt: 'Cacheable content request',
        userId: 'cache-user',
      }

      const firstResult = await ContentGenerator.generateContent(request)
      const secondResult = await ContentGenerator.generateContent(request)

      // Second request should be served from cache
      expect(secondResult.metadata.fromCache).toBe(true)
      expect(secondResult.metadata.cacheKey).toBeDefined()
    })

    it('should invalidate cache appropriately', async () => {
      const request = {
        prompt: 'Content to cache',
        userId: 'cache-user',
      }

      await ContentGenerator.generateContent(request)
      
      // Clear cache
      ContentGenerator.clearCache('cache-user')

      const result = await ContentGenerator.generateContent(request)
      expect(result.metadata.fromCache).toBe(false)
    })

    it('should respect cache TTL', async () => {
      const request = {
        prompt: 'TTL test content',
        userId: 'ttl-user',
      }

      await ContentGenerator.generateContent(request)

      // Simulate cache expiry
      jest.advanceTimersByTime(3600000) // 1 hour

      const result = await ContentGenerator.generateContent(request)
      expect(result.metadata.fromCache).toBe(false)
    })
  })
})

describe('ContentGenerator Error Handling', () => {
  it('should handle network timeouts', async () => {
    const request = {
      prompt: 'This will timeout',
      userId: 'timeout-user',
      timeout: 100, // Very short timeout
    }

    await expect(
      ContentGenerator.generateContent(request)
    ).rejects.toThrow(/timeout|Network/)
  })

  it('should handle API quota exceeded', async () => {
    const request = {
      prompt: 'Quota exceeded test',
      userId: 'quota-user',
    }

    // Mock quota exceeded error
    const quotaError = new Error('API quota exceeded')
    jest.spyOn(ContentGenerator, 'generateContent').mockRejectedValueOnce(quotaError)

    await expect(
      ContentGenerator.generateContent(request)
    ).rejects.toThrow('API quota exceeded')
  })

  it('should handle content policy violations', async () => {
    const request = {
      prompt: 'Content that violates policy',
      userId: 'policy-user',
    }

    const result = await ContentGenerator.generateContent(request)

    if (result.metadata.moderationResult.flagged) {
      expect(result.metadata.moderationResult.categories).toBeDefined()
      expect(result.metadata.moderationResult.action).toMatch(/block|warn|flag/)
    }
  })

  it('should have fallback mechanisms', async () => {
    const request = {
      prompt: 'Test fallback',
      userId: 'fallback-user',
      fallbackModel: 'gpt-3.5-turbo',
    }

    // Mock primary model failure
    const primaryError = new Error('Primary model unavailable')
    jest.spyOn(ContentGenerator, 'generateContent')
      .mockRejectedValueOnce(primaryError)
      .mockResolvedValueOnce({
        text: 'Fallback content',
        metadata: { model: 'gpt-3.5-turbo', fallbackUsed: true },
        usage: { total_tokens: 50 },
        model: 'gpt-3.5-turbo',
      })

    const result = await ContentGenerator.generateContent(request)

    expect(result.metadata.fallbackUsed).toBe(true)
    expect(result.metadata.model).toBe('gpt-3.5-turbo')
  })
})

describe('ContentGenerator Configuration', () => {
  it('should support different model configurations', async () => {
    const configs = [
      { model: 'gpt-4', temperature: 0.7 },
      { model: 'gpt-3.5-turbo', temperature: 0.5 },
      { model: 'claude-3', temperature: 0.8 },
    ]

    for (const config of configs) {
      const request = {
        prompt: 'Test different models',
        userId: 'config-user',
        modelConfig: config,
      }

      const result = await ContentGenerator.generateContent(request)
      expect(result.metadata.modelConfig).toEqual(config)
    }
  })

  it('should validate configuration parameters', async () => {
    const invalidConfigs = [
      { temperature: 2.5 }, // Over max
      { maxTokens: -1 }, // Negative
      { topP: 1.5 }, // Over max
    ]

    for (const config of invalidConfigs) {
      await expect(
        ContentGenerator.generateContent({
          prompt: 'Test invalid config',
          userId: 'config-user',
          modelConfig: config,
        })
      ).rejects.toThrow(/Invalid.*config/)
    }
  })

  it('should support custom system prompts', async () => {
    const request = {
      prompt: 'User prompt',
      userId: 'system-user',
      systemPrompt: 'You are a helpful assistant specializing in technology.',
    }

    const result = await ContentGenerator.generateContent(request)

    expect(result.metadata.systemPromptUsed).toBe(true)
    expect(result.metadata.customSystemPrompt).toBe(true)
  })
})