import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/api/trpc';
import { TrendingAnalyzer } from '@/lib/news/trending';
import { NewsClient } from '@/lib/news/client';

// Validation schemas based on API contracts
const TrendsQuerySchema = z.object({
  limit: z.number().min(1).max(50).default(10),
  region: z.string().optional(),
  category: z.string().optional(),
});

const TrendsByCategorySchema = z.object({
  category: z.string(),
  limit: z.number().min(1).max(50).default(10),
  timeRange: z.enum(['1h', '6h', '24h', '7d']).default('24h'),
});

export const trendsRouter = createTRPCRouter({
  // Get current trending topics with caching and real-time updates
  getCurrent: publicProcedure
    .input(TrendsQuerySchema)
    .query(async ({ input, ctx }) => {
      const { limit, region, category } = input;

      // Check Redis cache first
      const cacheKey = `trends:current:${region || 'global'}:${category || 'all'}:${limit}`;
      const cachedTrends = await ctx.redis.get(cacheKey);

      if (cachedTrends) {
        return {
          trends: JSON.parse(cachedTrends),
          fromCache: true,
          lastUpdated: await ctx.redis.get(`${cacheKey}:timestamp`),
        };
      }

      // Get trending topics from analyzer
      const trendingTopics = await TrendingAnalyzer.getCurrentTrends({
        maxResults: limit,
        region,
        category,
        confidenceThreshold: 0.6,
      });

      // Format according to API schema
      const trends = trendingTopics.map(trend => ({
        id: trend.id,
        topic: trend.topic,
        description: trend.description,
        velocity: trend.velocity,
        sources: trend.sources,
        categories: trend.categories,
        region: trend.region || region || 'global',
        confidence: trend.confidence,
        peakAt: trend.peakTime,
        expiresAt: trend.estimatedExpiry,
        isActive: trend.isActive,
        createdAt: trend.detectedAt,
      }));

      // Cache for 5 minutes
      await Promise.all([
        ctx.redis.setex(cacheKey, 300, JSON.stringify(trends)),
        ctx.redis.setex(`${cacheKey}:timestamp`, 300, new Date().toISOString()),
      ]);

      return {
        trends,
        fromCache: false,
        lastUpdated: new Date().toISOString(),
      };
    }),

  // Get trends by specific category with time range filtering
  getByCategory: publicProcedure
    .input(TrendsByCategorySchema)
    .query(async ({ input, ctx }) => {
      const { category, limit, timeRange } = input;

      // Calculate time boundaries
      const now = new Date();
      const timeRangeHours = {
        '1h': 1,
        '6h': 6,
        '24h': 24,
        '7d': 168,
      };

      const startTime = new Date(now.getTime() - timeRangeHours[timeRange] * 60 * 60 * 1000);

      // Get category-specific trends from database
      const trends = await ctx.prisma.trend.findMany({
        where: {
          categories: {
            has: category,
          },
          isActive: true,
          createdAt: {
            gte: startTime,
          },
        },
        take: limit,
        orderBy: [
          { velocity: 'desc' },
          { confidence: 'desc' },
        ],
      });

      return {
        trends: trends.map(trend => ({
          id: trend.id,
          topic: trend.topic,
          description: trend.description,
          velocity: trend.velocity,
          sources: trend.sources,
          categories: trend.categories,
          region: trend.region,
          confidence: trend.confidence,
          peakAt: trend.peakAt,
          expiresAt: trend.expiresAt,
          isActive: trend.isActive,
          createdAt: trend.createdAt,
        })),
        category,
        timeRange,
        totalCount: trends.length,
      };
    }),

  // Get trending topics related to a specific topic
  getRelated: publicProcedure
    .input(z.object({
      topic: z.string().min(1),
      limit: z.number().min(1).max(20).default(5),
    }))
    .query(async ({ input, ctx }) => {
      const { topic, limit } = input;

      // Use trending analyzer to find related topics
      const relatedTrends = await TrendingAnalyzer.getRelatedTrends(topic, {
        maxResults: limit,
        similarityThreshold: 0.3,
      });

      return {
        trends: relatedTrends.map(trend => ({
          id: trend.id,
          topic: trend.topic,
          description: trend.description,
          velocity: trend.velocity,
          sources: trend.sources,
          categories: trend.categories,
          region: trend.region,
          confidence: trend.confidence,
          similarity: trend.similarity,
          createdAt: trend.detectedAt,
        })),
        baseTopic: topic,
      };
    }),

  // Get trending statistics and insights
  getStats: publicProcedure
    .input(z.object({
      timeRange: z.enum(['24h', '7d', '30d']).default('24h'),
    }))
    .query(async ({ input, ctx }) => {
      const { timeRange } = input;

      const timeRangeHours = {
        '24h': 24,
        '7d': 168,
        '30d': 720,
      };

      const startTime = new Date(Date.now() - timeRangeHours[timeRange] * 60 * 60 * 1000);

      // Aggregate trending statistics
      const stats = await ctx.prisma.trend.aggregate({
        where: {
          createdAt: {
            gte: startTime,
          },
        },
        _count: {
          id: true,
        },
        _avg: {
          velocity: true,
          confidence: true,
        },
        _max: {
          velocity: true,
        },
      });

      // Get category breakdown
      const categoryStats = await ctx.prisma.trend.groupBy({
        by: ['categories'],
        where: {
          createdAt: {
            gte: startTime,
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 10,
      });

      return {
        totalTrends: stats._count.id,
        averageVelocity: stats._avg.velocity || 0,
        averageConfidence: stats._avg.confidence || 0,
        peakVelocity: stats._max.velocity || 0,
        topCategories: categoryStats.map(cat => ({
          categories: cat.categories,
          count: cat._count.id,
        })),
        timeRange,
      };
    }),

  // Force refresh trends (admin/debug endpoint)
  refresh: publicProcedure
    .mutation(async ({ ctx }) => {
      try {
        // Clear trends cache
        const pattern = 'trends:current:*';
        const keys = await ctx.redis.keys(pattern);
        if (keys.length > 0) {
          await ctx.redis.del(...keys);
        }

        // Trigger news ingestion
        await NewsClient.triggerRefresh();

        // Run trend detection
        const newTrends = await TrendingAnalyzer.detectTrends({
          forceRefresh: true,
          confidenceThreshold: 0.5,
        });

        return {
          success: true,
          message: `Refreshed ${newTrends.length} trends`,
          trendsDetected: newTrends.length,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        throw new Error(`REFRESH_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }),
});