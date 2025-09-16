import { NextRequest } from 'next/server'
import { z } from 'zod'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { NewsIngestionPipeline } from '@/lib/news-ingestion/pipeline'
import { TrendingAnalyzer } from '@/lib/news/trending'
import { redis } from '@/lib/redis'

// Webhook validation schemas
const NewsWebhookSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  articles: z.array(z.object({
    title: z.string().min(1),
    content: z.string().optional(),
    url: z.string().url(),
    author: z.string().optional(),
    publishedAt: z.string().datetime(),
    categories: z.array(z.string()).optional(),
  })).min(1, 'At least one article is required'),
  timestamp: z.string().datetime(),
  signature: z.string().optional(), // For webhook verification
})

const TrendWebhookSchema = z.object({
  type: z.enum(['trend_detected', 'trend_expired', 'trending_topic_update']),
  trend: z.object({
    id: z.string().optional(),
    topic: z.string(),
    velocity: z.number(),
    confidence: z.number(),
    sources: z.array(z.string()),
    categories: z.array(z.string()),
    region: z.string().optional(),
  }),
  timestamp: z.string().datetime(),
  signature: z.string().optional(),
})

/**
 * POST /api/news/webhook - Handle incoming news feed updates
 * 
 * Processes webhooks from news sources and RSS feed aggregators.
 * Ingests new articles and triggers trend detection.
 * 
 * Supported webhook types:
 * - News articles from RSS feeds
 * - Breaking news alerts
 * - Trend detection notifications
 * - Source availability updates
 */
export async function POST(request: NextRequest) {
  try {
    // Get request headers for webhook verification
    const headersList = headers()
    const signature = headersList.get('x-webhook-signature')
    const source = headersList.get('x-webhook-source') || 'unknown'
    const contentType = headersList.get('content-type') || ''

    // Parse request body
    const body = await request.json()
    
    // Determine webhook type and validate
    const webhookType = body.type || 'news_articles'
    
    if (webhookType === 'news_articles' || !body.type) {
      await handleNewsArticlesWebhook(body, source, signature)
    } else if (webhookType.startsWith('trend_')) {
      await handleTrendWebhook(body, source, signature)
    } else {
      return new Response(
        JSON.stringify({
          error: 'Unsupported webhook type',
          supportedTypes: ['news_articles', 'trend_detected', 'trend_expired', 'trending_topic_update'],
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook processed successfully',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('News webhook error:', error)
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Webhook validation error',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

/**
 * Handle news articles webhook
 * Processes incoming news articles and triggers trend analysis
 */
async function handleNewsArticlesWebhook(
  body: any, 
  source: string, 
  signature?: string | null
) {
  // Validate webhook signature if provided
  if (signature && !verifyWebhookSignature(body, signature, source)) {
    throw new Error('Invalid webhook signature')
  }

  // Validate webhook payload
  const validatedData = NewsWebhookSchema.parse(body)

  console.log(`Processing news webhook from ${validatedData.source}: ${validatedData.articles.length} articles`)

  // Process articles in batches to avoid overwhelming the system
  const BATCH_SIZE = 10
  const articleBatches = []
  
  for (let i = 0; i < validatedData.articles.length; i += BATCH_SIZE) {
    articleBatches.push(validatedData.articles.slice(i, i + BATCH_SIZE))
  }

  let processedCount = 0
  let duplicateCount = 0
  let errorCount = 0

  for (const batch of articleBatches) {
    await Promise.allSettled(
      batch.map(async (article) => {
        try {
          // Check if article already exists
          const existingArticle = await prisma.newsItem.findUnique({
            where: { url: article.url },
          })

          if (existingArticle) {
            duplicateCount++
            return
          }

          // Ingest the article
          const newsItem = await NewsIngestionPipeline.ingestArticle({
            title: article.title,
            content: article.content || '',
            url: article.url,
            source: validatedData.source,
            author: article.author,
            publishedAt: new Date(article.publishedAt),
            categories: article.categories || [],
          })

          if (newsItem) {
            processedCount++
          }

        } catch (error) {
          console.error(`Error processing article ${article.url}:`, error)
          errorCount++
        }
      })
    )
  }

  // Trigger trend detection if significant new content was added
  if (processedCount > 5) {
    try {
      await TrendingAnalyzer.detectTrends({
        forceRefresh: false,
        confidenceThreshold: 0.5,
        sources: [validatedData.source],
      })

      // Clear related caches
      const cacheKeys = await redis.keys('trends:current:*')
      if (cacheKeys.length > 0) {
        await redis.del(...cacheKeys)
      }

    } catch (error) {
      console.error('Error triggering trend detection:', error)
    }
  }

  console.log(`News webhook processed: ${processedCount} new, ${duplicateCount} duplicates, ${errorCount} errors`)
}

/**
 * Handle trend-related webhooks
 * Processes trend detection and update notifications
 */
async function handleTrendWebhook(
  body: any,
  source: string,
  signature?: string | null
) {
  // Validate webhook signature if provided
  if (signature && !verifyWebhookSignature(body, signature, source)) {
    throw new Error('Invalid webhook signature')
  }

  // Validate webhook payload
  const validatedData = TrendWebhookSchema.parse(body)

  console.log(`Processing trend webhook: ${validatedData.type} from ${source}`)

  switch (validatedData.type) {
    case 'trend_detected':
      await handleTrendDetected(validatedData.trend)
      break
    
    case 'trend_expired':
      await handleTrendExpired(validatedData.trend)
      break
    
    case 'trending_topic_update':
      await handleTrendingTopicUpdate(validatedData.trend)
      break
  }

  // Clear trend caches to force refresh
  const cacheKeys = await redis.keys('trends:*')
  if (cacheKeys.length > 0) {
    await redis.del(...cacheKeys)
  }
}

/**
 * Handle trend detected webhook
 */
async function handleTrendDetected(trend: any) {
  try {
    // Create or update trend in database
    await prisma.trend.upsert({
      where: {
        topic: trend.topic,
      },
      update: {
        velocity: trend.velocity,
        confidence: trend.confidence,
        sources: trend.sources,
        categories: trend.categories,
        region: trend.region,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        topic: trend.topic,
        velocity: trend.velocity,
        confidence: trend.confidence,
        sources: trend.sources,
        categories: trend.categories,
        region: trend.region,
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours default
      },
    })

    console.log(`Trend detected and saved: ${trend.topic}`)
  } catch (error) {
    console.error('Error handling trend detected:', error)
  }
}

/**
 * Handle trend expired webhook
 */
async function handleTrendExpired(trend: any) {
  try {
    // Mark trend as inactive
    await prisma.trend.updateMany({
      where: {
        topic: trend.topic,
        isActive: true,
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    })

    console.log(`Trend expired: ${trend.topic}`)
  } catch (error) {
    console.error('Error handling trend expired:', error)
  }
}

/**
 * Handle trending topic update webhook
 */
async function handleTrendingTopicUpdate(trend: any) {
  try {
    // Update trend data
    await prisma.trend.updateMany({
      where: {
        topic: trend.topic,
        isActive: true,
      },
      data: {
        velocity: trend.velocity,
        confidence: trend.confidence,
        sources: trend.sources,
        categories: trend.categories,
        region: trend.region,
        updatedAt: new Date(),
      },
    })

    console.log(`Trend updated: ${trend.topic}`)
  } catch (error) {
    console.error('Error handling trend update:', error)
  }
}

/**
 * Verify webhook signature for security
 * Implements HMAC-SHA256 signature verification
 */
function verifyWebhookSignature(body: any, signature: string, source: string): boolean {
  try {
    const crypto = require('crypto')
    const secret = process.env[`WEBHOOK_SECRET_${source.toUpperCase()}`] || process.env.WEBHOOK_SECRET_DEFAULT
    
    if (!secret) {
      console.warn(`No webhook secret configured for source: ${source}`)
      return true // Allow if no secret is configured (development mode)
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex')

    // Support both 'sha256=' prefix and raw hash
    const actualSignature = signature.startsWith('sha256=') 
      ? signature.slice(7) 
      : signature

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(actualSignature, 'hex')
    )

  } catch (error) {
    console.error('Error verifying webhook signature:', error)
    return false
  }
}

/**
 * GET /api/news/webhook - Webhook endpoint information
 * Returns webhook configuration and testing information
 */
export async function GET() {
  return new Response(
    JSON.stringify({
      endpoint: '/api/news/webhook',
      description: 'News feed and trending topic webhook handler',
      methods: ['POST'],
      authentication: 'Webhook signature (optional)',
      supportedTypes: {
        news_articles: {
          description: 'News articles from RSS feeds and news sources',
          schema: {
            source: 'string (required)',
            articles: 'array of article objects',
            timestamp: 'ISO datetime string',
            signature: 'optional HMAC-SHA256 signature',
          },
        },
        trend_detected: {
          description: 'New trending topic detected',
          schema: {
            type: 'trend_detected',
            trend: 'trend object with topic, velocity, confidence',
            timestamp: 'ISO datetime string',
            signature: 'optional HMAC-SHA256 signature',
          },
        },
        trend_expired: {
          description: 'Trending topic no longer active',
        },
        trending_topic_update: {
          description: 'Update to existing trending topic',
        },
      },
      headers: {
        'x-webhook-signature': 'HMAC-SHA256 signature (optional)',
        'x-webhook-source': 'Source identifier for webhook verification',
        'content-type': 'application/json',
      },
      environment: {
        WEBHOOK_SECRET_DEFAULT: 'Default webhook verification secret',
        'WEBHOOK_SECRET_[SOURCE]': 'Source-specific webhook secrets',
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

/**
 * OPTIONS /api/news/webhook - CORS preflight handler
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-webhook-signature, x-webhook-source',
    },
  })
}