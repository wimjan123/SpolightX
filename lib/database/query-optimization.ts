import { PrismaClient } from '@prisma/client'
import { cache } from '@/lib/cache/redis-cache'

/**
 * Query optimization utilities for SpotlightX
 * 
 * Provides optimized database queries using pgvector indexes
 * and other performance optimizations.
 */

export class QueryOptimizer {
  
  constructor(private prisma: PrismaClient) {}

  // Vector similarity queries
  async findSimilarContent(
    embedding: number[],
    limit: number = 10,
    threshold: number = 0.8,
    excludeIds: string[] = []
  ) {
    const embeddingString = `[${embedding.join(',')}]`
    const excludeClause = excludeIds.length > 0 ? `AND id NOT IN (${excludeIds.map(() => '?').join(',')})` : ''
    
    return this.prisma.$queryRaw`
      SELECT 
        id,
        content,
        author_id,
        created_at,
        1 - (content_embedding <=> ${embeddingString}::vector) as similarity
      FROM "Post" 
      WHERE 
        visibility = 'PUBLIC'
        AND (content_embedding <=> ${embeddingString}::vector) < ${1 - threshold}
        ${excludeClause}
      ORDER BY content_embedding <=> ${embeddingString}::vector
      LIMIT ${limit}
    `
  }

  async findPersonalizedContent(
    userEmbedding: number[],
    limit: number = 20,
    offset: number = 0
  ) {
    const embeddingString = `[${userEmbedding.join(',')}]`
    
    return this.prisma.$queryRaw`
      SELECT 
        p.*,
        1 - (p.content_embedding <=> ${embeddingString}::vector) as relevance_score
      FROM "Post" p
      WHERE 
        p.visibility = 'PUBLIC'
        AND p.created_at > NOW() - INTERVAL '7 days'
        AND p.content_embedding IS NOT NULL
      ORDER BY 
        (p.content_embedding <=> ${embeddingString}::vector),
        p.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `
  }

  // Optimized feed queries
  async getUserFeed(
    userId: string,
    feedType: 'hybrid' | 'following' | 'discover',
    limit: number = 20,
    cursor?: string
  ) {
    const cacheKey = `feed:${userId}:${feedType}:${cursor || 'first'}`
    
    return cache.withCache(
      cacheKey,
      async () => {
        switch (feedType) {
          case 'following':
            return this.getFollowingFeed(userId, limit, cursor)
          case 'discover':
            return this.getDiscoverFeed(userId, limit, cursor)
          case 'hybrid':
          default:
            return this.getHybridFeed(userId, limit, cursor)
        }
      },
      { ttl: 300, namespace: 'feeds' } // 5 minutes
    )
  }

  private async getFollowingFeed(userId: string, limit: number, cursor?: string) {
    return this.prisma.post.findMany({
      where: {
        AND: [
          { visibility: 'PUBLIC' },
          {
            OR: [
              {
                author: {
                  followers: {
                    some: { followerId: userId }
                  }
                }
              },
              { authorId: userId } // Include user's own posts
            ]
          },
          cursor ? { id: { lt: cursor } } : {}
        ]
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        persona: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true
          }
        },
        _count: {
          select: {
            interactions: {
              where: { type: 'LIKE' }
            },
            replies: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    })
  }

  private async getDiscoverFeed(userId: string, limit: number, cursor?: string) {
    // Get user preferences for personalization
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferenceEmbedding: true }
    })

    if (user?.preferenceEmbedding) {
      return this.findPersonalizedContent(
        user.preferenceEmbedding as number[],
        limit,
        cursor ? parseInt(cursor) : 0
      )
    }

    // Fallback to trending content
    return this.getTrendingPosts(limit, cursor)
  }

  private async getHybridFeed(userId: string, limit: number, cursor?: string) {
    // Combine following feed (70%) and discover feed (30%)
    const followingLimit = Math.ceil(limit * 0.7)
    const discoverLimit = Math.floor(limit * 0.3)

    const [followingPosts, discoverPosts] = await Promise.all([
      this.getFollowingFeed(userId, followingLimit, cursor),
      this.getDiscoverFeed(userId, discoverLimit, cursor)
    ])

    // Merge and sort by engagement and recency
    const allPosts = [...followingPosts, ...discoverPosts]
    
    return allPosts
      .sort((a, b) => {
        // Weight by engagement score and recency
        const scoreA = this.calculatePostScore(a)
        const scoreB = this.calculatePostScore(b)
        return scoreB - scoreA
      })
      .slice(0, limit)
  }

  private calculatePostScore(post: any): number {
    const age = Date.now() - new Date(post.createdAt).getTime()
    const ageHours = age / (1000 * 60 * 60)
    
    // Engagement metrics
    const likes = post._count?.interactions || 0
    const replies = post._count?.replies || 0
    const engagement = likes + (replies * 2) // Replies weighted more
    
    // Decay factor for age
    const decayFactor = Math.exp(-ageHours / 24) // Decay over 24 hours
    
    return engagement * decayFactor
  }

  // Trending queries
  async getTrendingPosts(limit: number = 20, cursor?: string) {
    return this.prisma.post.findMany({
      where: {
        AND: [
          { visibility: 'PUBLIC' },
          { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, // Last 24 hours
          cursor ? { id: { lt: cursor } } : {}
        ]
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        persona: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true
          }
        },
        _count: {
          select: {
            interactions: true,
            replies: true
          }
        }
      },
      orderBy: [
        { interactions: { _count: 'desc' } },
        { createdAt: 'desc' }
      ],
      take: limit
    })
  }

  // Optimized persona queries
  async getActivePersonas(limit: number = 20) {
    return this.prisma.persona.findMany({
      where: {
        isActive: true
      },
      include: {
        _count: {
          select: {
            posts: {
              where: {
                createdAt: {
                  gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
                }
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: limit
    })
  }

  async getPersonaEngagementMetrics(personaId: string, days: number = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    
    return this.prisma.$queryRaw`
      SELECT 
        DATE(p.created_at) as date,
        COUNT(p.id) as posts_count,
        COUNT(i.id) as total_interactions,
        COUNT(CASE WHEN i.type = 'LIKE' THEN 1 END) as likes_count,
        COUNT(CASE WHEN i.type = 'REPOST' THEN 1 END) as reposts_count,
        AVG(CASE WHEN i.type = 'LIKE' THEN 1 ELSE 0 END) as engagement_rate
      FROM "Post" p
      LEFT JOIN "Interaction" i ON p.id = i.post_id
      WHERE 
        p.author_id = ${personaId}
        AND p.author_type = 'PERSONA'
        AND p.created_at >= ${startDate}
      GROUP BY DATE(p.created_at)
      ORDER BY date DESC
    `
  }

  // Conversation queries
  async getConversationMessages(
    conversationId: string,
    limit: number = 50,
    cursor?: string
  ) {
    return this.prisma.directMessage.findMany({
      where: {
        AND: [
          { conversationId },
          cursor ? { id: { lt: cursor } } : {}
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    })
  }

  async getUserConversations(userId: string, limit: number = 20) {
    return this.prisma.conversation.findMany({
      where: {
        participantIds: {
          has: userId
        }
      },
      include: {
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true
              }
            }
          }
        },
        _count: {
          select: {
            messages: {
              where: {
                senderId: { not: userId },
                readAt: null
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: limit
    })
  }

  // Analytics queries
  async getUserEngagementStats(userId: string, days: number = 30) {
    const cacheKey = `analytics:user:${userId}:${days}d`
    
    return cache.withCache(
      cacheKey,
      async () => {
        return this.prisma.$queryRaw`
          SELECT 
            COUNT(DISTINCT p.id) as total_posts,
            COUNT(i.id) as total_interactions,
            COUNT(DISTINCT i.user_id) as unique_interactors,
            AVG(daily_stats.interactions_per_post) as avg_engagement_rate
          FROM "Post" p
          LEFT JOIN "Interaction" i ON p.id = i.post_id
          LEFT JOIN (
            SELECT 
              p2.id,
              COUNT(i2.id)::float / GREATEST(COUNT(DISTINCT p2.id), 1) as interactions_per_post
            FROM "Post" p2
            LEFT JOIN "Interaction" i2 ON p2.id = i2.post_id
            WHERE p2.author_id = ${userId} 
              AND p2.created_at >= NOW() - INTERVAL '${days} days'
            GROUP BY p2.id
          ) daily_stats ON p.id = daily_stats.id
          WHERE p.author_id = ${userId}
            AND p.created_at >= NOW() - INTERVAL '${days} days'
        `
      },
      { ttl: 1800, namespace: 'analytics' } // 30 minutes
    )
  }

  // Search queries with full-text search
  async searchContent(
    query: string,
    filters: {
      authorType?: 'USER' | 'PERSONA'
      dateRange?: { start: Date; end: Date }
      contentType?: 'POST' | 'REPLY'
    } = {},
    limit: number = 20
  ) {
    const whereClause: any = {
      AND: [
        { visibility: 'PUBLIC' },
        {
          OR: [
            { content: { search: query } },
            { content: { contains: query, mode: 'insensitive' } }
          ]
        }
      ]
    }

    if (filters.authorType) {
      whereClause.AND.push({ authorType: filters.authorType })
    }

    if (filters.dateRange) {
      whereClause.AND.push({
        createdAt: {
          gte: filters.dateRange.start,
          lte: filters.dateRange.end
        }
      })
    }

    if (filters.contentType) {
      if (filters.contentType === 'REPLY') {
        whereClause.AND.push({ parentId: { not: null } })
      } else {
        whereClause.AND.push({ parentId: null })
      }
    }

    return this.prisma.post.findMany({
      where: whereClause,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        persona: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true
          }
        },
        _count: {
          select: {
            interactions: true,
            replies: true
          }
        }
      },
      orderBy: [
        { _relevance: { fields: ['content'], search: query, sort: 'desc' } },
        { createdAt: 'desc' }
      ],
      take: limit
    })
  }

  // Batch operations for better performance
  async batchCreateInteractions(interactions: Array<{
    userId: string
    postId: string
    type: 'LIKE' | 'REPOST' | 'VIEW'
    metadata?: any
  }>) {
    return this.prisma.interaction.createMany({
      data: interactions.map(interaction => ({
        ...interaction,
        createdAt: new Date()
      })),
      skipDuplicates: true
    })
  }

  async batchUpdatePersonaActivities(activities: Array<{
    id: string
    status: 'COMPLETED' | 'FAILED'
    completedAt: Date
    result?: any
  }>) {
    return this.prisma.$transaction(
      activities.map(activity => 
        this.prisma.personaActivity.update({
          where: { id: activity.id },
          data: activity
        })
      )
    )
  }
}

// Export singleton instance
let queryOptimizer: QueryOptimizer | null = null

export function getQueryOptimizer(prisma: PrismaClient): QueryOptimizer {
  if (!queryOptimizer) {
    queryOptimizer = new QueryOptimizer(prisma)
  }
  return queryOptimizer
}

// Performance monitoring
export function logQueryPerformance<T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now()
    
    try {
      const result = await queryFn()
      const duration = Date.now() - startTime
      
      console.log(`Query ${queryName} completed in ${duration}ms`)
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query detected: ${queryName} took ${duration}ms`)
      }
      
      resolve(result)
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`Query ${queryName} failed after ${duration}ms:`, error)
      reject(error)
    }
  })
}