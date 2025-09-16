import { z } from 'zod';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '@/server/api/trpc';
import { ContentGenerator } from '@/lib/ai/content-generator';
import { ToneProcessor } from '@/lib/ai/tone-processing';
import { ContentSafetyModeration } from '@/lib/safety/moderation';

// Validation schemas based on API contracts
const ToneSettingsSchema = z.object({
  humor: z.number().min(0).max(1).optional(),
  snark: z.number().min(0).max(1).optional(),
  formality: z.number().min(0).max(1).optional(),
  riskiness: z.number().min(0).max(1).optional(),
  novelty: z.number().min(0).max(1).optional(),
});

const ContentGenerateSchema = z.object({
  prompt: z.string().min(1).max(500),
  toneSettings: ToneSettingsSchema.optional(),
  parentId: z.string().uuid().optional(),
  quotedPostId: z.string().uuid().optional(),
  personaId: z.string().uuid().optional(),
  stream: z.boolean().default(false),
});

const ContentScheduleSchema = z.object({
  type: z.enum(['POST', 'REPLY', 'DM', 'INTERACTION']),
  personaIds: z.array(z.string().uuid()).optional(),
  scheduledAt: z.string().datetime().optional(),
  parameters: z.object({
    prompt: z.string().optional(),
    toneSettings: ToneSettingsSchema.optional(),
    targetId: z.string().uuid().optional(),
  }).optional(),
});

export const contentRouter = createTRPCRouter({
  // Generate AI-assisted content with tone controls
  generate: protectedProcedure
    .input(ContentGenerateSchema)
    .mutation(async ({ input, ctx }) => {
      const { prompt, toneSettings, parentId, quotedPostId, personaId, stream } = input;

      // Get context for content generation
      let context: any = {};
      
      if (parentId) {
        const parentPost = await ctx.prisma.post.findUnique({
          where: { id: parentId },
          include: { author: true },
        });
        context.parentPost = parentPost;
      }

      if (quotedPostId) {
        const quotedPost = await ctx.prisma.post.findUnique({
          where: { id: quotedPostId },
          include: { author: true },
        });
        context.quotedPost = quotedPost;
      }

      if (personaId) {
        const persona = await ctx.prisma.persona.findUnique({
          where: { id: personaId },
        });
        context.persona = persona;
      }

      // Process tone settings
      const processedTone = ToneProcessor.processToneSettings({
        humor: toneSettings?.humor ?? 0.5,
        snark: toneSettings?.snark ?? 0.3,
        formality: toneSettings?.formality ?? 0.4,
        riskiness: toneSettings?.riskiness ?? 0.2,
        novelty: toneSettings?.novelty ?? 0.6,
      });

      // Generate content
      if (stream) {
        // For streaming responses, we'll need to implement SSE
        // For now, return a placeholder that will be handled by route handlers
        return {
          type: 'stream_initiated',
          streamId: `stream-${Date.now()}`,
          message: 'Streaming content generation will be handled by /api/compose endpoint',
        };
      } else {
        // Non-streaming generation
        const generatedContent = await ContentGenerator.generateContent({
          prompt,
          tone: processedTone,
          context,
          userId: ctx.userId,
          maxLength: 2000,
        });

        // Safety moderation
        const moderationResult = await ContentSafetyModeration.moderateContent(
          generatedContent.text,
          {
            userId: ctx.userId,
            contentType: 'GENERATED_CONTENT',
            generationMetadata: generatedContent.metadata,
          }
        );

        if (moderationResult.action === 'BLOCK') {
          throw new Error(`CONTENT_BLOCKED: ${moderationResult.reason}`);
        }

        return {
          type: 'complete',
          content: generatedContent.text,
          metadata: {
            ...generatedContent.metadata,
            toneSettings: processedTone,
            moderationResult: moderationResult.metadata,
            tokensUsed: generatedContent.usage?.total_tokens || 0,
            modelUsed: generatedContent.model,
          },
        };
      }
    }),

  // Schedule content generation for personas
  schedule: protectedProcedure
    .input(ContentScheduleSchema)
    .mutation(async ({ input, ctx }) => {
      const { type, personaIds, scheduledAt, parameters } = input;

      // Get target personas or use all active ones
      const targetPersonas = personaIds 
        ? await ctx.prisma.persona.findMany({
            where: { 
              id: { in: personaIds },
              isActive: true,
            },
          })
        : await ctx.prisma.persona.findMany({
            where: { isActive: true },
            take: 10, // Limit to prevent overwhelming the system
          });

      if (targetPersonas.length === 0) {
        throw new Error('NO_ACTIVE_PERSONAS');
      }

      // Create scheduled jobs
      const scheduledTime = scheduledAt ? new Date(scheduledAt) : new Date();
      const jobs = [];

      for (const persona of targetPersonas) {
        // Create job record
        const job = await ctx.prisma.scheduledJob.create({
          data: {
            type: 'CONTENT_GENERATION',
            status: 'PENDING',
            scheduledAt: scheduledTime,
            payload: {
              generationType: type,
              personaId: persona.id,
              parameters: parameters || {},
              requestedBy: ctx.userId,
            },
            createdBy: ctx.userId,
          },
        });

        jobs.push({
          jobId: job.id,
          personaId: persona.id,
          personaName: persona.name,
          scheduledAt: job.scheduledAt,
        });

        // Add job to Redis queue (BullMQ integration)
        await ctx.redis.lpush(
          'content_generation_queue',
          JSON.stringify({
            jobId: job.id,
            type,
            personaId: persona.id,
            parameters,
            scheduledAt: scheduledTime.toISOString(),
          })
        );
      }

      return {
        jobId: `batch-${Date.now()}`,
        scheduledAt: scheduledTime.toISOString(),
        jobs,
        totalJobs: jobs.length,
      };
    }),

  // Get scheduled jobs status
  getScheduledJobs: protectedProcedure
    .input(z.object({
      status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
      limit: z.number().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { status, limit, cursor } = input;

      const jobs = await ctx.prisma.scheduledJob.findMany({
        where: {
          createdBy: ctx.userId,
          ...(status && { status }),
          ...(cursor && { id: { gt: cursor } }),
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: true,
        },
      });

      return {
        jobs: jobs.map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          scheduledAt: job.scheduledAt,
          completedAt: job.completedAt,
          payload: job.payload,
          error: job.error,
          createdAt: job.createdAt,
        })),
        hasMore: jobs.length === limit,
        nextCursor: jobs.length > 0 ? jobs[jobs.length - 1].id : undefined,
      };
    }),

  // Cancel scheduled job
  cancelJob: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { jobId } = input;

      const job = await ctx.prisma.scheduledJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        throw new Error('JOB_NOT_FOUND');
      }

      if (job.createdBy !== ctx.userId) {
        throw new Error('FORBIDDEN');
      }

      if (job.status === 'COMPLETED') {
        throw new Error('JOB_ALREADY_COMPLETED');
      }

      // Update job status
      await ctx.prisma.scheduledJob.update({
        where: { id: jobId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });

      // Remove from Redis queue if pending
      if (job.status === 'PENDING') {
        // This would require more sophisticated queue management
        // For now, we'll just mark it as cancelled
      }

      return { success: true };
    }),
});