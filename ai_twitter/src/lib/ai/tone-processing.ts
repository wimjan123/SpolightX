/**
 * Tone parameter handling and processing
 * Implements the tone control system described in spec.md
 */

export interface ToneParameters {
  humor: number; // 0-1, 0 = serious, 1 = very funny
  formality: number; // 0-1, 0 = casual, 1 = formal  
  riskiness: number; // 0-1, 0 = safe, 1 = edgy
  novelty: number; // 0-1, 0 = conventional, 1 = unique
  snark: number; // 0-1, 0 = straightforward, 1 = sarcastic
}

export interface PersonalityProfile {
  baseHumor: number;
  baseFormality: number;
  baseRiskiness: number;
  baseNovelty: number;
  baseSnark: number;
  traits: string[];
  archetype: string;
}

/**
 * Default tone settings for different contexts
 */
export const DEFAULT_TONES = {
  conservative: {
    humor: 0.2,
    formality: 0.8,
    riskiness: 0.1,
    novelty: 0.3,
    snark: 0.1,
  },
  balanced: {
    humor: 0.5,
    formality: 0.5,
    riskiness: 0.3,
    novelty: 0.5,
    snark: 0.3,
  },
  edgy: {
    humor: 0.8,
    formality: 0.2,
    riskiness: 0.7,
    novelty: 0.8,
    snark: 0.7,
  },
  professional: {
    humor: 0.3,
    formality: 0.9,
    riskiness: 0.1,
    novelty: 0.4,
    snark: 0.1,
  },
  casual: {
    humor: 0.7,
    formality: 0.2,
    riskiness: 0.4,
    novelty: 0.6,
    snark: 0.5,
  },
} as const;

/**
 * Validate tone parameters
 */
export function validateToneParameters(tone: Partial<ToneParameters>): ToneParameters {
  const clamp = (value: number | undefined, fallback: number) => 
    Math.max(0, Math.min(1, value ?? fallback));

  return {
    humor: clamp(tone.humor, 0.5),
    formality: clamp(tone.formality, 0.5),
    riskiness: clamp(tone.riskiness, 0.3),
    novelty: clamp(tone.novelty, 0.5),
    snark: clamp(tone.snark, 0.3),
  };
}

/**
 * Combine user tone preferences with persona base personality
 */
export function blendToneWithPersonality(
  userTone: ToneParameters,
  personality: PersonalityProfile,
  blendFactor = 0.7 // How much to favor user tone vs personality
): ToneParameters {
  return {
    humor: (userTone.humor * blendFactor) + (personality.baseHumor * (1 - blendFactor)),
    formality: (userTone.formality * blendFactor) + (personality.baseFormality * (1 - blendFactor)),
    riskiness: (userTone.riskiness * blendFactor) + (personality.baseRiskiness * (1 - blendFactor)),
    novelty: (userTone.novelty * blendFactor) + (personality.baseNovelty * (1 - blendFactor)),
    snark: (userTone.snark * blendFactor) + (personality.baseSnark * (1 - blendFactor)),
  };
}

/**
 * Analyze content to extract implicit tone
 */
export function analyzeToneFromContent(content: string): Partial<ToneParameters> {
  const text = content.toLowerCase();
  const words = text.split(/\s+/);
  const wordCount = words.length;

  // Humor indicators
  const humorKeywords = ['lol', 'haha', 'funny', 'joke', 'hilarious', '😂', '😄', '😆'];
  const humorScore = humorKeywords.filter(word => text.includes(word)).length / wordCount;

  // Formality indicators
  const formalWords = ['however', 'therefore', 'furthermore', 'consequently', 'nevertheless'];
  const casualWords = ['yeah', 'gonna', 'wanna', 'kinda', 'sorta', 'like', 'totally'];
  const formalScore = formalWords.filter(word => text.includes(word)).length / wordCount;
  const casualScore = casualWords.filter(word => text.includes(word)).length / wordCount;

  // Riskiness indicators
  const riskyKeywords = ['controversial', 'unpopular', 'bold', 'dare', 'provocative'];
  const safeKeywords = ['safe', 'careful', 'traditional', 'conservative'];
  const riskyScore = riskyKeywords.filter(word => text.includes(word)).length / wordCount;
  const safeScore = safeKeywords.filter(word => text.includes(word)).length / wordCount;

  // Snark indicators
  const snarkKeywords = ['obviously', 'clearly', 'sure', 'right', 'brilliant', 'genius'];
  const snarkPunctuation = (text.match(/[!]{2,}|[?]{2,}/g) || []).length;
  const snarkScore = (snarkKeywords.filter(word => text.includes(word)).length + snarkPunctuation) / wordCount;

  return {
    humor: Math.min(1, humorScore * 10),
    formality: Math.max(0, Math.min(1, (formalScore * 10) - (casualScore * 5) + 0.5)),
    riskiness: Math.max(0, Math.min(1, (riskyScore * 10) - (safeScore * 5) + 0.3)),
    snark: Math.min(1, snarkScore * 8),
  };
}

/**
 * Generate tone descriptors for prompt engineering
 */
export function generateToneDescriptors(tone: ToneParameters): {
  overall: string;
  specific: string[];
  warnings: string[];
} {
  const specific: string[] = [];
  const warnings: string[] = [];

  // Humor descriptors
  if (tone.humor < 0.2) {
    specific.push('serious and straightforward');
  } else if (tone.humor < 0.4) {
    specific.push('occasionally lighthearted');
  } else if (tone.humor < 0.6) {
    specific.push('moderately humorous');
  } else if (tone.humor < 0.8) {
    specific.push('quite funny and witty');
  } else {
    specific.push('very humorous and entertaining');
  }

  // Formality descriptors
  if (tone.formality < 0.2) {
    specific.push('very casual and informal');
  } else if (tone.formality < 0.4) {
    specific.push('conversational');
  } else if (tone.formality < 0.6) {
    specific.push('balanced between casual and formal');
  } else if (tone.formality < 0.8) {
    specific.push('professional and polished');
  } else {
    specific.push('very formal and sophisticated');
  }

  // Riskiness descriptors
  if (tone.riskiness < 0.2) {
    specific.push('very safe and non-controversial');
  } else if (tone.riskiness < 0.4) {
    specific.push('mildly opinionated');
  } else if (tone.riskiness < 0.6) {
    specific.push('moderately bold in opinions');
  } else if (tone.riskiness < 0.8) {
    specific.push('quite provocative and edgy');
    warnings.push('Monitor for potentially controversial content');
  } else {
    specific.push('very provocative and boundary-pushing');
    warnings.push('High risk of controversial content - review carefully');
  }

  // Novelty descriptors
  if (tone.novelty < 0.2) {
    specific.push('conventional and mainstream');
  } else if (tone.novelty < 0.4) {
    specific.push('mostly conventional with some unique angles');
  } else if (tone.novelty < 0.6) {
    specific.push('balanced between conventional and creative');
  } else if (tone.novelty < 0.8) {
    specific.push('quite creative and original');
  } else {
    specific.push('very unconventional and innovative');
  }

  // Snark descriptors
  if (tone.snark > 0.6) {
    specific.push('sarcastic and sharp-tongued');
    if (tone.snark > 0.8) {
      warnings.push('High snark level - may come across as mean');
    }
  } else if (tone.snark > 0.3) {
    specific.push('occasionally sarcastic');
  }

  // Overall tone assessment
  let overall: string;
  if (tone.humor > 0.6 && tone.riskiness > 0.6) {
    overall = 'edgy comedian';
  } else if (tone.formality > 0.7 && tone.riskiness < 0.3) {
    overall = 'professional and cautious';
  } else if (tone.novelty > 0.7 && tone.humor > 0.5) {
    overall = 'creative and entertaining';
  } else if (tone.snark > 0.6 && tone.riskiness > 0.5) {
    overall = 'sarcastic provocateur';
  } else if (tone.formality < 0.3 && tone.humor > 0.5) {
    overall = 'casual and friendly';
  } else {
    overall = 'balanced and moderate';
  }

  return { overall, specific, warnings };
}

/**
 * Adjust tone based on context (topic, audience, etc.)
 */
export function adjustToneForContext(
  baseTone: ToneParameters,
  context: {
    topic?: string;
    isReply?: boolean;
    originalTone?: Partial<ToneParameters>;
    timeOfDay?: number; // 0-23
    hasHashtags?: boolean;
  }
): ToneParameters {
  let adjusted = { ...baseTone };

  // Adjust for topic sensitivity
  if (context.topic) {
    const sensitiveTopics = ['politics', 'religion', 'tragedy', 'health', 'finance'];
    const isSensitive = sensitiveTopics.some(topic => 
      context.topic!.toLowerCase().includes(topic)
    );
    
    if (isSensitive) {
      adjusted.riskiness = Math.max(0, adjusted.riskiness - 0.3);
      adjusted.humor = Math.max(0, adjusted.humor - 0.2);
      adjusted.snark = Math.max(0, adjusted.snark - 0.4);
    }
  }

  // Adjust for replies (generally more conversational)
  if (context.isReply) {
    adjusted.formality = Math.max(0, adjusted.formality - 0.2);
    
    // Match original tone somewhat
    if (context.originalTone) {
      const matchFactor = 0.3;
      adjusted.humor = adjusted.humor * (1 - matchFactor) + (context.originalTone.humor ?? adjusted.humor) * matchFactor;
      adjusted.formality = adjusted.formality * (1 - matchFactor) + (context.originalTone.formality ?? adjusted.formality) * matchFactor;
    }
  }

  // Adjust for time of day
  if (context.timeOfDay !== undefined) {
    // Late night posts can be more casual and edgy
    if (context.timeOfDay >= 22 || context.timeOfDay <= 6) {
      adjusted.formality = Math.max(0, adjusted.formality - 0.1);
      adjusted.riskiness = Math.min(1, adjusted.riskiness + 0.1);
    }
    
    // Business hours posts more professional
    if (context.timeOfDay >= 9 && context.timeOfDay <= 17) {
      adjusted.formality = Math.min(1, adjusted.formality + 0.1);
      adjusted.riskiness = Math.max(0, adjusted.riskiness - 0.1);
    }
  }

  // Adjust for hashtag usage (more social media native)
  if (context.hasHashtags) {
    adjusted.formality = Math.max(0, adjusted.formality - 0.1);
    adjusted.novelty = Math.min(1, adjusted.novelty + 0.1);
  }

  return adjusted;
}

/**
 * Create tone variation for different personas
 */
export function createPersonaToneVariation(
  baseTone: ToneParameters,
  archetype: string
): ToneParameters {
  const variations: Record<string, Partial<ToneParameters>> = {
    'Tech Critic': {
      riskiness: Math.min(1, baseTone.riskiness + 0.2),
      snark: Math.min(1, baseTone.snark + 0.3),
      formality: Math.min(1, baseTone.formality + 0.1),
    },
    'Optimistic Futurist': {
      humor: Math.min(1, baseTone.humor + 0.2),
      novelty: Math.min(1, baseTone.novelty + 0.3),
      riskiness: Math.max(0, baseTone.riskiness - 0.2),
    },
    'News Curator': {
      formality: Math.min(1, baseTone.formality + 0.2),
      riskiness: Math.max(0, baseTone.riskiness - 0.1),
      humor: Math.max(0, baseTone.humor - 0.1),
    },
    'Comedian': {
      humor: Math.min(1, baseTone.humor + 0.4),
      snark: Math.min(1, baseTone.snark + 0.2),
      formality: Math.max(0, baseTone.formality - 0.3),
    },
    'Academic': {
      formality: Math.min(1, baseTone.formality + 0.3),
      novelty: Math.min(1, baseTone.novelty + 0.2),
      humor: Math.max(0, baseTone.humor - 0.2),
    },
  };

  const variation = variations[archetype] || {};
  
  return {
    humor: variation.humor ?? baseTone.humor,
    formality: variation.formality ?? baseTone.formality,
    riskiness: variation.riskiness ?? baseTone.riskiness,
    novelty: variation.novelty ?? baseTone.novelty,
    snark: variation.snark ?? baseTone.snark,
  };
}