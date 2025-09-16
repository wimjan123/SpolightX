/**
 * Content categorization and topic classification
 * Based on research.md content analysis recommendations
 */

import { generateEmbedding } from '@/lib/ai/embedding';
import { llmClient } from '@/lib/ai/client';
import { prisma } from '@/lib/prisma';
import type { NewsArticle } from '@/lib/news/client';
import type { RSSFeedItem } from '@/lib/news/rss-parser';

export interface ContentCategory {
  primary: string;
  secondary?: string;
  confidence: number;
  subcategories: string[];
  entities: EntityMention[];
  sentiment: {
    score: number; // -1 to 1
    label: 'negative' | 'neutral' | 'positive';
    confidence: number;
  };
  topics: TopicMention[];
}

export interface EntityMention {
  text: string;
  type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'EVENT' | 'PRODUCT' | 'OTHER';
  confidence: number;
  relevance: number;
}

export interface TopicMention {
  topic: string;
  relevance: number;
  category: string;
}

export interface CategoryTaxonomy {
  [key: string]: {
    keywords: string[];
    subcategories: string[];
    indicators: string[];
  };
}

/**
 * Content categorization engine with ML and rule-based classification
 */
export class ContentCategorizer {
  private static readonly CATEGORY_TAXONOMY: CategoryTaxonomy = {
    technology: {
      keywords: ['tech', 'ai', 'artificial intelligence', 'software', 'hardware', 'startup', 'innovation', 'digital', 'cyber', 'data', 'algorithm', 'machine learning', 'blockchain', 'crypto'],
      subcategories: ['ai/ml', 'cybersecurity', 'startups', 'gadgets', 'software', 'blockchain'],
      indicators: ['launched', 'developed', 'announced', 'released', 'beta', 'update']
    },
    politics: {
      keywords: ['election', 'government', 'policy', 'congress', 'senate', 'president', 'minister', 'parliament', 'vote', 'campaign', 'political', 'democracy', 'legislation'],
      subcategories: ['elections', 'policy', 'international relations', 'domestic affairs'],
      indicators: ['voted', 'announced', 'proposed', 'signed', 'passed', 'rejected']
    },
    business: {
      keywords: ['market', 'stock', 'economy', 'finance', 'revenue', 'profit', 'company', 'corporation', 'investment', 'merger', 'acquisition', 'earnings', 'growth'],
      subcategories: ['markets', 'earnings', 'mergers', 'economics', 'startups'],
      indicators: ['reported', 'announced', 'acquired', 'invested', 'launched', 'filed']
    },
    health: {
      keywords: ['health', 'medical', 'disease', 'treatment', 'hospital', 'doctor', 'patient', 'vaccine', 'drug', 'therapy', 'clinical', 'research', 'pandemic'],
      subcategories: ['medical research', 'public health', 'healthcare policy', 'pharmaceuticals'],
      indicators: ['diagnosed', 'treated', 'approved', 'tested', 'studied', 'developed']
    },
    sports: {
      keywords: ['sports', 'game', 'team', 'player', 'championship', 'league', 'tournament', 'match', 'season', 'score', 'win', 'football', 'basketball', 'soccer'],
      subcategories: ['football', 'basketball', 'soccer', 'olympics', 'motorsports'],
      indicators: ['won', 'lost', 'scored', 'played', 'competed', 'defeated']
    },
    entertainment: {
      keywords: ['movie', 'film', 'music', 'celebrity', 'actor', 'singer', 'television', 'show', 'concert', 'album', 'award', 'hollywood', 'streaming'],
      subcategories: ['movies', 'music', 'television', 'celebrities', 'gaming'],
      indicators: ['released', 'premiered', 'starred', 'performed', 'won', 'nominated']
    },
    science: {
      keywords: ['science', 'research', 'study', 'discovery', 'experiment', 'scientist', 'university', 'climate', 'space', 'environment', 'energy'],
      subcategories: ['climate', 'space', 'physics', 'biology', 'chemistry', 'environment'],
      indicators: ['discovered', 'researched', 'studied', 'published', 'found', 'observed']
    },
    world: {
      keywords: ['international', 'global', 'country', 'nation', 'war', 'conflict', 'peace', 'treaty', 'embassy', 'foreign', 'diplomatic'],
      subcategories: ['conflicts', 'diplomacy', 'trade', 'humanitarian'],
      indicators: ['signed', 'negotiated', 'attacked', 'defended', 'agreed', 'disputed']
    }
  };

  private static readonly SENTIMENT_INDICATORS = {
    positive: ['success', 'achievement', 'breakthrough', 'victory', 'growth', 'improvement', 'recovery', 'progress', 'celebration', 'award'],
    negative: ['crisis', 'failure', 'crash', 'decline', 'loss', 'disaster', 'conflict', 'problem', 'controversy', 'scandal']
  };

  /**
   * Categorize content using multiple classification methods
   */
  async categorizeContent(
    content: NewsArticle | RSSFeedItem
  ): Promise<ContentCategory> {
    const text = this.prepareTextForAnalysis(content);
    
    // Run classification methods in parallel
    const [
      ruleBasedCategory,
      semanticCategory,
      entities,
      sentiment,
      topics
    ] = await Promise.all([
      this.classifyUsingRules(text),
      this.classifyUsingSemantic(text),
      this.extractEntities(text),
      this.analyzeSentiment(text),
      this.extractTopics(text, content)
    ]);

    // Combine results with confidence weighting
    const finalCategory = this.combineClassifications(ruleBasedCategory, semanticCategory);
    
    return {
      ...finalCategory,
      entities,
      sentiment,
      topics,
    };
  }

  /**
   * Batch categorize multiple articles
   */
  async batchCategorize(
    contents: (NewsArticle | RSSFeedItem)[]
  ): Promise<Map<string, ContentCategory>> {
    const results = new Map<string, ContentCategory>();
    
    // Process in batches to avoid overwhelming the LLM API
    const batchSize = 5;
    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(content => this.categorizeContent(content))
      );
      
      batchResults.forEach((result, index) => {
        const content = batch[index];
        const key = 'id' in content ? content.id : content.url;
        
        if (result.status === 'fulfilled') {
          results.set(key, result.value);
        } else {
          console.warn(`Categorization failed for content ${key}:`, result.reason);
          // Provide fallback category
          results.set(key, this.createFallbackCategory());
        }
      });
      
      // Small delay between batches
      if (i + batchSize < contents.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  /**
   * Rule-based classification using keyword matching
   */
  private async classifyUsingRules(text: string): Promise<{
    primary: string;
    secondary?: string;
    confidence: number;
    subcategories: string[];
  }> {
    const normalizedText = text.toLowerCase();
    const categoryScores = new Map<string, number>();
    const subcategoryMatches = new Map<string, string[]>();
    
    // Score each category based on keyword matches
    for (const [category, config] of Object.entries(ContentCategorizer.CATEGORY_TAXONOMY)) {
      let score = 0;
      const matchedSubcategories: string[] = [];
      
      // Score main keywords
      for (const keyword of config.keywords) {
        const matches = (normalizedText.match(new RegExp(keyword, 'g')) || []).length;
        score += matches * 2; // Base keyword weight
      }
      
      // Score indicators
      for (const indicator of config.indicators) {
        const matches = (normalizedText.match(new RegExp(indicator, 'g')) || []).length;
        score += matches * 1; // Indicator weight
      }
      
      // Check subcategory matches
      for (const subcategory of config.subcategories) {
        if (normalizedText.includes(subcategory.toLowerCase())) {
          matchedSubcategories.push(subcategory);
          score += 3; // Subcategory bonus
        }
      }
      
      if (score > 0) {
        categoryScores.set(category, score);
        subcategoryMatches.set(category, matchedSubcategories);
      }
    }
    
    // Find top categories
    const sortedCategories = Array.from(categoryScores.entries())
      .sort(([, a], [, b]) => b - a);
    
    if (sortedCategories.length === 0) {
      return {
        primary: 'general',
        confidence: 0.3,
        subcategories: [],
      };
    }
    
    const [primaryCategory, primaryScore] = sortedCategories[0];
    const secondaryCategory = sortedCategories.length > 1 ? sortedCategories[1][0] : undefined;
    
    // Calculate confidence based on score gap
    const totalScore = Array.from(categoryScores.values()).reduce((sum, score) => sum + score, 0);
    const confidence = Math.min(0.95, primaryScore / Math.max(totalScore, 1));
    
    return {
      primary: primaryCategory,
      secondary: secondaryCategory,
      confidence,
      subcategories: subcategoryMatches.get(primaryCategory) || [],
    };
  }

  /**
   * Semantic classification using LLM
   */
  private async classifyUsingSemantic(text: string): Promise<{
    primary: string;
    secondary?: string;
    confidence: number;
    subcategories: string[];
  }> {
    try {
      const categories = Object.keys(ContentCategorizer.CATEGORY_TAXONOMY);
      
      const prompt = `Classify the following news content into one or more categories. 
      
Available categories: ${categories.join(', ')}

Content: "${text.substring(0, 1000)}"

Respond with JSON in this format:
{
  "primary": "category_name",
  "secondary": "category_name_or_null",
  "confidence": 0.85,
  "reasoning": "brief explanation"
}`;

      const response = await llmClient.generateCompletion({
        model: 'gpt-4o-mini', // Use cheaper model for classification
        messages: [
          {
            role: 'system',
            content: 'You are a news content classifier. Provide accurate category classifications with confidence scores.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.1,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      return {
        primary: result.primary || 'general',
        secondary: result.secondary,
        confidence: Math.min(0.95, Math.max(0.1, result.confidence || 0.5)),
        subcategories: [], // LLM doesn't provide subcategories in this implementation
      };
      
    } catch (error) {
      console.warn('Semantic classification failed:', error);
      return {
        primary: 'general',
        confidence: 0.3,
        subcategories: [],
      };
    }
  }

  /**
   * Extract named entities from content
   */
  private async extractEntities(text: string): Promise<EntityMention[]> {
    try {
      const prompt = `Extract named entities from the following news content. Focus on people, organizations, locations, events, and products.

Content: "${text.substring(0, 1500)}"

Respond with JSON array in this format:
[
  {
    "text": "entity name",
    "type": "PERSON|ORGANIZATION|LOCATION|EVENT|PRODUCT",
    "confidence": 0.9
  }
]`;

      const response = await llmClient.generateCompletion({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a named entity recognition system. Extract important entities with high accuracy.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.1,
      });

      const entities = JSON.parse(response.choices[0]?.message?.content || '[]');
      
      return entities.map((entity: any) => ({
        text: entity.text,
        type: entity.type as EntityMention['type'],
        confidence: Math.min(0.95, Math.max(0.1, entity.confidence || 0.7)),
        relevance: this.calculateEntityRelevance(entity.text, text),
      })).slice(0, 10); // Limit to top 10 entities
      
    } catch (error) {
      console.warn('Entity extraction failed:', error);
      return [];
    }
  }

  /**
   * Analyze sentiment of content
   */
  private async analyzeSentiment(text: string): Promise<ContentCategory['sentiment']> {
    try {
      // First try rule-based sentiment
      const ruleBasedSentiment = this.analyzeSentimentRules(text);
      
      // Then use LLM for more nuanced analysis
      const prompt = `Analyze the sentiment of this news content on a scale from -1 (very negative) to 1 (very positive).

Content: "${text.substring(0, 1000)}"

Respond with JSON:
{
  "score": 0.2,
  "label": "positive|neutral|negative",
  "confidence": 0.8
}`;

      const response = await llmClient.generateCompletion({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a sentiment analysis system. Provide accurate sentiment scores for news content.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.1,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      // Combine rule-based and LLM results
      const finalScore = (ruleBasedSentiment.score + (result.score || 0)) / 2;
      
      return {
        score: Math.max(-1, Math.min(1, finalScore)),
        label: result.label || this.scoreToLabel(finalScore),
        confidence: Math.min(0.95, Math.max(0.1, result.confidence || 0.6)),
      };
      
    } catch (error) {
      console.warn('Sentiment analysis failed:', error);
      return this.analyzeSentimentRules(text);
    }
  }

  /**
   * Rule-based sentiment analysis
   */
  private analyzeSentimentRules(text: string): ContentCategory['sentiment'] {
    const normalizedText = text.toLowerCase();
    
    let positiveScore = 0;
    let negativeScore = 0;
    
    // Count positive indicators
    for (const indicator of ContentCategorizer.SENTIMENT_INDICATORS.positive) {
      const matches = (normalizedText.match(new RegExp(indicator, 'g')) || []).length;
      positiveScore += matches;
    }
    
    // Count negative indicators
    for (const indicator of ContentCategorizer.SENTIMENT_INDICATORS.negative) {
      const matches = (normalizedText.match(new RegExp(indicator, 'g')) || []).length;
      negativeScore += matches;
    }
    
    // Calculate net sentiment
    const totalIndicators = positiveScore + negativeScore;
    if (totalIndicators === 0) {
      return { score: 0, label: 'neutral', confidence: 0.5 };
    }
    
    const score = (positiveScore - negativeScore) / Math.max(totalIndicators, 1);
    const normalizedScore = Math.max(-1, Math.min(1, score));
    
    return {
      score: normalizedScore,
      label: this.scoreToLabel(normalizedScore),
      confidence: Math.min(0.8, totalIndicators / 5), // Higher confidence with more indicators
    };
  }

  /**
   * Convert sentiment score to label
   */
  private scoreToLabel(score: number): 'positive' | 'neutral' | 'negative' {
    if (score > 0.1) return 'positive';
    if (score < -0.1) return 'negative';
    return 'neutral';
  }

  /**
   * Extract relevant topics from content
   */
  private async extractTopics(
    text: string,
    content: NewsArticle | RSSFeedItem
  ): Promise<TopicMention[]> {
    const topics: TopicMention[] = [];
    
    // Use existing categories as potential topics
    const categories = Object.keys(ContentCategorizer.CATEGORY_TAXONOMY);
    
    for (const category of categories) {
      const relevance = this.calculateTopicRelevance(text, category);
      
      if (relevance > 0.1) {
        topics.push({
          topic: category,
          relevance,
          category: category,
        });
      }
    }
    
    // Add article-specific topics from title/content
    const titleTopics = this.extractTopicsFromTitle(content.title);
    topics.push(...titleTopics);
    
    return topics
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 5); // Top 5 topics
  }

  /**
   * Extract topics from article title
   */
  private extractTopicsFromTitle(title: string): TopicMention[] {
    const words = title.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const topicCounts = new Map<string, number>();
    
    // Extract meaningful phrases (2-3 words)
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (phrase.length <= 30) {
        topicCounts.set(phrase, (topicCounts.get(phrase) || 0) + 1);
      }
    }
    
    return Array.from(topicCounts.entries())
      .map(([topic, count]) => ({
        topic,
        relevance: Math.min(0.8, count * 0.3),
        category: 'general',
      }))
      .slice(0, 3);
  }

  /**
   * Calculate entity relevance in text
   */
  private calculateEntityRelevance(entity: string, text: string): number {
    const normalizedText = text.toLowerCase();
    const normalizedEntity = entity.toLowerCase();
    
    const mentions = (normalizedText.match(new RegExp(normalizedEntity, 'g')) || []).length;
    const textLength = normalizedText.split(/\s+/).length;
    
    // Calculate relevance based on frequency and text length
    const frequency = mentions / Math.max(textLength, 1);
    return Math.min(0.95, frequency * 100);
  }

  /**
   * Calculate topic relevance
   */
  private calculateTopicRelevance(text: string, topic: string): number {
    const config = ContentCategorizer.CATEGORY_TAXONOMY[topic];
    if (!config) return 0;
    
    const normalizedText = text.toLowerCase();
    let relevanceScore = 0;
    
    // Check keyword matches
    for (const keyword of config.keywords) {
      const matches = (normalizedText.match(new RegExp(keyword, 'g')) || []).length;
      relevanceScore += matches * 0.1;
    }
    
    return Math.min(0.95, relevanceScore);
  }

  /**
   * Combine rule-based and semantic classifications
   */
  private combineClassifications(
    ruleBased: Awaited<ReturnType<ContentCategorizer['classifyUsingRules']>>,
    semantic: Awaited<ReturnType<ContentCategorizer['classifyUsingSemantic']>>
  ): {
    primary: string;
    secondary?: string;
    confidence: number;
    subcategories: string[];
  } {
    // Weight the classifications based on their confidence
    const ruleWeight = ruleBased.confidence;
    const semanticWeight = semantic.confidence;
    const totalWeight = ruleWeight + semanticWeight;
    
    if (totalWeight === 0) {
      return {
        primary: 'general',
        confidence: 0.3,
        subcategories: [],
      };
    }
    
    // Choose primary category based on highest weighted confidence
    let primary: string;
    let confidence: number;
    
    if (ruleWeight > semanticWeight) {
      primary = ruleBased.primary;
      confidence = (ruleWeight * ruleBased.confidence + semanticWeight * 0.5) / totalWeight;
    } else {
      primary = semantic.primary;
      confidence = (semanticWeight * semantic.confidence + ruleWeight * 0.5) / totalWeight;
    }
    
    // Secondary category from the other method if different
    const secondary = primary !== ruleBased.primary ? ruleBased.primary :
                    primary !== semantic.primary ? semantic.primary : undefined;
    
    return {
      primary,
      secondary,
      confidence: Math.min(0.95, confidence),
      subcategories: ruleBased.subcategories,
    };
  }

  /**
   * Prepare text for analysis by cleaning and truncating
   */
  private prepareTextForAnalysis(content: NewsArticle | RSSFeedItem): string {
    const parts = [
      content.title,
      content.description || '',
      content.content?.substring(0, 2000) || '', // Limit content length
    ].filter(part => part && part.length > 0);
    
    return parts.join(' ').trim();
  }

  /**
   * Create fallback category for failed classifications
   */
  private createFallbackCategory(): ContentCategory {
    return {
      primary: 'general',
      confidence: 0.3,
      subcategories: [],
      entities: [],
      sentiment: {
        score: 0,
        label: 'neutral',
        confidence: 0.5,
      },
      topics: [],
    };
  }
}

/**
 * Singleton categorizer instance
 */
export const contentCategorizer = new ContentCategorizer();

/**
 * Helper function to categorize single article
 */
export async function categorizeArticle(
  article: NewsArticle | RSSFeedItem
): Promise<ContentCategory> {
  return await contentCategorizer.categorizeContent(article);
}

/**
 * Helper function to batch categorize articles
 */
export async function categorizeArticles(
  articles: (NewsArticle | RSSFeedItem)[]
): Promise<Map<string, ContentCategory>> {
  return await contentCategorizer.batchCategorize(articles);
}

/**
 * Get category statistics from database
 */
export async function getCategoryStats(
  timeWindow: number = 7 * 24 * 60 * 60 * 1000 // 7 days
): Promise<Map<string, { count: number; percentage: number }>> {
  const cutoffDate = new Date(Date.now() - timeWindow);
  
  const categories = await prisma.newsItem.groupBy({
    by: ['categories'],
    where: {
      createdAt: { gte: cutoffDate },
      categories: { not: null },
    },
    _count: true,
  });
  
  const stats = new Map<string, { count: number; percentage: number }>();
  const total = categories.reduce((sum, cat) => sum + cat._count, 0);
  
  for (const category of categories) {
    if (category.categories && category.categories.length > 0) {
      for (const cat of category.categories) {
        const existing = stats.get(cat) || { count: 0, percentage: 0 };
        existing.count += category._count;
        stats.set(cat, existing);
      }
    }
  }
  
  // Calculate percentages
  for (const [category, data] of stats.entries()) {
    data.percentage = total > 0 ? (data.count / total) * 100 : 0;
  }
  
  return stats;
}