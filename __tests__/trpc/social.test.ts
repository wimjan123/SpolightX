/**
 * Social Router tRPC Tests
 * 
 * Tests for post procedures per API contracts.
 * Following TDD - these tests should FAIL FIRST before implementation.
 */

import { createCallerFactory } from '@/server/api/trpc'
import { socialRouter } from '@/server/api/routers/social'
import { prisma } from '@/lib/prisma'

// Create a test caller
const createCaller = createCallerFactory(socialRouter)

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

describe('Social Router - Posts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('posts.getAll', () => {
    it('should return paginated posts with default parameters', async () => {
      // Mock FeedRanking.generateFeed to return test data
      const mockPosts = [
        {
          contentId: 'post-1',
          score: 0.95,
          timestamp: new Date(),
          metadata: {
            authorId: 'user-1',
            authorType: 'PERSONA',
            content: 'Test post content',
            visibility: 'PUBLIC',
          },
          metrics: {
            likes: 5,
            reposts: 2,
            replies: 1,
          },
        },
      ]

      // This should FAIL initially because FeedRanking.generateFeed might not exist
      const result = await caller.posts.getAll({})

      expect(result).toEqual({
        posts: expect.arrayContaining([
          expect.objectContaining({
            id: 'post-1',
            authorId: 'user-1',
            authorType: 'PERSONA',
            content: 'Test post content',
            visibility: 'PUBLIC',
            engagementCount: {
              likes: 5,
              reposts: 2,
              replies: 1,
            },
          }),
        ]),
        hasMore: false,
        nextCursor: undefined,
      })
    })

    it('should handle pagination with cursor and limit', async () => {
      const result = await caller.posts.getAll({
        cursor: 'cursor-123',
        limit: 10,
        filter: 'trending',
      })

      expect(result).toHaveProperty('posts')
      expect(result).toHaveProperty('hasMore')
      expect(result).toHaveProperty('nextCursor')
      expect(Array.isArray(result.posts)).toBe(true)
    })

    it('should filter posts by type', async () => {
      const filters = ['all', 'following', 'trending', 'recent'] as const

      for (const filter of filters) {
        const result = await caller.posts.getAll({ filter })
        expect(result).toHaveProperty('posts')
        expect(Array.isArray(result.posts)).toBe(true)
      }
    })
  })

  describe('posts.getById', () => {
    it('should return specific post by ID', async () => {
      const mockPost = {
        id: 'post-123',
        authorId: 'user-1',
        authorType: 'USER',
        content: 'Specific post content',
        createdAt: new Date(),
        updatedAt: new Date(),
        author: { id: 'user-1', username: 'testuser' },
      }

      // Mock Prisma findUnique
      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(mockPost)

      const result = await caller.posts.getById({
        postId: 'post-123',
      })

      expect(result).toEqual({
        post: mockPost,
      })

      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id: 'post-123' },
        include: {
          author: true,
          parent: false,
          children: false,
        },
      })
    })

    it('should include thread when requested', async () => {
      const mockPost = {
        id: 'post-123',
        children: [
          { id: 'reply-1', content: 'Reply content', author: {} },
        ],
      }

      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(mockPost)

      const result = await caller.posts.getById({
        postId: 'post-123',
        includeThread: true,
      })

      expect(result.thread).toBeDefined()
      expect(Array.isArray(result.thread)).toBe(true)
    })

    it('should throw error when post not found', async () => {
      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(null)

      await expect(
        caller.posts.getById({ postId: 'nonexistent' })
      ).rejects.toThrow('POST_NOT_FOUND')
    })
  })

  describe('posts.create', () => {
    it('should create new post with content safety checks', async () => {
      const mockModerationResult = {
        action: 'ALLOW',
        reason: 'Content is safe',
        metadata: { confidence: 0.99 },
      }

      const mockCreatedPost = {
        id: 'new-post-id',
        authorId: 'test-user-id',
        authorType: 'USER',
        content: 'New post content',
        visibility: 'PUBLIC',
        createdAt: new Date(),
        updatedAt: new Date(),
        author: { id: 'test-user-id' },
      }

      ;(prisma.post.create as jest.Mock).mockResolvedValueOnce(mockCreatedPost)

      const result = await caller.posts.create({
        content: 'New post content',
        visibility: 'PUBLIC',
      })

      expect(result).toEqual({
        id: 'new-post-id',
        authorId: 'test-user-id',
        authorType: 'USER',
        content: 'New post content',
        visibility: 'PUBLIC',
        engagementCount: {
          likes: 0,
          reposts: 0,
          replies: 0,
        },
        createdAt: mockCreatedPost.createdAt,
        updatedAt: mockCreatedPost.updatedAt,
      })
    })

    it('should block content that fails moderation', async () => {
      // This should test ContentSafetyModeration.moderateContent
      await expect(
        caller.posts.create({
          content: 'Harmful content that should be blocked',
        })
      ).rejects.toThrow(/CONTENT_BLOCKED/)
    })

    it('should handle reply posts with parentId', async () => {
      const mockCreatedPost = {
        id: 'reply-post-id',
        authorId: 'test-user-id',
        parentId: 'parent-post-id',
        content: 'Reply content',
        author: { id: 'test-user-id' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      ;(prisma.post.create as jest.Mock).mockResolvedValueOnce(mockCreatedPost)

      const result = await caller.posts.create({
        content: 'Reply content',
        parentId: 'parent-post-id',
      })

      expect(result.parentId).toBe('parent-post-id')
    })
  })

  describe('posts.delete', () => {
    it('should soft delete user\'s own post', async () => {
      const mockPost = {
        id: 'post-to-delete',
        authorId: 'test-user-id',
        content: 'Post to delete',
      }

      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(mockPost)
      ;(prisma.post.update as jest.Mock).mockResolvedValueOnce({})

      const result = await caller.posts.delete({
        postId: 'post-to-delete',
      })

      expect(result).toEqual({ success: true })
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-to-delete' },
        data: {
          deletedAt: expect.any(Date),
          visibility: 'DRAFT',
        },
      })
    })

    it('should throw error when trying to delete non-existent post', async () => {
      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(null)

      await expect(
        caller.posts.delete({ postId: 'nonexistent' })
      ).rejects.toThrow('POST_NOT_FOUND')
    })

    it('should throw error when trying to delete another user\'s post', async () => {
      const mockPost = {
        id: 'post-to-delete',
        authorId: 'different-user-id',
        content: 'Not my post',
      }

      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(mockPost)

      await expect(
        caller.posts.delete({ postId: 'post-to-delete' })
      ).rejects.toThrow('FORBIDDEN')
    })
  })

  describe('posts.addInteraction', () => {
    it('should record like interaction', async () => {
      const mockPost = { id: 'post-123', authorId: 'user-1' }
      const mockInteraction = {
        id: 'interaction-id',
        userId: 'test-user-id',
        targetId: 'post-123',
        targetType: 'POST',
        interactionType: 'LIKE',
        metadata: {},
        sessionId: 'session-123',
        createdAt: new Date(),
      }

      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(mockPost)
      ;(prisma.interaction.create as jest.Mock).mockResolvedValueOnce(mockInteraction)
      ;(prisma.post.update as jest.Mock).mockResolvedValueOnce({})

      const result = await caller.posts.addInteraction({
        postId: 'post-123',
        type: 'LIKE',
      })

      expect(result).toEqual(mockInteraction)
      expect(prisma.interaction.create).toHaveBeenCalled()
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-123' },
        data: { likes: { increment: 1 } },
      })
    })

    it('should handle view interactions without incrementing engagement', async () => {
      const mockPost = { id: 'post-123' }
      const mockInteraction = {
        id: 'view-interaction',
        targetType: 'POST',
        interactionType: 'VIEW',
        createdAt: new Date(),
      }

      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(mockPost)
      ;(prisma.interaction.create as jest.Mock).mockResolvedValueOnce(mockInteraction)

      await caller.posts.addInteraction({
        postId: 'post-123',
        type: 'VIEW',
      })

      // View interactions shouldn't increment post engagement
      expect(prisma.post.update).not.toHaveBeenCalled()
    })

    it('should throw error for non-existent post', async () => {
      ;(prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(null)

      await expect(
        caller.posts.addInteraction({
          postId: 'nonexistent',
          type: 'LIKE',
        })
      ).rejects.toThrow('POST_NOT_FOUND')
    })
  })
})

describe('Social Router - Authentication', () => {
  it('should require authentication for protected procedures', async () => {
    const unauthenticatedContext = {
      ...mockContext,
      session: null,
      userId: null,
    }

    const unauthenticatedCaller = createCaller(unauthenticatedContext)

    await expect(
      unauthenticatedCaller.posts.create({
        content: 'Should require auth',
      })
    ).rejects.toThrow('UNAUTHORIZED')
  })
})