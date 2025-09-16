'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ContentSafetyModeration } from '@/lib/safety/moderation'

// Server Action validation schemas
const CreatePostSchema = z.object({
  content: z.string().min(1, 'Post content is required').max(2000, 'Post content too long'),
  parentId: z.string().uuid().optional(),
  quotedPostId: z.string().uuid().optional(),
  visibility: z.enum(['PUBLIC', 'DRAFT']).default('PUBLIC'),
})

const DeletePostSchema = z.object({
  postId: z.string().uuid('Invalid post ID'),
})

const InteractionSchema = z.object({
  postId: z.string().uuid('Invalid post ID'),
  type: z.enum(['LIKE', 'REPOST', 'VIEW']),
})

/**
 * Server Action to create a new post
 * Used by forms with progressive enhancement
 */
export async function createPost(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    // Extract and validate form data
    const rawData = {
      content: formData.get('content')?.toString() || '',
      parentId: formData.get('parentId')?.toString() || undefined,
      quotedPostId: formData.get('quotedPostId')?.toString() || undefined,
      visibility: (formData.get('visibility')?.toString() as 'PUBLIC' | 'DRAFT') || 'PUBLIC',
    }

    const validatedData = CreatePostSchema.parse(rawData)

    // Content safety moderation
    const moderationResult = await ContentSafetyModeration.moderateContent(
      validatedData.content,
      {
        userId: session.user.id,
        contentType: 'POST',
        parentId: validatedData.parentId,
      }
    )

    if (moderationResult.action === 'BLOCK') {
      // Return error state for form to handle
      return {
        error: `Content blocked: ${moderationResult.reason}`,
        field: 'content',
      }
    }

    // Create post in database
    const post = await prisma.post.create({
      data: {
        authorId: session.user.id,
        authorType: 'USER',
        content: validatedData.content,
        parentId: validatedData.parentId,
        quotedPostId: validatedData.quotedPostId,
        visibility: validatedData.visibility,
        moderationMetadata: moderationResult.metadata,
      },
    })

    // Revalidate relevant pages
    revalidatePath('/')
    revalidatePath('/feed')
    if (validatedData.parentId) {
      revalidatePath(`/post/${validatedData.parentId}`)
    }

    // Redirect to the new post or parent thread
    const redirectPath = validatedData.parentId 
      ? `/post/${validatedData.parentId}`
      : `/post/${post.id}`

    redirect(redirectPath)

  } catch (error) {
    console.error('Create post error:', error)
    
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
 * Server Action to delete a post
 * Performs soft delete with ownership verification
 */
export async function deletePost(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    // Extract and validate form data
    const rawData = {
      postId: formData.get('postId')?.toString() || '',
    }

    const validatedData = DeletePostSchema.parse(rawData)

    // Verify post exists and user owns it
    const post = await prisma.post.findUnique({
      where: { id: validatedData.postId },
    })

    if (!post) {
      return {
        error: 'Post not found',
        field: 'postId',
      }
    }

    if (post.authorId !== session.user.id) {
      return {
        error: 'You can only delete your own posts',
        field: 'authorization',
      }
    }

    // Soft delete the post
    await prisma.post.update({
      where: { id: validatedData.postId },
      data: {
        deletedAt: new Date(),
        visibility: 'DRAFT', // Hide from public feeds
      },
    })

    // Revalidate relevant pages
    revalidatePath('/')
    revalidatePath('/feed')
    revalidatePath(`/post/${validatedData.postId}`)

    return {
      success: true,
      message: 'Post deleted successfully',
    }

  } catch (error) {
    console.error('Delete post error:', error)
    
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
 * Server Action to add interaction to a post
 * Handles likes, reposts, and views
 */
export async function addInteraction(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    // Extract and validate form data
    const rawData = {
      postId: formData.get('postId')?.toString() || '',
      type: formData.get('type')?.toString() as 'LIKE' | 'REPOST' | 'VIEW',
    }

    const validatedData = InteractionSchema.parse(rawData)

    // Verify post exists
    const post = await prisma.post.findUnique({
      where: { id: validatedData.postId },
    })

    if (!post) {
      return {
        error: 'Post not found',
        field: 'postId',
      }
    }

    // Check if interaction already exists for LIKE/REPOST
    if (['LIKE', 'REPOST'].includes(validatedData.type)) {
      const existingInteraction = await prisma.interaction.findFirst({
        where: {
          userId: session.user.id,
          targetId: validatedData.postId,
          targetType: 'POST',
          interactionType: validatedData.type,
        },
      })

      if (existingInteraction) {
        // Remove existing interaction (toggle behavior)
        await prisma.interaction.delete({
          where: { id: existingInteraction.id },
        })

        // Decrement engagement count
        const engagementField = validatedData.type.toLowerCase() + 's'
        await prisma.post.update({
          where: { id: validatedData.postId },
          data: {
            [engagementField]: {
              decrement: 1,
            },
          },
        })

        // Revalidate pages
        revalidatePath('/')
        revalidatePath('/feed')
        revalidatePath(`/post/${validatedData.postId}`)

        return {
          success: true,
          action: 'removed',
          type: validatedData.type,
        }
      }
    }

    // Create new interaction
    await prisma.interaction.create({
      data: {
        userId: session.user.id,
        targetId: validatedData.postId,
        targetType: 'POST',
        interactionType: validatedData.type,
        sessionId: `session-${session.user.id}-${Date.now()}`,
      },
    })

    // Update engagement counts for LIKE/REPOST
    if (['LIKE', 'REPOST'].includes(validatedData.type)) {
      const engagementField = validatedData.type.toLowerCase() + 's'
      await prisma.post.update({
        where: { id: validatedData.postId },
        data: {
          [engagementField]: {
            increment: 1,
          },
        },
      })
    }

    // Revalidate pages
    revalidatePath('/')
    revalidatePath('/feed')
    revalidatePath(`/post/${validatedData.postId}`)

    return {
      success: true,
      action: 'added',
      type: validatedData.type,
    }

  } catch (error) {
    console.error('Add interaction error:', error)
    
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
 * Server Action to create a reply to a post
 * Specialized form of post creation for threading
 */
export async function createReply(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    // Extract parent post ID and content
    const parentId = formData.get('parentId')?.toString()
    const content = formData.get('content')?.toString() || ''

    if (!parentId) {
      return {
        error: 'Parent post ID is required',
        field: 'parentId',
      }
    }

    // Verify parent post exists
    const parentPost = await prisma.post.findUnique({
      where: { id: parentId },
    })

    if (!parentPost) {
      return {
        error: 'Parent post not found',
        field: 'parentId',
      }
    }

    // Use the main createPost action with parentId set
    const modifiedFormData = new FormData()
    modifiedFormData.set('content', content)
    modifiedFormData.set('parentId', parentId)
    modifiedFormData.set('visibility', 'PUBLIC')

    return await createPost(modifiedFormData)

  } catch (error) {
    console.error('Create reply error:', error)
    
    return {
      error: 'An unexpected error occurred',
      field: 'general',
    }
  }
}