/**
 * Article deduplication using vector similarity and content analysis
 * Based on research.md deduplication strategy recommendations
 */

import { generateEmbedding } from '@/lib/ai/embedding';
import { prisma } from '@/lib/prisma';
import type { NewsArticle } from '@/lib/news/client';
import type { RSSFeedItem } from '@/lib/news/rss-parser';

export interface DeduplicationResult {
  isOriginal: boolean;
  duplicateOf?: string;
  similarityScore?: number;
  method: 'url' | 'title' | 'content' | 'embedding';
  confidence: number;
}

export interface DuplicateGroup {
  primaryArticle: NewsArticle | RSSFeedItem;
  duplicates: Array<{
    article: NewsArticle | RSSFeedItem;
    similarityScore: number;
    method: string;
  }>;
  consolidatedContent?: string;
}

/**
 * Article deduplication engine with multiple detection methods
 */
export class ArticleDeduplicator {
  private static readonly SIMILARITY_THRESHOLDS = {
    url: 0.95,           // Near-identical URLs
    title: 0.85,         // Very similar titles
    content: 0.80,       // Similar content text
    embedding: 0.85,     // Semantic similarity threshold from research.md
  };

  private static readonly CONFIDENCE_WEIGHTS = {
    url: 1.0,
    title: 0.8,
    content: 0.7,
    embedding: 0.9,
  };

  /**
   * Check if article is duplicate of existing content
   */
  async checkDuplicate(
    article: NewsArticle | RSSFeedItem,
    timeWindow: number = 7 * 24 * 60 * 60 * 1000 // 7 days
  ): Promise<DeduplicationResult> {
    const cutoffDate = new Date(Date.now() - timeWindow);

    // 1. URL-based duplicate detection (fastest)
    const urlDuplicate = await this.checkUrlDuplicate(article, cutoffDate);
    if (urlDuplicate.isOriginal === false) {
      return urlDuplicate;
    }

    // 2. Title-based similarity
    const titleDuplicate = await this.checkTitleSimilarity(article, cutoffDate);
    if (titleDuplicate.isOriginal === false) {
      return titleDuplicate;
    }

    // 3. Content-based similarity (if content available)
    if (article.content) {
      const contentDuplicate = await this.checkContentSimilarity(article, cutoffDate);
      if (contentDuplicate.isOriginal === false) {
        return contentDuplicate;
      }
    }

    // 4. Embedding-based semantic similarity (most accurate)
    try {
      const embeddingDuplicate = await this.checkEmbeddingSimilarity(article, cutoffDate);
      if (embeddingDuplicate.isOriginal === false) {
        return embeddingDuplicate;
      }
    } catch (error) {
      console.warn('Embedding similarity check failed:', error);
      // Continue without embedding check
    }

    return {
      isOriginal: true,
      method: 'none',
      confidence: 1.0,
    };
  }

  /**
   * Batch deduplication for multiple articles
   */
  async batchDeduplicate(
    articles: (NewsArticle | RSSFeedItem)[],
    timeWindow?: number
  ): Promise<{
    original: (NewsArticle | RSSFeedItem)[];
    duplicates: Array<{
      article: NewsArticle | RSSFeedItem;
      result: DeduplicationResult;
    }>;
    groups: DuplicateGroup[];
  }> {
    const results = await Promise.all(
      articles.map(async article => ({
        article,
        result: await this.checkDuplicate(article, timeWindow),
      }))
    );

    const original = results
      .filter(({ result }) => result.isOriginal)
      .map(({ article }) => article);

    const duplicates = results.filter(({ result }) => !result.isOriginal);

    // Group duplicates by similarity
    const groups = await this.groupDuplicates(articles);

    return { original, duplicates, groups };
  }

  /**
   * URL-based duplicate detection
   */
  private async checkUrlDuplicate(
    article: NewsArticle | RSSFeedItem,
    cutoffDate: Date
  ): Promise<DeduplicationResult> {
    // Normalize URL for comparison
    const normalizedUrl = this.normalizeUrl(article.url);

    // Check exact URL matches
    const exactMatch = await prisma.newsItem.findFirst({
      where: {
        url: normalizedUrl,
        createdAt: { gte: cutoffDate },
      },
      select: { id: true, url: true },
    });

    if (exactMatch) {
      return {
        isOriginal: false,
        duplicateOf: exactMatch.id,
        similarityScore: 1.0,
        method: 'url',
        confidence: 1.0,
      };
    }

    // Check similar URLs (domain redirects, different protocols, etc.)
    const similarUrls = await this.findSimilarUrls(normalizedUrl, cutoffDate);
    
    for (const similar of similarUrls) {
      const similarity = this.calculateUrlSimilarity(normalizedUrl, similar.url);
      if (similarity >= ArticleDeduplicator.SIMILARITY_THRESHOLDS.url) {
        return {
          isOriginal: false,
          duplicateOf: similar.id,
          similarityScore: similarity,
          method: 'url',
          confidence: ArticleDeduplicator.CONFIDENCE_WEIGHTS.url * similarity,
        };
      }
    }

    return { isOriginal: true, method: 'url', confidence: 1.0 };
  }

  /**
   * Title-based similarity detection
   */
  private async checkTitleSimilarity(
    article: NewsArticle | RSSFeedItem,
    cutoffDate: Date
  ): Promise<DeduplicationResult> {
    const normalizedTitle = this.normalizeTitle(article.title);

    // Get articles with similar titles using PostgreSQL similarity
    const similarTitles = await prisma.$queryRaw<Array<{ id: string; title: string; similarity: number }>>`
      SELECT id, title, similarity(title, ${normalizedTitle}) as similarity
      FROM "NewsItem" 
      WHERE created_at >= ${cutoffDate}
        AND similarity(title, ${normalizedTitle}) > ${ArticleDeduplicator.SIMILARITY_THRESHOLDS.title}
      ORDER BY similarity DESC
      LIMIT 5
    `;

    if (similarTitles.length > 0) {
      const best = similarTitles[0];
      return {
        isOriginal: false,
        duplicateOf: best.id,
        similarityScore: best.similarity,
        method: 'title',
        confidence: ArticleDeduplicator.CONFIDENCE_WEIGHTS.title * best.similarity,
      };
    }

    return { isOriginal: true, method: 'title', confidence: 1.0 };
  }

  /**
   * Content-based similarity detection
   */
  private async checkContentSimilarity(
    article: NewsArticle | RSSFeedItem,
    cutoffDate: Date
  ): Promise<DeduplicationResult> {
    if (!article.content) {
      return { isOriginal: true, method: 'content', confidence: 0.5 };
    }

    const normalizedContent = this.normalizeContent(article.content);
    const contentHash = this.generateContentHash(normalizedContent);

    // Check for identical content hashes
    const hashMatch = await prisma.newsItem.findFirst({
      where: {
        processingNotes: {
          path: ['contentHash'],
          equals: contentHash,
        },
        createdAt: { gte: cutoffDate },
      },
      select: { id: true },
    });

    if (hashMatch) {
      return {
        isOriginal: false,
        duplicateOf: hashMatch.id,
        similarityScore: 1.0,
        method: 'content',
        confidence: ArticleDeduplicator.CONFIDENCE_WEIGHTS.content,
      };
    }

    // Check for similar content using trigram similarity
    const similarContent = await prisma.$queryRaw<Array<{ id: string; content: string; similarity: number }>>`
      SELECT id, content, similarity(content, ${normalizedContent}) as similarity
      FROM "NewsItem" 
      WHERE created_at >= ${cutoffDate}
        AND content IS NOT NULL
        AND similarity(content, ${normalizedContent}) > ${ArticleDeduplicator.SIMILARITY_THRESHOLDS.content}
      ORDER BY similarity DESC
      LIMIT 3
    `;

    if (similarContent.length > 0) {
      const best = similarContent[0];
      return {
        isOriginal: false,
        duplicateOf: best.id,
        similarityScore: best.similarity,
        method: 'content',
        confidence: ArticleDeduplicator.CONFIDENCE_WEIGHTS.content * best.similarity,
      };
    }

    return { isOriginal: true, method: 'content', confidence: 1.0 };
  }

  /**
   * Embedding-based semantic similarity detection
   */
  private async checkEmbeddingSimilarity(
    article: NewsArticle | RSSFeedItem,
    cutoffDate: Date
  ): Promise<DeduplicationResult> {
    // Generate embedding for the article
    const contentForEmbedding = this.prepareContentForEmbedding(article);
    const embedding = await generateEmbedding(contentForEmbedding);

    // Find similar articles using vector similarity
    const similarArticles = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      similarity: number;
    }>>`
      SELECT id, title, 
             1 - (content_embedding <-> ${JSON.stringify(embedding)}::vector) as similarity
      FROM "NewsItem" 
      WHERE created_at >= ${cutoffDate}
        AND content_embedding IS NOT NULL
        AND 1 - (content_embedding <-> ${JSON.stringify(embedding)}::vector) > ${ArticleDeduplicator.SIMILARITY_THRESHOLDS.embedding}
      ORDER BY content_embedding <-> ${JSON.stringify(embedding)}::vector
      LIMIT 5
    `;

    if (similarArticles.length > 0) {
      const best = similarArticles[0];
      return {
        isOriginal: false,
        duplicateOf: best.id,
        similarityScore: best.similarity,
        method: 'embedding',
        confidence: ArticleDeduplicator.CONFIDENCE_WEIGHTS.embedding * best.similarity,
      };
    }

    return { isOriginal: true, method: 'embedding', confidence: 1.0 };
  }

  /**
   * Group duplicate articles together
   */
  private async groupDuplicates(
    articles: (NewsArticle | RSSFeedItem)[]
  ): Promise<DuplicateGroup[]> {
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    for (const article of articles) {
      const articleKey = this.getArticleKey(article);
      if (processed.has(articleKey)) continue;

      // Find all duplicates of this article
      const duplicates: DuplicateGroup['duplicates'] = [];
      
      for (const otherArticle of articles) {
        const otherKey = this.getArticleKey(otherArticle);
        if (otherKey === articleKey || processed.has(otherKey)) continue;

        const result = await this.checkDuplicate(otherArticle);
        if (!result.isOriginal && result.duplicateOf === articleKey) {
          duplicates.push({
            article: otherArticle,
            similarityScore: result.similarityScore || 0,
            method: result.method,
          });
          processed.add(otherKey);
        }
      }

      if (duplicates.length > 0) {
        groups.push({
          primaryArticle: article,
          duplicates,
          consolidatedContent: await this.consolidateContent([article, ...duplicates.map(d => d.article)]),
        });
      }

      processed.add(articleKey);
    }

    return groups;
  }

  /**
   * Normalize URL for comparison
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      
      // Remove common tracking parameters
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source'];
      paramsToRemove.forEach(param => parsed.searchParams.delete(param));
      
      // Normalize protocol and www
      parsed.protocol = 'https:';
      if (parsed.hostname.startsWith('www.')) {
        parsed.hostname = parsed.hostname.substring(4);
      }
      
      // Remove trailing slash
      if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
      
      return parsed.toString();
    } catch {
      return url.trim();
    }
  }

  /**
   * Find URLs similar to the given URL
   */
  private async findSimilarUrls(normalizedUrl: string, cutoffDate: Date) {
    const domain = new URL(normalizedUrl).hostname;
    
    return await prisma.newsItem.findMany({
      where: {
        url: { contains: domain },
        createdAt: { gte: cutoffDate },
      },
      select: { id: true, url: true },
      take: 10,
    });
  }

  /**
   * Calculate URL similarity using domain and path comparison
   */
  private calculateUrlSimilarity(url1: string, url2: string): number {
    try {
      const parsed1 = new URL(url1);
      const parsed2 = new URL(url2);
      
      // Same domain gets high base score
      if (parsed1.hostname !== parsed2.hostname) {
        return 0;
      }
      
      // Calculate path similarity
      const path1 = parsed1.pathname.split('/').filter(p => p.length > 0);
      const path2 = parsed2.pathname.split('/').filter(p => p.length > 0);
      
      const maxLength = Math.max(path1.length, path2.length);
      if (maxLength === 0) return 1.0;
      
      let matches = 0;
      for (let i = 0; i < maxLength; i++) {
        if (path1[i] === path2[i]) {
          matches++;
        }
      }
      
      return matches / maxLength;
    } catch {
      return 0;
    }
  }

  /**
   * Normalize title for comparison
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalize content for comparison
   */
  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 2000); // Limit to first 2000 chars for comparison
  }

  /**
   * Generate content hash for identical content detection
   */
  private generateContentHash(content: string): string {
    // Simple hash function for content deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Prepare content for embedding generation
   */
  private prepareContentForEmbedding(article: NewsArticle | RSSFeedItem): string {
    const parts = [
      article.title,
      article.description || '',
      article.content?.substring(0, 1000) || '', // Limit content length for embedding
    ].filter(part => part.length > 0);
    
    return parts.join(' ').trim();
  }

  /**
   * Get unique key for article
   */
  private getArticleKey(article: NewsArticle | RSSFeedItem): string {
    return 'id' in article ? article.id : this.normalizeUrl(article.url);
  }

  /**
   * Consolidate content from duplicate articles
   */
  private async consolidateContent(articles: (NewsArticle | RSSFeedItem)[]): Promise<string> {
    // Sort by publication date (newest first)
    const sorted = articles.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // Use the most recent article's content as primary
    const primary = sorted[0];
    
    // If primary has no content, try to find the best content from duplicates
    if (!primary.content || primary.content.length < 100) {
      const withContent = sorted.find(article => 
        article.content && article.content.length >= 100
      );
      
      if (withContent) {
        return withContent.content;
      }
    }

    return primary.content || primary.description || primary.title;
  }
}

/**
 * Singleton deduplicator instance
 */
export const articleDeduplicator = new ArticleDeduplicator();

/**
 * Helper function for quick duplicate check
 */
export async function isDuplicate(
  article: NewsArticle | RSSFeedItem,
  timeWindow?: number
): Promise<boolean> {
  const result = await articleDeduplicator.checkDuplicate(article, timeWindow);
  return !result.isOriginal;
}

/**
 * Helper function for batch deduplication
 */
export async function deduplicateArticles(
  articles: (NewsArticle | RSSFeedItem)[],
  timeWindow?: number
): Promise<(NewsArticle | RSSFeedItem)[]> {
  const result = await articleDeduplicator.batchDeduplicate(articles, timeWindow);
  return result.original;
}