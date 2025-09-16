#!/usr/bin/env tsx

/**
 * Background worker process for SpotlightX
 * 
 * This script starts all BullMQ workers for:
 * - Persona content generation
 * - Content moderation
 * - Trending analysis
 * - Feed ranking
 * 
 * Usage:
 *   npm run workers           # Start all workers
 *   npm run workers:dev       # Start with hot reload
 * 
 * Environment variables:
 *   WORKER_CONCURRENCY       # Max concurrent jobs per worker (default: varies by worker)
 *   REDIS_URL               # Redis connection URL
 *   NODE_ENV                # Environment (development/production)
 */

import { workers, JobScheduler } from '@/lib/queue/jobs'
import { redis } from '@/lib/redis'

async function startWorkers() {
  console.log('🚀 Starting SpotlightX background workers...')
  
  // Test Redis connection
  try {
    await redis.ping()
    console.log('✅ Redis connection established')
  } catch (error) {
    console.error('❌ Redis connection failed:', error)
    process.exit(1)
  }
  
  // Start all workers
  const workerNames = Object.keys(workers) as Array<keyof typeof workers>
  
  console.log(`📋 Starting ${workerNames.length} worker processes:`)
  workerNames.forEach(name => {
    console.log(`  - ${name}`)
  })
  
  // Set up worker event listeners for monitoring
  Object.entries(workers).forEach(([name, worker]) => {
    worker.on('ready', () => {
      console.log(`✅ Worker ${name} is ready`)
    })
    
    worker.on('active', (job) => {
      console.log(`🔄 [${name}] Processing job ${job.id}: ${job.name}`)
    })
    
    worker.on('completed', (job, result) => {
      console.log(`✅ [${name}] Job ${job.id} completed:`, result?.success ? '✓' : '⚠️')
    })
    
    worker.on('failed', (job, error) => {
      console.error(`❌ [${name}] Job ${job?.id} failed:`, error.message)
    })
    
    worker.on('error', (error) => {
      console.error(`💥 [${name}] Worker error:`, error)
    })
    
    worker.on('stalled', (jobId) => {
      console.warn(`⏱️ [${name}] Job ${jobId} stalled`)
    })
  })
  
  // Schedule initial jobs
  await scheduleInitialJobs()
  
  // Set up periodic maintenance
  setInterval(async () => {
    try {
      await JobScheduler.cleanupQueues()
      const stats = await JobScheduler.getQueueStats()
      console.log('📊 Queue stats:', stats)
    } catch (error) {
      console.error('Failed to cleanup queues:', error)
    }
  }, 60 * 60 * 1000) // Every hour
  
  console.log('🎉 All workers started successfully!')
  console.log('📡 Workers are now listening for jobs...')
  
  // Keep process alive
  process.on('SIGINT', gracefulShutdown)
  process.on('SIGTERM', gracefulShutdown)
}

async function scheduleInitialJobs() {
  console.log('🕐 Scheduling initial jobs...')
  
  try {
    // Schedule trending analysis to run immediately and then every 15 minutes
    await JobScheduler.scheduleTrendingAnalysis({
      timeframe: 'hourly',
      sources: ['rss', 'api', 'social'],
    })
    
    // Schedule some persona activity for demo purposes
    // In production, this would be based on actual persona schedules
    const mockPersonaIds = ['persona-1', 'persona-2', 'persona-3']
    const trendingTopics = ['AI', 'Technology', 'Innovation']
    
    await JobScheduler.schedulePersonaActivities(mockPersonaIds, trendingTopics)
    
    console.log('✅ Initial jobs scheduled')
    
  } catch (error) {
    console.error('❌ Failed to schedule initial jobs:', error)
  }
}

async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}, shutting down workers gracefully...`)
  
  // Stop accepting new jobs
  const shutdownPromises = Object.entries(workers).map(async ([name, worker]) => {
    console.log(`⏳ Closing ${name} worker...`)
    try {
      await worker.close()
      console.log(`✅ ${name} worker closed`)
    } catch (error) {
      console.error(`❌ Error closing ${name} worker:`, error)
    }
  })
  
  await Promise.all(shutdownPromises)
  
  // Close Redis connection
  try {
    await redis.disconnect()
    console.log('✅ Redis connection closed')
  } catch (error) {
    console.error('❌ Error closing Redis connection:', error)
  }
  
  console.log('👋 Workers shutdown complete')
  process.exit(0)
}

// Handle unhandled promises and exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit in production, but log the error
  if (process.env.NODE_ENV === 'development') {
    process.exit(1)
  }
})

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error)
  process.exit(1)
})

// Start the workers
startWorkers().catch((error) => {
  console.error('💥 Failed to start workers:', error)
  process.exit(1)
})

export { startWorkers }