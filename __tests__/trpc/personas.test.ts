/**
 * Personas Router tRPC Tests
 * 
 * Tests for persona management procedures per API contracts.
 * Following TDD - these tests should FAIL FIRST before implementation.
 */

import { createCallerFactory } from '@/server/api/trpc'
import { personasRouter } from '@/server/api/routers/personas'
import { prisma } from '@/lib/prisma'

// Create a test caller
const createCaller = createCallerFactory(personasRouter)

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

describe('Personas Router - CRUD Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('personas.getAll', () => {
    it('should return all active personas by default', async () => {
      const mockPersonas = [
        {
          id: 'persona-1',
          name: 'Tech Enthusiast',
          username: 'techie',
          bio: 'Loves technology and innovation',
          personality: { openness: 0.8 },
          archetype: 'INNOVATOR',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      ;(prisma.persona.findMany as jest.Mock).mockResolvedValueOnce(mockPersonas)

      const result = await caller.getAll({})

      expect(result).toEqual({
        personas: expect.arrayContaining([
          expect.objectContaining({
            id: 'persona-1',
            name: 'Tech Enthusiast',
            username: 'techie',
            archetype: 'INNOVATOR',
            isActive: true,
          }),
        ]),
      })

      expect(prisma.persona.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
      })
    })

    it('should filter personas by archetype', async () => {
      await caller.getAll({ archetype: 'INNOVATOR' })

      expect(prisma.persona.findMany).toHaveBeenCalledWith({
        where: {
          archetype: 'INNOVATOR',
          isActive: true,
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
      })
    })

    it('should include inactive personas when requested', async () => {
      await caller.getAll({ includeInactive: true })

      expect(prisma.persona.findMany).toHaveBeenCalledWith({
        where: {},
        take: 20,
        orderBy: { createdAt: 'desc' },
      })
    })

    it('should handle pagination', async () => {
      await caller.getAll({
        limit: 10,
        cursor: 'cursor-123',
      })

      expect(prisma.persona.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          id: { gt: 'cursor-123' },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('personas.create', () => {
    it('should create new persona with valid data', async () => {
      const mockPersonaData = {
        name: 'New Persona',
        username: 'newpersona',
        bio: 'A test persona',
        personality: {
          openness: 0.7,
          conscientiousness: 0.6,
          extraversion: 0.8,
          agreeableness: 0.5,
          neuroticism: 0.3,
        },
        archetype: 'CREATIVE',
        riskLevel: 0.2,
      }

      const mockProcessedPersonality = {
        ...mockPersonaData.personality,
        processed: true,
      }

      const mockBehaviorPatterns = {
        activityPattern: {
          peakHours: [9, 12, 18],
          postFrequency: 0.5,
        },
      }

      const mockCreatedPersona = {
        id: 'new-persona-id',
        ...mockPersonaData,
        personality: mockProcessedPersonality,
        activityPattern: mockBehaviorPatterns.activityPattern,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Check username availability
      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(null)
      ;(prisma.persona.create as jest.Mock).mockResolvedValueOnce(mockCreatedPersona)

      // This should FAIL initially because PersonalityProcessor and PersonaSimulator might not exist
      const result = await caller.create(mockPersonaData)

      expect(result).toEqual(expect.objectContaining({
        id: 'new-persona-id',
        name: 'New Persona',
        username: 'newpersona',
        archetype: 'CREATIVE',
        riskLevel: 0.2,
        isActive: true,
      }))

      expect(prisma.persona.findUnique).toHaveBeenCalledWith({
        where: { username: 'newpersona' },
      })
    })

    it('should throw error when username already exists', async () => {
      const existingPersona = { id: 'existing-id', username: 'taken' }
      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(existingPersona)

      await expect(
        caller.create({
          name: 'Test',
          username: 'taken',
          bio: 'Test bio',
          personality: { openness: 0.5 },
          archetype: 'TEST',
        })
      ).rejects.toThrow('USERNAME_EXISTS')
    })

    it('should validate personality traits are in valid range', async () => {
      await expect(
        caller.create({
          name: 'Test',
          username: 'test',
          bio: 'Test bio',
          personality: {
            openness: 1.5, // Invalid: over 1.0
          },
          archetype: 'TEST',
        })
      ).rejects.toThrow()
    })

    it('should validate username format', async () => {
      await expect(
        caller.create({
          name: 'Test',
          username: 'invalid username!', // Contains spaces and special chars
          bio: 'Test bio',
          personality: { openness: 0.5 },
          archetype: 'TEST',
        })
      ).rejects.toThrow()
    })

    it('should handle optional posting style configuration', async () => {
      const personaData = {
        name: 'Test Persona',
        username: 'testpersona',
        bio: 'Test bio',
        personality: { openness: 0.5 },
        postingStyle: {
          frequency: 0.7,
          topics: ['technology', 'science'],
          tonePreferences: {
            humor: 0.6,
            formality: 0.4,
          },
        },
        archetype: 'TEST',
      }

      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(null)
      ;(prisma.persona.create as jest.Mock).mockResolvedValueOnce({
        id: 'test-id',
        ...personaData,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await caller.create(personaData)

      expect(result.postingStyle).toEqual(personaData.postingStyle)
    })
  })

  describe('personas.update', () => {
    it('should update existing persona', async () => {
      const existingPersona = {
        id: 'persona-id',
        name: 'Old Name',
        personality: { openness: 0.5 },
        archetype: 'OLD_TYPE',
        riskLevel: 0.3,
      }

      const updateData = {
        name: 'Updated Name',
        bio: 'Updated bio',
        personality: { openness: 0.8 },
        riskLevel: 0.2,
      }

      const updatedPersona = {
        ...existingPersona,
        ...updateData,
        updatedAt: new Date(),
      }

      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(existingPersona)
      ;(prisma.persona.update as jest.Mock).mockResolvedValueOnce(updatedPersona)

      const result = await caller.update({
        personaId: 'persona-id',
        ...updateData,
      })

      expect(result).toEqual(expect.objectContaining({
        id: 'persona-id',
        name: 'Updated Name',
        bio: 'Updated bio',
      }))

      expect(prisma.persona.update).toHaveBeenCalledWith({
        where: { id: 'persona-id' },
        data: expect.objectContaining({
          name: 'Updated Name',
          bio: 'Updated bio',
          updatedAt: expect.any(Date),
        }),
      })
    })

    it('should throw error for non-existent persona', async () => {
      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(null)

      await expect(
        caller.update({
          personaId: 'nonexistent',
          name: 'Updated Name',
        })
      ).rejects.toThrow('PERSONA_NOT_FOUND')
    })

    it('should process personality updates', async () => {
      const existingPersona = {
        id: 'persona-id',
        personality: { openness: 0.5, extraversion: 0.6 },
        archetype: 'EXISTING',
        riskLevel: 0.3,
      }

      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(existingPersona)
      ;(prisma.persona.update as jest.Mock).mockResolvedValueOnce({
        ...existingPersona,
        personality: { openness: 0.8, extraversion: 0.6 },
      })

      await caller.update({
        personaId: 'persona-id',
        personality: { openness: 0.8 },
      })

      // Should merge with existing personality traits
      expect(prisma.persona.update).toHaveBeenCalled()
    })
  })

  describe('personas.delete', () => {
    it('should soft delete persona and related content', async () => {
      const mockPersona = {
        id: 'persona-to-delete',
        name: 'Test Persona',
      }

      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(mockPersona)
      ;(prisma.$transaction as jest.Mock).mockResolvedValueOnce([{}, {}])

      const result = await caller.delete({
        personaId: 'persona-to-delete',
      })

      expect(result).toEqual({ success: true })

      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({
          where: { id: 'persona-to-delete' },
          data: {
            isActive: false,
            deletedAt: expect.any(Date),
          },
        }),
        expect.objectContaining({
          where: {
            authorId: 'persona-to-delete',
            authorType: 'PERSONA',
          },
          data: {
            deletedAt: expect.any(Date),
            visibility: 'DRAFT',
          },
        }),
      ])
    })

    it('should throw error for non-existent persona', async () => {
      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(null)

      await expect(
        caller.delete({ personaId: 'nonexistent' })
      ).rejects.toThrow('PERSONA_NOT_FOUND')
    })
  })

  describe('personas.getById', () => {
    it('should return persona with detailed information', async () => {
      const mockPersona = {
        id: 'persona-id',
        name: 'Test Persona',
        username: 'testpersona',
        bio: 'Test bio',
        personality: { openness: 0.7 },
        archetype: 'TEST',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: {
          posts: 15,
        },
      }

      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(mockPersona)

      const result = await caller.getById({
        personaId: 'persona-id',
      })

      expect(result).toEqual(expect.objectContaining({
        id: 'persona-id',
        name: 'Test Persona',
        stats: {
          totalPosts: 15,
        },
      }))

      expect(prisma.persona.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'persona-id',
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
      })
    })

    it('should throw error for inactive persona', async () => {
      ;(prisma.persona.findUnique as jest.Mock).mockResolvedValueOnce(null)

      await expect(
        caller.getById({ personaId: 'inactive-persona' })
      ).rejects.toThrow('PERSONA_NOT_FOUND')
    })
  })
})

describe('Personas Router - Input Validation', () => {
  it('should validate name length', async () => {
    await expect(
      caller.create({
        name: '', // Too short
        username: 'test',
        bio: 'Test bio',
        personality: { openness: 0.5 },
        archetype: 'TEST',
      })
    ).rejects.toThrow()

    await expect(
      caller.create({
        name: 'a'.repeat(51), // Too long
        username: 'test',
        bio: 'Test bio',
        personality: { openness: 0.5 },
        archetype: 'TEST',
      })
    ).rejects.toThrow()
  })

  it('should validate username length and format', async () => {
    // Too short
    await expect(
      caller.create({
        name: 'Test',
        username: 'ab',
        bio: 'Test bio',
        personality: { openness: 0.5 },
        archetype: 'TEST',
      })
    ).rejects.toThrow()

    // Too long
    await expect(
      caller.create({
        name: 'Test',
        username: 'a'.repeat(31),
        bio: 'Test bio',
        personality: { openness: 0.5 },
        archetype: 'TEST',
      })
    ).rejects.toThrow()

    // Invalid characters
    await expect(
      caller.create({
        name: 'Test',
        username: 'invalid-username!',
        bio: 'Test bio',
        personality: { openness: 0.5 },
        archetype: 'TEST',
      })
    ).rejects.toThrow()
  })

  it('should validate bio length', async () => {
    await expect(
      caller.create({
        name: 'Test',
        username: 'test',
        bio: 'a'.repeat(501), // Too long
        personality: { openness: 0.5 },
        archetype: 'TEST',
      })
    ).rejects.toThrow()
  })

  it('should validate personality trait ranges', async () => {
    const invalidValues = [-0.1, 1.1, 2.0]

    for (const value of invalidValues) {
      await expect(
        caller.create({
          name: 'Test',
          username: 'test',
          bio: 'Test bio',
          personality: {
            openness: value,
          },
          archetype: 'TEST',
        })
      ).rejects.toThrow()
    }
  })

  it('should validate risk level range', async () => {
    await expect(
      caller.create({
        name: 'Test',
        username: 'test',
        bio: 'Test bio',
        personality: { openness: 0.5 },
        archetype: 'TEST',
        riskLevel: 1.5, // Over max value
      })
    ).rejects.toThrow()

    await expect(
      caller.create({
        name: 'Test',
        username: 'test',
        bio: 'Test bio',
        personality: { openness: 0.5 },
        archetype: 'TEST',
        riskLevel: -0.1, // Under min value
      })
    ).rejects.toThrow()
  })

  it('should validate UUID format for persona operations', async () => {
    await expect(
      caller.getById({ personaId: 'invalid-uuid' })
    ).rejects.toThrow()

    await expect(
      caller.update({
        personaId: 'invalid-uuid',
        name: 'Updated Name',
      })
    ).rejects.toThrow()

    await expect(
      caller.delete({ personaId: 'invalid-uuid' })
    ).rejects.toThrow()
  })
})

describe('Personas Router - Authentication', () => {
  it('should require authentication for create operations', async () => {
    const unauthenticatedContext = {
      ...mockContext,
      session: null,
      userId: null,
    }

    const unauthenticatedCaller = createCaller(unauthenticatedContext)

    await expect(
      unauthenticatedCaller.create({
        name: 'Test',
        username: 'test',
        bio: 'Test bio',
        personality: { openness: 0.5 },
        archetype: 'TEST',
      })
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('should allow public access to read operations', async () => {
    const publicContext = {
      ...mockContext,
      session: null,
      userId: null,
    }

    const publicCaller = createCaller(publicContext)

    ;(prisma.persona.findMany as jest.Mock).mockResolvedValueOnce([])

    // getAll should work without authentication
    const result = await publicCaller.getAll({})
    expect(result).toEqual({ personas: [] })
  })
})