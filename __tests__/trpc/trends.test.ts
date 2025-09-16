/**
 * Trends Router tRPC Tests
 * 
 * Tests for news and trending procedures per API contracts.
 * Following TDD - these tests should FAIL FIRST before implementation.
 */

import { createCallerFactory } from '@/server/api/trpc'
import { trendsRouter } from '@/server/api/routers/trends'
import { prisma } from '@/lib/prisma'

// Create a test caller
const createCaller = createCallerFactory(trendsRouter)

// Mock context for tests
const mockContext = {
  req: {} as any,
  prisma,
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
    keys: jest.fn(),
    del: jest.fn(),
  } as any,
  session: null,
  userId: null,
}

const caller = createCaller(mockContext)

describe('Trends Router - Current Trends', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('trends.getCurrent', () => {
    it('should return cached trends when available', async () => {
      const cachedTrends = [
        {
          id: 'trend-1',
          topic: 'AI Technology',
          velocity: 0.85,
          confidence: 0.92,
          sources: ['tech-news', 'social-media'],
          region: 'global',
        },
      ]

      ;(mockContext.redis.get as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(cachedTrends)
      )
      ;(mockContext.redis.get as jest.Mock).mockResolvedValueOnce(
        '2024-01-01T12:00:00Z'
      )

      const result = await caller.getCurrent({})

      expect(result).toEqual({
        trends: cachedTrends,
        fromCache: true,
        lastUpdated: '2024-01-01T12:00:00Z',
      })

      expect(mockContext.redis.get).toHaveBeenCalledWith(
        'trends:current:global:all:10'
      )
    })

    it('should fetch fresh trends when cache is empty', async () => {
      const mockTrendingTopics = [
        {
          id: 'trend-1',
          topic: 'Machine Learning',
          description: 'Latest developments in ML',
          velocity: 0.75,
          sources: ['tech-blog', 'research'],
          categories: ['technology'],
          confidence: 0.88,
          isActive: true,
          detectedAt: new Date(),
          estimatedExpiry: new Date(Date.now() + 3600000),
        },
      ]

      // Cache miss
      ;(mockContext.redis.get as jest.Mock).mockResolvedValueOnce(null)

      // This should FAIL initially because TrendingAnalyzer.getCurrentTrends might not exist
      const result = await caller.getCurrent({
        limit: 5,
        region: 'US',
        category: 'technology',
      })

      expect(result).toEqual({
        trends: expect.arrayContaining([
          expect.objectContaining({
            id: 'trend-1',
            topic: 'Machine Learning',
            velocity: 0.75,
            confidence: 0.88,
            region: 'US',
          }),
        ]),
        fromCache: false,
        lastUpdated: expect.any(String),
      })

      // Should cache the results
      expect(mockContext.redis.setex).toHaveBeenCalledWith(
        'trends:current:US:technology:5',
        300,
        expect.any(String)
      )
    })

    it('should handle different regions and categories', async () => {
      ;(mockContext.redis.get as jest.Mock).mockResolvedValue(null)

      await caller.getCurrent({
        region: 'EU',
        category: 'politics',
        limit: 15,
      })

      expect(mockContext.redis.get).toHaveBeenCalledWith(
        'trends:current:EU:politics:15'
      )
    })

    it('should use default parameters when none provided', async () => {
      ;(mockContext.redis.get as jest.Mock).mockResolvedValue(null)

      await caller.getCurrent({})

      expect(mockContext.redis.get).toHaveBeenCalledWith(
        'trends:current:global:all:10'
      )
    })

    it('should validate limit parameter', async () => {
      await expect(
        caller.getCurrent({ limit: 0 })
      ).rejects.toThrow()

      await expect(
        caller.getCurrent({ limit: 51 })
      ).rejects.toThrow()
    })
  })

  describe('trends.getByCategory', () => {
    it('should return category-specific trends with time filtering', async () => {
      const mockTrends = [
        {
          id: 'tech-trend-1',
          topic: 'Blockchain',
          velocity: 0.65,
          confidence: 0.84,
          categories: ['technology', 'finance'],
          createdAt: new Date(Date.now() - 3600000), // 1 hour ago
        },
      ]

      ;(prisma.trend.findMany as jest.Mock).mockResolvedValueOnce(mockTrends)

      const result = await caller.getByCategory({
        category: 'technology',
        limit: 10,
        timeRange: '24h',
      })

      expect(result).toEqual({
        trends: expect.arrayContaining([
          expect.objectContaining({
            id: 'tech-trend-1',
            topic: 'Blockchain',
            categories: ['technology', 'finance'],
          }),
        ]),
        category: 'technology',
        timeRange: '24h',
        totalCount: 1,
      })

      expect(prisma.trend.findMany).toHaveBeenCalledWith({
        where: {
          categories: {
            has: 'technology',
          },
          isActive: true,
          createdAt: {
            gte: expect.any(Date),
          },
        },
        take: 10,
        orderBy: [
          { velocity: 'desc' },
          { confidence: 'desc' },
        ],
      })
    })

    it('should handle different time ranges', async () => {
      const timeRanges = ['1h', '6h', '24h', '7d'] as const

      for (const timeRange of timeRanges) {
        ;(prisma.trend.findMany as jest.Mock).mockResolvedValueOnce([])

        await caller.getByCategory({
          category: 'sports',
          timeRange,
        })

        // Verify correct time calculation
        expect(prisma.trend.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              createdAt: {
                gte: expect.any(Date),
              },
            }),
          })
        )
      }
    })

    it('should validate category parameter', async () => {
      await expect(
        caller.getByCategory({
          category: '', // Empty category
        })
      ).rejects.toThrow()
    })
  })

  describe('trends.getRelated', () => {
    it('should find related trending topics', async () => {
      const mockRelatedTrends = [
        {
          id: 'related-1',
          topic: 'Neural Networks',
          velocity: 0.72,
          confidence: 0.89,
          similarity: 0.85,
          detectedAt: new Date(),
        },
      ]

      // This should FAIL initially because TrendingAnalyzer.getRelatedTrends might not exist
      const result = await caller.getRelated({
        topic: 'Machine Learning',
        limit: 3,
      })

      expect(result).toEqual({
        trends: expect.arrayContaining([
          expect.objectContaining({
            id: 'related-1',
            topic: 'Neural Networks',
            similarity: 0.85,
          }),
        ]),
        baseTopic: 'Machine Learning',
      })
    })

    it('should validate topic parameter', async () => {
      await expect(
        caller.getRelated({
          topic: '', // Empty topic
        })
      ).rejects.toThrow()
    })

    it('should validate limit parameter', async () => {
      await expect(
        caller.getRelated({
          topic: 'AI',
          limit: 0,
        })
      ).rejects.toThrow()

      await expect(
        caller.getRelated({
          topic: 'AI',
          limit: 21, // Over max
        })
      ).rejects.toThrow()
    })
  })

  describe('trends.getStats', () => {
    it('should return trending statistics and insights', async () => {
      const mockStats = {
        _count: { id: 150 },
        _avg: { velocity: 0.65, confidence: 0.82 },
        _max: { velocity: 0.95 },
      }

      const mockCategoryStats = [
        { categories: ['technology'], _count: { id: 45 } },
        { categories: ['politics'], _count: { id: 32 } },
      ]

      ;(prisma.trend.aggregate as jest.Mock).mockResolvedValueOnce(mockStats)
      ;(prisma.trend.groupBy as jest.Mock).mockResolvedValueOnce(mockCategoryStats)

      const result = await caller.getStats({
        timeRange: '7d',
      })

      expect(result).toEqual({
        totalTrends: 150,
        averageVelocity: 0.65,
        averageConfidence: 0.82,
        peakVelocity: 0.95,
        topCategories: [
          { categories: ['technology'], count: 45 },
          { categories: ['politics'], count: 32 },
        ],
        timeRange: '7d',
      })

      expect(prisma.trend.aggregate).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: expect.any(Date),
          },
        },
        _count: { id: true },
        _avg: { velocity: true, confidence: true },
        _max: { velocity: true },
      })
    })

    it('should handle different time ranges for stats', async () => {
      const timeRanges = ['24h', '7d', '30d'] as const

      ;(prisma.trend.aggregate as jest.Mock).mockResolvedValue({
        _count: { id: 0 },
        _avg: { velocity: 0, confidence: 0 },
        _max: { velocity: 0 },
      })
      ;(prisma.trend.groupBy as jest.Mock).mockResolvedValue([])

      for (const timeRange of timeRanges) {
        await caller.getStats({ timeRange })

        expect(prisma.trend.aggregate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              createdAt: {
                gte: expect.any(Date),
              },
            },
          })
        )
      }
    })
  })

  describe('trends.refresh', () => {
    it('should force refresh trends and clear cache', async () => {
      const mockCacheKeys = [
        'trends:current:global:all:10',
        'trends:current:US:tech:5',
      ]

      const mockNewTrends = [
        { id: 'new-trend-1', topic: 'Fresh Topic' },
        { id: 'new-trend-2', topic: 'Another Topic' },
      ]

      ;(mockContext.redis.keys as jest.Mock).mockResolvedValueOnce(mockCacheKeys)
      ;(mockContext.redis.del as jest.Mock).mockResolvedValueOnce(2)

      // This should FAIL initially because NewsClient.triggerRefresh and TrendingAnalyzer.detectTrends might not exist
      const result = await caller.refresh()

      expect(result).toEqual({
        success: true,
        message: expect.stringContaining('Refreshed'),
        trendsDetected: expect.any(Number),
        timestamp: expect.any(String),
      })

      expect(mockContext.redis.keys).toHaveBeenCalledWith('trends:current:*')
      expect(mockContext.redis.del).toHaveBeenCalledWith(...mockCacheKeys)
    })

    it('should handle cache clearing when no keys exist', async () => {
      ;(mockContext.redis.keys as jest.Mock).mockResolvedValueOnce([])

      const result = await caller.refresh()

      expect(result.success).toBe(true)
      expect(mockContext.redis.del).not.toHaveBeenCalled()
    })

    it('should handle errors during refresh', async () => {
      ;(mockContext.redis.keys as jest.Mock).mockRejectedValueOnce(
        new Error('Redis error')
      )

      await expect(caller.refresh()).rejects.toThrow(/REFRESH_FAILED/)
    })
  })
})

describe('Trends Router - Data Processing', () => {
  it('should properly format trend data according to API schema', async () => {
    const mockRawTrend = {
      id: 'trend-1',
      topic: 'Climate Change',
      description: 'Environmental concerns rising',
      velocity: 0.78,
      sources: ['news1', 'news2'],
      categories: ['environment', 'politics'],
      region: 'global',
      confidence: 0.91,
      peakTime: new Date(),
      estimatedExpiry: new Date(Date.now() + 7200000),
      isActive: true,
      detectedAt: new Date(),
    }

    ;(mockContext.redis.get as jest.Mock).mockResolvedValueOnce(null)

    // Mock the trending analyzer response
    const result = await caller.getCurrent({ limit: 1 })

    // Should format according to API contracts schema
    expect(result.trends).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          topic: expect.any(String),
          velocity: expect.any(Number),
          sources: expect.any(Array),
          categories: expect.any(Array),
          confidence: expect.any(Number),
          isActive: expect.any(Boolean),
          createdAt: expect.any(Date),
        }),
      ])
    )
  })

  it('should handle empty trend results gracefully', async () => {
    ;(mockContext.redis.get as jest.Mock).mockResolvedValueOnce(null)
    ;(prisma.trend.findMany as jest.Mock).mockResolvedValueOnce([])

    const result = await caller.getByCategory({
      category: 'nonexistent',
    })

    expect(result).toEqual({
      trends: [],
      category: 'nonexistent',
      timeRange: '24h',
      totalCount: 0,
    })
  })

  it('should handle malformed cache data', async () => {
    ;(mockContext.redis.get as jest.Mock).mockResolvedValueOnce('invalid-json')

    // Should fall back to fresh data when cache is corrupted
    const result = await caller.getCurrent({})

    expect(result.fromCache).toBe(false)
  })
})

describe('Trends Router - Performance', () => {
  it('should implement proper caching strategy', async () => {
    const trends = [{ id: 'trend-1', topic: 'Test' }]

    ;(mockContext.redis.get as jest.Mock).mockResolvedValueOnce(null)

    await caller.getCurrent({ limit: 5 })

    // Should cache for 5 minutes (300 seconds)
    expect(mockContext.redis.setex).toHaveBeenCalledWith(
      expect.any(String),
      300,
      expect.any(String)
    )

    // Should also cache timestamp
    expect(mockContext.redis.setex).toHaveBeenCalledWith(
      expect.stringContaining(':timestamp'),
      300,
      expect.any(String)
    )
  })

  it('should generate unique cache keys for different parameters', async () => {
    ;(mockContext.redis.get as jest.Mock).mockResolvedValue(null)

    const testCases = [
      { region: 'US', category: 'tech', limit: 5 },
      { region: 'EU', category: 'sports', limit: 10 },
      { limit: 15 },
    ]

    for (const params of testCases) {
      await caller.getCurrent(params)
    }

    // Should have made different cache key requests
    const cacheKeyCalls = (mockContext.redis.get as jest.Mock).mock.calls
    const cacheKeys = cacheKeyCalls.map((call) => call[0])
    const uniqueKeys = new Set(cacheKeys)

    expect(uniqueKeys.size).toBe(testCases.length)
  })
})

describe('Trends Router - Input Validation', () => {
  it('should validate limit ranges across all endpoints', async () => {
    // getCurrent limits
    await expect(caller.getCurrent({ limit: 0 })).rejects.toThrow()
    await expect(caller.getCurrent({ limit: 51 })).rejects.toThrow()

    // getByCategory limits
    await expect(
      caller.getByCategory({ category: 'test', limit: 0 })
    ).rejects.toThrow()
    await expect(
      caller.getByCategory({ category: 'test', limit: 51 })
    ).rejects.toThrow()

    // getRelated limits
    await expect(
      caller.getRelated({ topic: 'test', limit: 0 })
    ).rejects.toThrow()
    await expect(
      caller.getRelated({ topic: 'test', limit: 21 })
    ).rejects.toThrow()
  })

  it('should validate time range enums', async () => {
    // Valid time ranges
    const validRanges = ['1h', '6h', '24h', '7d']
    for (const timeRange of validRanges) {
      ;(prisma.trend.findMany as jest.Mock).mockResolvedValueOnce([])
      await expect(
        caller.getByCategory({ category: 'test', timeRange: timeRange as any })
      ).resolves.toBeDefined()
    }

    // Invalid time range should be caught by Zod validation
    await expect(
      caller.getByCategory({ category: 'test', timeRange: 'invalid' as any })
    ).rejects.toThrow()
  })
})

describe('Trends Router - Public Access', () => {
  it('should allow public access to all trend endpoints', async () => {
    // All trends endpoints should be public procedures
    ;(mockContext.redis.get as jest.Mock).mockResolvedValue(null)
    ;(prisma.trend.findMany as jest.Mock()).mockResolvedValue([])
    ;(prisma.trend.aggregate as jest.Mock()).mockResolvedValue({
      _count: { id: 0 },
      _avg: { velocity: 0, confidence: 0 },
      _max: { velocity: 0 },
    })
    ;(prisma.trend.groupBy as jest.Mock()).mockResolvedValue([])

    // These should not require authentication
    await expect(caller.getCurrent({})).resolves.toBeDefined()
    await expect(
      caller.getByCategory({ category: 'test' })
    ).resolves.toBeDefined()
    await expect(
      caller.getRelated({ topic: 'test' })
    ).resolves.toBeDefined()
    await expect(caller.getStats({})).resolves.toBeDefined()
    await expect(caller.refresh()).resolves.toBeDefined()
  })
})