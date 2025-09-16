import { redis } from '@/lib/redis'

/**
 * Redis caching utilities for SpotlightX
 * 
 * Provides caching for:
 * - Feed ranking data
 * - News data and trending topics
 * - User engagement metrics
 * - AI-generated content
 * - Session data
 */

interface CacheOptions {
  ttl?: number // Time to live in seconds
  namespace?: string
  compression?: boolean
}

interface FeedCacheData {
  posts: any[]
  ranking: number[]
  lastUpdated: string
  algorithm: string
  userId: string
}

interface NewsCacheData {
  articles: any[]
  trends: any[]
  lastFetched: string
  sources: string[]
}

interface PersonaCacheData {
  persona: any
  recentPosts: any[]
  engagementStats: any
  lastActivity: string
}

class RedisCache {
  private defaultTTL = 3600 // 1 hour default
  private defaultNamespace = 'spotlight'

  private getKey(key: string, namespace?: string): string {
    const ns = namespace || this.defaultNamespace
    return `${ns}:${key}`
  }

  private async serialize(data: any, compression?: boolean): Promise<string> {
    const serialized = JSON.stringify(data)
    // TODO: Add compression if needed
    return serialized
  }

  private async deserialize(data: string): Promise<any> {
    try {
      return JSON.parse(data)
    } catch (error) {
      console.error('Failed to deserialize cached data:', error)
      return null
    }
  }

  // Generic cache operations
  async set(key: string, data: any, options: CacheOptions = {}): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key, options.namespace)
      const serialized = await this.serialize(data, options.compression)
      const ttl = options.ttl || this.defaultTTL

      if (ttl > 0) {
        await redis.setex(cacheKey, ttl, serialized)
      } else {
        await redis.set(cacheKey, serialized)
      }

      return true
    } catch (error) {
      console.error(`Cache set failed for key ${key}:`, error)
      return false
    }
  }

  async get<T = any>(key: string, namespace?: string): Promise<T | null> {
    try {
      const cacheKey = this.getKey(key, namespace)
      const cached = await redis.get(cacheKey)
      
      if (!cached) return null
      
      return await this.deserialize(cached)
    } catch (error) {
      console.error(`Cache get failed for key ${key}:`, error)
      return null
    }
  }

  async del(key: string, namespace?: string): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key, namespace)
      const result = await redis.del(cacheKey)
      return result > 0
    } catch (error) {
      console.error(`Cache delete failed for key ${key}:`, error)
      return false
    }
  }

  async exists(key: string, namespace?: string): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key, namespace)
      const result = await redis.exists(cacheKey)
      return result > 0
    } catch (error) {
      console.error(`Cache exists check failed for key ${key}:`, error)
      return false
    }
  }

  async expire(key: string, ttl: number, namespace?: string): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key, namespace)
      const result = await redis.expire(cacheKey, ttl)
      return result > 0
    } catch (error) {
      console.error(`Cache expire failed for key ${key}:`, error)
      return false
    }
  }

  // Pattern-based operations
  async deleteByPattern(pattern: string, namespace?: string): Promise<number> {
    try {
      const searchPattern = this.getKey(pattern, namespace)
      const keys = await redis.keys(searchPattern)
      
      if (keys.length === 0) return 0
      
      const result = await redis.del(...keys)
      return result
    } catch (error) {
      console.error(`Cache pattern delete failed for pattern ${pattern}:`, error)
      return 0
    }
  }

  async getKeysByPattern(pattern: string, namespace?: string): Promise<string[]> {
    try {
      const searchPattern = this.getKey(pattern, namespace)
      return await redis.keys(searchPattern)
    } catch (error) {
      console.error(`Cache pattern search failed for pattern ${pattern}:`, error)
      return []
    }
  }

  // Feed-specific caching
  async cacheFeed(userId: string, feedType: string, data: FeedCacheData): Promise<boolean> {
    const key = `feed:${userId}:${feedType}`
    return this.set(key, data, { 
      ttl: 900, // 15 minutes
      namespace: 'feeds' 
    })
  }

  async getFeed(userId: string, feedType: string): Promise<FeedCacheData | null> {
    const key = `feed:${userId}:${feedType}`
    return this.get<FeedCacheData>(key, 'feeds')
  }

  async invalidateFeed(userId: string, feedType?: string): Promise<void> {
    if (feedType) {
      await this.del(`feed:${userId}:${feedType}`, 'feeds')
    } else {
      // Invalidate all feed types for user
      await this.deleteByPattern(`feed:${userId}:*`, 'feeds')
    }
  }

  // News and trending caching
  async cacheNews(region: string, category: string, data: NewsCacheData): Promise<boolean> {
    const key = `news:${region}:${category}`
    return this.set(key, data, { 
      ttl: 300, // 5 minutes
      namespace: 'news' 
    })
  }

  async getNews(region: string, category: string): Promise<NewsCacheData | null> {
    const key = `news:${region}:${category}`
    return this.get<NewsCacheData>(key, 'news')
  }

  async cacheTrends(region: string, data: any[]): Promise<boolean> {
    const key = `trends:${region}`
    return this.set(key, data, { 
      ttl: 900, // 15 minutes
      namespace: 'trends' 
    })
  }

  async getTrends(region: string): Promise<any[] | null> {
    const key = `trends:${region}`
    return this.get<any[]>(key, 'trends')
  }

  // Persona-specific caching
  async cachePersona(personaId: string, data: PersonaCacheData): Promise<boolean> {
    const key = `persona:${personaId}`
    return this.set(key, data, { 
      ttl: 1800, // 30 minutes
      namespace: 'personas' 
    })
  }

  async getPersona(personaId: string): Promise<PersonaCacheData | null> {
    const key = `persona:${personaId}`
    return this.get<PersonaCacheData>(key, 'personas')
  }

  async invalidatePersona(personaId: string): Promise<void> {
    await this.deleteByPattern(`persona:${personaId}*`, 'personas')
  }

  // Engagement metrics caching
  async cacheEngagementMetrics(entityId: string, entityType: string, metrics: any): Promise<boolean> {
    const key = `engagement:${entityType}:${entityId}`
    return this.set(key, metrics, { 
      ttl: 600, // 10 minutes
      namespace: 'metrics' 
    })
  }

  async getEngagementMetrics(entityId: string, entityType: string): Promise<any | null> {
    const key = `engagement:${entityType}:${entityId}`
    return this.get(key, 'metrics')
  }

  // Session caching
  async cacheSession(sessionId: string, data: any): Promise<boolean> {
    const key = `session:${sessionId}`
    return this.set(key, data, { 
      ttl: 86400, // 24 hours
      namespace: 'sessions' 
    })
  }

  async getSession(sessionId: string): Promise<any | null> {
    const key = `session:${sessionId}`
    return this.get(key, 'sessions')
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.del(`session:${sessionId}`, 'sessions')
  }

  // Cache warming utilities
  async warmCache(tasks: Array<{ key: string; fetcher: () => Promise<any>; options?: CacheOptions }>): Promise<void> {
    const promises = tasks.map(async ({ key, fetcher, options }) => {
      try {
        const data = await fetcher()
        await this.set(key, data, options)
        console.log(`Cache warmed for key: ${key}`)
      } catch (error) {
        console.error(`Cache warming failed for key ${key}:`, error)
      }
    })

    await Promise.all(promises)
  }

  // Cache statistics
  async getStats(): Promise<{
    totalKeys: number
    memoryUsage: string
    keysByNamespace: Record<string, number>
  }> {
    try {
      const info = await redis.info('memory')
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/)
      const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown'

      // Get all keys for counting
      const allKeys = await redis.keys(`${this.defaultNamespace}:*`)
      
      // Group by namespace
      const keysByNamespace: Record<string, number> = {}
      allKeys.forEach(key => {
        const parts = key.split(':')
        if (parts.length >= 2) {
          const namespace = parts[1]
          keysByNamespace[namespace] = (keysByNamespace[namespace] || 0) + 1
        }
      })

      return {
        totalKeys: allKeys.length,
        memoryUsage,
        keysByNamespace,
      }
    } catch (error) {
      console.error('Failed to get cache stats:', error)
      return {
        totalKeys: 0,
        memoryUsage: 'unknown',
        keysByNamespace: {},
      }
    }
  }

  // Cache cleanup
  async cleanup(maxAge: number = 86400): Promise<void> {
    try {
      console.log('Starting cache cleanup...')
      
      // This would require more sophisticated tracking of key ages
      // For now, just clean up known temporary patterns
      const patterns = [
        'feeds:*',
        'news:*',
        'trends:*',
        'metrics:*',
      ]

      let totalDeleted = 0
      for (const pattern of patterns) {
        const deleted = await this.deleteByPattern(pattern)
        totalDeleted += deleted
        console.log(`Cleaned up ${deleted} keys matching pattern: ${pattern}`)
      }

      console.log(`Cache cleanup complete. Deleted ${totalDeleted} keys.`)
    } catch (error) {
      console.error('Cache cleanup failed:', error)
    }
  }
}

// Export singleton instance
export const cache = new RedisCache()

// Export utility functions
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  // Try to get from cache first
  const cached = await cache.get<T>(key, options.namespace)
  if (cached !== null) {
    return cached
  }

  // Fetch fresh data
  const data = await fetcher()
  
  // Cache the result
  await cache.set(key, data, options)
  
  return data
}

export async function invalidateCache(pattern: string, namespace?: string): Promise<void> {
  await cache.deleteByPattern(pattern, namespace)
}