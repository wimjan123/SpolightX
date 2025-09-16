/**
 * Trending Analyzer Service Tests
 * 
 * Tests for trend detection and analysis logic.
 * Following TDD - these tests should FAIL FIRST before implementation.
 */

import { TrendingAnalyzer } from '@/lib/news/trending'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

// Mock dependencies
jest.mock('@/lib/prisma')
jest.mock('@/lib/redis')
jest.mock('@/lib/ai/embedding')

describe('TrendingAnalyzer Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('detectTrends', () => {
    it('should detect trending topics from news articles', async () => {
      const mockArticles = [
        {
          id: 'article-1',
          title: 'AI Revolution in Healthcare',
          content: 'Artificial intelligence is transforming medical diagnosis...',
          url: 'https://example.com/ai-healthcare',
          publishedAt: new Date(),
          source: 'Tech News',
          categories: ['technology', 'healthcare'],
        },
        {
          id: 'article-2',
          title: 'Machine Learning Breakthrough',
          content: 'New ML algorithms show promising results...',
          url: 'https://example.com/ml-breakthrough',
          publishedAt: new Date(),
          source: 'Science Daily',
          categories: ['technology', 'science'],
        },
        {
          id: 'article-3',
          title: 'AI in Medical Imaging',
          content: 'AI-powered diagnostic tools improve accuracy...',
          url: 'https://example.com/ai-imaging',
          publishedAt: new Date(),
          source: 'Medical Journal',
          categories: ['technology', 'healthcare'],
        },
      ]

      // This should FAIL initially because TrendingAnalyzer.detectTrends might not exist
      const result = await TrendingAnalyzer.detectTrends({
        articles: mockArticles,
        timeWindow: '24h',
        confidenceThreshold: 0.7,
      })

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            topic: expect.stringMatching(/AI|artificial intelligence/i),
            velocity: expect.any(Number),
            confidence: expect.any(Number),
            sources: expect.arrayContaining([
              expect.objectContaining({
                name: expect.any(String),
                count: expect.any(Number),
              }),
            ]),
            categories: expect.arrayContaining(['technology']),
            metadata: expect.objectContaining({
              totalMentions: expect.any(Number),
              uniqueSources: expect.any(Number),
            }),
          }),
        ])
      )
    })

    it('should calculate trend velocity based on time series data', async () => {
      const mockTimeSeriesData = [
        { timestamp: new Date(Date.now() - 86400000), mentions: 5 }, // 24h ago
        { timestamp: new Date(Date.now() - 43200000), mentions: 12 }, // 12h ago
        { timestamp: new Date(Date.now() - 21600000), mentions: 25 }, // 6h ago
        { timestamp: new Date(Date.now() - 10800000), mentions: 45 }, // 3h ago
        { timestamp: new Date(), mentions: 78 }, // now
      ]

      const velocity = await TrendingAnalyzer.calculateVelocity({
        timeSeries: mockTimeSeriesData,
        timeWindow: '24h',
      })

      expect(velocity).toBeGreaterThan(0)
      expect(velocity).toBeLessThanOrEqual(1)
      
      // Velocity should be high for accelerating trends
      expect(velocity).toBeGreaterThan(0.7) // Strong upward trend
    })

    it('should identify emerging vs declining trends', async () => {
      const emergingData = [
        { timestamp: new Date(Date.now() - 86400000), mentions: 2 },
        { timestamp: new Date(Date.now() - 43200000), mentions: 8 },
        { timestamp: new Date(Date.now() - 21600000), mentions: 25 },
        { timestamp: new Date(), mentions: 67 },
      ]

      const decliningData = [
        { timestamp: new Date(Date.now() - 86400000), mentions: 89 },
        { timestamp: new Date(Date.now() - 43200000), mentions: 45 },
        { timestamp: new Date(Date.now() - 21600000), mentions: 23 },
        { timestamp: new Date(), mentions: 8 },
      ]

      const emergingVelocity = await TrendingAnalyzer.calculateVelocity({
        timeSeries: emergingData,
        timeWindow: '24h',
      })

      const decliningVelocity = await TrendingAnalyzer.calculateVelocity({
        timeSeries: decliningData,
        timeWindow: '24h',
      })

      expect(emergingVelocity).toBeGreaterThan(0.5)
      expect(decliningVelocity).toBeLessThan(0.3)
    })

    it('should filter trends by confidence threshold', async () => {
      const mockTrends = [
        { topic: 'High Confidence Topic', confidence: 0.95, velocity: 0.8 },
        { topic: 'Medium Confidence Topic', confidence: 0.65, velocity: 0.6 },
        { topic: 'Low Confidence Topic', confidence: 0.35, velocity: 0.7 },
      ]

      const result = await TrendingAnalyzer.detectTrends({
        articles: [],
        confidenceThreshold: 0.7,
      })

      // Should only return trends above threshold
      expect(result.every(trend => trend.confidence >= 0.7)).toBe(true)
    })

    it('should handle different time windows', async () => {
      const timeWindows = ['1h', '6h', '24h', '7d', '30d']

      for (const timeWindow of timeWindows) {
        const result = await TrendingAnalyzer.detectTrends({
          articles: [],
          timeWindow,
        })

        expect(result).toEqual(expect.any(Array))
        // Each trend should have metadata reflecting the time window
        if (result.length > 0) {
          expect(result[0].metadata.timespan).toBe(timeWindow)
        }
      }
    })

    it('should deduplicate similar trending topics', async () => {
      const duplicateArticles = [
        {
          id: 'article-1',
          title: 'Climate Change Summit 2024',
          content: 'World leaders gather for climate discussions...',
          categories: ['environment', 'politics'],
        },
        {
          id: 'article-2',
          title: 'Global Climate Summit Opens',
          content: 'International climate conference begins...',
          categories: ['environment', 'politics'],
        },
        {
          id: 'article-3',
          title: 'Climate Change Conference Updates',
          content: 'Latest developments from climate summit...',
          categories: ['environment', 'politics'],
        },
      ]

      const result = await TrendingAnalyzer.detectTrends({
        articles: duplicateArticles,
        deduplication: true,
        similarityThreshold: 0.8,
      })

      // Should merge similar topics into one trend
      expect(result.length).toBeLessThan(duplicateArticles.length)
      expect(result[0].metadata.totalMentions).toBeGreaterThan(1)
    })

    it('should categorize trends properly', async () => {
      const categorizedArticles = [
        {
          title: 'Tech Stock Market Rally',
          categories: ['technology', 'finance'],
          content: 'Technology stocks surge...',
        },
        {
          title: 'AI Company IPO',
          categories: ['technology', 'finance'],
          content: 'Artificial intelligence startup goes public...',
        },
        {
          title: 'Climate Policy Changes',
          categories: ['environment', 'politics'],
          content: 'New environmental regulations announced...',
        },
      ]

      const result = await TrendingAnalyzer.detectTrends({
        articles: categorizedArticles,
      })

      // Should preserve and aggregate categories
      const techTrend = result.find(trend => 
        trend.categories.includes('technology')
      )
      
      if (techTrend) {
        expect(techTrend.categories).toContain('technology')
        expect(techTrend.categories).toContain('finance')
      }
    })
  })

  describe('getCurrentTrends', () => {
    it('should return cached trends when available', async () => {
      const cachedTrends = [
        {
          id: 'cached-trend-1',
          topic: 'Cached AI Trend',
          velocity: 0.85,
          confidence: 0.92,
        },
      ]

      ;(redis.get as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(cachedTrends)
      )

      const result = await TrendingAnalyzer.getCurrentTrends({
        maxResults: 10,
        useCache: true,
      })

      expect(result).toEqual(cachedTrends)
      expect(redis.get).toHaveBeenCalledWith(
        expect.stringMatching(/trends:current/)
      )
    })

    it('should fetch fresh trends when cache is empty', async () => {
      ;(redis.get as jest.Mock).mockResolvedValueOnce(null)
      ;(prisma.trend.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'fresh-trend-1',
          topic: 'Fresh AI Trend',
          velocity: 0.78,
          confidence: 0.89,
          isActive: true,
          createdAt: new Date(),
        },
      ])

      const result = await TrendingAnalyzer.getCurrentTrends({
        maxResults: 5,
        region: 'US',
        category: 'technology',
      })

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'fresh-trend-1',
            topic: 'Fresh AI Trend',
            velocity: 0.78,
          }),
        ])
      )

      expect(prisma.trend.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          region: 'US',
          categories: { has: 'technology' },
        },
        take: 5,
        orderBy: [
          { velocity: 'desc' },
          { confidence: 'desc' },
        ],
      })
    })

    it('should filter trends by region and category', async () => {
      await TrendingAnalyzer.getCurrentTrends({
        region: 'EU',
        category: 'sports',
        maxResults: 15,
      })

      expect(prisma.trend.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            region: 'EU',
            categories: { has: 'sports' },
          }),
        })
      )
    })

    it('should cache results for future requests', async () => {
      const freshTrends = [{ id: 'trend-1', topic: 'Test Trend' }]

      ;(redis.get as jest.Mock).mockResolvedValueOnce(null)
      ;(prisma.trend.findMany as jest.Mock).mockResolvedValueOnce(freshTrends)

      await TrendingAnalyzer.getCurrentTrends({ maxResults: 10 })

      expect(redis.setex).toHaveBeenCalledWith(
        expect.stringMatching(/trends:current/),
        expect.any(Number), // TTL
        JSON.stringify(freshTrends)
      )
    })
  })

  describe('getRelatedTrends', () => {
    it('should find related trending topics using semantic similarity', async () => {
      const baseTopic = 'Artificial Intelligence'
      
      const mockSimilarTrends = [
        {
          id: 'related-1',
          topic: 'Machine Learning',
          similarity: 0.85,
          velocity: 0.72,
          confidence: 0.89,
        },
        {
          id: 'related-2',
          topic: 'Neural Networks',
          similarity: 0.78,
          velocity: 0.65,
          confidence: 0.82,
        },
      ]

      // This should FAIL initially because getRelatedTrends might not exist
      const result = await TrendingAnalyzer.getRelatedTrends(baseTopic, {
        maxResults: 5,
        similarityThreshold: 0.7,
      })

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            topic: expect.any(String),
            similarity: expect.any(Number),
            velocity: expect.any(Number),
            confidence: expect.any(Number),
          }),
        ])
      )

      // All results should be above similarity threshold
      expect(result.every(trend => trend.similarity >= 0.7)).toBe(true)
    })

    it('should rank related trends by relevance score', async () => {
      const result = await TrendingAnalyzer.getRelatedTrends('Climate Change', {
        maxResults: 10,
        rankBy: 'relevance', // combination of similarity, velocity, and confidence
      })

      // Should be ordered by relevance (highest first)
      for (let i = 0; i < result.length - 1; i++) {
        const current = result[i]
        const next = result[i + 1]
        
        const currentScore = current.similarity * current.velocity * current.confidence
        const nextScore = next.similarity * next.velocity * next.confidence
        
        expect(currentScore).toBeGreaterThanOrEqual(nextScore)
      }
    })

    it('should exclude the base topic from results', async () => {
      const baseTopic = 'Renewable Energy'

      const result = await TrendingAnalyzer.getRelatedTrends(baseTopic)

      // Should not include the base topic itself
      expect(result.every(trend => trend.topic !== baseTopic)).toBe(true)
    })

    it('should handle topics with no related trends', async () => {
      const obscureTopic = 'Very Specific Niche Topic That Has No Related Trends'

      const result = await TrendingAnalyzer.getRelatedTrends(obscureTopic, {
        similarityThreshold: 0.8,
      })

      expect(result).toEqual([])
    })
  })

  describe('analyzeTrendingMetrics', () => {
    it('should calculate comprehensive trending statistics', async () => {
      const mockTrends = [
        { velocity: 0.8, confidence: 0.9, sources: ['src1', 'src2'] },
        { velocity: 0.6, confidence: 0.8, sources: ['src2', 'src3'] },
        { velocity: 0.9, confidence: 0.95, sources: ['src1', 'src3', 'src4'] },
      ]

      const metrics = await TrendingAnalyzer.analyzeTrendingMetrics({
        trends: mockTrends,
        timeWindow: '24h',
      })

      expect(metrics).toEqual({
        totalTrends: 3,
        averageVelocity: expect.closeTo(0.77, 2),
        averageConfidence: expect.closeTo(0.88, 2),
        peakVelocity: 0.9,
        uniqueSources: 4,
        trendingScore: expect.any(Number),
        distribution: expect.objectContaining({
          emerging: expect.any(Number),
          stable: expect.any(Number),
          declining: expect.any(Number),
        }),
      })
    })

    it('should identify trend patterns over time', async () => {
      const timeSeriesData = [
        { timestamp: new Date(Date.now() - 86400000), trendCount: 15 },
        { timestamp: new Date(Date.now() - 43200000), trendCount: 23 },
        { timestamp: new Date(Date.now() - 21600000), trendCount: 31 },
        { timestamp: new Date(), trendCount: 28 },
      ]

      const patterns = await TrendingAnalyzer.identifyTrendPatterns({
        timeSeries: timeSeriesData,
        analysisType: 'momentum',
      })

      expect(patterns).toEqual({
        trend: expect.stringMatching(/rising|stable|declining/),
        momentum: expect.any(Number),
        prediction: expect.objectContaining({
          nextHour: expect.any(Number),
          confidence: expect.any(Number),
        }),
        patterns: expect.arrayContaining([
          expect.stringMatching(/cyclical|seasonal|linear|exponential/),
        ]),
      })
    })

    it('should detect anomalies in trending patterns', async () => {
      const anomalousData = [
        { timestamp: new Date(Date.now() - 86400000), mentions: 10 },
        { timestamp: new Date(Date.now() - 43200000), mentions: 12 },
        { timestamp: new Date(Date.now() - 21600000), mentions: 15 },
        { timestamp: new Date(Date.now() - 10800000), mentions: 150 }, // Anomaly
        { timestamp: new Date(), mentions: 18 },
      ]

      const anomalies = await TrendingAnalyzer.detectAnomalies({
        timeSeries: anomalousData,
        sensitivity: 0.8,
      })

      expect(anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            timestamp: expect.any(Date),
            value: 150,
            severity: expect.any(Number),
            type: expect.stringMatching(/spike|drop|pattern_break/),
          }),
        ])
      )
    })
  })

  describe('trending cache management', () => {
    it('should implement cache invalidation strategies', async () => {
      await TrendingAnalyzer.invalidateCache({
        pattern: 'trends:*',
        reason: 'manual_refresh',
      })

      expect(redis.keys).toHaveBeenCalledWith('trends:*')
      expect(redis.del).toHaveBeenCalled()
    })

    it('should handle cache warming for popular queries', async () => {
      const popularQueries = [
        { region: 'US', category: 'technology' },
        { region: 'EU', category: 'politics' },
        { region: 'global', category: 'sports' },
      ]

      await TrendingAnalyzer.warmCache({
        queries: popularQueries,
        priority: 'high',
      })

      // Should pre-fetch and cache popular trend queries
      expect(redis.setex).toHaveBeenCalledTimes(popularQueries.length)
    })

    it('should implement cache hierarchy for different data types', async () => {
      await TrendingAnalyzer.getCurrentTrends({
        maxResults: 10,
        useCache: true,
        cacheLevel: 'L1', // Fast cache for frequently accessed data
      })

      expect(redis.get).toHaveBeenCalledWith(
        expect.stringMatching(/trends:L1:/)
      )
    })
  })

  describe('trend quality assessment', () => {
    it('should score trend quality based on multiple factors', async () => {
      const trendData = {
        topic: 'High Quality Trend',
        velocity: 0.85,
        confidence: 0.92,
        sources: [
          { name: 'Reuters', reliability: 0.95 },
          { name: 'BBC', reliability: 0.93 },
          { name: 'AP News', reliability: 0.94 },
        ],
        timespan: '6h',
        mentions: 247,
        uniqueSources: 15,
      }

      const qualityScore = await TrendingAnalyzer.assessTrendQuality(trendData)

      expect(qualityScore).toEqual({
        overall: expect.any(Number),
        factors: {
          sourceReliability: expect.any(Number),
          velocityStability: expect.any(Number),
          sourcesDiversity: expect.any(Number),
          temporalConsistency: expect.any(Number),
          contentQuality: expect.any(Number),
        },
        rating: expect.stringMatching(/excellent|good|fair|poor/),
        confidence: expect.any(Number),
      })

      expect(qualityScore.overall).toBeGreaterThan(0.8) // High quality trend
    })

    it('should flag low-quality or suspicious trends', async () => {
      const suspiciousTrend = {
        topic: 'Suspicious Trend',
        velocity: 0.95, // Very high velocity
        confidence: 0.45, // Low confidence
        sources: [
          { name: 'Unknown Blog', reliability: 0.2 },
          { name: 'Social Media', reliability: 0.3 },
        ],
        mentions: 500, // High mentions but low source reliability
        uniqueSources: 2, // Very few sources
      }

      const qualityScore = await TrendingAnalyzer.assessTrendQuality(suspiciousTrend)

      expect(qualityScore.overall).toBeLessThan(0.5)
      expect(qualityScore.rating).toMatch(/poor|suspicious/)
      expect(qualityScore.flags).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/low_source_reliability|velocity_confidence_mismatch/),
        ])
      )
    })
  })

  describe('real-time trend monitoring', () => {
    it('should monitor trending topics in real-time', async () => {
      const monitorConfig = {
        keywords: ['AI', 'climate change', 'crypto'],
        thresholds: {
          velocity: 0.7,
          mentions: 50,
          timeWindow: '1h',
        },
        alerts: true,
      }

      // This should FAIL initially because real-time monitoring might not exist
      const monitor = await TrendingAnalyzer.startRealTimeMonitoring(monitorConfig)

      expect(monitor).toEqual({
        id: expect.any(String),
        status: 'active',
        config: monitorConfig,
        startedAt: expect.any(Date),
      })
    })

    it('should trigger alerts for significant trend changes', async () => {
      const alertConfig = {
        trendId: 'monitored-trend-1',
        thresholds: {
          velocityIncrease: 0.3, // Alert if velocity increases by 30%
          mentionSpike: 2.0, // Alert if mentions double
        },
        channels: ['webhook', 'email'],
      }

      const alert = await TrendingAnalyzer.configureAlerts(alertConfig)

      expect(alert).toEqual({
        id: expect.any(String),
        trendId: 'monitored-trend-1',
        active: true,
        thresholds: alertConfig.thresholds,
        channels: alertConfig.channels,
      })
    })

    it('should provide trend forecasting', async () => {
      const trendHistory = [
        { timestamp: new Date(Date.now() - 21600000), velocity: 0.6 },
        { timestamp: new Date(Date.now() - 10800000), velocity: 0.7 },
        { timestamp: new Date(Date.now() - 5400000), velocity: 0.75 },
        { timestamp: new Date(), velocity: 0.8 },
      ]

      const forecast = await TrendingAnalyzer.forecastTrend({
        trendId: 'forecast-trend-1',
        history: trendHistory,
        timeHorizon: '6h',
        model: 'linear_regression',
      })

      expect(forecast).toEqual({
        predictions: expect.arrayContaining([
          expect.objectContaining({
            timestamp: expect.any(Date),
            velocity: expect.any(Number),
            confidence: expect.any(Number),
          }),
        ]),
        trend: expect.stringMatching(/rising|stable|declining/),
        confidence: expect.any(Number),
        model: 'linear_regression',
      })
    })
  })
})

describe('TrendingAnalyzer Error Handling', () => {
  it('should handle API failures gracefully', async () => {
    ;(prisma.trend.findMany as jest.Mock).mockRejectedValueOnce(
      new Error('Database connection failed')
    )

    await expect(
      TrendingAnalyzer.getCurrentTrends({ maxResults: 10 })
    ).rejects.toThrow('Database connection failed')
  })

  it('should handle malformed input data', async () => {
    const malformedArticles = [
      { title: null, content: undefined }, // Missing required fields
      { title: '', content: '' }, // Empty strings
      { title: 'Valid', content: 'Valid', publishedAt: 'invalid-date' }, // Invalid date
    ]

    await expect(
      TrendingAnalyzer.detectTrends({ articles: malformedArticles })
    ).rejects.toThrow(/Invalid input data/)
  })

  it('should handle cache failures by falling back to direct queries', async () => {
    ;(redis.get as jest.Mock).mockRejectedValueOnce(new Error('Redis down'))
    ;(prisma.trend.findMany as jest.Mock).mockResolvedValueOnce([])

    const result = await TrendingAnalyzer.getCurrentTrends({
      maxResults: 5,
      useCache: true,
    })

    expect(result).toEqual([])
    expect(prisma.trend.findMany).toHaveBeenCalled()
  })

  it('should validate configuration parameters', async () => {
    await expect(
      TrendingAnalyzer.detectTrends({
        articles: [],
        confidenceThreshold: 1.5, // Invalid: over 1.0
      })
    ).rejects.toThrow(/Invalid confidence threshold/)

    await expect(
      TrendingAnalyzer.getCurrentTrends({
        maxResults: 0, // Invalid: must be positive
      })
    ).rejects.toThrow(/Invalid maxResults/)
  })
})