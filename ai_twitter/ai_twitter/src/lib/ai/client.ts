import OpenAI from 'openai';
import { env } from '@/lib/env';

/**
 * OpenAI client configuration based on research.md LLM Integration
 * Primary: OpenAI Realtime API with OpenRouter fallback
 */

// Primary OpenAI client
export const openai = new OpenAI({
  baseURL: env.LLM_BASE_URL,
  apiKey: env.LLM_API_KEY,
  timeout: 30000, // 30 seconds
  maxRetries: 3,
});

// OpenRouter fallback client (same API interface)
export const openaiRouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: env.LLM_API_KEY,
  timeout: 30000,
  maxRetries: 2,
});

/**
 * Model configurations based on research recommendations
 */
export const MODEL_CONFIG = {
  // Primary models for content generation
  content: {
    primary: 'gpt-4o-realtime',
    fallback: 'gpt-4o-mini',
  },
  // For embeddings and vector search
  embeddings: {
    primary: 'text-embedding-3-small',
    fallback: 'text-embedding-ada-002',
  },
  // For content moderation
  moderation: {
    primary: 'text-moderation-stable',
  },
  // For function calling and structured outputs
  functions: {
    primary: 'gpt-4o',
    fallback: 'gpt-4o-mini',
  },
} as const;

/**
 * Client wrapper with automatic fallback
 */
export class LLMClient {
  private primaryClient: OpenAI;
  private fallbackClient: OpenAI;
  private usesFallback = false;

  constructor() {
    this.primaryClient = openai;
    this.fallbackClient = openaiRouter;
  }

  /**
   * Generate chat completion with automatic fallback
   */
  async generateCompletion(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParams
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    try {
      // Try primary client first
      return await this.primaryClient.chat.completions.create(params);
    } catch (error) {
      console.warn('Primary LLM client failed, falling back to OpenRouter:', error);
      this.usesFallback = true;
      
      // Adjust model for OpenRouter compatibility
      const fallbackParams = {
        ...params,
        model: this.mapToFallbackModel(params.model),
      };
      
      return await this.fallbackClient.chat.completions.create(fallbackParams);
    }
  }

  /**
   * Generate streaming completion with automatic fallback
   */
  async generateStreamingCompletion(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParams
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    const streamParams = { ...params, stream: true as const };
    
    try {
      return await this.primaryClient.chat.completions.create(streamParams);
    } catch (error) {
      console.warn('Primary LLM streaming failed, falling back to OpenRouter:', error);
      this.usesFallback = true;
      
      const fallbackParams = {
        ...streamParams,
        model: this.mapToFallbackModel(params.model),
      };
      
      return await this.fallbackClient.chat.completions.create(fallbackParams);
    }
  }

  /**
   * Generate embeddings with automatic fallback
   */
  async generateEmbedding(
    input: string | string[],
    model = MODEL_CONFIG.embeddings.primary
  ): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
    try {
      return await this.primaryClient.embeddings.create({
        input,
        model,
      });
    } catch (error) {
      console.warn('Primary embedding generation failed, falling back:', error);
      this.usesFallback = true;
      
      return await this.fallbackClient.embeddings.create({
        input,
        model: MODEL_CONFIG.embeddings.fallback,
      });
    }
  }

  /**
   * Content moderation using OpenAI Moderation API
   * Free and highly accurate per research.md
   */
  async moderateContent(
    input: string
  ): Promise<OpenAI.Moderations.ModerationCreateResponse> {
    // Moderation only available through OpenAI, no fallback
    return await this.primaryClient.moderations.create({
      input,
      model: MODEL_CONFIG.moderation.primary,
    });
  }

  /**
   * Map primary models to fallback models for OpenRouter
   */
  private mapToFallbackModel(model: string): string {
    const modelMap: Record<string, string> = {
      'gpt-4o-realtime': 'openai/gpt-4o',
      'gpt-4o': 'openai/gpt-4o',
      'gpt-4o-mini': 'openai/gpt-4o-mini',
      'text-embedding-3-small': 'openai/text-embedding-3-small',
    };

    return modelMap[model] || model;
  }

  /**
   * Check if currently using fallback client
   */
  isUsingFallback(): boolean {
    return this.usesFallback;
  }

  /**
   * Reset fallback status
   */
  resetFallbackStatus(): void {
    this.usesFallback = false;
  }

  /**
   * Health check for both clients
   */
  async healthCheck(): Promise<{
    primary: boolean;
    fallback: boolean;
    latency: { primary?: number; fallback?: number };
  }> {
    const result = {
      primary: false,
      fallback: false,
      latency: {} as { primary?: number; fallback?: number },
    };

    // Test primary client
    try {
      const start = Date.now();
      await this.primaryClient.chat.completions.create({
        model: MODEL_CONFIG.functions.primary,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      });
      result.primary = true;
      result.latency.primary = Date.now() - start;
    } catch (error) {
      console.warn('Primary client health check failed:', error);
    }

    // Test fallback client
    try {
      const start = Date.now();
      await this.fallbackClient.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      });
      result.fallback = true;
      result.latency.fallback = Date.now() - start;
    } catch (error) {
      console.warn('Fallback client health check failed:', error);
    }

    return result;
  }
}

// Export singleton instance
export const llmClient = new LLMClient();

// Export convenience functions
export const generateCompletion = llmClient.generateCompletion.bind(llmClient);
export const generateStreamingCompletion = llmClient.generateStreamingCompletion.bind(llmClient);
export const generateEmbedding = llmClient.generateEmbedding.bind(llmClient);
export const moderateContent = llmClient.moderateContent.bind(llmClient);