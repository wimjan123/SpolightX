import { Queue, Worker, Job } from 'bullmq'
import { redis } from '@/lib/redis'
import { AIGenerationService } from '@/lib/ai/generation'
import { PersonaEngineService } from '@/lib/persona/engine'
import { ContentSafetyService } from '@/lib/safety/content'
import { eventEmitter } from '@/server/api/trpc'

// Job types
interface PersonaContentJob {
  personaId: string
  contentType: 'post' | 'reply' | 'dm'
  context?: {
    trendingTopics?: string[]
    replyToPostId?: string
    conversationId?: string
    prompt?: string
  }
  settings?: {
    creativity: number
    riskLevel: number
    maxLength: number
  }
}

interface ContentModerationJob {
  contentId: string
  content: string
  authorId: string
  contentType: 'post' | 'message' | 'bio'
}

interface TrendingAnalysisJob {
  timeframe: 'hourly' | 'daily'
  sources: string[]
}

interface FeedRankingJob {
  userId: string
  feedType: 'hybrid' | 'following' | 'discover'
  refreshType: 'full' | 'incremental'
}

// Queue definitions
export const personaContentQueue = new Queue<PersonaContentJob>('persona-content', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
})

export const contentModerationQueue = new Queue<ContentModerationJob>('content-moderation', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 500,
    removeOnFail: 100,
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 1000,
    },
  },
})

export const trendingAnalysisQueue = new Queue<TrendingAnalysisJob>('trending-analysis', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    attempts: 2,
    repeat: {
      pattern: '*/15 * * * *', // Every 15 minutes
    },
  },
})

export const feedRankingQueue = new Queue<FeedRankingJob>('feed-ranking', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 50,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 1500,
    },
  },
})

// Workers
const personaContentWorker = new Worker<PersonaContentJob>(
  'persona-content',
  async (job: Job<PersonaContentJob>) => {
    const { personaId, contentType, context, settings } = job.data
    
    try {
      console.log(`Processing persona content job for persona ${personaId}`)
      
      // Get persona details
      const persona = await PersonaEngineService.getPersona(personaId)
      if (!persona) {
        throw new Error(`Persona ${personaId} not found`)
      }
      
      // Generate content based on type
      let generatedContent: string
      
      switch (contentType) {
        case 'post':
          generatedContent = await AIGenerationService.generatePost({
            persona,
            trendingTopics: context?.trendingTopics || [],
            creativity: settings?.creativity || 0.7,
            maxLength: settings?.maxLength || 280,
          })
          break
          
        case 'reply':
          if (!context?.replyToPostId) {
            throw new Error('Reply job missing replyToPostId in context')
          }
          generatedContent = await AIGenerationService.generateReply({
            persona,
            replyToPostId: context.replyToPostId,
            creativity: settings?.creativity || 0.6,
            maxLength: settings?.maxLength || 280,
          })
          break
          
        case 'dm':
          if (!context?.conversationId) {
            throw new Error('DM job missing conversationId in context')
          }
          generatedContent = await AIGenerationService.generateDirectMessage({
            persona,
            conversationId: context.conversationId,
            prompt: context.prompt,
            creativity: settings?.creativity || 0.8,
            maxLength: settings?.maxLength || 500,
          })
          break
          
        default:
          throw new Error(`Unsupported content type: ${contentType}`)
      }
      
      // Safety check the generated content
      const safetyResult = await ContentSafetyService.moderateContent(generatedContent)
      
      if (!safetyResult.approved) {
        console.warn(`Content rejected for persona ${personaId}:`, safetyResult.reason)
        
        // Retry with lower risk settings if this was the first attempt
        if (job.attemptsMade === 1 && settings?.riskLevel && settings.riskLevel > 0.3) {
          throw new Error('Content safety violation - retrying with lower risk')
        } else {
          throw new Error(`Content safety violation: ${safetyResult.reason}`)
        }
      }
      
      // Save the content and notify listeners
      const savedContent = await PersonaEngineService.saveGeneratedContent({
        personaId,
        content: generatedContent,
        contentType,
        context,
        safetyScore: safetyResult.score,
      })
      
      // Emit real-time update
      eventEmitter.emit('newPost', {
        type: 'persona_content',
        personaId,
        contentId: savedContent.id,
        content: generatedContent,
        timestamp: new Date().toISOString(),
      })
      
      console.log(`Successfully generated ${contentType} for persona ${personaId}`)
      
      return {
        success: true,
        contentId: savedContent.id,
        content: generatedContent,
        safetyScore: safetyResult.score,
      }
      
    } catch (error) {
      console.error(`Persona content job failed for ${personaId}:`, error)
      throw error
    }
  },
  {
    connection: redis,
    concurrency: 5, // Process up to 5 persona jobs concurrently
  }
)

const contentModerationWorker = new Worker<ContentModerationJob>(
  'content-moderation',
  async (job: Job<ContentModerationJob>) => {
    const { contentId, content, authorId, contentType } = job.data
    
    try {
      console.log(`Moderating ${contentType} content: ${contentId}`)
      
      const result = await ContentSafetyService.moderateContent(content)
      
      // Update content moderation status in database
      await ContentSafetyService.updateModerationResult({
        contentId,
        approved: result.approved,
        score: result.score,
        flags: result.flags,
        reason: result.reason,
      })
      
      // If content is flagged, take appropriate action
      if (!result.approved) {
        await ContentSafetyService.handleFlaggedContent({
          contentId,
          authorId,
          contentType,
          severity: result.severity,
          reason: result.reason,
        })
      }
      
      return {
        success: true,
        approved: result.approved,
        score: result.score,
        flags: result.flags,
      }
      
    } catch (error) {
      console.error(`Content moderation failed for ${contentId}:`, error)
      throw error
    }
  },
  {
    connection: redis,
    concurrency: 10,
  }
)

const trendingAnalysisWorker = new Worker<TrendingAnalysisJob>(
  'trending-analysis',
  async (job: Job<TrendingAnalysisJob>) => {
    const { timeframe, sources } = job.data
    
    try {
      console.log(`Analyzing trends for ${timeframe} timeframe`)
      
      // This would integrate with the trending detection service
      // For now, just log the job
      console.log(`Processing ${sources.length} sources for trending analysis`)
      
      // Emit trending update
      eventEmitter.emit('feedUpdate', {
        type: 'trending_update',
        timeframe,
        timestamp: new Date().toISOString(),
      })
      
      return {
        success: true,
        processed: sources.length,
        timeframe,
      }
      
    } catch (error) {
      console.error('Trending analysis failed:', error)
      throw error
    }
  },
  {
    connection: redis,
    concurrency: 2,
  }
)

const feedRankingWorker = new Worker<FeedRankingJob>(
  'feed-ranking',
  async (job: Job<FeedRankingJob>) => {
    const { userId, feedType, refreshType } = job.data
    
    try {
      console.log(`Updating ${feedType} feed ranking for user ${userId} (${refreshType})`)
      
      // This would integrate with the feed ranking service
      // For now, just log the job
      console.log(`Feed ranking updated for ${userId}`)
      
      // Emit feed update
      eventEmitter.emit('feedUpdate', {
        type: 'ranking_update',
        userId,
        feedType,
        refreshType,
        timestamp: new Date().toISOString(),
      })
      
      return {
        success: true,
        userId,
        feedType,
        refreshType,
      }
      
    } catch (error) {
      console.error(`Feed ranking failed for ${userId}:`, error)
      throw error
    }
  },
  {
    connection: redis,
    concurrency: 8,
  }
)

// Job scheduling utilities
export class JobScheduler {
  
  // Schedule persona content generation
  static async schedulePersonaContent(data: PersonaContentJob, options?: {
    delay?: number
    priority?: number
    repeatPattern?: string
  }) {
    return personaContentQueue.add('generate-content', data, {
      delay: options?.delay,
      priority: options?.priority,
      repeat: options?.repeatPattern ? { pattern: options.repeatPattern } : undefined,
    })
  }
  
  // Schedule content moderation
  static async scheduleContentModeration(data: ContentModerationJob) {
    return contentModerationQueue.add('moderate-content', data, {
      priority: 10, // High priority for safety
    })
  }
  
  // Schedule trending analysis
  static async scheduleTrendingAnalysis(data: TrendingAnalysisJob) {
    return trendingAnalysisQueue.add('analyze-trends', data)
  }
  
  // Schedule feed ranking update
  static async scheduleFeedRanking(data: FeedRankingJob, options?: {
    delay?: number
  }) {
    return feedRankingQueue.add('update-feed-ranking', data, {
      delay: options?.delay,
    })
  }
  
  // Bulk schedule persona activities
  static async schedulePersonaActivities(personaIds: string[], trendingTopics: string[]) {
    const jobs = personaIds.map(personaId => ({
      name: 'generate-content',
      data: {
        personaId,
        contentType: 'post' as const,
        context: { trendingTopics },
        settings: {
          creativity: 0.7,
          riskLevel: 0.5,
          maxLength: 280,
        },
      },
      opts: {
        delay: Math.random() * 300000, // Random delay up to 5 minutes
      },
    }))
    
    return personaContentQueue.addBulk(jobs)
  }
  
  // Get queue status
  static async getQueueStats() {
    const [
      personaStats,
      moderationStats,
      trendingStats,
      feedStats,
    ] = await Promise.all([
      personaContentQueue.getJobCounts(),
      contentModerationQueue.getJobCounts(),
      trendingAnalysisQueue.getJobCounts(),
      feedRankingQueue.getJobCounts(),
    ])
    
    return {
      personaContent: personaStats,
      contentModeration: moderationStats,
      trendingAnalysis: trendingStats,
      feedRanking: feedStats,
    }
  }
  
  // Cleanup old jobs
  static async cleanupQueues() {
    await Promise.all([
      personaContentQueue.clean(24 * 60 * 60 * 1000, 100), // Clean jobs older than 24 hours
      contentModerationQueue.clean(24 * 60 * 60 * 1000, 200),
      trendingAnalysisQueue.clean(7 * 24 * 60 * 60 * 1000, 50), // Clean jobs older than 7 days
      feedRankingQueue.clean(24 * 60 * 60 * 1000, 100),
    ])
  }
}

// Export workers for external process management
export const workers = {
  personaContentWorker,
  contentModerationWorker,
  trendingAnalysisWorker,
  feedRankingWorker,
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down workers...')
  await Promise.all([
    personaContentWorker.close(),
    contentModerationWorker.close(),
    trendingAnalysisWorker.close(),
    feedRankingWorker.close(),
  ])
  process.exit(0)
})