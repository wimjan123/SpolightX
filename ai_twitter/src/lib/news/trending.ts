/**
 * Trending topic detection and analysis
 * Based on research.md trending detection strategy
 */

import { prisma } from '@/lib/prisma';
import { generateEmbedding } from '@/lib/ai/embedding';
import { redis } from '@/lib/redis';
import type { NewsArticle } from '@/lib/news/client';
import type { RSSFeedItem } from '@/lib/news/rss-parser';

export interface TrendingTopic {
  id: string;
  topic: string;
  description?: string;
  velocity: number;
  confidence: number;
  sources: Array<{
    id: string;
    name: string;
    count: number;
  }>;
  categories: string[];
  region?: string;
  peakAt?: Date;
  expiresAt: Date;
  articles: Array<{
    id: string;
    title: string;
    url: string;
    publishedAt: Date;
    source: string;
  }>;
  metadata: {
    totalMentions: number;
    uniqueSources: number;
    timespan: string;
    relatedTopics: string[];
  };
}

export interface TrendingAnalysis {
  topics: TrendingTopic[];
  emerging: TrendingTopic[];
  declining: TrendingTopic[];
  stats: {
    totalTopics: number;
    totalArticles: number;
    uniqueSources: number;
    timeWindow: string;
  };
}

export interface KeywordScore {
  keyword: string;
  frequency: number;
  velocity: number;
  sources: Set<string>;
  articles: string[];
  trendScore: number;
}

/**
 * Trending topic detection engine
 */
export class TrendingDetector {
  private static readonly MIN_MENTIONS = 3;
  private static readonly MIN_SOURCES = 2;
  private static readonly MIN_VELOCITY = 0.1;
  private static readonly MAX_TOPICS = 50;
  
  private static readonly TIME_WINDOWS = {
    '1h': 1 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  };

  private static readonly STOP_WORDS = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'this', 'that', 'these', 'those', 'a', 'an', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'can', 'said', 'says', 'new', 'also',
    'its', 'his', 'her', 'their', 'our', 'your', 'my', 'me', 'him', 'them', 'us',
    'she', 'he', 'it', 'we', 'you', 'they', 'who', 'what', 'when', 'where', 'why', 'how',
    'news', 'report', 'reports', 'story', 'stories', 'article', 'breaking',
  ]);

  /**
   * Detect trending topics from recent articles
   */
  async detectTrending(
    timeWindow: keyof typeof TrendingDetector.TIME_WINDOWS = '24h',
    region?: string
  ): Promise<TrendingAnalysis> {
    const windowMs = TrendingDetector.TIME_WINDOWS[timeWindow];
    const cutoffDate = new Date(Date.now() - windowMs);

    // Get recent articles
    const articles = await this.getRecentArticles(cutoffDate, region);
    
    if (articles.length === 0) {
      return this.createEmptyAnalysis(timeWindow);
    }

    // Extract keywords and calculate scores
    const keywordScores = await this.extractAndScoreKeywords(articles, timeWindow);
    
    // Filter and rank trending topics
    const trendingKeywords = this.filterTrendingKeywords(keywordScores);
    
    // Group related keywords into topics
    const topics = await this.groupIntoTopics(trendingKeywords, articles);
    
    // Analyze trends over time
    const analysis = await this.analyzeTrends(topics, timeWindow);
    
    // Cache results
    await this.cacheResults(analysis, timeWindow, region);
    
    return analysis;
  }

  /**
   * Get cached trending analysis
   */
  async getCachedTrending(
    timeWindow: keyof typeof TrendingDetector.TIME_WINDOWS = '24h',
    region?: string
  ): Promise<TrendingAnalysis | null> {
    try {
      const cacheKey = `trending:${timeWindow}:${region || 'global'}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Failed to get cached trending data:', error);
    }
    
    return null;
  }

  /**
   * Update trending topics in real-time
   */
  async updateTrendingRealTime(
    newArticles: (NewsArticle | RSSFeedItem)[]
  ): Promise<void> {
    if (newArticles.length === 0) return;

    try {
      // Extract keywords from new articles
      const keywords = this.extractKeywordsFromArticles(newArticles);
      
      // Update keyword frequencies in Redis
      const pipeline = redis.pipeline();
      const now = Date.now();
      
      for (const [keyword, data] of keywords.entries()) {
        const key = `keyword:${keyword}`;
        
        // Update frequency
        pipeline.hincrby(key, 'frequency', data.frequency);
        pipeline.hset(key, 'lastSeen', now);
        
        // Add to time-series for velocity calculation
        const timeKey = `${key}:timeseries`;
        pipeline.zadd(timeKey, now, `${now}:${data.frequency}`);
        pipeline.expire(timeKey, 7 * 24 * 60 * 60); // 7 days
        
        // Cleanup old entries
        const cutoff = now - TrendingDetector.TIME_WINDOWS['7d'];
        pipeline.zremrangebyscore(timeKey, 0, cutoff);
      }
      
      await pipeline.exec();
      
      // Invalidate trending cache
      await this.invalidateTrendingCache();
      
    } catch (error) {
      console.error('Failed to update trending topics in real-time:', error);
    }
  }

  /**
   * Get recent articles for analysis
   */
  private async getRecentArticles(
    cutoffDate: Date,
    region?: string
  ): Promise<Array<NewsArticle & { id: string }>> {
    const whereClause: any = {
      createdAt: { gte: cutoffDate },
      isProcessed: true,
    };

    // Add region filter if specified
    if (region) {
      whereClause.processingNotes = {
        path: ['region'],
        equals: region,
      };
    }

    return await prisma.newsItem.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        source: true,
        publishedAt: true,
        categories: true,
        sentiment: true,
        processingNotes: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 1000, // Limit for performance
    }) as any;
  }

  /**
   * Extract and score keywords from articles
   */
  private async extractAndScoreKeywords(
    articles: Array<NewsArticle & { id: string }>,
    timeWindow: string
  ): Promise<Map<string, KeywordScore>> {
    const keywordScores = new Map<string, KeywordScore>();
    const timeWindowMs = TrendingDetector.TIME_WINDOWS[timeWindow as keyof typeof TrendingDetector.TIME_WINDOWS];
    
    for (const article of articles) {
      const keywords = this.extractKeywords(article);
      const ageMs = Date.now() - new Date(article.publishedAt).getTime();
      const timeWeight = this.calculateTimeWeight(ageMs, timeWindowMs);
      
      for (const keyword of keywords) {
        if (!keywordScores.has(keyword)) {
          keywordScores.set(keyword, {
            keyword,
            frequency: 0,
            velocity: 0,
            sources: new Set(),
            articles: [],
            trendScore: 0,
          });
        }
        
        const score = keywordScores.get(keyword)!;
        score.frequency += timeWeight;
        score.sources.add(article.source);
        score.articles.push(article.id);
      }
    }
    
    // Calculate velocity for each keyword
    for (const [keyword, score] of keywordScores.entries()) {
      score.velocity = await this.calculateKeywordVelocity(keyword, timeWindow);
      score.trendScore = this.calculateTrendScore(score);
    }
    
    return keywordScores;
  }

  /**
   * Extract keywords from article content
   */
  private extractKeywords(article: NewsArticle & { id: string }): string[] {
    const text = `${article.title} ${article.content || ''}`.toLowerCase();
    
    // Simple keyword extraction
    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length >= 3 && 
        word.length <= 50 &&
        !TrendingDetector.STOP_WORDS.has(word) &&
        !/^\d+$/.test(word) // Skip pure numbers
      );
    
    // Count word frequencies
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
    
    // Extract multi-word phrases (2-3 words)
    const phrases = this.extractPhrases(text);
    for (const phrase of phrases) {
      if (!TrendingDetector.STOP_WORDS.has(phrase.split(' ')[0])) {
        wordCounts.set(phrase, (wordCounts.get(phrase) || 0) + 2); // Weight phrases higher
      }
    }
    
    // Return keywords with minimum frequency
    return Array.from(wordCounts.entries())
      .filter(([_, count]) => count >= 1)
      .map(([word, _]) => word);
  }

  /**
   * Extract key phrases from text
   */
  private extractPhrases(text: string): string[] {
    const phrases: string[] = [];
    const words = text.split(/\s+/);
    
    // Extract 2-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (phrase.length <= 50 && !this.isStopPhrase(phrase)) {
        phrases.push(phrase);
      }
    }
    
    // Extract 3-word phrases for important patterns
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      if (phrase.length <= 50 && !this.isStopPhrase(phrase)) {
        phrases.push(phrase);
      }
    }
    
    return phrases;
  }

  /**
   * Check if phrase should be filtered out
   */
  private isStopPhrase(phrase: string): boolean {
    const words = phrase.split(' ');
    return words.some(word => TrendingDetector.STOP_WORDS.has(word));
  }

  /**
   * Extract keywords from new articles for real-time updates
   */
  private extractKeywordsFromArticles(
    articles: (NewsArticle | RSSFeedItem)[]
  ): Map<string, { frequency: number; sources: Set<string> }> {
    const keywords = new Map<string, { frequency: number; sources: Set<string> }>();
    
    for (const article of articles) {
      const articleKeywords = this.extractKeywords(article as any);
      
      for (const keyword of articleKeywords) {
        if (!keywords.has(keyword)) {
          keywords.set(keyword, { frequency: 0, sources: new Set() });
        }
        
        const data = keywords.get(keyword)!;
        data.frequency += 1;
        data.sources.add(article.source.name);
      }
    }
    
    return keywords;
  }

  /**
   * Calculate time-based weight for keywords
   */
  private calculateTimeWeight(ageMs: number, windowMs: number): number {
    // Recent articles get higher weight
    const normalizedAge = ageMs / windowMs;
    return Math.max(0.1, 1 - Math.pow(normalizedAge, 2));
  }

  /**
   * Calculate keyword velocity (rate of mention increase)
   */
  private async calculateKeywordVelocity(
    keyword: string,
    timeWindow: string
  ): Promise<number> {
    try {
      const key = `keyword:${keyword}:timeseries`;
      const now = Date.now();
      const windowMs = TrendingDetector.TIME_WINDOWS[timeWindow as keyof typeof TrendingDetector.TIME_WINDOWS];
      const cutoff = now - windowMs;
      
      // Get mention counts over time
      const mentions = await redis.zrangebyscore(key, cutoff, now, 'WITHSCORES');
      
      if (mentions.length < 4) return 0; // Need minimum data points
      
      // Calculate velocity as rate of change
      const recentHalf = mentions.slice(mentions.length / 2);
      const olderHalf = mentions.slice(0, mentions.length / 2);
      
      const recentCount = recentHalf.length / 2; // WITHSCORES returns value, score pairs
      const olderCount = olderHalf.length / 2;
      
      if (olderCount === 0) return recentCount > 0 ? 1 : 0;
      
      return (recentCount - olderCount) / olderCount;
      
    } catch (error) {
      console.warn(`Failed to calculate velocity for keyword ${keyword}:`, error);
      return 0;
    }
  }

  /**
   * Calculate overall trend score
   */
  private calculateTrendScore(score: KeywordScore): number {
    const frequencyScore = Math.log(score.frequency + 1);
    const sourceScore = Math.log(score.sources.size + 1);
    const velocityScore = Math.max(0, score.velocity);
    
    return frequencyScore * sourceScore * (1 + velocityScore);
  }

  /**
   * Filter keywords that meet trending criteria
   */
  private filterTrendingKeywords(keywordScores: Map<string, KeywordScore>): KeywordScore[] {
    return Array.from(keywordScores.values())
      .filter(score => 
        score.frequency >= TrendingDetector.MIN_MENTIONS &&
        score.sources.size >= TrendingDetector.MIN_SOURCES &&
        score.velocity >= TrendingDetector.MIN_VELOCITY
      )
      .sort((a, b) => b.trendScore - a.trendScore)
      .slice(0, TrendingDetector.MAX_TOPICS);
  }

  /**
   * Group related keywords into topics using clustering
   */
  private async groupIntoTopics(
    keywords: KeywordScore[],
    articles: Array<NewsArticle & { id: string }>
  ): Promise<TrendingTopic[]> {
    const topics: TrendingTopic[] = [];
    const processed = new Set<string>();
    
    for (const keyword of keywords) {
      if (processed.has(keyword.keyword)) continue;
      
      // Find related keywords using semantic similarity
      const relatedKeywords = await this.findRelatedKeywords(keyword, keywords);
      
      // Mark related keywords as processed
      relatedKeywords.forEach(k => processed.add(k.keyword));
      
      // Create topic from keyword group
      const topic = await this.createTopicFromKeywords([keyword, ...relatedKeywords], articles);
      topics.push(topic);
    }
    
    return topics;
  }

  /**
   * Find semantically related keywords
   */
  private async findRelatedKeywords(
    targetKeyword: KeywordScore,
    allKeywords: KeywordScore[]
  ): Promise<KeywordScore[]> {
    const related: KeywordScore[] = [];
    
    for (const keyword of allKeywords) {
      if (keyword.keyword === targetKeyword.keyword) continue;
      
      // Simple string similarity for now (could be enhanced with embeddings)
      const similarity = this.calculateStringSimilarity(
        targetKeyword.keyword,
        keyword.keyword
      );
      
      if (similarity > 0.7) {
        related.push(keyword);
      }
    }
    
    return related.slice(0, 3); // Limit related keywords
  }

  /**
   * Calculate string similarity using longest common subsequence
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    
    let commonWords = 0;
    for (const word1 of words1) {
      if (words2.includes(word1)) {
        commonWords++;
      }
    }
    
    const maxWords = Math.max(words1.length, words2.length);
    return maxWords > 0 ? commonWords / maxWords : 0;
  }

  /**
   * Create topic from keyword group
   */
  private async createTopicFromKeywords(
    keywords: KeywordScore[],
    articles: Array<NewsArticle & { id: string }>
  ): Promise<TrendingTopic> {
    const primaryKeyword = keywords[0];
    const allArticleIds = new Set(keywords.flatMap(k => k.articles));
    const topicArticles = articles.filter(a => allArticleIds.has(a.id));
    
    // Calculate topic metrics
    const totalMentions = keywords.reduce((sum, k) => sum + k.frequency, 0);
    const allSources = new Set(keywords.flatMap(k => Array.from(k.sources)));
    const velocity = keywords.reduce((sum, k) => sum + k.velocity, 0) / keywords.length;
    
    // Generate topic description
    const description = await this.generateTopicDescription(topicArticles.slice(0, 5));
    
    // Calculate confidence based on data quality
    const confidence = this.calculateTopicConfidence(keywords, topicArticles);
    
    // Estimate peak time
    const peakAt = this.estimatePeakTime(topicArticles);
    
    return {
      id: `topic_${Date.now()}_${primaryKeyword.keyword.replace(/\s+/g, '_')}`,
      topic: primaryKeyword.keyword,
      description,
      velocity,
      confidence,
      sources: Array.from(allSources).map(source => ({
        id: source,
        name: source,
        count: topicArticles.filter(a => a.source === source).length,
      })),
      categories: this.extractTopicCategories(topicArticles),
      peakAt,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      articles: topicArticles.slice(0, 10).map(a => ({
        id: a.id,
        title: a.title,
        url: a.url,
        publishedAt: a.publishedAt,
        source: a.source,
      })),
      metadata: {
        totalMentions,
        uniqueSources: allSources.size,
        timespan: '24h',
        relatedTopics: keywords.slice(1).map(k => k.keyword),
      },
    };
  }

  /**
   * Generate topic description using article content
   */
  private async generateTopicDescription(articles: Array<NewsArticle & { id: string }>): Promise<string> {
    if (articles.length === 0) return '';
    
    // Use the most recent article's title/content for description
    const primary = articles[0];
    return primary.content?.substring(0, 200) || primary.title;
  }

  /**
   * Calculate topic confidence score
   */
  private calculateTopicConfidence(
    keywords: KeywordScore[],
    articles: Array<NewsArticle & { id: string }>
  ): number {
    const sourceCount = new Set(articles.map(a => a.source)).size;
    const timeSpread = this.calculateTimeSpread(articles);
    const mentionCount = keywords.reduce((sum, k) => sum + k.frequency, 0);
    
    // Normalize factors to 0-1 range
    const sourceScore = Math.min(1, sourceCount / 5); // 5+ sources = max confidence
    const timeScore = Math.min(1, timeSpread / (6 * 60 * 60 * 1000)); // 6 hours spread = max
    const mentionScore = Math.min(1, mentionCount / 20); // 20+ mentions = max
    
    return (sourceScore + timeScore + mentionScore) / 3;
  }

  /**
   * Calculate time spread of articles
   */
  private calculateTimeSpread(articles: Array<NewsArticle & { id: string }>): number {
    if (articles.length < 2) return 0;
    
    const times = articles.map(a => new Date(a.publishedAt).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    return maxTime - minTime;
  }

  /**
   * Estimate when topic will peak
   */
  private estimatePeakTime(articles: Array<NewsArticle & { id: string }>): Date | undefined {
    if (articles.length < 3) return undefined;
    
    // Simple linear extrapolation based on current velocity
    const recent = articles.slice(0, Math.min(5, articles.length));
    const avgTime = recent.reduce((sum, a) => sum + new Date(a.publishedAt).getTime(), 0) / recent.length;
    
    // Estimate peak 2-4 hours from average article time
    const peakOffset = 2 * 60 * 60 * 1000 + Math.random() * 2 * 60 * 60 * 1000;
    return new Date(avgTime + peakOffset);
  }

  /**
   * Extract categories from topic articles
   */
  private extractTopicCategories(articles: Array<NewsArticle & { id: string }>): string[] {
    const categoryCount = new Map<string, number>();
    
    for (const article of articles) {
      if (article.categories) {
        for (const category of article.categories) {
          categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
        }
      }
    }
    
    return Array.from(categoryCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category]) => category);
  }

  /**
   * Analyze trend changes over time
   */
  private async analyzeTrends(
    topics: TrendingTopic[],
    timeWindow: string
  ): Promise<TrendingAnalysis> {
    // Get previous trending data for comparison
    const previousTopics = await this.getPreviousTrending(timeWindow);
    
    const emerging = topics.filter(topic => 
      topic.velocity > 0.5 && 
      !previousTopics.some(prev => prev.topic === topic.topic)
    );
    
    const declining = previousTopics.filter(prev => 
      !topics.some(current => current.topic === prev.topic) ||
      topics.find(current => current.topic === prev.topic)!.velocity < 0
    );
    
    return {
      topics: topics.slice(0, 20), // Top 20 trending
      emerging: emerging.slice(0, 10),
      declining: declining.slice(0, 10),
      stats: {
        totalTopics: topics.length,
        totalArticles: topics.reduce((sum, t) => sum + t.articles.length, 0),
        uniqueSources: new Set(topics.flatMap(t => t.sources.map(s => s.id))).size,
        timeWindow,
      },
    };
  }

  /**
   * Get previous trending topics for comparison
   */
  private async getPreviousTrending(timeWindow: string): Promise<TrendingTopic[]> {
    try {
      const cacheKey = `trending:${timeWindow}:global:previous`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Failed to get previous trending data:', error);
    }
    
    return [];
  }

  /**
   * Cache trending results
   */
  private async cacheResults(
    analysis: TrendingAnalysis,
    timeWindow: string,
    region?: string
  ): Promise<void> {
    try {
      const cacheKey = `trending:${timeWindow}:${region || 'global'}`;
      const previousKey = `${cacheKey}:previous`;
      
      // Save current results as previous
      const currentCached = await redis.get(cacheKey);
      if (currentCached) {
        await redis.set(previousKey, currentCached, 'EX', 2 * 60 * 60); // 2 hours
      }
      
      // Cache new results
      await redis.set(cacheKey, JSON.stringify(analysis), 'EX', 5 * 60); // 5 minutes
      
    } catch (error) {
      console.error('Failed to cache trending results:', error);
    }
  }

  /**
   * Invalidate trending cache
   */
  private async invalidateTrendingCache(): Promise<void> {
    try {
      const keys = await redis.keys('trending:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.warn('Failed to invalidate trending cache:', error);
    }
  }

  /**
   * Create empty analysis for cases with no data
   */
  private createEmptyAnalysis(timeWindow: string): TrendingAnalysis {
    return {
      topics: [],
      emerging: [],
      declining: [],
      stats: {
        totalTopics: 0,
        totalArticles: 0,
        uniqueSources: 0,
        timeWindow,
      },
    };
  }
}

/**
 * Singleton trending detector instance
 */
export const trendingDetector = new TrendingDetector();

/**
 * Helper function to get current trending topics
 */
export async function getCurrentTrending(
  timeWindow: keyof typeof TrendingDetector.TIME_WINDOWS = '24h',
  region?: string
): Promise<TrendingAnalysis> {
  // Try cache first
  const cached = await trendingDetector.getCachedTrending(timeWindow, region);
  if (cached) {
    return cached;
  }
  
  // Generate new trending analysis
  return await trendingDetector.detectTrending(timeWindow, region);
}

/**
 * Helper function to update trending with new articles
 */
export async function updateTrendingWithArticles(
  articles: (NewsArticle | RSSFeedItem)[]
): Promise<void> {
  await trendingDetector.updateTrendingRealTime(articles);
}