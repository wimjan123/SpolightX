/**
 * NewsData.io API client
 * Based on research.md News Aggregation recommendations
 */

import { env } from '@/lib/env';

export interface NewsArticle {
  id: string;
  title: string;
  content?: string;
  description?: string;
  url: string;
  imageUrl?: string;
  publishedAt: Date;
  source: {
    id: string;
    name: string;
    url?: string;
  };
  author?: string;
  categories: string[];
  country?: string;
  language?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface NewsSearchParams {
  query?: string;
  categories?: string[];
  countries?: string[];
  languages?: string[];
  domains?: string[];
  excludeDomains?: string[];
  from?: Date;
  to?: Date;
  sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
  pageSize?: number;
  page?: number;
}

export interface NewsResponse {
  articles: NewsArticle[];
  totalResults: number;
  status: string;
  nextPage?: string;
}

/**
 * NewsData.io API client
 * Using the superior service identified in research.md
 */
export class NewsDataClient {
  private apiKey: string;
  private baseUrl: string;
  private rateLimitRemaining = 200; // Default daily limit
  private rateLimitReset = new Date();

  constructor() {
    this.apiKey = env.NEWS_API_KEY;
    this.baseUrl = env.NEWS_API_URL;
  }

  /**
   * Get latest news with optional filtering
   */
  async getLatestNews(params: NewsSearchParams = {}): Promise<NewsResponse> {
    const searchParams = new URLSearchParams({
      apikey: this.apiKey,
      language: 'en', // Default to English
      ...(params.query && { q: params.query }),
      ...(params.categories?.length && { category: params.categories.join(',') }),
      ...(params.countries?.length && { country: params.countries.join(',') }),
      ...(params.languages?.length && { language: params.languages.join(',') }),
      ...(params.domains?.length && { domain: params.domains.join(',') }),
      ...(params.excludeDomains?.length && { excludedomain: params.excludeDomains.join(',') }),
      ...(params.sortBy && { prioritydomain: params.sortBy === 'popularity' ? 'top' : 'latest' }),
      ...(params.pageSize && { size: params.pageSize.toString() }),
      ...(params.page && { page: params.page.toString() }),
    });

    const response = await this.makeRequest(`/news?${searchParams}`);
    return this.transformResponse(response);
  }

  /**
   * Search archived news
   */
  async searchNews(params: NewsSearchParams): Promise<NewsResponse> {
    const searchParams = new URLSearchParams({
      apikey: this.apiKey,
      ...(params.query && { q: params.query }),
      ...(params.categories?.length && { category: params.categories.join(',') }),
      ...(params.from && { from_date: params.from.toISOString().split('T')[0] }),
      ...(params.to && { to_date: params.to.toISOString().split('T')[0] }),
      ...(params.pageSize && { size: params.pageSize.toString() }),
    });

    const response = await this.makeRequest(`/archive?${searchParams}`);
    return this.transformResponse(response);
  }

  /**
   * Get trending topics
   */
  async getTrendingTopics(
    timeframe: '1h' | '6h' | '24h' = '24h',
    region?: string
  ): Promise<Array<{
    topic: string;
    count: number;
    velocity: number;
    articles: NewsArticle[];
  }>> {
    // NewsData.io doesn't have a direct trending endpoint
    // We'll simulate this by getting latest news and analyzing keywords
    const params: NewsSearchParams = {
      pageSize: 100,
      sortBy: 'publishedAt',
      ...(region && { countries: [region] }),
    };

    const news = await this.getLatestNews(params);
    return this.extractTrendingTopics(news.articles, timeframe);
  }

  /**
   * Get news sources
   */
  async getSources(
    categories?: string[],
    countries?: string[]
  ): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    url: string;
    category: string;
    country: string;
    language: string;
  }>> {
    const searchParams = new URLSearchParams({
      apikey: this.apiKey,
      ...(categories?.length && { category: categories.join(',') }),
      ...(countries?.length && { country: countries.join(',') }),
    });

    const response = await this.makeRequest(`/sources?${searchParams}`);
    return response.results || [];
  }

  /**
   * Check API rate limits
   */
  getRateLimitStatus(): {
    remaining: number;
    resetTime: Date;
    canMakeRequest: boolean;
  } {
    return {
      remaining: this.rateLimitRemaining,
      resetTime: this.rateLimitReset,
      canMakeRequest: this.rateLimitRemaining > 0,
    };
  }

  /**
   * Make HTTP request to NewsData.io API
   */
  private async makeRequest(endpoint: string): Promise<any> {
    if (this.rateLimitRemaining <= 0 && new Date() < this.rateLimitReset) {
      throw new Error(`Rate limit exceeded. Resets at ${this.rateLimitReset}`);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SpotlightX/1.0',
        },
      });

      // Update rate limit info from headers
      this.updateRateLimitInfo(response);

      if (!response.ok) {
        throw new Error(`NewsData.io API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(`NewsData.io error: ${data.message}`);
      }

      return data;
      
    } catch (error) {
      console.error('NewsData.io API request failed:', error);
      throw error;
    }
  }

  /**
   * Update rate limit information from response headers
   */
  private updateRateLimitInfo(response: Response): void {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');

    if (remaining) {
      this.rateLimitRemaining = parseInt(remaining, 10);
    }

    if (reset) {
      this.rateLimitReset = new Date(parseInt(reset, 10) * 1000);
    }
  }

  /**
   * Transform NewsData.io response to our format
   */
  private transformResponse(data: any): NewsResponse {
    const articles: NewsArticle[] = (data.results || []).map((article: any) => ({
      id: article.article_id || article.link,
      title: article.title,
      content: article.content,
      description: article.description,
      url: article.link,
      imageUrl: article.image_url,
      publishedAt: new Date(article.pubDate),
      source: {
        id: article.source_id,
        name: article.source_name || article.source_id,
        url: article.source_url,
      },
      author: article.creator?.[0] || undefined,
      categories: article.category || [],
      country: article.country?.[0],
      language: article.language,
      sentiment: article.sentiment,
    }));

    return {
      articles,
      totalResults: data.totalResults || articles.length,
      status: data.status,
      nextPage: data.nextPage,
    };
  }

  /**
   * Extract trending topics from articles using keyword analysis
   */
  private extractTrendingTopics(
    articles: NewsArticle[],
    timeframe: string
  ): Array<{
    topic: string;
    count: number;
    velocity: number;
    articles: NewsArticle[];
  }> {
    // Simple keyword extraction and trending analysis
    const keywords = new Map<string, { count: number; articles: NewsArticle[] }>();
    
    // Get cutoff time based on timeframe
    const cutoffTime = new Date();
    switch (timeframe) {
      case '1h':
        cutoffTime.setHours(cutoffTime.getHours() - 1);
        break;
      case '6h':
        cutoffTime.setHours(cutoffTime.getHours() - 6);
        break;
      case '24h':
        cutoffTime.setDate(cutoffTime.getDate() - 1);
        break;
    }

    // Filter articles by timeframe
    const recentArticles = articles.filter(article => article.publishedAt >= cutoffTime);

    // Extract keywords from titles and descriptions
    recentArticles.forEach(article => {
      const text = `${article.title} ${article.description || ''}`.toLowerCase();
      const words = text
        .split(/\s+/)
        .filter(word => word.length > 3 && !this.isStopWord(word))
        .map(word => word.replace(/[^\w]/g, ''));

      words.forEach(word => {
        if (!keywords.has(word)) {
          keywords.set(word, { count: 0, articles: [] });
        }
        const data = keywords.get(word)!;
        data.count++;
        data.articles.push(article);
      });
    });

    // Convert to trending topics and calculate velocity
    const trending = Array.from(keywords.entries())
      .filter(([_, data]) => data.count >= 3) // Minimum threshold
      .map(([topic, data]) => ({
        topic,
        count: data.count,
        velocity: this.calculateVelocity(data.articles, timeframe),
        articles: data.articles.slice(0, 5), // Top 5 articles
      }))
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 10); // Top 10 trending topics

    return trending;
  }

  /**
   * Calculate velocity score for trending topics
   */
  private calculateVelocity(articles: NewsArticle[], timeframe: string): number {
    const now = new Date();
    let timeWeight = 0;
    
    articles.forEach(article => {
      const hoursAgo = (now.getTime() - article.publishedAt.getTime()) / (1000 * 60 * 60);
      
      // More recent articles get higher weight
      let weight = 1;
      if (hoursAgo < 1) weight = 5;
      else if (hoursAgo < 6) weight = 3;
      else if (hoursAgo < 12) weight = 2;
      else if (hoursAgo < 24) weight = 1.5;
      
      timeWeight += weight;
    });

    return timeWeight / articles.length;
  }

  /**
   * Simple stop word filter
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'from', 'this', 'that', 'these', 'those', 'a', 'an', 'is', 'are', 'was', 'were',
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'said', 'says', 'new', 'also',
      'its', 'his', 'her', 'their', 'our', 'your', 'my', 'me', 'him', 'them', 'us',
      'she', 'he', 'it', 'we', 'you', 'they', 'who', 'what', 'when', 'where', 'why', 'how'
    ]);
    
    return stopWords.has(word.toLowerCase());
  }
}

/**
 * Singleton instance
 */
export const newsClient = new NewsDataClient();

/**
 * RSS Feed fallback client for when NewsData.io is unavailable
 */
export class RSSFeedClient {
  private sources = [
    'https://rss.cnn.com/rss/edition.rss',
    'https://feeds.bbci.co.uk/news/rss.xml',
    'https://www.reuters.com/tools/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  ];

  async getFeedArticles(feedUrl: string): Promise<NewsArticle[]> {
    try {
      // Note: RSS parsing would typically require a library like 'rss-parser'
      // For now, this is a placeholder implementation
      console.warn('RSS parsing not implemented - install rss-parser for full functionality');
      
      return [];
      
    } catch (error) {
      console.error(`Failed to parse RSS feed ${feedUrl}:`, error);
      return [];
    }
  }

  async getAllFeeds(): Promise<NewsArticle[]> {
    const results = await Promise.allSettled(
      this.sources.map(source => this.getFeedArticles(source))
    );

    return results
      .filter((result): result is PromiseFulfilledResult<NewsArticle[]> => 
        result.status === 'fulfilled'
      )
      .flatMap(result => result.value);
  }
}

export const rssClient = new RSSFeedClient();