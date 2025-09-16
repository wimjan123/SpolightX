/**
 * Main content generation logic
 * Orchestrates all AI generation components
 */

import { llmClient } from './client';
import {
  generatePersonaPrompt,
  generateTonePrompt,
  generateTrendingTopicPrompt,
  generateReplyPrompt,
  generateQuotePrompt,
  generateContextPrompt,
  CONTENT_SAFETY_PROMPT,
  type PersonaTraits,
  type ToneSettings,
} from './prompts';
import {
  validateToneParameters,
  blendToneWithPersonality,
  adjustToneForContext,
  generateToneDescriptors,
  type ToneParameters,
  type PersonalityProfile,
} from './tone-processing';
import { streamChatCompletion, type StreamingOptions } from './streaming';
import { moderateContent } from './client';

export interface GenerationRequest {
  type: 'post' | 'reply' | 'quote' | 'dm';
  persona: PersonaTraits;
  toneSettings?: Partial<ToneParameters>;
  context?: {
    originalPost?: {
      content: string;
      author: string;
      isPersona: boolean;
    };
    trendingTopic?: {
      topic: string;
      description?: string;
    };
    conversationHistory?: Array<{
      author: string;
      content: string;
      timestamp: Date;
    }>;
    prompt?: string;
  };
  streaming?: boolean;
  maxLength?: number;
}

export interface GenerationResult {
  content: string;
  moderation: {
    flagged: boolean;
    categories: string[];
    score: number;
  };
  metadata: {
    model: string;
    tokensUsed: number;
    generationTime: number;
    toneApplied: ToneParameters;
    warnings: string[];
  };
}

export interface StreamingGenerationResult {
  stream: AsyncGenerator<string, void, unknown>;
  metadata: Omit<GenerationResult['metadata'], 'tokensUsed' | 'generationTime'>;
  onComplete: (result: Pick<GenerationResult, 'moderation' | 'metadata'>) => void;
}

/**
 * Main content generation function
 */
export async function generateContent(
  request: GenerationRequest
): Promise<GenerationResult> {
  const startTime = Date.now();
  
  try {
    // Validate and process tone settings
    const baseTone = validateToneParameters(request.toneSettings || {});
    const personalityProfile = mapPersonaToProfile(request.persona);
    const blendedTone = blendToneWithPersonality(baseTone, personalityProfile);
    
    // Adjust tone for context
    const finalTone = adjustToneForContext(blendedTone, {
      topic: request.context?.trendingTopic?.topic,
      isReply: request.type === 'reply',
      originalTone: request.context?.originalPost ? undefined : undefined, // TODO: analyze original post tone
    });

    // Generate tone descriptors and warnings
    const toneDescriptors = generateToneDescriptors(finalTone);
    
    // Build system prompt
    const systemPrompt = buildSystemPrompt(request, finalTone, toneDescriptors);
    
    // Build user prompt
    const userPrompt = buildUserPrompt(request);
    
    // Generate content
    const completion = await llmClient.generateCompletion({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: request.maxLength || 300,
      temperature: calculateTemperature(finalTone),
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
    });

    const content = completion.choices[0]?.message?.content || '';
    
    // Content moderation
    const moderation = await moderateContent(content);
    const moderationResult = {
      flagged: moderation.flagged,
      categories: moderation.categories
        ? Object.entries(moderation.categories)
            .filter(([_, flagged]) => flagged)
            .map(([category]) => category)
        : [],
      score: moderation.category_scores
        ? Math.max(...Object.values(moderation.category_scores))
        : 0,
    };

    const generationTime = Date.now() - startTime;
    
    return {
      content,
      moderation: moderationResult,
      metadata: {
        model: 'gpt-4o',
        tokensUsed: completion.usage?.total_tokens || 0,
        generationTime,
        toneApplied: finalTone,
        warnings: toneDescriptors.warnings,
      },
    };
    
  } catch (error) {
    throw new Error(`Content generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Streaming content generation
 */
export async function generateStreamingContent(
  request: GenerationRequest,
  streamingOptions: StreamingOptions = {}
): Promise<StreamingGenerationResult> {
  // Process tone and build prompts (same as non-streaming)
  const baseTone = validateToneParameters(request.toneSettings || {});
  const personalityProfile = mapPersonaToProfile(request.persona);
  const blendedTone = blendToneWithPersonality(baseTone, personalityProfile);
  const finalTone = adjustToneForContext(blendedTone, {
    topic: request.context?.trendingTopic?.topic,
    isReply: request.type === 'reply',
  });

  const toneDescriptors = generateToneDescriptors(finalTone);
  const systemPrompt = buildSystemPrompt(request, finalTone, toneDescriptors);
  const userPrompt = buildUserPrompt(request);

  let fullContent = '';
  let tokensUsed = 0;
  const startTime = Date.now();

  // Create streaming generator
  const stream = streamChatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    'gpt-4o',
    llmClient.primaryClient,
    {
      ...streamingOptions,
      onToken: (token) => {
        fullContent += token;
        tokensUsed += 1; // Rough estimate
        streamingOptions.onToken?.(token);
      },
    }
  );

  const onComplete = async (result: Pick<GenerationResult, 'moderation' | 'metadata'>) => {
    // Moderate the complete content
    try {
      const moderation = await moderateContent(fullContent);
      const moderationResult = {
        flagged: moderation.flagged,
        categories: moderation.categories
          ? Object.entries(moderation.categories)
              .filter(([_, flagged]) => flagged)
              .map(([category]) => category)
          : [],
        score: moderation.category_scores
          ? Math.max(...Object.values(moderation.category_scores))
          : 0,
      };

      const generationTime = Date.now() - startTime;
      
      const completeResult = {
        moderation: moderationResult,
        metadata: {
          model: 'gpt-4o',
          tokensUsed,
          generationTime,
          toneApplied: finalTone,
          warnings: toneDescriptors.warnings,
        },
      };
      
      // Call the provided completion handler
      streamingOptions.onComplete?.(fullContent);
      
      // Return the result via the onComplete callback
      result.moderation = completeResult.moderation;
      result.metadata = completeResult.metadata;
      
    } catch (error) {
      console.error('Error in streaming completion:', error);
    }
  };

  return {
    stream,
    metadata: {
      model: 'gpt-4o',
      toneApplied: finalTone,
      warnings: toneDescriptors.warnings,
    },
    onComplete,
  };
}

/**
 * Build system prompt for generation
 */
function buildSystemPrompt(
  request: GenerationRequest,
  tone: ToneParameters,
  toneDescriptors: { overall: string; specific: string[]; warnings: string[] }
): string {
  let prompt = generatePersonaPrompt(request.persona);
  
  // Add tone instructions
  prompt += generateTonePrompt(tone);
  
  // Add content safety
  prompt += '\n\n' + CONTENT_SAFETY_PROMPT;
  
  // Add specific instructions for content type
  switch (request.type) {
    case 'post':
      prompt += '\n\nGenerate an original social media post that reflects your persona and the specified tone.';
      break;
    case 'reply':
      prompt += '\n\nGenerate a thoughtful reply that engages with the original post while maintaining your persona.';
      break;
    case 'quote':
      prompt += '\n\nGenerate commentary for reposting the content. Add your unique perspective or insight.';
      break;
    case 'dm':
      prompt += '\n\nGenerate a direct message response that feels personal and conversational.';
      break;
  }
  
  return prompt;
}

/**
 * Build user prompt based on request context
 */
function buildUserPrompt(request: GenerationRequest): string {
  const { context, type } = request;
  
  if (type === 'reply' && context?.originalPost) {
    return generateReplyPrompt(
      context.originalPost.content,
      context.originalPost.author,
      context.originalPost.isPersona
    );
  }
  
  if (type === 'quote' && context?.originalPost) {
    return generateQuotePrompt(
      context.originalPost.content,
      context.originalPost.author
    );
  }
  
  if (context?.trendingTopic) {
    return generateTrendingTopicPrompt(
      context.trendingTopic.topic,
      context.trendingTopic.description
    );
  }
  
  if (context?.conversationHistory) {
    return generateContextPrompt(context.conversationHistory);
  }
  
  if (context?.prompt) {
    return context.prompt;
  }
  
  // Default: generate original content
  return 'Generate an engaging social media post that reflects your personality and interests. Consider current events, your expertise, or something your followers would find interesting.';
}

/**
 * Map persona traits to personality profile for tone processing
 */
function mapPersonaToProfile(persona: PersonaTraits): PersonalityProfile {
  return {
    baseHumor: persona.personality.humor,
    baseFormality: persona.personality.formality,
    baseRiskiness: Math.max(0, Math.min(1, persona.personality.aggressiveness * 0.8)), // Map aggressiveness to riskiness
    baseNovelty: 0.5, // Default, could be enhanced with more persona data
    baseSnark: Math.max(0, Math.min(1, persona.personality.aggressiveness * 0.6)), // Map aggressiveness to snark
    traits: persona.personality.traits,
    archetype: persona.archetype,
  };
}

/**
 * Calculate temperature based on tone settings
 */
function calculateTemperature(tone: ToneParameters): number {
  // Higher novelty and humor increase temperature (more creative)
  // Higher formality decreases temperature (more predictable)
  const creativityScore = (tone.novelty + tone.humor) / 2;
  const stabilityScore = tone.formality;
  
  // Base temperature around 0.7, adjust based on tone
  const temperature = 0.7 + (creativityScore * 0.3) - (stabilityScore * 0.2);
  
  return Math.max(0.1, Math.min(1.0, temperature));
}

/**
 * Batch generation for multiple requests
 */
export async function generateBatchContent(
  requests: GenerationRequest[]
): Promise<GenerationResult[]> {
  const results = await Promise.allSettled(
    requests.map(request => generateContent(request))
  );
  
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(`Batch generation failed for request ${index}:`, result.reason);
      // Return a fallback result
      return {
        content: 'Content generation failed. Please try again.',
        moderation: { flagged: false, categories: [], score: 0 },
        metadata: {
          model: 'error',
          tokensUsed: 0,
          generationTime: 0,
          toneApplied: validateToneParameters({}),
          warnings: ['Generation failed'],
        },
      };
    }
  });
}

/**
 * Validate generated content meets basic requirements
 */
export function validateGeneratedContent(
  content: string,
  requirements: {
    maxLength?: number;
    minLength?: number;
    requiresHashtags?: boolean;
    bannedWords?: string[];
  } = {}
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (requirements.maxLength && content.length > requirements.maxLength) {
    issues.push(`Content too long: ${content.length} > ${requirements.maxLength}`);
  }
  
  if (requirements.minLength && content.length < requirements.minLength) {
    issues.push(`Content too short: ${content.length} < ${requirements.minLength}`);
  }
  
  if (requirements.requiresHashtags && !content.includes('#')) {
    issues.push('Content missing required hashtags');
  }
  
  if (requirements.bannedWords) {
    const foundBanned = requirements.bannedWords.filter(word => 
      content.toLowerCase().includes(word.toLowerCase())
    );
    if (foundBanned.length > 0) {
      issues.push(`Content contains banned words: ${foundBanned.join(', ')}`);
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}