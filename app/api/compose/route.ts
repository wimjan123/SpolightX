import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { AIContentGenerator } from '@/lib/ai-generation/generator'
import { ContentSafetyModeration } from '@/lib/safety/moderation'

// Request validation schema
const ComposeRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(500, 'Prompt too long'),
  persona: z.string().uuid().optional(),
  toneSettings: z.object({
    creativity: z.number().min(0).max(1).optional(),
    formality: z.number().min(0).max(1).optional(),
    humor: z.number().min(0).max(1).optional(),
    controversy: z.number().min(0).max(1).optional(),
  }).optional(),
  maxLength: z.number().min(10).max(2000).default(280),
  temperature: z.number().min(0).max(2).default(0.7),
  streamResponse: z.boolean().default(true),
})

/**
 * POST /api/compose - Real-time AI content generation with SSE streaming
 * 
 * Generates social media content using AI with real-time streaming response.
 * Supports persona-based generation and custom tone settings.
 * 
 * Request Body:
 * - prompt: Content prompt or topic
 * - persona?: UUID of persona to generate content for
 * - toneSettings?: Tone configuration object
 * - maxLength?: Maximum content length (default: 280)
 * - temperature?: AI temperature setting (default: 0.7)
 * - streamResponse?: Enable streaming response (default: true)
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth()
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = ComposeRequestSchema.parse(body)

    // Content safety moderation on prompt
    const moderationResult = await ContentSafetyModeration.moderateContent(
      validatedData.prompt,
      {
        userId: session.user.id,
        contentType: 'PROMPT',
      }
    )

    if (moderationResult.action === 'BLOCK') {
      return new Response(
        JSON.stringify({ 
          error: 'Prompt blocked by content moderation',
          reason: moderationResult.reason,
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // If streaming is disabled, generate and return complete response
    if (!validatedData.streamResponse) {
      const content = await AIContentGenerator.generateContent({
        prompt: validatedData.prompt,
        personaId: validatedData.persona,
        toneSettings: validatedData.toneSettings,
        maxLength: validatedData.maxLength,
        temperature: validatedData.temperature,
        userId: session.user.id,
      })

      // Moderate the generated content
      const contentModeration = await ContentSafetyModeration.moderateContent(
        content.text,
        {
          userId: session.user.id,
          contentType: 'GENERATED_CONTENT',
        }
      )

      if (contentModeration.action === 'BLOCK') {
        return new Response(
          JSON.stringify({ 
            error: 'Generated content blocked by moderation',
            reason: contentModeration.reason,
          }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          content: content.text,
          metadata: {
            generatedAt: new Date().toISOString(),
            tokensUsed: content.tokensUsed,
            model: content.model,
            persona: validatedData.persona,
            toneSettings: validatedData.toneSettings,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Set up Server-Sent Events streaming
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial connection confirmation
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: 'connected',
              message: 'Content generation started',
              timestamp: new Date().toISOString(),
            })}\n\n`)
          )

          // Generate content with streaming
          await AIContentGenerator.generateContentStream({
            prompt: validatedData.prompt,
            personaId: validatedData.persona,
            toneSettings: validatedData.toneSettings,
            maxLength: validatedData.maxLength,
            temperature: validatedData.temperature,
            userId: session.user.id,
            onToken: (token: string) => {
              // Stream each token as it's generated
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'token',
                  content: token,
                  timestamp: new Date().toISOString(),
                })}\n\n`)
              )
            },
            onProgress: (progress: { completed: number; total: number; stage: string }) => {
              // Stream progress updates
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'progress',
                  ...progress,
                  timestamp: new Date().toISOString(),
                })}\n\n`)
              )
            },
            onComplete: async (result: { 
              text: string; 
              tokensUsed: number; 
              model: string;
            }) => {
              // Final moderation check on complete content
              const contentModeration = await ContentSafetyModeration.moderateContent(
                result.text,
                {
                  userId: session.user.id,
                  contentType: 'GENERATED_CONTENT',
                }
              )

              if (contentModeration.action === 'BLOCK') {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'error',
                    error: 'Generated content blocked by moderation',
                    reason: contentModeration.reason,
                    timestamp: new Date().toISOString(),
                  })}\n\n`)
                )
              } else {
                // Stream completion event
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'complete',
                    content: result.text,
                    metadata: {
                      tokensUsed: result.tokensUsed,
                      model: result.model,
                      persona: validatedData.persona,
                      toneSettings: validatedData.toneSettings,
                      moderationPassed: true,
                    },
                    timestamp: new Date().toISOString(),
                  })}\n\n`)
                )
              }

              // Close the stream
              controller.close()
            },
            onError: (error: Error) => {
              // Stream error event
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  error: error.message,
                  timestamp: new Date().toISOString(),
                })}\n\n`)
              )
              controller.close()
            },
          })

        } catch (error) {
          console.error('Streaming error:', error)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              timestamp: new Date().toISOString(),
            })}\n\n`)
          )
          controller.close()
        }
      },
      cancel() {
        // Handle client disconnect
        console.log('Client disconnected from compose stream')
      },
    })

    // Return streaming response with proper SSE headers
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })

  } catch (error) {
    console.error('Compose API error:', error)
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Validation error',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

/**
 * OPTIONS /api/compose - CORS preflight handler
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

/**
 * GET /api/compose - Endpoint information and testing
 * Returns API documentation and examples for development
 */
export async function GET() {
  return new Response(
    JSON.stringify({
      endpoint: '/api/compose',
      description: 'Real-time AI content generation with SSE streaming',
      methods: ['POST'],
      authentication: 'Required (session)',
      parameters: {
        prompt: 'string (required) - Content prompt or topic',
        persona: 'string (optional) - UUID of persona to generate for',
        toneSettings: 'object (optional) - Tone configuration',
        maxLength: 'number (optional, default: 280) - Maximum content length',
        temperature: 'number (optional, default: 0.7) - AI temperature',
        streamResponse: 'boolean (optional, default: true) - Enable streaming',
      },
      examples: {
        basic: {
          prompt: 'Write a tweet about artificial intelligence',
          streamResponse: true,
        },
        withPersona: {
          prompt: 'Share thoughts on the latest tech trends',
          persona: 'persona-uuid-here',
          toneSettings: {
            creativity: 0.8,
            formality: 0.3,
            humor: 0.6,
          },
        },
      },
      streamingFormat: {
        connected: '{ type: "connected", message: "...", timestamp: "..." }',
        token: '{ type: "token", content: "...", timestamp: "..." }',
        progress: '{ type: "progress", completed: N, total: N, stage: "...", timestamp: "..." }',
        complete: '{ type: "complete", content: "...", metadata: {...}, timestamp: "..." }',
        error: '{ type: "error", error: "...", timestamp: "..." }',
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}