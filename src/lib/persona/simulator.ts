/**
 * GABM (Generative Agent-Based Modeling) persona simulation
 * Based on research.md Social Graph Simulation recommendations
 */

import { llmClient } from '@/lib/ai/client';
import { generateContent } from '@/lib/ai/content-generator';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { getCurrentTrending } from '@/lib/news/trending';
import type { PersonaTraits } from '@/lib/ai/prompts';
import type { ToneParameters } from '@/lib/ai/tone-processing';

export interface PersonaBehavior {
  id: string;
  personaId: string;
  behaviorType: 'post' | 'reply' | 'like' | 'repost' | 'dm' | 'follow';
  targetId?: string;
  context: {
    triggerType: 'scheduled' | 'reactive' | 'trend' | 'social';
    triggerData?: any;
    socialContext?: SocialContext;
  };
  parameters: {
    urgency: number; // 0-1, how quickly to act
    confidence: number; // 0-1, confidence in action
    socialWeight: number; // 0-1, influence of social signals
  };
  scheduledAt: Date;
  executedAt?: Date;
  result?: {
    success: boolean;
    contentId?: string;
    error?: string;
  };
}

export interface SocialContext {
  recentInteractions: Array<{
    personaId: string;
    type: string;
    timestamp: Date;
    content?: string;
  }>;
  networkPosition: {
    connections: number;
    influence: number;
    centrality: number;
  };
  currentMood: {
    valence: number; // -1 to 1 (negative to positive)
    arousal: number; // 0 to 1 (calm to excited)
    dominance: number; // 0 to 1 (submissive to dominant)
  };
  topicInterests: Map<string, number>; // topic -> interest level
}

export interface SimulationEvent {
  id: string;
  type: 'user_post' | 'trending_topic' | 'time_trigger' | 'social_trigger';
  timestamp: Date;
  data: any;
  affectedPersonas: string[];
  processed: boolean;
}

/**
 * GABM-based persona simulation engine
 */
export class PersonaSimulator {
  private static readonly BEHAVIOR_WEIGHTS = {
    personality: 0.4,     // Base personality traits
    social: 0.3,          // Social context and relationships
    temporal: 0.2,        // Time-based patterns
    trending: 0.1,        // Trending topics influence
  };

  private static readonly RESPONSE_PROBABILITIES = {
    post: 0.15,           // Probability of creating original post
    reply: 0.25,          // Probability of replying to posts
    like: 0.40,           // Probability of liking posts
    repost: 0.10,         // Probability of reposting
    dm: 0.05,             // Probability of sending DM
    follow: 0.05,         // Probability of following/unfollowing
  };

  private static readonly TEMPORAL_PATTERNS = {
    morning: { start: 6, end: 12, activity: 0.7 },
    afternoon: { start: 12, end: 18, activity: 0.9 },
    evening: { start: 18, end: 22, activity: 1.0 },
    night: { start: 22, end: 6, activity: 0.2 },
  };

  /**
   * Initialize simulation for all active personas
   */
  async initializeSimulation(): Promise<void> {
    const personas = await this.getActivePersonas();
    
    console.log(`Initializing GABM simulation for ${personas.length} personas`);
    
    // Initialize social contexts for each persona
    for (const persona of personas) {
      await this.initializePersonaContext(persona);
    }
    
    // Start background simulation process
    await this.scheduleNextSimulationCycle();
  }

  /**
   * Process a simulation event that might trigger persona behaviors
   */
  async processSimulationEvent(event: SimulationEvent): Promise<PersonaBehavior[]> {
    const behaviors: PersonaBehavior[] = [];
    
    // Get affected personas or determine them based on event type
    const relevantPersonas = await this.getRelevantPersonas(event);
    
    for (const persona of relevantPersonas) {
      const socialContext = await this.getPersonaSocialContext(persona.id);
      const behavior = await this.evaluatePersonaBehavior(persona, event, socialContext);
      
      if (behavior) {
        behaviors.push(behavior);
        await this.scheduleBehavior(behavior);
      }
    }
    
    // Mark event as processed
    await this.markEventProcessed(event.id);
    
    return behaviors;
  }

  /**
   * Execute scheduled persona behaviors
   */
  async executeScheduledBehaviors(): Promise<void> {
    const dueBehaviors = await this.getDueBehaviors();
    
    for (const behavior of dueBehaviors) {
      try {
        await this.executeBehavior(behavior);
        await this.updateBehaviorResult(behavior.id, { success: true });
      } catch (error) {
        console.error(`Failed to execute behavior ${behavior.id}:`, error);
        await this.updateBehaviorResult(behavior.id, { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Simulate persona posting behavior based on realistic patterns
   */
  async simulatePersonaPosting(
    persona: any,
    context: SocialContext,
    trendingTopics?: any[]
  ): Promise<string | null> {
    // Calculate posting probability based on multiple factors
    const postingProbability = this.calculatePostingProbability(persona, context);
    
    if (Math.random() > postingProbability) {
      return null; // Persona decides not to post
    }
    
    // Determine post type and content strategy
    const postStrategy = await this.determinePostStrategy(persona, context, trendingTopics);
    
    // Generate content using AI
    const generationRequest = {
      type: postStrategy.type as 'post' | 'reply' | 'quote' | 'dm',
      persona: this.mapPersonaToTraits(persona),
      toneSettings: this.calculatePersonaTone(persona, context),
      context: postStrategy.context,
      maxLength: 280, // Twitter-like limit
    };
    
    const result = await generateContent(generationRequest);
    
    if (result.moderation.flagged) {
      console.warn(`Generated content flagged for persona ${persona.id}`);
      return null;
    }
    
    // Create post in database
    const post = await prisma.post.create({
      data: {
        authorId: persona.id,
        authorType: 'PERSONA',
        content: result.content,
        generationSource: {
          model: result.metadata.model,
          tokensUsed: result.metadata.tokensUsed,
          toneApplied: result.metadata.toneApplied,
          strategy: postStrategy,
        },
        toneSettings: result.metadata.toneApplied,
        parentId: postStrategy.context?.originalPost ? undefined : undefined, // TODO: implement reply logic
        quotedPostId: postStrategy.context?.originalPost ? undefined : undefined, // TODO: implement quote logic
      },
    });
    
    // Update persona's social context
    await this.updatePersonaAfterPosting(persona.id, context, post.id);
    
    return post.id;
  }

  /**
   * Simulate persona interaction behaviors (likes, replies, etc.)
   */
  async simulatePersonaInteractions(
    persona: any,
    context: SocialContext
  ): Promise<Array<{ type: string; targetId: string }>> {
    const interactions: Array<{ type: string; targetId: string }> = [];
    
    // Get recent posts that persona might interact with
    const candidatePosts = await this.getCandidatePostsForInteraction(persona, context);
    
    for (const post of candidatePosts) {
      const interactionProbability = await this.calculateInteractionProbability(
        persona,
        post,
        context
      );
      
      // Determine interaction types persona might perform
      const possibleInteractions = ['like', 'reply', 'repost'];
      
      for (const interactionType of possibleInteractions) {
        const typeWeight = PersonaSimulator.RESPONSE_PROBABILITIES[interactionType as keyof typeof PersonaSimulator.RESPONSE_PROBABILITIES];
        
        if (Math.random() < interactionProbability * typeWeight) {
          await this.executePersonaInteraction(persona, post, interactionType);
          interactions.push({ type: interactionType, targetId: post.id });
          
          // Limit interactions per cycle to maintain realism
          if (interactions.length >= 3) break;
        }
      }
      
      if (interactions.length >= 3) break;
    }
    
    return interactions;
  }

  /**
   * Get all active personas
   */
  private async getActivePersonas(): Promise<any[]> {
    return await prisma.persona.findMany({
      where: { isActive: true },
      include: {
        posts: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        sentMessages: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Initialize social context for a persona
   */
  private async initializePersonaContext(persona: any): Promise<void> {
    const recentInteractions = await this.getRecentInteractions(persona.id);
    const networkMetrics = await this.calculateNetworkMetrics(persona.id);
    
    const context: SocialContext = {
      recentInteractions,
      networkPosition: networkMetrics,
      currentMood: this.initializePersonaMood(persona),
      topicInterests: await this.calculateTopicInterests(persona),
    };
    
    // Cache context in Redis for quick access
    await redis.set(
      `persona:context:${persona.id}`,
      JSON.stringify(context),
      'EX',
      3600 // 1 hour expiry
    );
  }

  /**
   * Get persona's current social context
   */
  private async getPersonaSocialContext(personaId: string): Promise<SocialContext> {
    try {
      const cached = await redis.get(`persona:context:${personaId}`);
      if (cached) {
        const context = JSON.parse(cached);
        // Restore Map from serialized data
        context.topicInterests = new Map(Object.entries(context.topicInterests || {}));
        return context;
      }
    } catch (error) {
      console.warn(`Failed to get cached context for persona ${personaId}:`, error);
    }
    
    // Fallback: recalculate context
    const persona = await prisma.persona.findUnique({ where: { id: personaId } });
    if (!persona) throw new Error(`Persona ${personaId} not found`);
    
    await this.initializePersonaContext(persona);
    return await this.getPersonaSocialContext(personaId);
  }

  /**
   * Calculate posting probability based on multiple factors
   */
  private calculatePostingProbability(persona: any, context: SocialContext): number {
    const baseRate = 0.1; // Base 10% chance per simulation cycle
    
    // Personality factors
    const personalityFactor = this.getPersonalityActivity(persona.personality);
    
    // Temporal factors
    const temporalFactor = this.getTemporalActivity();
    
    // Social factors
    const socialFactor = this.getSocialActivity(context);
    
    // Mood factors
    const moodFactor = this.getMoodActivity(context.currentMood);
    
    const probability = baseRate * 
      (personalityFactor * PersonaSimulator.BEHAVIOR_WEIGHTS.personality +
       temporalFactor * PersonaSimulator.BEHAVIOR_WEIGHTS.temporal +
       socialFactor * PersonaSimulator.BEHAVIOR_WEIGHTS.social +
       0.5 * PersonaSimulator.BEHAVIOR_WEIGHTS.trending); // Base trending influence
    
    return Math.min(1.0, Math.max(0.0, probability));
  }

  /**
   * Determine posting strategy for persona
   */
  private async determinePostStrategy(
    persona: any,
    context: SocialContext,
    trendingTopics?: any[]
  ): Promise<{
    type: string;
    context?: any;
  }> {
    const strategies = ['original', 'trending', 'reactive'];
    const weights = [0.6, 0.3, 0.1];
    
    // Adjust weights based on persona and context
    if (trendingTopics && trendingTopics.length > 0) {
      weights[1] *= 1.5; // Increase trending weight
    }
    
    if (context.recentInteractions.length > 2) {
      weights[2] *= 2.0; // Increase reactive weight
    }
    
    const strategy = this.weightedRandomChoice(strategies, weights);
    
    switch (strategy) {
      case 'trending':
        return {
          type: 'post',
          context: {
            trendingTopic: trendingTopics?.[0],
          },
        };
      
      case 'reactive':
        const recentPost = context.recentInteractions[0];
        return {
          type: 'reply',
          context: {
            originalPost: {
              content: recentPost?.content || '',
              author: 'Unknown',
              isPersona: true,
            },
          },
        };
      
      default:
        return {
          type: 'post',
          context: {
            prompt: this.generatePersonaPrompt(persona, context),
          },
        };
    }
  }

  /**
   * Map persona to AI generation traits
   */
  private mapPersonaToTraits(persona: any): PersonaTraits {
    return {
      archetype: persona.archetype,
      personality: persona.personality || {
        humor: 0.5,
        formality: 0.5,
        aggressiveness: persona.riskLevel || 0.3,
        traits: ['social', 'curious'],
      },
      expertise: persona.personality?.expertise || [],
      background: persona.bio,
      communicationStyle: persona.postingStyle || {
        preferredLength: 'medium',
        useEmojis: Math.random() > 0.5,
        useHashtags: Math.random() > 0.7,
      },
    };
  }

  /**
   * Calculate persona tone based on personality and context
   */
  private calculatePersonaTone(persona: any, context: SocialContext): Partial<ToneParameters> {
    const baseTone = {
      humor: persona.personality?.humor || 0.5,
      formality: persona.personality?.formality || 0.5,
      riskiness: persona.riskLevel || 0.3,
      novelty: 0.5,
      snark: persona.personality?.snark || 0.3,
    };
    
    // Adjust based on mood
    const mood = context.currentMood;
    return {
      humor: Math.max(0, Math.min(1, baseTone.humor + mood.valence * 0.2)),
      formality: Math.max(0, Math.min(1, baseTone.formality - mood.arousal * 0.1)),
      riskiness: Math.max(0, Math.min(1, baseTone.riskiness + mood.dominance * 0.1)),
      novelty: Math.max(0, Math.min(1, baseTone.novelty + mood.arousal * 0.2)),
      snark: Math.max(0, Math.min(1, baseTone.snark + (mood.dominance - mood.valence) * 0.1)),
    };
  }

  /**
   * Get recent interactions for persona
   */
  private async getRecentInteractions(personaId: string): Promise<SocialContext['recentInteractions']> {
    const interactions = await prisma.interaction.findMany({
      where: {
        OR: [
          { userId: personaId },
          { targetId: personaId },
        ],
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      include: {
        user: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    
    return interactions.map(interaction => ({
      personaId: interaction.userId,
      type: interaction.interactionType,
      timestamp: interaction.createdAt,
      content: interaction.metadata?.content,
    }));
  }

  /**
   * Calculate network metrics for persona
   */
  private async calculateNetworkMetrics(personaId: string): Promise<SocialContext['networkPosition']> {
    // Simplified network metrics - could be enhanced with graph analysis
    const connections = await prisma.interaction.count({
      where: {
        OR: [
          { userId: personaId },
          { targetId: personaId },
        ],
      },
      distinct: ['userId', 'targetId'],
    });
    
    const totalInteractions = await prisma.interaction.count({
      where: {
        OR: [
          { userId: personaId },
          { targetId: personaId },
        ],
      },
    });
    
    // Simple influence calculation based on interaction volume
    const influence = Math.min(1.0, totalInteractions / 100);
    const centrality = Math.min(1.0, connections / 20);
    
    return {
      connections,
      influence,
      centrality,
    };
  }

  /**
   * Initialize persona mood based on personality
   */
  private initializePersonaMood(persona: any): SocialContext['currentMood'] {
    const personality = persona.personality || {};
    
    return {
      valence: (personality.optimism || 0.5) * 2 - 1, // Convert 0-1 to -1 to 1
      arousal: personality.energy || 0.5,
      dominance: personality.assertiveness || 0.5,
    };
  }

  /**
   * Calculate topic interests for persona
   */
  private async calculateTopicInterests(persona: any): Promise<Map<string, number>> {
    const interests = new Map<string, number>();
    
    // Base interests from persona configuration
    const expertise = persona.personality?.expertise || [];
    expertise.forEach((topic: string) => {
      interests.set(topic, 0.8 + Math.random() * 0.2);
    });
    
    // Analyze recent posts to infer interests
    const recentPosts = await prisma.post.findMany({
      where: { authorId: persona.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    
    // Simple keyword extraction for interests
    const keywords = new Map<string, number>();
    recentPosts.forEach(post => {
      const words = post.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 3) {
          keywords.set(word, (keywords.get(word) || 0) + 1);
        }
      });
    });
    
    // Convert top keywords to interests
    const topKeywords = Array.from(keywords.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    
    topKeywords.forEach(([keyword, count]) => {
      const interest = Math.min(1.0, count / recentPosts.length);
      interests.set(keyword, interest);
    });
    
    return interests;
  }

  /**
   * Get personality-based activity level
   */
  private getPersonalityActivity(personality: any): number {
    const extroversion = personality?.extroversion || 0.5;
    const openness = personality?.openness || 0.5;
    const energy = personality?.energy || 0.5;
    
    return (extroversion + openness + energy) / 3;
  }

  /**
   * Get temporal activity based on time of day
   */
  private getTemporalActivity(): number {
    const hour = new Date().getHours();
    
    for (const [period, config] of Object.entries(PersonaSimulator.TEMPORAL_PATTERNS)) {
      if (
        (config.start <= config.end && hour >= config.start && hour < config.end) ||
        (config.start > config.end && (hour >= config.start || hour < config.end))
      ) {
        return config.activity;
      }
    }
    
    return 0.5; // Default activity
  }

  /**
   * Get social activity based on recent interactions
   */
  private getSocialActivity(context: SocialContext): number {
    const recentCount = context.recentInteractions.filter(
      interaction => Date.now() - interaction.timestamp.getTime() < 2 * 60 * 60 * 1000
    ).length;
    
    return Math.min(1.0, recentCount / 5); // Normalize to 0-1
  }

  /**
   * Get mood-based activity
   */
  private getMoodActivity(mood: SocialContext['currentMood']): number {
    // Higher arousal and positive valence increase activity
    return (mood.arousal + Math.max(0, mood.valence)) / 2;
  }

  /**
   * Weighted random choice
   */
  private weightedRandomChoice<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }
    
    return items[items.length - 1];
  }

  /**
   * Generate context-appropriate prompt for persona
   */
  private generatePersonaPrompt(persona: any, context: SocialContext): string {
    const interests = Array.from(context.topicInterests.keys()).slice(0, 3);
    const mood = context.currentMood;
    
    let prompt = `Share your thoughts`;
    
    if (interests.length > 0) {
      prompt += ` about ${interests[Math.floor(Math.random() * interests.length)]}`;
    }
    
    if (mood.valence > 0.3) {
      prompt += ` in a positive way`;
    } else if (mood.valence < -0.3) {
      prompt += ` with some concerns`;
    }
    
    return prompt;
  }

  /**
   * Placeholder methods for behavior execution
   */
  private async getRelevantPersonas(event: SimulationEvent): Promise<any[]> {
    // TODO: Implement logic to determine which personas should react to events
    return await this.getActivePersonas();
  }

  private async evaluatePersonaBehavior(
    persona: any,
    event: SimulationEvent,
    context: SocialContext
  ): Promise<PersonaBehavior | null> {
    // TODO: Implement behavior evaluation logic
    return null;
  }

  private async scheduleBehavior(behavior: PersonaBehavior): Promise<void> {
    // TODO: Implement behavior scheduling
  }

  private async getDueBehaviors(): Promise<PersonaBehavior[]> {
    // TODO: Implement due behavior retrieval
    return [];
  }

  private async executeBehavior(behavior: PersonaBehavior): Promise<void> {
    // TODO: Implement behavior execution
  }

  private async updateBehaviorResult(behaviorId: string, result: any): Promise<void> {
    // TODO: Implement behavior result update
  }

  private async markEventProcessed(eventId: string): Promise<void> {
    // TODO: Implement event processing tracking
  }

  private async scheduleNextSimulationCycle(): Promise<void> {
    // TODO: Implement simulation cycle scheduling
  }

  private async updatePersonaAfterPosting(personaId: string, context: SocialContext, postId: string): Promise<void> {
    // TODO: Update persona state after posting
  }

  private async getCandidatePostsForInteraction(persona: any, context: SocialContext): Promise<any[]> {
    // TODO: Get posts persona might interact with
    return [];
  }

  private async calculateInteractionProbability(persona: any, post: any, context: SocialContext): Promise<number> {
    // TODO: Calculate probability of interaction with specific post
    return 0.1;
  }

  private async executePersonaInteraction(persona: any, post: any, interactionType: string): Promise<void> {
    // TODO: Execute specific interaction
  }
}

/**
 * Singleton persona simulator instance
 */
export const personaSimulator = new PersonaSimulator();

/**
 * Helper function to simulate posting for a specific persona
 */
export async function simulatePersonaPost(personaId: string): Promise<string | null> {
  const persona = await prisma.persona.findUnique({ 
    where: { id: personaId },
    include: { posts: { take: 10, orderBy: { createdAt: 'desc' } } }
  });
  
  if (!persona || !persona.isActive) {
    return null;
  }
  
  const context = await personaSimulator['getPersonaSocialContext'](personaId);
  const trendingTopics = await getCurrentTrending('24h');
  
  return await personaSimulator.simulatePersonaPosting(
    persona,
    context,
    trendingTopics.topics.slice(0, 5)
  );
}

/**
 * Helper function to simulate interactions for all personas
 */
export async function simulateAllPersonaInteractions(): Promise<void> {
  const personas = await prisma.persona.findMany({
    where: { isActive: true },
  });
  
  for (const persona of personas) {
    try {
      const context = await personaSimulator['getPersonaSocialContext'](persona.id);
      await personaSimulator.simulatePersonaInteractions(persona, context);
    } catch (error) {
      console.error(`Failed to simulate interactions for persona ${persona.id}:`, error);
    }
  }
}