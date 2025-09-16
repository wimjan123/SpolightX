'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { PersonalityProcessor } from '@/lib/persona/personality'
import { PersonaSimulator } from '@/lib/persona/simulator'

// Server Action validation schemas
const CreatePersonaSchema = z.object({
  name: z.string().min(1, 'Persona name is required').max(50, 'Name too long'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username too long')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  bio: z.string().max(500, 'Bio too long'),
  archetype: z.string().min(1, 'Archetype is required'),
  riskLevel: z.coerce.number().min(0).max(1).default(0.3),
  // Personality traits (Big Five model)
  openness: z.coerce.number().min(0).max(1).optional(),
  conscientiousness: z.coerce.number().min(0).max(1).optional(),
  extraversion: z.coerce.number().min(0).max(1).optional(),
  agreeableness: z.coerce.number().min(0).max(1).optional(),
  neuroticism: z.coerce.number().min(0).max(1).optional(),
  // Posting style preferences
  frequency: z.coerce.number().min(0).max(1).optional(),
  humor: z.coerce.number().min(0).max(1).optional(),
  formality: z.coerce.number().min(0).max(1).optional(),
  controversy: z.coerce.number().min(0).max(1).optional(),
  topics: z.string().optional(), // Comma-separated list
})

const UpdatePersonaSchema = z.object({
  personaId: z.string().uuid('Invalid persona ID'),
  name: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).optional(),
  archetype: z.string().min(1).optional(),
  riskLevel: z.coerce.number().min(0).max(1).optional(),
  isActive: z.coerce.boolean().optional(),
  // Personality traits
  openness: z.coerce.number().min(0).max(1).optional(),
  conscientiousness: z.coerce.number().min(0).max(1).optional(),
  extraversion: z.coerce.number().min(0).max(1).optional(),
  agreeableness: z.coerce.number().min(0).max(1).optional(),
  neuroticism: z.coerce.number().min(0).max(1).optional(),
  // Posting style
  frequency: z.coerce.number().min(0).max(1).optional(),
  humor: z.coerce.number().min(0).max(1).optional(),
  formality: z.coerce.number().min(0).max(1).optional(),
  controversy: z.coerce.number().min(0).max(1).optional(),
  topics: z.string().optional(),
})

const DeletePersonaSchema = z.object({
  personaId: z.string().uuid('Invalid persona ID'),
  confirmUsername: z.string().min(1, 'Username confirmation required'),
})

/**
 * Server Action to create a new persona
 * Used by persona creation forms
 */
export async function createPersona(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    // Extract and validate form data
    const rawData = {
      name: formData.get('name')?.toString() || '',
      username: formData.get('username')?.toString() || '',
      bio: formData.get('bio')?.toString() || '',
      archetype: formData.get('archetype')?.toString() || '',
      riskLevel: formData.get('riskLevel')?.toString() || '0.3',
      // Personality traits
      openness: formData.get('openness')?.toString(),
      conscientiousness: formData.get('conscientiousness')?.toString(),
      extraversion: formData.get('extraversion')?.toString(),
      agreeableness: formData.get('agreeableness')?.toString(),
      neuroticism: formData.get('neuroticism')?.toString(),
      // Posting style
      frequency: formData.get('frequency')?.toString(),
      humor: formData.get('humor')?.toString(),
      formality: formData.get('formality')?.toString(),
      controversy: formData.get('controversy')?.toString(),
      topics: formData.get('topics')?.toString(),
    }

    const validatedData = CreatePersonaSchema.parse(rawData)

    // Check if username is available
    const existingPersona = await prisma.persona.findUnique({
      where: { username: validatedData.username },
    })

    if (existingPersona) {
      return {
        error: 'Username is already taken',
        field: 'username',
      }
    }

    // Build personality object
    const personality = {
      ...(validatedData.openness !== undefined && { openness: validatedData.openness }),
      ...(validatedData.conscientiousness !== undefined && { conscientiousness: validatedData.conscientiousness }),
      ...(validatedData.extraversion !== undefined && { extraversion: validatedData.extraversion }),
      ...(validatedData.agreeableness !== undefined && { agreeableness: validatedData.agreeableness }),
      ...(validatedData.neuroticism !== undefined && { neuroticism: validatedData.neuroticism }),
    }

    // Build posting style object
    const postingStyle = {
      ...(validatedData.frequency !== undefined && { frequency: validatedData.frequency }),
      tonePreferences: {
        ...(validatedData.humor !== undefined && { humor: validatedData.humor }),
        ...(validatedData.formality !== undefined && { formality: validatedData.formality }),
        ...(validatedData.controversy !== undefined && { controversy: validatedData.controversy }),
      },
      ...(validatedData.topics && { 
        topics: validatedData.topics.split(',').map(t => t.trim()).filter(Boolean) 
      }),
    }

    // Process and validate personality traits
    const processedPersonality = await PersonalityProcessor.processPersonality({
      traits: personality,
      archetype: validatedData.archetype,
      riskLevel: validatedData.riskLevel,
    })

    // Generate initial behavior patterns
    const behaviorPatterns = await PersonaSimulator.initializePersona({
      personality: processedPersonality,
      archetype: validatedData.archetype,
      postingStyle,
    })

    // Create persona in database
    const persona = await prisma.persona.create({
      data: {
        name: validatedData.name,
        username: validatedData.username,
        bio: validatedData.bio,
        personality: processedPersonality,
        postingStyle,
        relationships: {}, // Will be populated as persona interacts
        activityPattern: behaviorPatterns.activityPattern,
        archetype: validatedData.archetype,
        riskLevel: validatedData.riskLevel,
        isActive: true,
        createdBy: session.user.id,
      },
    })

    // Revalidate relevant pages
    revalidatePath('/personas')
    revalidatePath('/persona-lab')
    
    // Redirect to the new persona's page
    redirect(`/persona/${persona.id}`)

  } catch (error) {
    console.error('Create persona error:', error)
    
    if (error instanceof z.ZodError) {
      return {
        error: error.errors[0].message,
        field: error.errors[0].path[0] as string,
      }
    }
    
    if (error instanceof Error) {
      if (error.message === 'UNAUTHORIZED') {
        redirect('/login')
      }
      
      return {
        error: error.message,
        field: 'general',
      }
    }

    return {
      error: 'An unexpected error occurred',
      field: 'general',
    }
  }
}

/**
 * Server Action to update an existing persona
 * Allows modification of personality traits and behavior
 */
export async function updatePersona(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    // Extract and validate form data
    const rawData: any = {
      personaId: formData.get('personaId')?.toString() || '',
    }

    // Add all optional fields
    const optionalFields = [
      'name', 'bio', 'archetype', 'riskLevel', 'isActive',
      'openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism',
      'frequency', 'humor', 'formality', 'controversy', 'topics'
    ]

    optionalFields.forEach(field => {
      const value = formData.get(field)?.toString()
      if (value !== undefined && value !== '') {
        rawData[field] = value
      }
    })

    const validatedData = UpdatePersonaSchema.parse(rawData)

    // Verify persona exists
    const existingPersona = await prisma.persona.findUnique({
      where: { id: validatedData.personaId },
    })

    if (!existingPersona) {
      return {
        error: 'Persona not found',
        field: 'personaId',
      }
    }

    // For demo purposes, allow all users to update personas
    // In production, add proper ownership/permission checks
    // if (existingPersona.createdBy !== session.user.id) {
    //   return {
    //     error: 'You can only edit personas you created',
    //     field: 'authorization',
    //   }
    // }

    // Build update object
    const updateData: any = {}

    // Basic fields
    if (validatedData.name) updateData.name = validatedData.name
    if (validatedData.bio !== undefined) updateData.bio = validatedData.bio
    if (validatedData.archetype) updateData.archetype = validatedData.archetype
    if (validatedData.riskLevel !== undefined) updateData.riskLevel = validatedData.riskLevel
    if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive

    // Process personality updates if provided
    if (validatedData.openness !== undefined || 
        validatedData.conscientiousness !== undefined ||
        validatedData.extraversion !== undefined ||
        validatedData.agreeableness !== undefined ||
        validatedData.neuroticism !== undefined) {
      
      const updatedPersonality = {
        ...existingPersona.personality,
        ...(validatedData.openness !== undefined && { openness: validatedData.openness }),
        ...(validatedData.conscientiousness !== undefined && { conscientiousness: validatedData.conscientiousness }),
        ...(validatedData.extraversion !== undefined && { extraversion: validatedData.extraversion }),
        ...(validatedData.agreeableness !== undefined && { agreeableness: validatedData.agreeableness }),
        ...(validatedData.neuroticism !== undefined && { neuroticism: validatedData.neuroticism }),
      }

      updateData.personality = await PersonalityProcessor.processPersonality({
        traits: updatedPersonality,
        archetype: validatedData.archetype || existingPersona.archetype,
        riskLevel: validatedData.riskLevel ?? existingPersona.riskLevel,
      })
    }

    // Process posting style updates
    if (validatedData.frequency !== undefined ||
        validatedData.humor !== undefined ||
        validatedData.formality !== undefined ||
        validatedData.controversy !== undefined ||
        validatedData.topics !== undefined) {
      
      const currentStyle = existingPersona.postingStyle as any || {}
      const currentTonePrefs = currentStyle.tonePreferences || {}

      updateData.postingStyle = {
        ...currentStyle,
        ...(validatedData.frequency !== undefined && { frequency: validatedData.frequency }),
        tonePreferences: {
          ...currentTonePrefs,
          ...(validatedData.humor !== undefined && { humor: validatedData.humor }),
          ...(validatedData.formality !== undefined && { formality: validatedData.formality }),
          ...(validatedData.controversy !== undefined && { controversy: validatedData.controversy }),
        },
        ...(validatedData.topics && { 
          topics: validatedData.topics.split(',').map(t => t.trim()).filter(Boolean) 
        }),
      }
    }

    updateData.updatedAt = new Date()

    // Update persona
    const updatedPersona = await prisma.persona.update({
      where: { id: validatedData.personaId },
      data: updateData,
    })

    // Revalidate relevant pages
    revalidatePath('/personas')
    revalidatePath('/persona-lab')
    revalidatePath(`/persona/${validatedData.personaId}`)

    return {
      success: true,
      message: 'Persona updated successfully',
      persona: {
        id: updatedPersona.id,
        name: updatedPersona.name,
        username: updatedPersona.username,
      },
    }

  } catch (error) {
    console.error('Update persona error:', error)
    
    if (error instanceof z.ZodError) {
      return {
        error: error.errors[0].message,
        field: error.errors[0].path[0] as string,
      }
    }
    
    if (error instanceof Error) {
      if (error.message === 'UNAUTHORIZED') {
        redirect('/login')
      }
      
      return {
        error: error.message,
        field: 'general',
      }
    }

    return {
      error: 'An unexpected error occurred',
      field: 'general',
    }
  }
}

/**
 * Server Action to delete a persona
 * Performs soft delete with content cleanup
 */
export async function deletePersona(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    // Extract and validate form data
    const rawData = {
      personaId: formData.get('personaId')?.toString() || '',
      confirmUsername: formData.get('confirmUsername')?.toString() || '',
    }

    const validatedData = DeletePersonaSchema.parse(rawData)

    // Verify persona exists
    const persona = await prisma.persona.findUnique({
      where: { id: validatedData.personaId },
    })

    if (!persona) {
      return {
        error: 'Persona not found',
        field: 'personaId',
      }
    }

    // Verify username confirmation
    if (persona.username !== validatedData.confirmUsername) {
      return {
        error: 'Username confirmation does not match',
        field: 'confirmUsername',
      }
    }

    // For demo purposes, allow all users to delete personas
    // In production, add proper ownership/permission checks
    // if (persona.createdBy !== session.user.id) {
    //   return {
    //     error: 'You can only delete personas you created',
    //     field: 'authorization',
    //   }
    // }

    // Soft delete persona and mark related content as deleted
    await prisma.$transaction([
      // Soft delete the persona
      prisma.persona.update({
        where: { id: validatedData.personaId },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      }),
      // Mark persona's posts as deleted
      prisma.post.updateMany({
        where: { 
          authorId: validatedData.personaId,
          authorType: 'PERSONA',
        },
        data: {
          deletedAt: new Date(),
          visibility: 'DRAFT',
        },
      }),
    ])

    // Revalidate relevant pages
    revalidatePath('/personas')
    revalidatePath('/persona-lab')
    revalidatePath(`/persona/${validatedData.personaId}`)

    return {
      success: true,
      message: `Persona "${persona.name}" deleted successfully`,
    }

  } catch (error) {
    console.error('Delete persona error:', error)
    
    if (error instanceof z.ZodError) {
      return {
        error: error.errors[0].message,
        field: error.errors[0].path[0] as string,
      }
    }
    
    if (error instanceof Error) {
      if (error.message === 'UNAUTHORIZED') {
        redirect('/login')
      }
      
      return {
        error: error.message,
        field: 'general',
      }
    }

    return {
      error: 'An unexpected error occurred',
      field: 'general',
    }
  }
}

/**
 * Server Action to activate or deactivate a persona
 * Quick toggle for persona status
 */
export async function togglePersonaStatus(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    const personaId = formData.get('personaId')?.toString()
    if (!personaId) {
      return {
        error: 'Persona ID is required',
        field: 'personaId',
      }
    }

    // Get current persona status
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { id: true, username: true, isActive: true },
    })

    if (!persona) {
      return {
        error: 'Persona not found',
        field: 'personaId',
      }
    }

    // Toggle status
    const newStatus = !persona.isActive
    await prisma.persona.update({
      where: { id: personaId },
      data: { 
        isActive: newStatus,
        updatedAt: new Date(),
      },
    })

    // Revalidate relevant pages
    revalidatePath('/personas')
    revalidatePath('/persona-lab')
    revalidatePath(`/persona/${personaId}`)

    return {
      success: true,
      message: `Persona "${persona.username}" ${newStatus ? 'activated' : 'deactivated'}`,
      isActive: newStatus,
    }

  } catch (error) {
    console.error('Toggle persona status error:', error)
    
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      redirect('/login')
    }

    return {
      error: 'An unexpected error occurred',
      field: 'general',
    }
  }
}