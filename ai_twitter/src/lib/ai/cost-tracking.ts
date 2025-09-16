/**
 * Token usage monitoring and cost tracking
 * Based on research.md LLM Integration cost optimization recommendations
 */

import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export interface TokenUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  requestType: 'generation' | 'embedding' | 'moderation';
  userId?: string;
  personaId?: string;
  timestamp: Date;
}

export interface CostSummary {
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  breakdown: {
    generation: { cost: number; tokens: number; requests: number };
    embedding: { cost: number; tokens: number; requests: number };
    moderation: { cost: number; tokens: number; requests: number };
  };
  topModels: Array<{ model: string; cost: number; usage: number }>;
}

/**
 * Current OpenAI pricing (as of January 2025)
 * Source: research.md LLM Integration section
 */
const PRICING = {
  // GPT-4o pricing (per 1M tokens)
  'gpt-4o': {
    input: 2.50,
    output: 10.00,
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.60,
  },
  'gpt-4o-realtime': {
    input: 5.00, // Per 1M text tokens
    output: 20.00, // Per 1M text tokens
    audio_input: 100.00, // Per 1M audio tokens
    audio_output: 200.00, // Per 1M audio tokens
  },
  // Embedding models
  'text-embedding-3-small': {
    input: 0.02,
    output: 0, // No output cost for embeddings
  },
  'text-embedding-3-large': {
    input: 0.13,
    output: 0,
  },
  'text-embedding-ada-002': {
    input: 0.10,
    output: 0,
  },
  // Moderation (free)
  'text-moderation-stable': {
    input: 0,
    output: 0,
  },
  // OpenRouter models (varies, these are estimates)
  'openai/gpt-4o': {
    input: 5.00, // Usually higher than direct OpenAI
    output: 15.00,
  },
  'openai/gpt-4o-mini': {
    input: 0.30,
    output: 1.20,
  },
} as const;

/**
 * Calculate cost for token usage
 */
export function calculateTokenCost(
  model: string,
  promptTokens: number,
  completionTokens: number = 0
): number {
  const pricing = PRICING[model as keyof typeof PRICING];
  
  if (!pricing) {
    console.warn(`Unknown model for cost calculation: ${model}`);
    return 0;
  }

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Track token usage
 */
export async function trackTokenUsage(usage: Omit<TokenUsage, 'timestamp'>): Promise<void> {
  const tokenUsage: TokenUsage = {
    ...usage,
    timestamp: new Date(),
  };

  try {
    // Store in database for long-term tracking
    await prisma.$executeRaw`
      INSERT INTO usage_tracking (
        model, prompt_tokens, completion_tokens, total_tokens, 
        cost, request_type, user_id, persona_id, timestamp
      ) VALUES (
        ${tokenUsage.model}, ${tokenUsage.promptTokens}, ${tokenUsage.completionTokens},
        ${tokenUsage.totalTokens}, ${tokenUsage.cost}, ${tokenUsage.requestType},
        ${tokenUsage.userId}, ${tokenUsage.personaId}, ${tokenUsage.timestamp}
      )
    `;

    // Store in Redis for real-time monitoring
    const redisKey = `usage:${new Date().toISOString().split('T')[0]}`; // Daily key
    await redis.hincrby(redisKey, 'total_cost', Math.round(tokenUsage.cost * 10000)); // Store as cents * 100
    await redis.hincrby(redisKey, 'total_tokens', tokenUsage.totalTokens);
    await redis.hincrby(redisKey, 'request_count', 1);
    await redis.hincrby(redisKey, `${tokenUsage.requestType}_cost`, Math.round(tokenUsage.cost * 10000));
    await redis.hincrby(redisKey, `${tokenUsage.requestType}_tokens`, tokenUsage.totalTokens);
    await redis.hincrby(redisKey, `${tokenUsage.requestType}_requests`, 1);
    
    // Set expiration for Redis data (90 days)
    await redis.expire(redisKey, 90 * 24 * 60 * 60);

    console.log(`Token usage tracked: ${tokenUsage.model} - ${tokenUsage.totalTokens} tokens - $${tokenUsage.cost.toFixed(4)}`);
    
  } catch (error) {
    console.error('Failed to track token usage:', error);
    // Don't throw - usage tracking shouldn't break the main flow
  }
}

/**
 * Get cost summary for a date range
 */
export async function getCostSummary(
  startDate: Date,
  endDate: Date,
  userId?: string
): Promise<CostSummary> {
  try {
    const whereClause = userId
      ? `WHERE timestamp >= $1 AND timestamp <= $2 AND user_id = $3`
      : `WHERE timestamp >= $1 AND timestamp <= $2`;
    
    const params = userId
      ? [startDate, endDate, userId]
      : [startDate, endDate];

    // Get aggregate data
    const summary = await prisma.$queryRawUnsafe<Array<{
      total_cost: number;
      total_tokens: number;
      request_count: number;
    }>>(
      `SELECT 
        SUM(cost) as total_cost,
        SUM(total_tokens) as total_tokens,
        COUNT(*) as request_count
       FROM usage_tracking ${whereClause}`,
      ...params
    );

    // Get breakdown by request type
    const breakdown = await prisma.$queryRawUnsafe<Array<{
      request_type: string;
      cost: number;
      tokens: number;
      requests: number;
    }>>(
      `SELECT 
        request_type,
        SUM(cost) as cost,
        SUM(total_tokens) as tokens,
        COUNT(*) as requests
       FROM usage_tracking ${whereClause}
       GROUP BY request_type`,
      ...params
    );

    // Get top models
    const topModels = await prisma.$queryRawUnsafe<Array<{
      model: string;
      cost: number;
      usage: number;
    }>>(
      `SELECT 
        model,
        SUM(cost) as cost,
        SUM(total_tokens) as usage
       FROM usage_tracking ${whereClause}
       GROUP BY model
       ORDER BY cost DESC
       LIMIT 10`,
      ...params
    );

    const result: CostSummary = {
      totalCost: summary[0]?.total_cost || 0,
      totalTokens: summary[0]?.total_tokens || 0,
      requestCount: summary[0]?.request_count || 0,
      breakdown: {
        generation: { cost: 0, tokens: 0, requests: 0 },
        embedding: { cost: 0, tokens: 0, requests: 0 },
        moderation: { cost: 0, tokens: 0, requests: 0 },
      },
      topModels: topModels || [],
    };

    // Fill breakdown
    breakdown.forEach(item => {
      if (item.request_type in result.breakdown) {
        const type = item.request_type as keyof typeof result.breakdown;
        result.breakdown[type] = {
          cost: item.cost,
          tokens: item.tokens,
          requests: item.requests,
        };
      }
    });

    return result;
    
  } catch (error) {
    console.error('Failed to get cost summary:', error);
    return {
      totalCost: 0,
      totalTokens: 0,
      requestCount: 0,
      breakdown: {
        generation: { cost: 0, tokens: 0, requests: 0 },
        embedding: { cost: 0, tokens: 0, requests: 0 },
        moderation: { cost: 0, tokens: 0, requests: 0 },
      },
      topModels: [],
    };
  }
}

/**
 * Get real-time cost data from Redis
 */
export async function getRealTimeCosts(date = new Date()): Promise<Partial<CostSummary>> {
  try {
    const redisKey = `usage:${date.toISOString().split('T')[0]}`;
    const data = await redis.hgetall(redisKey);
    
    if (!data || Object.keys(data).length === 0) {
      return {
        totalCost: 0,
        totalTokens: 0,
        requestCount: 0,
      };
    }

    return {
      totalCost: (parseInt(data.total_cost || '0') / 10000), // Convert back from cents * 100
      totalTokens: parseInt(data.total_tokens || '0'),
      requestCount: parseInt(data.request_count || '0'),
      breakdown: {
        generation: {
          cost: (parseInt(data.generation_cost || '0') / 10000),
          tokens: parseInt(data.generation_tokens || '0'),
          requests: parseInt(data.generation_requests || '0'),
        },
        embedding: {
          cost: (parseInt(data.embedding_cost || '0') / 10000),
          tokens: parseInt(data.embedding_tokens || '0'),
          requests: parseInt(data.embedding_requests || '0'),
        },
        moderation: {
          cost: (parseInt(data.moderation_cost || '0') / 10000),
          tokens: parseInt(data.moderation_tokens || '0'),
          requests: parseInt(data.moderation_requests || '0'),
        },
      },
    };
    
  } catch (error) {
    console.error('Failed to get real-time costs:', error);
    return { totalCost: 0, totalTokens: 0, requestCount: 0 };
  }
}

/**
 * Check if spending limits are exceeded
 */
export async function checkSpendingLimits(
  dailyLimit: number,
  monthlyLimit: number
): Promise<{
  dailyExceeded: boolean;
  monthlyExceeded: boolean;
  dailyUsage: number;
  monthlyUsage: number;
}> {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  
  // Get daily usage
  const dailyUsage = await getRealTimeCosts(today);
  
  // Get monthly usage
  const monthlyUsage = await getCostSummary(monthStart, today);
  
  return {
    dailyExceeded: (dailyUsage.totalCost || 0) > dailyLimit,
    monthlyExceeded: monthlyUsage.totalCost > monthlyLimit,
    dailyUsage: dailyUsage.totalCost || 0,
    monthlyUsage: monthlyUsage.totalCost,
  };
}

/**
 * Rate limiting based on cost
 */
export class CostBasedRateLimiter {
  private redisKeyPrefix = 'rate_limit:cost:';
  
  async checkRateLimit(
    identifier: string,
    maxCostPerMinute: number,
    maxCostPerHour: number
  ): Promise<{
    allowed: boolean;
    minuteUsage: number;
    hourUsage: number;
    minuteRemaining: number;
    hourRemaining: number;
  }> {
    const now = new Date();
    const minuteKey = `${this.redisKeyPrefix}${identifier}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    const hourKey = `${this.redisKeyPrefix}${identifier}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    
    try {
      const [minuteUsage, hourUsage] = await Promise.all([
        redis.get(minuteKey).then(val => parseFloat(val || '0')),
        redis.get(hourKey).then(val => parseFloat(val || '0')),
      ]);
      
      return {
        allowed: minuteUsage < maxCostPerMinute && hourUsage < maxCostPerHour,
        minuteUsage,
        hourUsage,
        minuteRemaining: Math.max(0, maxCostPerMinute - minuteUsage),
        hourRemaining: Math.max(0, maxCostPerHour - hourUsage),
      };
      
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail open - allow the request
      return {
        allowed: true,
        minuteUsage: 0,
        hourUsage: 0,
        minuteRemaining: maxCostPerMinute,
        hourRemaining: maxCostPerHour,
      };
    }
  }
  
  async recordUsage(identifier: string, cost: number): Promise<void> {
    const now = new Date();
    const minuteKey = `${this.redisKeyPrefix}${identifier}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    const hourKey = `${this.redisKeyPrefix}${identifier}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    
    try {
      await Promise.all([
        redis.incrbyfloat(minuteKey, cost).then(() => redis.expire(minuteKey, 120)), // 2 minute expiry
        redis.incrbyfloat(hourKey, cost).then(() => redis.expire(hourKey, 3720)), // 62 minute expiry
      ]);
    } catch (error) {
      console.error('Failed to record rate limit usage:', error);
    }
  }
}

export const costRateLimiter = new CostBasedRateLimiter();

/**
 * Middleware to automatically track costs for OpenAI calls
 */
export function withCostTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    requestType: TokenUsage['requestType'];
    model: string;
    userId?: string;
    personaId?: string;
  }
): T {
  return (async (...args: Parameters<T>) => {
    const startTime = Date.now();
    
    try {
      const result = await fn(...args);
      
      // Extract token usage from OpenAI response
      if (result && typeof result === 'object' && 'usage' in result) {
        const usage = result.usage as {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
        
        const cost = calculateTokenCost(
          options.model,
          usage.prompt_tokens,
          usage.completion_tokens
        );
        
        await trackTokenUsage({
          model: options.model,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          cost,
          requestType: options.requestType,
          userId: options.userId,
          personaId: options.personaId,
        });
      }
      
      return result;
      
    } catch (error) {
      // Still track failed requests for monitoring
      const duration = Date.now() - startTime;
      console.error(`Request failed after ${duration}ms:`, error);
      throw error;
    }
  }) as T;
}

/**
 * Create the usage_tracking table if it doesn't exist
 * This should be run during application startup
 */
export async function ensureUsageTrackingTable(): Promise<void> {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS usage_tracking (
        id SERIAL PRIMARY KEY,
        model VARCHAR(100) NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost DECIMAL(10,6) NOT NULL,
        request_type VARCHAR(50) NOT NULL,
        user_id VARCHAR(100),
        persona_id VARCHAR(100),
        timestamp TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    
    // Create indexes for better query performance
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_usage_tracking_timestamp ON usage_tracking(timestamp)
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id ON usage_tracking(user_id)
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_usage_tracking_model ON usage_tracking(model)
    `;
    
    console.log('Usage tracking table initialized');
    
  } catch (error) {
    console.error('Failed to initialize usage tracking table:', error);
  }
}