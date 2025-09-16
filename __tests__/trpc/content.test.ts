/**
 * Content Router tRPC Tests
 * 
 * Tests for AI generation procedures per API contracts.
 * Following TDD - these tests should FAIL FIRST before implementation.
 */

import { createCallerFactory } from '@/server/api/trpc'
import { contentRouter } from '@/server/api/routers/content'
import { prisma } from '@/lib/prisma'

// Create a test caller
const createCaller = createCallerFactory(contentRouter)

// Mock context for tests
const mockContext = {
  req: {} as any,
  prisma,
  redis: {} as any,
  session: {
    userId: 'test-user-id',
    user: {
      id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
    },
  },
  userId: 'test-user-id',
}

const caller = createCaller(mockContext)

describe('Content Router - AI Generation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('content.generate', () => {
    it('should generate content with basic prompt', async () => {
      const mockGeneratedContent = {
        text: 'Generated AI content',
        metadata: {
          model: 'gpt-4',
          temperature: 0.7,
          promptTokens: 50,
        },
        usage: { total_tokens: 100 },
        model: 'gpt-4',
      }

      const mockModerationResult = {
        action: 'ALLOW',
        reason: 'Content is safe',
        metadata: { confidence: 0.99 },
      }

      // This should FAIL initially because ContentGenerator.generateContent might not exist
      const result = await caller.generate({
        prompt: 'Write a post about technology',
        stream: false,
      })

      expect(result).toEqual({
        type: 'complete',
        content: 'Generated AI content',
        metadata: expect.objectContaining({
          tokensUsed: 100,
          modelUsed: 'gpt-4',
          toneSettings: expect.any(Object),
          moderationResult: expect.any(Object),
        }),
      })
    })

    it('should apply tone settings to generation', async () => {
      const toneSettings = {
        humor: 0.8,
        snark: 0.2,
        formality: 0.4,
        riskiness: 0.1,
        novelty: 0.7,
      }

      const result = await caller.generate({
        prompt: 'Write a funny post',
        toneSettings,
        stream: false,
      })

      expect(result.metadata?.toneSettings).toEqual(expect.objectContaining({
        humor: 0.8,
        snark: 0.2,
        formality: 0.4,
        riskiness: 0.1,
        novelty: 0.7,
      }))
    })

    it('should handle reply context with parentId', async () => {
      const mockParentPost = {
        id: 'parent-post-id',
        content: 'Original post content',
        author: { id: 'author-id', username: 'author' },
      }

      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(mockParentPost)

      const result = await caller.generate({
        prompt: 'Reply to this',
        parentId: 'parent-post-id',
        stream: false,
      })

      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id: 'parent-post-id' },
        include: { author: true },
      })

      // Should use parent post context in generation
      expect(result.metadata).toBeDefined()
    })

    it('should handle quote post context', async () => {
      const mockQuotedPost = {
        id: 'quoted-post-id',
        content: 'Quoted post content',
        author: { id: 'quoted-author', username: 'quoteduser' },
      }

      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(mockQuotedPost)

      const result = await caller.generate({
        prompt: 'Quote this post',
        quotedPostId: 'quoted-post-id',
        stream: false,
      })

      expect(result.metadata).toBeDefined()
    })

    it('should use persona context when personaId provided', async () => {
      const mockPersona = {
        id: 'persona-id',
        name: 'Test Persona',
        personality: {
          openness: 0.8,
          extraversion: 0.6,
        },
        postingStyle: {
          frequency: 0.7,
          topics: ['technology'],
        },
      }

      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(mockPersona)

      const result = await caller.generate({
        prompt: 'Generate as persona',
        personaId: 'persona-id',
        stream: false,
      })

      expect(result.metadata).toBeDefined()
    })

    it('should block content that fails moderation', async () => {
      // This should test ContentSafetyModeration.moderateContent
      await expect(
        caller.generate({
          prompt: 'Generate harmful content that should be blocked',
          stream: false,
        })
      ).rejects.toThrow(/CONTENT_BLOCKED/)
    })

    it('should handle streaming mode initiation', async () => {
      const result = await caller.generate({
        prompt: 'Stream this content',
        stream: true,
      })

      expect(result).toEqual({
        type: 'stream_initiated',
        streamId: expect.stringMatching(/^stream-/),
        message: 'Streaming content generation will be handled by /api/compose endpoint',
      })
    })

    it('should validate input parameters', async () => {
      // Test prompt length validation
      await expect(
        caller.generate({
          prompt: '', // Empty prompt
        })
      ).rejects.toThrow()

      // Test prompt max length
      const longPrompt = 'a'.repeat(501) // Over 500 char limit
      await expect(
        caller.generate({
          prompt: longPrompt,
        })
      ).rejects.toThrow()

      // Test tone settings validation
      await expect(
        caller.generate({
          prompt: 'Valid prompt',
          toneSettings: {
            humor: 1.5, // Over max value
          },
        })
      ).rejects.toThrow()
    })
  })

  describe('content.schedule', () => {
    it('should schedule content generation for personas', async () => {
      const mockPersonas = [
        { id: 'persona-1', name: 'Persona 1', isActive: true },
        { id: 'persona-2', name: 'Persona 2', isActive: true },
      ]

      const mockJob = {
        id: 'job-id-1',
        scheduledAt: new Date(),
      }

      ;(prisma.persona.findMany as jest.Mock).mockResolvedValueOnce(mockPersonas)
      ;(prisma.scheduledJob.create as jest.Mock).mockResolvedValue(mockJob)

      const result = await caller.schedule({
        type: 'POST',
        personaIds: ['persona-1', 'persona-2'],
        parameters: {
          prompt: 'Generate scheduled content',
        },
      })

      expect(result).toEqual({
        jobId: expect.stringMatching(/^batch-/),
        scheduledAt: expect.any(String),
        jobs: expect.arrayContaining([
          expect.objectContaining({
            personaId: 'persona-1',
            personaName: 'Persona 1',
          }),
          expect.objectContaining({
            personaId: 'persona-2',
            personaName: 'Persona 2',
          }),
        ]),
        totalJobs: 2,
      })

      expect(prisma.scheduledJob.create).toHaveBeenCalledTimes(2)
    })

    it('should schedule for all active personas when none specified', async () => {
      const mockPersonas = Array.from({ length: 5 }, (_, i) => ({
        id: `persona-${i}`,
        name: `Persona ${i}`,
        isActive: true,
      }))

      ;(prisma.persona.findMany as jest.Mock).mockResolvedValueOnce(mockPersonas)
      ;(prisma.scheduledJob.create as jest.Mock).mockResolvedValue({
        id: 'job-id',
        scheduledAt: new Date(),
      })

      const result = await caller.schedule({
        type: 'DM',
      })

      expect(result.totalJobs).toBe(5)
      expect(prisma.persona.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        take: 10, // Limited to prevent overwhelming
      })
    })

    it('should handle different content generation types', async () => {
      const types = ['POST', 'REPLY', 'DM', 'INTERACTION'] as const

      ;(prisma.persona.findMany as jest.Mock).mockResolvedValue([
        { id: 'persona-1', name: 'Test Persona', isActive: true },
      ])
      ;(prisma.scheduledJob.create as jest.Mock).mockResolvedValue({
        id: 'job-id',
        scheduledAt: new Date(),
      })

      for (const type of types) {
        const result = await caller.schedule({ type })
        expect(result.totalJobs).toBe(1)
      }
    })

    it('should schedule for future execution', async () => {
      const futureDate = new Date(Date.now() + 3600000) // 1 hour from now

      ;(prisma.persona.findMany as jest.Mock).mockResolvedValue([
        { id: 'persona-1', name: 'Test Persona', isActive: true },
      ])
      ;(prisma.scheduledJob.create as jest.Mock).mockResolvedValue({
        id: 'job-id',
        scheduledAt: futureDate,
      })

      const result = await caller.schedule({
        type: 'POST',
        scheduledAt: futureDate.toISOString(),
      })

      expect(new Date(result.scheduledAt)).toEqual(futureDate)
    })

    it('should throw error when no active personas available', async () => {
      ;(prisma.persona.findMany as jest.Mock).mockResolvedValueOnce([])

      await expect(
        caller.schedule({
          type: 'POST',
          personaIds: ['nonexistent-persona'],
        })
      ).rejects.toThrow('NO_ACTIVE_PERSONAS')
    })

    it('should add jobs to Redis queue', async () => {
      ;(prisma.persona.findMany as jest.Mock).mockResolvedValue([
        { id: 'persona-1', name: 'Test Persona', isActive: true },
      ])
      ;(prisma.scheduledJob.create as jest.Mock).mockResolvedValue({
        id: 'job-id',
        scheduledAt: new Date(),
      })

      await caller.schedule({
        type: 'POST',
      })

      expect(mockContext.redis.lpush).toHaveBeenCalledWith(
        'content_generation_queue',
        expect.stringContaining('job-id')
      )
    })
  })

  describe('content.getScheduledJobs', () => {
    it('should retrieve user\'s scheduled jobs', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          type: 'CONTENT_GENERATION',
          status: 'PENDING',
          scheduledAt: new Date(),
          payload: { generationType: 'POST' },
          createdAt: new Date(),
        },
      ]

      ;(prisma.scheduledJob.findMany as jest.Mock).mockResolvedValueOnce(mockJobs)

      const result = await caller.getScheduledJobs({})

      expect(result).toEqual({
        jobs: expect.arrayContaining([
          expect.objectContaining({
            id: 'job-1',
            type: 'CONTENT_GENERATION',
            status: 'PENDING',
          }),
        ]),
        hasMore: false,
        nextCursor: undefined,
      })

      expect(prisma.scheduledJob.findMany).toHaveBeenCalledWith({
        where: {
          createdBy: 'test-user-id',
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { _count: true },
      })
    })

    it('should filter jobs by status', async () => {
      await caller.getScheduledJobs({ status: 'COMPLETED' })

      expect(prisma.scheduledJob.findMany).toHaveBeenCalledWith({
        where: {
          createdBy: 'test-user-id',
          status: 'COMPLETED',
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { _count: true },
      })
    })

    it('should handle pagination', async () => {
      await caller.getScheduledJobs({
        limit: 10,
        cursor: 'cursor-123',
      })

      expect(prisma.scheduledJob.findMany).toHaveBeenCalledWith({
        where: {
          createdBy: 'test-user-id',
          id: { gt: 'cursor-123' },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { _count: true },
      })
    })
  })

  describe('content.cancelJob', () => {
    it('should cancel user\'s own job', async () => {
      const mockJob = {
        id: 'job-to-cancel',
        createdBy: 'test-user-id',
        status: 'PENDING',
      }

      ;(prisma.scheduledJob.findUnique as jest.Mock).mockResolvedValueOnce(mockJob)
      ;(prisma.scheduledJob.update as jest.Mock).mockResolvedValueOnce({})

      const result = await caller.cancelJob({
        jobId: 'job-to-cancel',
      })

      expect(result).toEqual({ success: true })
      expect(prisma.scheduledJob.update).toHaveBeenCalledWith({
        where: { id: 'job-to-cancel' },
        data: {
          status: 'CANCELLED',
          completedAt: expect.any(Date),
        },
      })
    })

    it('should throw error for non-existent job', async () => {
      ;(prisma.scheduledJob.findUnique as jest.Mock).mockResolvedValueOnce(null)

      await expect(
        caller.cancelJob({ jobId: 'nonexistent' })
      ).rejects.toThrow('JOB_NOT_FOUND')
    })

    it('should throw error when trying to cancel another user\'s job', async () => {
      const mockJob = {
        id: 'job-to-cancel',
        createdBy: 'different-user-id',
        status: 'PENDING',
      }

      ;(prisma.scheduledJob.findUnique as jest.Mock).mockResolvedValueOnce(mockJob)

      await expect(
        caller.cancelJob({ jobId: 'job-to-cancel' })
      ).rejects.toThrow('FORBIDDEN')
    })

    it('should throw error when trying to cancel completed job', async () => {
      const mockJob = {
        id: 'completed-job',
        createdBy: 'test-user-id',
        status: 'COMPLETED',
      }

      ;(prisma.scheduledJob.findUnique as jest.Mock).mockResolvedValueOnce(mockJob)

      await expect(
        caller.cancelJob({ jobId: 'completed-job' })
      ).rejects.toThrow('JOB_ALREADY_COMPLETED')
    })
  })
})

describe('Content Router - Authentication', () => {
  it('should require authentication for all procedures', async () => {
    const unauthenticatedContext = {
      ...mockContext,
      session: null,
      userId: null,
    }

    const unauthenticatedCaller = createCaller(unauthenticatedContext)

    await expect(
      unauthenticatedCaller.generate({
        prompt: 'Should require auth',
      })
    ).rejects.toThrow('UNAUTHORIZED')

    await expect(
      unauthenticatedCaller.schedule({
        type: 'POST',
      })
    ).rejects.toThrow('UNAUTHORIZED')

    await expect(
      unauthenticatedCaller.getScheduledJobs({})
    ).rejects.toThrow('UNAUTHORIZED')

    await expect(
      unauthenticatedCaller.cancelJob({
        jobId: 'some-job',
      })
    ).rejects.toThrow('UNAUTHORIZED')
  })
})

describe('Content Router - Input Validation', () => {
  it('should validate tone settings ranges', async () => {
    const invalidToneValues = [-0.1, 1.1, 2.0]

    for (const value of invalidToneValues) {
      await expect(
        caller.generate({
          prompt: 'Test prompt',
          toneSettings: {
            humor: value,
          },
        })
      ).rejects.toThrow()
    }
  })

  it('should validate UUID formats', async () => {
    await expect(
      caller.generate({
        prompt: 'Test prompt',
        parentId: 'invalid-uuid',
      })
    ).rejects.toThrow()

    await expect(
      caller.schedule({
        type: 'POST',
        personaIds: ['invalid-uuid'],
      })
    ).rejects.toThrow()
  })

  it('should validate datetime formats', async () => {
    await expect(
      caller.schedule({
        type: 'POST',
        scheduledAt: 'invalid-datetime',
      })
    ).rejects.toThrow()
  })
})