/**
 * Personality trait processing and psychological modeling
 * Based on research.md personality psychology frameworks
 */

import { z } from 'zod';

export interface PersonalityTraits {
  // Big Five personality traits (0-1 scale)
  openness: number;        // Open to experience vs conventional
  conscientiousness: number; // Organized vs careless
  extraversion: number;    // Outgoing vs reserved
  agreeableness: number;   // Friendly vs antagonistic
  neuroticism: number;     // Anxious vs calm

  // Additional traits for social media behavior
  humor: number;           // Tendency to use humor
  formality: number;       // Formal vs casual communication
  assertiveness: number;   // Assertive vs passive
  empathy: number;         // Empathetic vs detached
  curiosity: number;       // Curious vs disinterested
  optimism: number;        // Optimistic vs pessimistic
  riskTaking: number;      // Risk-taking vs cautious
  socialNeed: number;      // Need for social interaction
}

export interface PersonalityProfile {
  traits: PersonalityTraits;
  archetype: string;
  communicationStyle: CommunicationStyle;
  behaviorPatterns: BehaviorPatterns;
  emotionalProfile: EmotionalProfile;
  socialProfile: SocialProfile;
  contentPreferences: ContentPreferences;
}

export interface CommunicationStyle {
  verbosity: number;       // Talkative vs concise (0-1)
  complexity: number;      // Complex vs simple language (0-1)
  emotionality: number;    // Emotional vs rational (0-1)
  directness: number;      // Direct vs indirect (0-1)
  politeness: number;      // Polite vs blunt (0-1)
  useEmojis: boolean;
  useSlang: boolean;
  preferredLength: 'short' | 'medium' | 'long';
  topicFocus: 'broad' | 'specialized' | 'mixed';
}

export interface BehaviorPatterns {
  postingFrequency: number;     // Posts per day tendency
  replyPropensity: number;      // Likelihood to reply (0-1)
  likePropensity: number;       // Likelihood to like (0-1)
  sharePropensity: number;      // Likelihood to share (0-1)
  initiationTendency: number;   // Tendency to start conversations (0-1)
  controversyAvoidance: number; // Tendency to avoid controversial topics (0-1)
  attentionSeeking: number;     // Desire for attention/engagement (0-1)
  timePreferences: {
    morning: number;    // Activity level in morning (0-1)
    afternoon: number;  // Activity level in afternoon (0-1)
    evening: number;    // Activity level in evening (0-1)
    night: number;      // Activity level at night (0-1)
  };
}

export interface EmotionalProfile {
  baseValence: number;     // Baseline happiness (-1 to 1)
  baseArousal: number;     // Baseline energy level (0-1)
  emotionalStability: number; // Emotional consistency (0-1)
  moodSwings: number;      // Tendency for mood changes (0-1)
  stressResponse: number;  // How stress affects behavior (0-1)
  empathyLevel: number;    // Responsiveness to others' emotions (0-1)
}

export interface SocialProfile {
  socialDrive: number;         // Desire for social interaction (0-1)
  leadershipTendency: number;  // Tendency to lead conversations (0-1)
  conformityLevel: number;     // Tendency to follow social norms (0-1)
  competitiveness: number;     // Competitive vs cooperative (0-1)
  trustingness: number;        // Trusting vs suspicious (0-1)
  socialAnxiety: number;       // Anxiety in social situations (0-1)
  influenceability: number;    // Susceptibility to influence (0-1)
}

export interface ContentPreferences {
  topics: Map<string, number>;      // Topic interests (topic -> strength 0-1)
  contentTypes: {
    informational: number;    // Preference for informative content (0-1)
    entertainment: number;    // Preference for entertaining content (0-1)
    personal: number;         // Preference for personal content (0-1)
    controversial: number;    // Preference for controversial content (0-1)
    trending: number;         // Preference for trending content (0-1)
  };
  interactionStyles: {
    supportive: number;       // Tendency to be supportive (0-1)
    critical: number;         // Tendency to be critical (0-1)
    analytical: number;       // Tendency to analyze (0-1)
    humorous: number;         // Tendency to be humorous (0-1)
  };
}

export interface PersonalityArchetype {
  name: string;
  description: string;
  baseTraits: PersonalityTraits;
  typicalBehaviors: string[];
  contentThemes: string[];
  communicationPatterns: string[];
  riskLevel: number;
}

/**
 * Personality trait validation schema
 */
export const PersonalityTraitsSchema = z.object({
  openness: z.number().min(0).max(1),
  conscientiousness: z.number().min(0).max(1),
  extraversion: z.number().min(0).max(1),
  agreeableness: z.number().min(0).max(1),
  neuroticism: z.number().min(0).max(1),
  humor: z.number().min(0).max(1),
  formality: z.number().min(0).max(1),
  assertiveness: z.number().min(0).max(1),
  empathy: z.number().min(0).max(1),
  curiosity: z.number().min(0).max(1),
  optimism: z.number().min(0).max(1),
  riskTaking: z.number().min(0).max(1),
  socialNeed: z.number().min(0).max(1),
});

/**
 * Personality processing and analysis engine
 */
export class PersonalityProcessor {
  private static readonly ARCHETYPE_WEIGHTS = {
    traits: 0.6,
    behavior: 0.3,
    content: 0.1,
  };

  /**
   * Create comprehensive personality profile from traits
   */
  createPersonalityProfile(
    traits: PersonalityTraits,
    archetype?: string
  ): PersonalityProfile {
    // Validate traits
    const validatedTraits = PersonalityTraitsSchema.parse(traits);
    
    // Determine archetype if not provided
    const finalArchetype = archetype || this.determineArchetype(validatedTraits);
    
    // Generate derived profiles
    const communicationStyle = this.deriveCommunicationStyle(validatedTraits);
    const behaviorPatterns = this.deriveBehaviorPatterns(validatedTraits);
    const emotionalProfile = this.deriveEmotionalProfile(validatedTraits);
    const socialProfile = this.deriveSocialProfile(validatedTraits);
    const contentPreferences = this.deriveContentPreferences(validatedTraits, finalArchetype);
    
    return {
      traits: validatedTraits,
      archetype: finalArchetype,
      communicationStyle,
      behaviorPatterns,
      emotionalProfile,
      socialProfile,
      contentPreferences,
    };
  }

  /**
   * Update personality based on behavioral feedback
   */
  updatePersonalityFromBehavior(
    currentTraits: PersonalityTraits,
    behaviorData: {
      interactions: number;
      positiveResponses: number;
      controversialContent: number;
      averageResponseTime: number;
      topicEngagement: Map<string, number>;
    },
    learningRate: number = 0.1
  ): PersonalityTraits {
    const updated = { ...currentTraits };
    
    // Adjust extraversion based on interaction patterns
    const interactionRatio = behaviorData.interactions / 100; // Normalize
    updated.extraversion = this.adjustTrait(
      updated.extraversion,
      interactionRatio,
      learningRate
    );
    
    // Adjust agreeableness based on positive responses
    const positivityRatio = behaviorData.positiveResponses / Math.max(1, behaviorData.interactions);
    updated.agreeableness = this.adjustTrait(
      updated.agreeableness,
      positivityRatio,
      learningRate
    );
    
    // Adjust risk-taking based on controversial content
    const controversyRatio = behaviorData.controversialContent / Math.max(1, behaviorData.interactions);
    updated.riskTaking = this.adjustTrait(
      updated.riskTaking,
      controversyRatio,
      learningRate
    );
    
    // Adjust conscientiousness based on response time consistency
    const responseConsistency = 1 - Math.min(1, behaviorData.averageResponseTime / 3600); // Normalize to hours
    updated.conscientiousness = this.adjustTrait(
      updated.conscientiousness,
      responseConsistency,
      learningRate * 0.5 // Slower learning for conscientiousness
    );
    
    return updated;
  }

  /**
   * Calculate personality compatibility between two personas
   */
  calculateCompatibility(
    traits1: PersonalityTraits,
    traits2: PersonalityTraits
  ): {
    overall: number;
    dimensions: Map<string, number>;
    complementarity: number;
    similarity: number;
  } {
    const dimensions = new Map<string, number>();
    let totalSimilarity = 0;
    let totalComplementarity = 0;
    
    const traitKeys = Object.keys(traits1) as (keyof PersonalityTraits)[];
    
    for (const key of traitKeys) {
      const diff = Math.abs(traits1[key] - traits2[key]);
      const similarity = 1 - diff; // Higher when traits are similar
      const complementarity = this.calculateComplementarity(key, traits1[key], traits2[key]);
      
      dimensions.set(key, (similarity + complementarity) / 2);
      totalSimilarity += similarity;
      totalComplementarity += complementarity;
    }
    
    const avgSimilarity = totalSimilarity / traitKeys.length;
    const avgComplementarity = totalComplementarity / traitKeys.length;
    const overall = (avgSimilarity * 0.6) + (avgComplementarity * 0.4);
    
    return {
      overall,
      dimensions,
      complementarity: avgComplementarity,
      similarity: avgSimilarity,
    };
  }

  /**
   * Generate personality variation within archetype constraints
   */
  generatePersonalityVariation(
    baseTraits: PersonalityTraits,
    variationLevel: number = 0.1
  ): PersonalityTraits {
    const varied: PersonalityTraits = {} as PersonalityTraits;
    
    for (const [key, value] of Object.entries(baseTraits)) {
      const variation = (Math.random() - 0.5) * 2 * variationLevel;
      varied[key as keyof PersonalityTraits] = Math.max(0, Math.min(1, value + variation));
    }
    
    return varied;
  }

  /**
   * Predict behavior based on personality and context
   */
  predictBehavior(
    profile: PersonalityProfile,
    context: {
      timeOfDay: number; // 0-23
      recentInteractions: number;
      trendingTopics: string[];
      socialPressure: number; // 0-1
      currentMood?: { valence: number; arousal: number };
    }
  ): {
    postProbability: number;
    replyProbability: number;
    likeProbability: number;
    contentType: string;
    expectedTone: { humor: number; formality: number; riskiness: number };
  } {
    const { traits, behaviorPatterns, emotionalProfile } = profile;
    
    // Calculate base probabilities
    let postProb = this.calculatePostProbability(traits, behaviorPatterns, context);
    let replyProb = this.calculateReplyProbability(traits, behaviorPatterns, context);
    let likeProb = this.calculateLikeProbability(traits, behaviorPatterns, context);
    
    // Adjust for current mood if provided
    if (context.currentMood) {
      const moodFactor = (context.currentMood.valence + 1) / 2; // Convert -1,1 to 0,1
      postProb *= (0.5 + moodFactor * 0.5);
      replyProb *= (0.5 + moodFactor * 0.5);
      likeProb *= (0.8 + moodFactor * 0.4);
    }
    
    // Determine content type preference
    const contentType = this.predictContentType(profile, context);
    
    // Calculate expected tone
    const expectedTone = this.calculateExpectedTone(profile, context);
    
    return {
      postProbability: Math.max(0, Math.min(1, postProb)),
      replyProbability: Math.max(0, Math.min(1, replyProb)),
      likeProbability: Math.max(0, Math.min(1, likeProb)),
      contentType,
      expectedTone,
    };
  }

  /**
   * Derive communication style from personality traits
   */
  private deriveCommunicationStyle(traits: PersonalityTraits): CommunicationStyle {
    return {
      verbosity: (traits.extraversion * 0.6) + (traits.openness * 0.4),
      complexity: (traits.openness * 0.7) + (traits.conscientiousness * 0.3),
      emotionality: (traits.neuroticism * 0.5) + ((1 - traits.formality) * 0.5),
      directness: (traits.assertiveness * 0.6) + ((1 - traits.agreeableness) * 0.4),
      politeness: (traits.agreeableness * 0.7) + (traits.formality * 0.3),
      useEmojis: traits.extraversion > 0.6 && traits.formality < 0.6,
      useSlang: traits.extraversion > 0.5 && traits.formality < 0.4,
      preferredLength: this.determinePreferredLength(traits),
      topicFocus: this.determineTopicFocus(traits),
    };
  }

  /**
   * Derive behavior patterns from personality traits
   */
  private deriveBehaviorPatterns(traits: PersonalityTraits): BehaviorPatterns {
    return {
      postingFrequency: (traits.extraversion * 0.5) + (traits.socialNeed * 0.3) + (traits.openness * 0.2),
      replyPropensity: (traits.agreeableness * 0.4) + (traits.extraversion * 0.3) + (traits.socialNeed * 0.3),
      likePropensity: (traits.agreeableness * 0.5) + (traits.empathy * 0.3) + (traits.extraversion * 0.2),
      sharePropensity: (traits.extraversion * 0.4) + (traits.openness * 0.3) + (traits.socialNeed * 0.3),
      initiationTendency: (traits.extraversion * 0.6) + (traits.assertiveness * 0.4),
      controversyAvoidance: (traits.agreeableness * 0.5) + ((1 - traits.riskTaking) * 0.5),
      attentionSeeking: (traits.extraversion * 0.4) + (traits.assertiveness * 0.3) + ((1 - traits.agreeableness) * 0.3),
      timePreferences: {
        morning: traits.conscientiousness * 0.8 + 0.2,
        afternoon: 0.8 + (traits.extraversion * 0.2),
        evening: 0.9 + (traits.socialNeed * 0.1),
        night: (1 - traits.conscientiousness) * 0.6 + traits.openness * 0.4,
      },
    };
  }

  /**
   * Derive emotional profile from personality traits
   */
  private deriveEmotionalProfile(traits: PersonalityTraits): EmotionalProfile {
    return {
      baseValence: (traits.optimism * 2 - 1) + ((1 - traits.neuroticism) * 0.5),
      baseArousal: (traits.extraversion * 0.6) + (traits.openness * 0.4),
      emotionalStability: (1 - traits.neuroticism),
      moodSwings: traits.neuroticism * 0.8,
      stressResponse: traits.neuroticism * 0.7 + (1 - traits.conscientiousness) * 0.3,
      empathyLevel: (traits.empathy * 0.7) + (traits.agreeableness * 0.3),
    };
  }

  /**
   * Derive social profile from personality traits
   */
  private deriveSocialProfile(traits: PersonalityTraits): SocialProfile {
    return {
      socialDrive: (traits.extraversion * 0.6) + (traits.socialNeed * 0.4),
      leadershipTendency: (traits.extraversion * 0.4) + (traits.assertiveness * 0.6),
      conformityLevel: (traits.agreeableness * 0.5) + (traits.conscientiousness * 0.3) + ((1 - traits.openness) * 0.2),
      competitiveness: (traits.assertiveness * 0.6) + ((1 - traits.agreeableness) * 0.4),
      trustingness: (traits.agreeableness * 0.6) + ((1 - traits.neuroticism) * 0.4),
      socialAnxiety: (traits.neuroticism * 0.7) + ((1 - traits.extraversion) * 0.3),
      influenceability: (traits.agreeableness * 0.4) + ((1 - traits.assertiveness) * 0.6),
    };
  }

  /**
   * Derive content preferences from personality traits and archetype
   */
  private deriveContentPreferences(traits: PersonalityTraits, archetype: string): ContentPreferences {
    const topics = new Map<string, number>();
    
    // Base topic interests from personality
    if (traits.openness > 0.6) {
      topics.set('science', 0.7);
      topics.set('technology', 0.6);
      topics.set('arts', 0.8);
    }
    
    if (traits.extraversion > 0.6) {
      topics.set('social', 0.8);
      topics.set('entertainment', 0.7);
    }
    
    if (traits.conscientiousness > 0.6) {
      topics.set('business', 0.6);
      topics.set('productivity', 0.7);
    }
    
    return {
      topics,
      contentTypes: {
        informational: (traits.openness * 0.6) + (traits.curiosity * 0.4),
        entertainment: (traits.extraversion * 0.5) + (traits.humor * 0.5),
        personal: (traits.extraversion * 0.4) + (traits.empathy * 0.6),
        controversial: (traits.riskTaking * 0.7) + ((1 - traits.agreeableness) * 0.3),
        trending: (traits.extraversion * 0.5) + (traits.socialNeed * 0.5),
      },
      interactionStyles: {
        supportive: (traits.agreeableness * 0.6) + (traits.empathy * 0.4),
        critical: ((1 - traits.agreeableness) * 0.5) + (traits.assertiveness * 0.5),
        analytical: (traits.openness * 0.5) + (traits.conscientiousness * 0.5),
        humorous: (traits.humor * 0.8) + (traits.extraversion * 0.2),
      },
    };
  }

  /**
   * Determine personality archetype from traits
   */
  private determineArchetype(traits: PersonalityTraits): string {
    const archetypes = this.getPersonalityArchetypes();
    let bestMatch = '';
    let bestScore = 0;
    
    for (const archetype of archetypes) {
      const score = this.calculateArchetypeMatch(traits, archetype);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = archetype.name;
      }
    }
    
    return bestMatch || 'Balanced Individual';
  }

  /**
   * Calculate how well traits match an archetype
   */
  private calculateArchetypeMatch(traits: PersonalityTraits, archetype: PersonalityArchetype): number {
    let totalDifference = 0;
    let traitCount = 0;
    
    for (const [key, value] of Object.entries(archetype.baseTraits)) {
      const traitValue = traits[key as keyof PersonalityTraits];
      totalDifference += Math.abs(value - traitValue);
      traitCount++;
    }
    
    const averageDifference = totalDifference / traitCount;
    return 1 - averageDifference; // Convert difference to similarity score
  }

  /**
   * Adjust trait value with learning
   */
  private adjustTrait(currentValue: number, targetValue: number, learningRate: number): number {
    const adjustment = (targetValue - currentValue) * learningRate;
    return Math.max(0, Math.min(1, currentValue + adjustment));
  }

  /**
   * Calculate complementarity between two trait values
   */
  private calculateComplementarity(trait: keyof PersonalityTraits, value1: number, value2: number): number {
    // Some traits are more complementary when different (e.g., introvert + extravert)
    const complementaryTraits = ['extraversion', 'assertiveness', 'riskTaking'];
    
    if (complementaryTraits.includes(trait)) {
      // For complementary traits, moderate differences are good
      const diff = Math.abs(value1 - value2);
      return diff > 0.3 && diff < 0.7 ? 1 - diff : 0.5;
    } else {
      // For other traits, similarity is better
      return 1 - Math.abs(value1 - value2);
    }
  }

  /**
   * Calculate posting probability
   */
  private calculatePostProbability(
    traits: PersonalityTraits,
    patterns: BehaviorPatterns,
    context: any
  ): number {
    let baseProb = patterns.postingFrequency / 10; // Normalize
    
    // Adjust for time of day
    const hour = context.timeOfDay;
    if (hour >= 6 && hour < 12) baseProb *= patterns.timePreferences.morning;
    else if (hour >= 12 && hour < 18) baseProb *= patterns.timePreferences.afternoon;
    else if (hour >= 18 && hour < 22) baseProb *= patterns.timePreferences.evening;
    else baseProb *= patterns.timePreferences.night;
    
    // Adjust for recent activity
    const activityFactor = 1 - Math.min(0.8, context.recentInteractions / 10);
    baseProb *= activityFactor;
    
    return baseProb;
  }

  /**
   * Calculate reply probability
   */
  private calculateReplyProbability(
    traits: PersonalityTraits,
    patterns: BehaviorPatterns,
    context: any
  ): number {
    return patterns.replyPropensity * (1 + context.socialPressure * 0.3);
  }

  /**
   * Calculate like probability
   */
  private calculateLikeProbability(
    traits: PersonalityTraits,
    patterns: BehaviorPatterns,
    context: any
  ): number {
    return patterns.likePropensity * (1 + traits.agreeableness * 0.2);
  }

  /**
   * Predict content type based on profile and context
   */
  private predictContentType(profile: PersonalityProfile, context: any): string {
    const prefs = profile.contentPreferences.contentTypes;
    const weights = [
      ['informational', prefs.informational],
      ['entertainment', prefs.entertainment],
      ['personal', prefs.personal],
      ['controversial', prefs.controversial * (1 - context.socialPressure)], // Less controversial under social pressure
      ['trending', prefs.trending * (context.trendingTopics.length > 0 ? 1.5 : 0.5)],
    ];
    
    // Weighted random selection
    const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const [type, weight] of weights) {
      random -= weight;
      if (random <= 0) return type as string;
    }
    
    return 'informational'; // Fallback
  }

  /**
   * Calculate expected tone
   */
  private calculateExpectedTone(profile: PersonalityProfile, context: any): {
    humor: number;
    formality: number;
    riskiness: number;
  } {
    const { traits, communicationStyle } = profile;
    
    return {
      humor: traits.humor * (1 + communicationStyle.emotionality * 0.2),
      formality: traits.formality * (1 + context.socialPressure * 0.3),
      riskiness: traits.riskTaking * (1 - context.socialPressure * 0.5),
    };
  }

  /**
   * Determine preferred content length
   */
  private determinePreferredLength(traits: PersonalityTraits): 'short' | 'medium' | 'long' {
    const verbosity = (traits.extraversion * 0.6) + (traits.openness * 0.4);
    
    if (verbosity < 0.3) return 'short';
    if (verbosity > 0.7) return 'long';
    return 'medium';
  }

  /**
   * Determine topic focus preference
   */
  private determineTopicFocus(traits: PersonalityTraits): 'broad' | 'specialized' | 'mixed' {
    if (traits.openness > 0.7 && traits.curiosity > 0.6) return 'broad';
    if (traits.conscientiousness > 0.7 && traits.openness < 0.4) return 'specialized';
    return 'mixed';
  }

  /**
   * Get predefined personality archetypes
   */
  private getPersonalityArchetypes(): PersonalityArchetype[] {
    return [
      {
        name: 'Tech Critic',
        description: 'Analytical technology enthusiast with strong opinions',
        baseTraits: {
          openness: 0.8,
          conscientiousness: 0.7,
          extraversion: 0.4,
          agreeableness: 0.3,
          neuroticism: 0.4,
          humor: 0.3,
          formality: 0.6,
          assertiveness: 0.8,
          empathy: 0.4,
          curiosity: 0.9,
          optimism: 0.4,
          riskTaking: 0.6,
          socialNeed: 0.5,
        },
        typicalBehaviors: ['Analyzes tech trends', 'Criticizes poor implementations', 'Shares technical insights'],
        contentThemes: ['technology', 'innovation', 'criticism', 'analysis'],
        communicationPatterns: ['Direct', 'Technical', 'Critical'],
        riskLevel: 0.6,
      },
      {
        name: 'Optimistic Futurist',
        description: 'Enthusiastic about future possibilities and positive change',
        baseTraits: {
          openness: 0.9,
          conscientiousness: 0.6,
          extraversion: 0.7,
          agreeableness: 0.8,
          neuroticism: 0.2,
          humor: 0.7,
          formality: 0.4,
          assertiveness: 0.6,
          empathy: 0.8,
          curiosity: 0.9,
          optimism: 0.9,
          riskTaking: 0.5,
          socialNeed: 0.7,
        },
        typicalBehaviors: ['Shares inspiring content', 'Encourages innovation', 'Promotes positivity'],
        contentThemes: ['future', 'innovation', 'inspiration', 'progress'],
        communicationPatterns: ['Enthusiastic', 'Supportive', 'Visionary'],
        riskLevel: 0.3,
      },
      // Add more archetypes as needed...
    ];
  }
}

/**
 * Singleton personality processor instance
 */
export const personalityProcessor = new PersonalityProcessor();

/**
 * Helper function to create personality profile
 */
export function createPersonalityProfile(traits: PersonalityTraits, archetype?: string): PersonalityProfile {
  return personalityProcessor.createPersonalityProfile(traits, archetype);
}

/**
 * Helper function to generate random personality within bounds
 */
export function generateRandomPersonality(archetype?: string): PersonalityTraits {
  const baseTraits: PersonalityTraits = {
    openness: Math.random(),
    conscientiousness: Math.random(),
    extraversion: Math.random(),
    agreeableness: Math.random(),
    neuroticism: Math.random(),
    humor: Math.random(),
    formality: Math.random(),
    assertiveness: Math.random(),
    empathy: Math.random(),
    curiosity: Math.random(),
    optimism: Math.random(),
    riskTaking: Math.random(),
    socialNeed: Math.random(),
  };
  
  return PersonalityTraitsSchema.parse(baseTraits);
}