import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { env } from '@/lib/env';

// Redis client
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
});

// Job queues
export const aiGenerationQueue = new Queue('ai-generation', {
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
});

export const newsIngestionQueue = new Queue('news-ingestion', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
    attempts: 2,
  },
});

export const trendAnalysisQueue = new Queue('trend-analysis', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 30,
    removeOnFail: 10,
    attempts: 1,
  },
});