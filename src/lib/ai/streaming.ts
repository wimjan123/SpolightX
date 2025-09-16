/**
 * Server-Sent Events (SSE) streaming setup for real-time content generation
 * Based on research.md recommendation of SSE over WebSockets for one-way streaming
 */

import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export interface StreamingOptions {
  onToken?: (token: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
  abortSignal?: AbortSignal;
}

/**
 * Create a streaming response for SSE
 */
export function createStreamingResponse(
  generator: AsyncIterable<string>
): Response {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
        
        // Send completion signal
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        // Send error and close
        const errorData = `data: ${JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        })}\n\n`;
        controller.enqueue(encoder.encode(errorData));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * Stream OpenAI completion chunks
 */
export async function* streamOpenAICompletion(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  options: StreamingOptions = {}
): AsyncGenerator<string, void, unknown> {
  let fullContent = '';
  
  try {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      
      if (content) {
        fullContent += content;
        options.onToken?.(content);
        yield content;
      }
      
      // Check for completion
      if (chunk.choices[0]?.finish_reason === 'stop') {
        options.onComplete?.(fullContent);
        break;
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Streaming error');
    options.onError?.(err);
    throw err;
  }
}

/**
 * Create a streaming chat completion
 */
export async function* streamChatCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string,
  client: OpenAI,
  options: StreamingOptions = {}
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
      max_tokens: 1000,
      temperature: 0.7,
    });

    yield* streamOpenAICompletion(stream, options);
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Failed to create stream');
    options.onError?.(err);
    throw err;
  }
}

/**
 * Stream with timeout and cancellation support
 */
export async function* streamWithTimeout(
  generator: AsyncGenerator<string, void, unknown>,
  timeoutMs: number = 30000,
  abortSignal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Stream timeout')), timeoutMs)
  );

  const abortPromise = new Promise<never>((_, reject) => {
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => 
        reject(new Error('Stream aborted'))
      );
    }
  });

  try {
    while (true) {
      const { value, done } = await Promise.race([
        generator.next(),
        timeoutPromise,
        ...(abortSignal ? [abortPromise] : []),
      ]);

      if (done) break;
      yield value;
    }
  } catch (error) {
    await generator.return?.();
    throw error;
  }
}

/**
 * Parse SSE events on the client side
 */
export class SSEParser {
  private buffer = '';

  parseChunk(chunk: string): Array<{ type: string; data: any }> {
    this.buffer += chunk;
    const events: Array<{ type: string; data: any }> = [];
    
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        
        if (data === '[DONE]') {
          events.push({ type: 'complete', data: null });
        } else {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              events.push({ type: 'error', data: parsed.error });
            } else if (parsed.content) {
              events.push({ type: 'token', data: parsed.content });
            }
          } catch {
            // Invalid JSON, ignore
          }
        }
      }
    }
    
    return events;
  }

  reset(): void {
    this.buffer = '';
  }
}

/**
 * Client-side streaming utilities
 */
export class StreamingClient {
  private abortController: AbortController | null = null;

  async streamContent(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      onToken?: (token: string) => void;
      onError?: (error: string) => void;
      onComplete?: () => void;
    } = {}
  ): Promise<void> {
    this.abortController = new AbortController();
    const parser = new SSEParser();

    try {
      const response = await fetch(url, {
        method: options.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: options.body,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = parser.parseChunk(chunk);

        for (const event of events) {
          switch (event.type) {
            case 'token':
              options.onToken?.(event.data);
              break;
            case 'error':
              options.onError?.(event.data);
              return;
            case 'complete':
              options.onComplete?.();
              return;
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Stream was cancelled, this is expected
        return;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      options.onError?.(message);
    }
  }

  cancelStream(): void {
    this.abortController?.abort();
  }
}

/**
 * Utility to convert async generator to Node.js readable stream
 */
export function generatorToNodeStream(
  generator: AsyncGenerator<string, void, unknown>
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}