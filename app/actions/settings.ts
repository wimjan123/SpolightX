'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// Server Action validation schemas
const UpdateSettingSchema = z.object({
  category: z.string().min(1, 'Category is required').max(50, 'Category too long'),
  key: z.string().min(1, 'Key is required').max(100, 'Key too long'),
  value: z.any(), // JSON value - can be string, number, boolean, object, array
  description: z.string().optional(),
})

const DeleteSettingSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  key: z.string().min(1, 'Key is required'),
})

const BatchUpdateSettingsSchema = z.object({
  settings: z.array(z.object({
    category: z.string().min(1).max(50),
    key: z.string().min(1).max(100),
    value: z.any(),
    description: z.string().optional(),
  })).min(1, 'At least one setting is required'),
})

/**
 * Server Action to update a user setting
 * Used by preference forms and settings panels
 */
export async function updateSetting(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    // Extract and validate form data
    const rawData = {
      category: formData.get('category')?.toString() || '',
      key: formData.get('key')?.toString() || '',
      value: parseSettingValue(formData.get('value')?.toString() || ''),
      description: formData.get('description')?.toString(),
    }

    const validatedData = UpdateSettingSchema.parse(rawData)

    // Upsert setting (update if exists, create if not)
    const setting = await prisma.setting.upsert({
      where: {
        userId_category_key: {
          userId: session.user.id,
          category: validatedData.category,
          key: validatedData.key,
        },
      },
      update: {
        value: validatedData.value,
        description: validatedData.description,
        updatedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        category: validatedData.category,
        key: validatedData.key,
        value: validatedData.value,
        description: validatedData.description,
        isEncrypted: shouldEncryptSetting(validatedData.category, validatedData.key),
      },
    })

    // Revalidate relevant pages
    revalidatePath('/settings')
    revalidatePath(`/settings/${validatedData.category}`)

    return {
      success: true,
      message: 'Setting updated successfully',
      setting: {
        id: setting.id,
        category: setting.category,
        key: setting.key,
        value: setting.value,
      },
    }

  } catch (error) {
    console.error('Update setting error:', error)
    
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
 * Server Action to delete a user setting
 * Removes setting from database completely
 */
export async function deleteSetting(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    // Extract and validate form data
    const rawData = {
      category: formData.get('category')?.toString() || '',
      key: formData.get('key')?.toString() || '',
    }

    const validatedData = DeleteSettingSchema.parse(rawData)

    // Check if setting exists
    const existingSetting = await prisma.setting.findUnique({
      where: {
        userId_category_key: {
          userId: session.user.id,
          category: validatedData.category,
          key: validatedData.key,
        },
      },
    })

    if (!existingSetting) {
      return {
        error: 'Setting not found',
        field: 'key',
      }
    }

    // Delete the setting
    await prisma.setting.delete({
      where: {
        userId_category_key: {
          userId: session.user.id,
          category: validatedData.category,
          key: validatedData.key,
        },
      },
    })

    // Revalidate relevant pages
    revalidatePath('/settings')
    revalidatePath(`/settings/${validatedData.category}`)

    return {
      success: true,
      message: 'Setting deleted successfully',
    }

  } catch (error) {
    console.error('Delete setting error:', error)
    
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
 * Server Action to update multiple settings at once
 * Used for bulk preference updates and form submissions
 */
export async function batchUpdateSettings(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    // Parse settings from form data
    const settingsJson = formData.get('settings')?.toString()
    if (!settingsJson) {
      return {
        error: 'Settings data is required',
        field: 'settings',
      }
    }

    let settings
    try {
      settings = JSON.parse(settingsJson)
    } catch {
      return {
        error: 'Invalid settings data format',
        field: 'settings',
      }
    }

    const validatedData = BatchUpdateSettingsSchema.parse({ settings })

    // Process settings in transaction
    const results = await prisma.$transaction(
      validatedData.settings.map((setting) =>
        prisma.setting.upsert({
          where: {
            userId_category_key: {
              userId: session.user.id,
              category: setting.category,
              key: setting.key,
            },
          },
          update: {
            value: setting.value,
            description: setting.description,
            updatedAt: new Date(),
          },
          create: {
            userId: session.user.id,
            category: setting.category,
            key: setting.key,
            value: setting.value,
            description: setting.description,
            isEncrypted: shouldEncryptSetting(setting.category, setting.key),
          },
        })
      )
    )

    // Revalidate all affected pages
    const categories = [...new Set(validatedData.settings.map(s => s.category))]
    revalidatePath('/settings')
    categories.forEach(category => {
      revalidatePath(`/settings/${category}`)
    })

    return {
      success: true,
      message: `Updated ${results.length} settings successfully`,
      updatedCount: results.length,
      settings: results.map(setting => ({
        id: setting.id,
        category: setting.category,
        key: setting.key,
        value: setting.value,
      })),
    }

  } catch (error) {
    console.error('Batch update settings error:', error)
    
    if (error instanceof z.ZodError) {
      return {
        error: error.errors[0].message,
        field: error.errors[0].path.join('.'),
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
 * Server Action to reset settings to defaults for a category
 * Clears all user settings in the specified category
 */
export async function resetCategorySettings(formData: FormData) {
  try {
    // Get current user session
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('UNAUTHORIZED')
    }

    const category = formData.get('category')?.toString()
    if (!category) {
      return {
        error: 'Category is required',
        field: 'category',
      }
    }

    // Delete all settings in this category for the user
    const deleteResult = await prisma.setting.deleteMany({
      where: {
        userId: session.user.id,
        category: category,
      },
    })

    // Revalidate relevant pages
    revalidatePath('/settings')
    revalidatePath(`/settings/${category}`)

    return {
      success: true,
      message: `Reset ${deleteResult.count} settings in ${category} category`,
      deletedCount: deleteResult.count,
    }

  } catch (error) {
    console.error('Reset category settings error:', error)
    
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
 * Helper function to parse setting values from form data
 * Handles different data types (string, number, boolean, JSON)
 */
function parseSettingValue(value: string): any {
  if (!value) return null

  // Try to parse as JSON first (for objects/arrays/booleans/numbers)
  try {
    return JSON.parse(value)
  } catch {
    // If JSON parse fails, return as string
    return value
  }
}

/**
 * Helper function to determine if a setting should be encrypted
 * Based on category and key patterns for sensitive data
 */
function shouldEncryptSetting(category: string, key: string): boolean {
  const encryptedCategories = ['auth', 'api', 'security', 'tokens']
  const encryptedKeys = ['password', 'token', 'secret', 'key', 'apiKey']
  
  if (encryptedCategories.includes(category.toLowerCase())) {
    return true
  }
  
  if (encryptedKeys.some(pattern => key.toLowerCase().includes(pattern))) {
    return true
  }
  
  return false
}