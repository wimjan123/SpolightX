import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // LLM Configuration
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().default('auto'),

  // News API
  NEWS_API_KEY: z.string().min(1),
  NEWS_API_URL: z.string().url(),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32),

  // App Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Safety and Content Moderation
  ENABLE_SAFETY_MODE: z.string().default('true').transform((val) => val === 'true'),
  CONTENT_FILTER_LEVEL: z.enum(['low', 'medium', 'high']).default('medium'),

  // Session and Security
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;