import { z } from 'zod';
import { createTRPCRouter, publicProcedure, protectedProcedure, subscriptionProcedure } from '@/server/api/trpc';
import { FeedRanking } from '@/lib/feed/ranking';
import { ContentSafetyModeration } from '@/lib/safety/moderation';
import { observable } from '@trpc/server/observable';
import { TRPCError } from '@trpc/server';
import { cache, withCache } from '@/lib/cache/redis-cache';

// Validation schemas based on API contracts
const PostCreateSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().uuid().optional(),
  quotedPostId: z.string().uuid().optional(),
  visibility: z.enum(['PUBLIC', 'DRAFT']).default('PUBLIC'),
  generationSource: z.object({}).optional(),
});

const PostsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  filter: z.enum(['all', 'following', 'trending', 'recent']).default('all'),
});

const InteractionSchema = z.object({
  type: z.enum(['LIKE', 'REPOST', 'VIEW']),
  metadata: z.object({}).optional(),
});

export const socialRouter = createTRPCRouter({
  // Real-time feed subscription
  feedUpdates: subscriptionProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        feedType: z.enum(['following', 'discover', 'hybrid']).default('hybrid'),
      })
    )
    .subscription(({ ctx, input }) => {
      return observable<{ type: string; data: any }>((emit) => {
        const onFeedUpdate = (data: any) => {
          if (!input.userId || data.userId === input.userId) {
            emit.next({ type: 'feedUpdate', data });
          }
        };

        const onNewPost = (data: any) => {
          emit.next({ type: 'newPost', data });
        };

        ctx.eventEmitter.on('feedUpdate', onFeedUpdate);
        ctx.eventEmitter.on('newPost', onNewPost);

        return () => {
          ctx.eventEmitter.off('feedUpdate', onFeedUpdate);
          ctx.eventEmitter.off('newPost', onNewPost);
        };
      });
    }),

  // Real-time conversation updates
  conversationUpdates: subscriptionProcedure
    .input(
      z.object({
        conversationId: z.string(),
      })
    )
    .subscription(({ ctx, input }) => {
      return observable<{ type: string; data: any }>((emit) => {
        const onNewMessage = (data: any) => {
          if (data.conversationId === input.conversationId) {
            emit.next({ type: 'newMessage', data });
          }
        };

        ctx.eventEmitter.on('newMessage', onNewMessage);

        return () => {
          ctx.eventEmitter.off('newMessage', onNewMessage);
        };
      });
    }),
  // Get paginated feed posts with hybrid ranking
  posts: createTRPCRouter({
    getAll: publicProcedure
      .input(PostsQuerySchema)
      .query(async ({ input, ctx }) => {
        const { cursor, limit, filter } = input;
        
        // Use feed ranking service for post retrieval
        const rankedPosts = await FeedRanking.generateFeed(
          ctx.userId || 'anonymous',
          {
            filters: {
              visibility: ['PUBLIC'],
              contentTypes: ['POST', 'REPOST'],
            },
            pagination: {
              limit,
              cursor,
            },
            feedType: filter,
          }
        );

        // Convert to API format
        const posts = rankedPosts.map(item => ({
          id: item.contentId,
          authorId: item.metadata.authorId,
          authorType: item.metadata.authorType || 'PERSONA',
          content: item.metadata.content,
          parentId: item.metadata.parentId,
          quotedPostId: item.metadata.quotedPostId,
          threadId: item.metadata.threadId,
          isRepost: item.metadata.isRepost || false,
          originalPostId: item.metadata.originalPostId,
          visibility: item.metadata.visibility || 'PUBLIC',
          engagementCount: {
            likes: item.metrics?.likes || 0,
            reposts: item.metrics?.reposts || 0,
            replies: item.metrics?.replies || 0,
          },
          generationSource: item.metadata.generationSource,
          toneSettings: item.metadata.toneSettings,
          createdAt: item.timestamp,
          updatedAt: item.metadata.updatedAt || item.timestamp,
        }));

        return {
          posts,
          hasMore: rankedPosts.length === limit,
          nextCursor: posts.length > 0 ? posts[posts.length - 1].id : undefined,
        };
      }),

    // Get specific post with thread context
    getById: publicProcedure
      .input(z.object({
        postId: z.string().uuid(),
        includeThread: z.boolean().default(false),
      }))
      .query(async ({ input, ctx }) => {
        const { postId, includeThread } = input;

        // Get post from database
        const post = await ctx.prisma.post.findUnique({
          where: { id: postId },
          include: {
            author: true,
            parent: includeThread,
            children: includeThread ? {
              include: { author: true },
              orderBy: { createdAt: 'asc' },
            } : false,
          },
        });

        if (!post) {
          throw new Error('POST_NOT_FOUND');
        }

        // Format response
        const response: any = { post };
        
        if (includeThread && post.children) {
          response.thread = post.children.map((child: any) => ({
            id: child.id,
            authorId: child.authorId,
            authorType: child.authorType,
            content: child.content,
            createdAt: child.createdAt,
            updatedAt: child.updatedAt,
          }));
        }

        return response;
      }),

    // Create new post with content safety checks
    create: protectedProcedure
      .input(PostCreateSchema)
      .mutation(async ({ input, ctx }) => {
        const { content, parentId, quotedPostId, visibility, generationSource } = input;

        // Content safety moderation
        const moderationResult = await ContentSafetyModeration.moderateContent(
          content,
          { 
            userId: ctx.userId,
            contentType: 'POST',
            parentId,
          }
        );

        if (moderationResult.action === 'BLOCK') {
          throw new Error(`CONTENT_BLOCKED: ${moderationResult.reason}`);
        }

        // Create post in database
        const post = await ctx.prisma.post.create({
          data: {
            authorId: ctx.userId,
            authorType: 'USER',
            content,
            parentId,
            quotedPostId,
            visibility,
            generationSource,
            moderationMetadata: moderationResult.metadata,
          },
          include: {
            author: true,
          },
        });

        return {
          id: post.id,
          authorId: post.authorId,
          authorType: post.authorType,
          content: post.content,
          parentId: post.parentId,
          quotedPostId: post.quotedPostId,
          visibility: post.visibility,
          engagementCount: {
            likes: 0,
            reposts: 0,
            replies: 0,
          },
          generationSource: post.generationSource,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
        };
      }),

    // Soft delete post
    delete: protectedProcedure
      .input(z.object({ postId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const { postId } = input;

        // Verify ownership
        const post = await ctx.prisma.post.findUnique({
          where: { id: postId },
        });

        if (!post) {
          throw new Error('POST_NOT_FOUND');
        }

        if (post.authorId !== ctx.userId) {
          throw new Error('FORBIDDEN');
        }

        // Soft delete
        await ctx.prisma.post.update({
          where: { id: postId },
          data: {
            deletedAt: new Date(),
            visibility: 'DRAFT', // Hide from public feeds
          },
        });

        return { success: true };
      }),

    // Add interaction (like, repost, view)
    addInteraction: protectedProcedure
      .input(z.object({
        postId: z.string().uuid(),
      }).merge(InteractionSchema))
      .mutation(async ({ input, ctx }) => {
        const { postId, type, metadata } = input;

        // Verify post exists
        const post = await ctx.prisma.post.findUnique({
          where: { id: postId },
        });

        if (!post) {
          throw new Error('POST_NOT_FOUND');
        }

        // Create interaction record
        const interaction = await ctx.prisma.interaction.create({
          data: {
            userId: ctx.userId,
            targetId: postId,
            targetType: 'POST',
            interactionType: type,
            metadata,
            sessionId: `session-${ctx.userId}-${Date.now()}`, // Basic session tracking
          },
        });

        // Update engagement counts
        const engagementField = type.toLowerCase() + 's';
        if (['likes', 'reposts'].includes(engagementField)) {
          await ctx.prisma.post.update({
            where: { id: postId },
            data: {
              [engagementField]: {
                increment: 1,
              },
            },
          });
        }

        return {
          id: interaction.id,
          userId: interaction.userId,
          targetId: interaction.targetId,
          targetType: interaction.targetType,
          interactionType: interaction.interactionType,
          metadata: interaction.metadata,
          sessionId: interaction.sessionId,
          createdAt: interaction.createdAt,
        };
      }),
  }),
});