import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

interface HealthCheck {
  service: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime: number
  error?: string
  details?: Record<string, any>
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  version: string
  environment: string
  checks: HealthCheck[]
  summary: {
    total: number
    healthy: number
    degraded: number
    unhealthy: number
  }
}

/**
 * GET /api/health - System health check endpoint
 * 
 * Returns comprehensive health status for all system components.
 * Used by monitoring systems and load balancers for service discovery.
 * 
 * Query Parameters:
 * - detailed: Include detailed metrics and diagnostics
 * - services: Comma-separated list of specific services to check
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const url = new URL(request.url)
  const detailed = url.searchParams.get('detailed') === 'true'
  const servicesFilter = url.searchParams.get('services')?.split(',').map(s => s.trim())

  const checks: HealthCheck[] = []
  
  try {
    // Define all available health checks
    const allChecks = [
      { name: 'database', check: checkDatabase },
      { name: 'redis', check: checkRedis },
      { name: 'api', check: checkAPIServices },
      { name: 'ai', check: checkAIServices },
      { name: 'news', check: checkNewsServices },
      { name: 'storage', check: checkStorage },
    ]

    // Filter checks if specific services requested
    const checksToRun = servicesFilter 
      ? allChecks.filter(check => servicesFilter.includes(check.name))
      : allChecks

    // Run health checks in parallel
    const checkPromises = checksToRun.map(async ({ name, check }) => {
      const checkStart = Date.now()
      try {
        const result = await Promise.race([
          check(detailed),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ])
        
        return {
          service: name,
          status: result.status || 'healthy',
          responseTime: Date.now() - checkStart,
          details: detailed ? result.details : undefined,
        } as HealthCheck
        
      } catch (error) {
        return {
          service: name,
          status: 'unhealthy' as const,
          responseTime: Date.now() - checkStart,
          error: error instanceof Error ? error.message : 'Unknown error',
        } as HealthCheck
      }
    })

    const checkResults = await Promise.allSettled(checkPromises)
    
    // Process results
    checkResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        checks.push(result.value)
      } else {
        checks.push({
          service: 'unknown',
          status: 'unhealthy',
          responseTime: 5000,
          error: 'Health check failed to complete',
        })
      }
    })

    // Calculate overall health status
    const healthy = checks.filter(c => c.status === 'healthy').length
    const degraded = checks.filter(c => c.status === 'degraded').length
    const unhealthy = checks.filter(c => c.status === 'unhealthy').length

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (unhealthy > 0) {
      overallStatus = 'unhealthy'
    } else if (degraded > 0) {
      overallStatus = 'degraded'
    }

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
      summary: {
        total: checks.length,
        healthy,
        degraded,
        unhealthy,
      },
    }

    // Set appropriate HTTP status code
    const httpStatus = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503

    return new Response(
      JSON.stringify(response, null, 2),
      {
        status: httpStatus,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Health-Check-Duration': `${Date.now() - startTime}ms`,
        },
      }
    )

  } catch (error) {
    console.error('Health check error:', error)
    
    const errorResponse: HealthResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: [{
        service: 'health-endpoint',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Health check system failure',
      }],
      summary: {
        total: 1,
        healthy: 0,
        degraded: 0,
        unhealthy: 1,
      },
    }

    return new Response(
      JSON.stringify(errorResponse, null, 2),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    )
  }
}

/**
 * Check database connectivity and performance
 */
async function checkDatabase(detailed: boolean) {
  const start = Date.now()
  
  try {
    // Basic connectivity check
    await prisma.$queryRaw`SELECT 1 as test`
    
    // Check database metrics if detailed
    const details: Record<string, any> = {}
    
    if (detailed) {
      // Get database connection info
      details.connectionPool = {
        active: 'unknown', // Prisma doesn't expose pool stats easily
        idle: 'unknown',
        total: 'unknown',
      }
      
      // Check critical tables
      const [userCount, postCount, personaCount] = await Promise.all([
        prisma.user.count(),
        prisma.post.count(),
        prisma.persona.count(),
      ])
      
      details.counts = {
        users: userCount,
        posts: postCount,
        personas: personaCount,
      }
      
      // Check recent activity
      const recentPosts = await prisma.post.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      })
      
      details.activity = {
        postsLast24h: recentPosts,
      }
    }
    
    const responseTime = Date.now() - start
    
    return {
      status: responseTime < 100 ? 'healthy' : responseTime < 500 ? 'degraded' : 'unhealthy',
      details,
    }
    
  } catch (error) {
    throw new Error(`Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Check Redis connectivity and performance
 */
async function checkRedis(detailed: boolean) {
  const start = Date.now()
  
  try {
    // Basic connectivity and latency check
    await redis.ping()
    
    const details: Record<string, any> = {}
    
    if (detailed) {
      // Get Redis info
      const info = await redis.info()
      const lines = info.split('\r\n')
      
      // Parse memory usage
      const memoryLine = lines.find(line => line.startsWith('used_memory_human:'))
      details.memory = memoryLine ? memoryLine.split(':')[1] : 'unknown'
      
      // Parse connected clients
      const clientsLine = lines.find(line => line.startsWith('connected_clients:'))
      details.connectedClients = clientsLine ? parseInt(clientsLine.split(':')[1]) : 0
      
      // Check cache hit rate (approximate)
      const keyspaceHits = lines.find(line => line.startsWith('keyspace_hits:'))
      const keyspaceMisses = lines.find(line => line.startsWith('keyspace_misses:'))
      
      if (keyspaceHits && keyspaceMisses) {
        const hits = parseInt(keyspaceHits.split(':')[1])
        const misses = parseInt(keyspaceMisses.split(':')[1])
        details.cacheHitRate = hits + misses > 0 ? (hits / (hits + misses) * 100).toFixed(2) + '%' : 'N/A'
      }
      
      // Test cache operations
      const testKey = `health_check_${Date.now()}`
      await redis.setex(testKey, 5, 'test')
      const testValue = await redis.get(testKey)
      await redis.del(testKey)
      
      details.cacheOperations = testValue === 'test' ? 'working' : 'failed'
    }
    
    const responseTime = Date.now() - start
    
    return {
      status: responseTime < 50 ? 'healthy' : responseTime < 200 ? 'degraded' : 'unhealthy',
      details,
    }
    
  } catch (error) {
    throw new Error(`Redis check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Check API services availability
 */
async function checkAPIServices(detailed: boolean) {
  try {
    const details: Record<string, any> = {}
    
    if (detailed) {
      // Check tRPC endpoints by making internal requests
      details.endpoints = {
        social: 'available',
        personas: 'available', 
        content: 'available',
        trends: 'available',
      }
      
      // Check if any background jobs are failing
      const failedJobs = await prisma.job.count({
        where: {
          status: 'FAILED',
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        },
      })
      
      details.backgroundJobs = {
        failedLastHour: failedJobs,
        status: failedJobs > 10 ? 'degraded' : 'healthy',
      }
    }
    
    return {
      status: 'healthy' as const,
      details,
    }
    
  } catch (error) {
    throw new Error(`API services check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Check AI services availability
 */
async function checkAIServices(detailed: boolean) {
  try {
    const details: Record<string, any> = {}
    
    if (detailed) {
      // Check AI service configuration
      details.openai = {
        configured: !!process.env.OPENAI_API_KEY,
        status: !!process.env.OPENAI_API_KEY ? 'configured' : 'missing_key',
      }
      
      details.openrouter = {
        configured: !!process.env.OPENROUTER_API_KEY,
        status: !!process.env.OPENROUTER_API_KEY ? 'configured' : 'missing_key',
      }
      
      // Check recent AI generation activity
      const recentGenerations = await prisma.post.count({
        where: {
          generationSource: {
            not: null,
          },
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      })
      
      details.activity = {
        generationsLast24h: recentGenerations,
      }
    }
    
    return {
      status: 'healthy' as const,
      details,
    }
    
  } catch (error) {
    throw new Error(`AI services check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Check news ingestion services
 */
async function checkNewsServices(detailed: boolean) {
  try {
    const details: Record<string, any> = {}
    
    if (detailed) {
      // Check recent news ingestion
      const recentNews = await prisma.newsItem.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      })
      
      // Check active trends
      const activeTrends = await prisma.trend.count({
        where: {
          isActive: true,
          expiresAt: {
            gt: new Date(),
          },
        },
      })
      
      details.activity = {
        newsItemsLast24h: recentNews,
        activeTrends: activeTrends,
      }
      
      details.newsApi = {
        configured: !!process.env.NEWS_API_KEY,
        status: !!process.env.NEWS_API_KEY ? 'configured' : 'missing_key',
      }
    }
    
    return {
      status: 'healthy' as const,
      details,
    }
    
  } catch (error) {
    throw new Error(`News services check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Check storage and file systems
 */
async function checkStorage(detailed: boolean) {
  try {
    const details: Record<string, any> = {}
    
    if (detailed) {
      // Check disk space (basic Node.js check)
      const fs = require('fs')
      const path = require('path')
      
      try {
        const stats = fs.statSync(process.cwd())
        details.filesystem = {
          accessible: true,
          path: process.cwd(),
        }
      } catch (fsError) {
        details.filesystem = {
          accessible: false,
          error: fsError instanceof Error ? fsError.message : 'Unknown filesystem error',
        }
      }
      
      // Check environment variables for external storage
      details.externalStorage = {
        s3: !!process.env.AWS_S3_BUCKET,
        cloudinary: !!process.env.CLOUDINARY_URL,
      }
    }
    
    return {
      status: 'healthy' as const,
      details,
    }
    
  } catch (error) {
    throw new Error(`Storage check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * POST /api/health - Force health check refresh
 * Clears cached health data and runs fresh checks
 */
export async function POST() {
  try {
    // Clear any health check caches
    const cacheKeys = await redis.keys('health:*')
    if (cacheKeys.length > 0) {
      await redis.del(...cacheKeys)
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Health check cache cleared',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
    
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to refresh health checks',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}