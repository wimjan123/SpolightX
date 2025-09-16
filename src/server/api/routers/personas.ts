import { z } from 'zod';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '@/server/api/trpc';
import { PersonaSimulator } from '@/lib/persona/simulator';
import { PersonalityProcessor } from '@/lib/persona/personality';

// Validation schemas based on API contracts
const PersonaCreateSchema = z.object({
  name: z.string().min(1).max(50),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  bio: z.string().max(500),
  personality: z.object({
    openness: z.number().min(0).max(1).optional(),
    conscientiousness: z.number().min(0).max(1).optional(),
    extraversion: z.number().min(0).max(1).optional(),
    agreeableness: z.number().min(0).max(1).optional(),
    neuroticism: z.number().min(0).max(1).optional(),
  }),
  postingStyle: z.object({
    frequency: z.number().min(0).max(1).optional(),
    topics: z.array(z.string()).optional(),
    tonePreferences: z.object({
      humor: z.number().min(0).max(1).optional(),
      formality: z.number().min(0).max(1).optional(),
      controversy: z.number().min(0).max(1).optional(),
    }).optional(),
  }).optional(),
  archetype: z.string().min(1),
  riskLevel: z.number().min(0).max(1).default(0.3),
});

const PersonaUpdateSchema = PersonaCreateSchema.partial().omit({ username: true });

const PersonasQuerySchema = z.object({
  archetype: z.string().optional(),
  includeInactive: z.boolean().default(false),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const personasRouter = createTRPCRouter({
  // Get all personas with filtering
  getAll: publicProcedure
    .input(PersonasQuerySchema)
    .query(async ({ input, ctx }) => {
      const { archetype, includeInactive, limit, cursor } = input;

      const personas = await ctx.prisma.persona.findMany({
        where: {
          ...(archetype && { archetype }),
          ...(includeInactive ? {} : { isActive: true }),
          ...(cursor && { id: { gt: cursor } }),
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      return {
        personas: personas.map(persona => ({
          id: persona.id,
          name: persona.name,
          username: persona.username,
          bio: persona.bio,
          avatarUrl: persona.avatarUrl,
          personality: persona.personality,
          postingStyle: persona.postingStyle,
          relationships: persona.relationships,
          activityPattern: persona.activityPattern,
          archetype: persona.archetype,
          riskLevel: persona.riskLevel,
          isActive: persona.isActive,
          createdAt: persona.createdAt,
          updatedAt: persona.updatedAt,
        })),
      };
    }),

  // Create new persona with personality validation
  create: protectedProcedure
    .input(PersonaCreateSchema)
    .mutation(async ({ input, ctx }) => {
      const { name, username, bio, personality, postingStyle, archetype, riskLevel } = input;

      // Check if username is available
      const existingPersona = await ctx.prisma.persona.findUnique({
        where: { username },
      });

      if (existingPersona) {
        throw new Error('USERNAME_EXISTS');
      }

      // Process and validate personality traits
      const processedPersonality = await PersonalityProcessor.processPersonality({
        traits: personality,
        archetype,
        riskLevel,
      });

      // Generate initial behavior patterns
      const behaviorPatterns = await PersonaSimulator.initializePersona({
        personality: processedPersonality,
        archetype,
        postingStyle: postingStyle || {},
      });

      // Create persona in database
      const persona = await ctx.prisma.persona.create({
        data: {
          name,
          username,
          bio,
          personality: processedPersonality,
          postingStyle: postingStyle || {},
          relationships: {}, // Will be populated as persona interacts
          activityPattern: behaviorPatterns.activityPattern,
          archetype,
          riskLevel,
          isActive: true,
          createdBy: ctx.userId,
        },
      });

      return {
        id: persona.id,
        name: persona.name,
        username: persona.username,
        bio: persona.bio,
        avatarUrl: persona.avatarUrl,
        personality: persona.personality,
        postingStyle: persona.postingStyle,
        relationships: persona.relationships,
        activityPattern: persona.activityPattern,
        archetype: persona.archetype,
        riskLevel: persona.riskLevel,
        isActive: persona.isActive,
        createdAt: persona.createdAt,
        updatedAt: persona.updatedAt,
      };
    }),

  // Update persona configuration
  update: protectedProcedure
    .input(z.object({
      personaId: z.string().uuid(),
    }).merge(PersonaUpdateSchema))
    .mutation(async ({ input, ctx }) => {
      const { personaId, ...updateData } = input;

      // Verify persona exists and user has permission
      const existingPersona = await ctx.prisma.persona.findUnique({
        where: { id: personaId },
      });

      if (!existingPersona) {
        throw new Error('PERSONA_NOT_FOUND');
      }

      // For now, allow all users to update personas
      // In production, add proper ownership/permission checks

      // Process personality updates if provided
      let processedPersonality = existingPersona.personality;
      if (updateData.personality) {
        processedPersonality = await PersonalityProcessor.processPersonality({
          traits: { ...existingPersona.personality, ...updateData.personality },
          archetype: updateData.archetype || existingPersona.archetype,
          riskLevel: updateData.riskLevel ?? existingPersona.riskLevel,
        });
      }

      // Update persona
      const updatedPersona = await ctx.prisma.persona.update({
        where: { id: personaId },
        data: {
          ...updateData,
          personality: processedPersonality,
          updatedAt: new Date(),
        },
      });

      return {
        id: updatedPersona.id,
        name: updatedPersona.name,
        username: updatedPersona.username,
        bio: updatedPersona.bio,
        avatarUrl: updatedPersona.avatarUrl,
        personality: updatedPersona.personality,
        postingStyle: updatedPersona.postingStyle,
        relationships: updatedPersona.relationships,
        activityPattern: updatedPersona.activityPattern,
        archetype: updatedPersona.archetype,
        riskLevel: updatedPersona.riskLevel,
        isActive: updatedPersona.isActive,
        createdAt: updatedPersona.createdAt,
        updatedAt: updatedPersona.updatedAt,
      };
    }),

  // Delete persona (soft delete with content cleanup)
  delete: protectedProcedure
    .input(z.object({ personaId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { personaId } = input;

      // Verify persona exists
      const persona = await ctx.prisma.persona.findUnique({
        where: { id: personaId },
      });

      if (!persona) {
        throw new Error('PERSONA_NOT_FOUND');
      }

      // Soft delete persona and mark related content as deleted
      await ctx.prisma.$transaction([
        // Soft delete the persona
        ctx.prisma.persona.update({
          where: { id: personaId },
          data: {
            isActive: false,
            deletedAt: new Date(),
          },
        }),
        // Mark persona's posts as deleted
        ctx.prisma.post.updateMany({
          where: { 
            authorId: personaId,
            authorType: 'PERSONA',
          },
          data: {
            deletedAt: new Date(),
            visibility: 'DRAFT',
          },
        }),
      ]);

      return { success: true };
    }),

  // Get persona by ID with detailed information
  getById: publicProcedure
    .input(z.object({ personaId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const { personaId } = input;

      const persona = await ctx.prisma.persona.findUnique({
        where: { 
          id: personaId,
          isActive: true,
        },
        include: {
          _count: {
            select: {
              posts: {
                where: { deletedAt: null },
              },
            },
          },
        },
      });

      if (!persona) {
        throw new Error('PERSONA_NOT_FOUND');
      }

      return {
        id: persona.id,
        name: persona.name,
        username: persona.username,
        bio: persona.bio,
        avatarUrl: persona.avatarUrl,
        personality: persona.personality,
        postingStyle: persona.postingStyle,
        relationships: persona.relationships,
        activityPattern: persona.activityPattern,
        archetype: persona.archetype,
        riskLevel: persona.riskLevel,
        isActive: persona.isActive,
        createdAt: persona.createdAt,
        updatedAt: persona.updatedAt,
        stats: {
          totalPosts: persona._count.posts,
        },
      };
    }),
});