/**
 * RSS feed parsing for news aggregation
 * Based on research.md News Aggregation recommendations
 */

import Parser from 'rss-parser';
import { z } from 'zod';

export interface RSSFeedItem {
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
    url: string;
  };
  author?: string;
  categories: string[];
  language?: string;
}

export interface RSSFeedSource {
  id: string;
  name: string;
  url: string;
  feedUrl: string;
  language: string;
  category: string;
  country?: string;
  isActive: boolean;
  lastFetched?: Date;
  errorCount: number;
}

const RSSItemSchema = z.object({
  title: z.string().min(1),
  link: z.string().url(),
  pubDate: z.string().optional(),
  isoDate: z.string().optional(),
  content: z.string().optional(),
  contentSnippet: z.string().optional(),
  creator: z.string().optional(),
  categories: z.array(z.string()).optional(),
  guid: z.string().optional(),
});

/**
 * RSS feed parser with error handling and normalization
 */
export class RSSFeedParser {
  private parser: Parser;
  private maxRetries = 3;
  private timeout = 10000; // 10 seconds

  constructor() {
    this.parser = new Parser({
      timeout: this.timeout,
      headers: {
        'User-Agent': 'SpotlightX/1.0 RSS Parser',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      requestOptions: {
        rejectUnauthorized: false, // Allow self-signed certificates for some feeds
      },
    });
  }

  /**
   * Parse a single RSS feed URL
   */
  async parseFeed(feedUrl: string, source: RSSFeedSource): Promise<RSSFeedItem[]> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`Parsing RSS feed: ${feedUrl} (attempt ${attempt})`);
        
        const feed = await this.parser.parseURL(feedUrl);
        
        if (!feed.items || feed.items.length === 0) {
          throw new Error('No items found in RSS feed');
        }

        return this.normalizeFeedItems(feed.items, source, feed);
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`RSS parse attempt ${attempt} failed for ${feedUrl}:`, error);
        
        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Failed to parse RSS feed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Parse multiple RSS feeds concurrently
   */
  async parseFeeds(sources: RSSFeedSource[]): Promise<{
    items: RSSFeedItem[];
    errors: Array<{ source: RSSFeedSource; error: string }>;
  }> {
    const activeSources = sources.filter(source => source.isActive);
    
    const results = await Promise.allSettled(
      activeSources.map(source => this.parseFeed(source.feedUrl, source))
    );
    
    const items: RSSFeedItem[] = [];
    const errors: Array<{ source: RSSFeedSource; error: string }> = [];
    
    results.forEach((result, index) => {
      const source = activeSources[index];
      
      if (result.status === 'fulfilled') {
        items.push(...result.value);
      } else {
        errors.push({
          source,
          error: result.reason?.message || 'Unknown error',
        });
      }
    });
    
    return { items, errors };
  }

  /**
   * Normalize RSS items to consistent format
   */
  private normalizeFeedItems(
    items: any[],
    source: RSSFeedSource,
    feed: any
  ): RSSFeedItem[] {
    return items
      .map(item => this.normalizeItem(item, source, feed))
      .filter((item): item is RSSFeedItem => item !== null);
  }

  /**
   * Normalize a single RSS item
   */
  private normalizeItem(
    item: any,
    source: RSSFeedSource,
    feed: any
  ): RSSFeedItem | null {
    try {
      // Validate required fields
      const validated = RSSItemSchema.parse(item);
      
      // Generate unique ID
      const id = this.generateItemId(validated.guid || validated.link, source.id);
      
      // Parse publication date
      const publishedAt = this.parseDate(validated.isoDate || validated.pubDate);
      if (!publishedAt) {
        console.warn(`Skipping item with invalid date: ${validated.title}`);
        return null;
      }
      
      // Extract image URL
      const imageUrl = this.extractImageUrl(item);
      
      // Clean and normalize content
      const content = this.cleanContent(validated.content);
      const description = this.cleanContent(validated.contentSnippet);
      
      return {
        id,
        title: validated.title.trim(),
        content,
        description,
        url: validated.link,
        imageUrl,
        publishedAt,
        source: {
          id: source.id,
          name: source.name,
          url: source.url,
        },
        author: validated.creator?.trim(),
        categories: this.normalizeCategories(validated.categories || [], source.category),
        language: source.language,
      };
      
    } catch (error) {
      console.warn('Failed to normalize RSS item:', error, item);
      return null;
    }
  }

  /**
   * Generate consistent item ID
   */
  private generateItemId(guid: string, sourceId: string): string {
    // Use GUID if available, otherwise hash the URL + source
    const identifier = guid.includes('http') ? guid : `${sourceId}:${guid}`;
    
    // Create a simple hash for consistent IDs
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
      const char = identifier.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `rss_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Parse publication date from various formats
   */
  private parseDate(dateString?: string): Date | null {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      
      // Validate date is reasonable (not too far in future/past)
      const now = new Date();
      const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      
      if (date > oneWeekFromNow || date < oneYearAgo) {
        console.warn(`Date out of range: ${dateString}`);
        return null;
      }
      
      return date;
    } catch (error) {
      console.warn(`Failed to parse date: ${dateString}`);
      return null;
    }
  }

  /**
   * Extract image URL from various RSS formats
   */
  private extractImageUrl(item: any): string | undefined {
    // Try various common image fields
    const imageFields = [
      'enclosure.url',
      'media:content.url',
      'media:thumbnail.url',
      'itunes:image.href',
      'image.url',
      'image',
    ];
    
    for (const field of imageFields) {
      const value = this.getNestedProperty(item, field);
      if (value && typeof value === 'string' && this.isValidImageUrl(value)) {
        return value;
      }
    }
    
    // Try to extract from content
    const content = item.content || item.contentSnippet || '';
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"/i);
    if (imgMatch && imgMatch[1] && this.isValidImageUrl(imgMatch[1])) {
      return imgMatch[1];
    }
    
    return undefined;
  }

  /**
   * Get nested property from object using dot notation
   */
  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Validate image URL
   */
  private isValidImageUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();
      return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path) ||
             parsed.hostname.includes('image') ||
             path.includes('image') ||
             path.includes('photo');
    } catch {
      return false;
    }
  }

  /**
   * Clean HTML content and normalize text
   */
  private cleanContent(content?: string): string | undefined {
    if (!content) return undefined;
    
    // Remove HTML tags
    let cleaned = content.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    cleaned = cleaned
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    
    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned.length > 0 ? cleaned : undefined;
  }

  /**
   * Normalize categories
   */
  private normalizeCategories(categories: string[], defaultCategory: string): string[] {
    const normalized = categories
      .map(cat => cat.trim().toLowerCase())
      .filter(cat => cat.length > 0)
      .slice(0, 5); // Limit to 5 categories
    
    // Ensure at least one category
    if (normalized.length === 0) {
      normalized.push(defaultCategory.toLowerCase());
    }
    
    return [...new Set(normalized)]; // Remove duplicates
  }

  /**
   * Test if RSS feed is accessible
   */
  async testFeed(feedUrl: string): Promise<{
    accessible: boolean;
    itemCount?: number;
    error?: string;
    title?: string;
    description?: string;
  }> {
    try {
      const feed = await this.parser.parseURL(feedUrl);
      
      return {
        accessible: true,
        itemCount: feed.items?.length || 0,
        title: feed.title,
        description: feed.description,
      };
      
    } catch (error) {
      return {
        accessible: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Default RSS feed sources for news aggregation
 */
export const DEFAULT_RSS_SOURCES: RSSFeedSource[] = [
  {
    id: 'bbc_world',
    name: 'BBC World News',
    url: 'https://www.bbc.com',
    feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    language: 'en',
    category: 'general',
    country: 'GB',
    isActive: true,
    errorCount: 0,
  },
  {
    id: 'cnn_world',
    name: 'CNN World',
    url: 'https://www.cnn.com',
    feedUrl: 'https://rss.cnn.com/rss/edition.rss',
    language: 'en',
    category: 'general',
    country: 'US',
    isActive: true,
    errorCount: 0,
  },
  {
    id: 'reuters_world',
    name: 'Reuters World News',
    url: 'https://www.reuters.com',
    feedUrl: 'https://www.reuters.com/tools/rss',
    language: 'en',
    category: 'general',
    country: 'US',
    isActive: true,
    errorCount: 0,
  },
  {
    id: 'nytimes_world',
    name: 'New York Times World',
    url: 'https://www.nytimes.com',
    feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    language: 'en',
    category: 'general',
    country: 'US',
    isActive: true,
    errorCount: 0,
  },
  {
    id: 'guardian_world',
    name: 'The Guardian World',
    url: 'https://www.theguardian.com',
    feedUrl: 'https://www.theguardian.com/world/rss',
    language: 'en',
    category: 'general',
    country: 'GB',
    isActive: true,
    errorCount: 0,
  },
  {
    id: 'ap_news',
    name: 'Associated Press',
    url: 'https://apnews.com',
    feedUrl: 'https://apnews.com/apf-topnews',
    language: 'en',
    category: 'general',
    country: 'US',
    isActive: true,
    errorCount: 0,
  },
];

/**
 * Singleton RSS parser instance
 */
export const rssParser = new RSSFeedParser();

/**
 * Utility functions for RSS management
 */
export class RSSFeedManager {
  private sources: RSSFeedSource[] = [...DEFAULT_RSS_SOURCES];
  private parser = new RSSFeedParser();

  /**
   * Add new RSS source
   */
  async addSource(source: Omit<RSSFeedSource, 'id' | 'errorCount' | 'lastFetched'>): Promise<RSSFeedSource> {
    // Test feed accessibility
    const test = await this.parser.testFeed(source.feedUrl);
    if (!test.accessible) {
      throw new Error(`RSS feed not accessible: ${test.error}`);
    }

    const newSource: RSSFeedSource = {
      ...source,
      id: this.generateSourceId(source.name),
      errorCount: 0,
    };

    this.sources.push(newSource);
    return newSource;
  }

  /**
   * Remove RSS source
   */
  removeSource(sourceId: string): boolean {
    const initialLength = this.sources.length;
    this.sources = this.sources.filter(source => source.id !== sourceId);
    return this.sources.length < initialLength;
  }

  /**
   * Get all sources
   */
  getSources(): RSSFeedSource[] {
    return [...this.sources];
  }

  /**
   * Get active sources
   */
  getActiveSources(): RSSFeedSource[] {
    return this.sources.filter(source => source.isActive);
  }

  /**
   * Update source status
   */
  updateSource(sourceId: string, updates: Partial<RSSFeedSource>): boolean {
    const sourceIndex = this.sources.findIndex(source => source.id === sourceId);
    if (sourceIndex === -1) return false;

    this.sources[sourceIndex] = { ...this.sources[sourceIndex], ...updates };
    return true;
  }

  /**
   * Generate unique source ID
   */
  private generateSourceId(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const timestamp = Date.now().toString(36);
    return `${base}_${timestamp}`;
  }

  /**
   * Parse all active feeds
   */
  async parseAllFeeds(): Promise<{
    items: RSSFeedItem[];
    errors: Array<{ source: RSSFeedSource; error: string }>;
    stats: {
      totalSources: number;
      successfulSources: number;
      totalItems: number;
    };
  }> {
    const activeSources = this.getActiveSources();
    const result = await this.parser.parseFeeds(activeSources);

    // Update error counts
    result.errors.forEach(({ source }) => {
      this.updateSource(source.id, {
        errorCount: source.errorCount + 1,
        lastFetched: new Date(),
      });
    });

    // Update successful sources
    const successfulSourceIds = new Set(
      activeSources
        .filter(source => !result.errors.some(err => err.source.id === source.id))
        .map(source => source.id)
    );

    successfulSourceIds.forEach(sourceId => {
      this.updateSource(sourceId, {
        errorCount: 0,
        lastFetched: new Date(),
      });
    });

    return {
      ...result,
      stats: {
        totalSources: activeSources.length,
        successfulSources: successfulSourceIds.size,
        totalItems: result.items.length,
      },
    };
  }
}

/**
 * Singleton RSS feed manager instance
 */
export const rssFeedManager = new RSSFeedManager();