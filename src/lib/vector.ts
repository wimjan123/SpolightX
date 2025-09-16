import { prisma } from '@/lib/prisma';

/**
 * Vector similarity search utilities for pgvector integration
 * Based on research.md Vector Storage recommendations
 */

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  distanceMetric?: 'l2' | 'cosine' | 'dot_product';
}

export interface SimilarityResult {
  id: string;
  distance: number;
  content: string;
  authorId: string;
  authorType: 'USER' | 'PERSONA';
  createdAt: Date;
}

/**
 * Convert OpenAI embedding array to pgvector format
 */
export function formatEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Parse pgvector format back to number array
 */
export function parseEmbedding(vectorString: string): number[] {
  return vectorString
    .slice(1, -1) // Remove brackets
    .split(',')
    .map((val) => parseFloat(val.trim()));
}

/**
 * Find similar posts using vector similarity search
 * Uses L2 distance for general content similarity as recommended in research.md
 */
export async function findSimilarPosts(
  embedding: number[],
  options: VectorSearchOptions = {}
): Promise<SimilarityResult[]> {
  const {
    limit = 10,
    threshold = 0.8,
    distanceMetric = 'l2',
  } = options;

  const vectorString = formatEmbedding(embedding);
  
  // Build distance operator based on metric
  const distanceOp = {
    l2: '<->',
    cosine: '<=>',
    dot_product: '<#>',
  }[distanceMetric];

  // Raw SQL query for vector similarity search
  // Using raw SQL because Prisma doesn't fully support vector operations yet
  const query = `
    SELECT 
      id,
      content,
      "authorId",
      "authorType",
      "createdAt",
      "contentEmbedding" ${distanceOp} $1::vector as distance
    FROM posts 
    WHERE 
      "contentEmbedding" IS NOT NULL
      AND "visibility" = 'PUBLIC'
      AND ("contentEmbedding" ${distanceOp} $1::vector) < $2
    ORDER BY distance ASC
    LIMIT $3
  `;

  const results = await prisma.$queryRawUnsafe<any[]>(
    query,
    vectorString,
    threshold,
    limit
  );

  return results.map((row) => ({
    id: row.id,
    distance: parseFloat(row.distance),
    content: row.content,
    authorId: row.authorId,
    authorType: row.authorType,
    createdAt: row.createdAt,
  }));
}

/**
 * Store embedding for a post
 */
export async function storePostEmbedding(
  postId: string,
  embedding: number[]
): Promise<void> {
  const vectorString = formatEmbedding(embedding);
  
  await prisma.$executeRawUnsafe(
    'UPDATE posts SET "contentEmbedding" = $1::vector WHERE id = $2',
    vectorString,
    postId
  );
}

/**
 * Find users with similar content preferences using vector similarity
 * Based on their interaction history and content embeddings
 */
export async function findSimilarContentPreferences(
  userEmbedding: number[],
  options: VectorSearchOptions = {}
): Promise<{ userId: string; similarity: number }[]> {
  const { limit = 5, threshold = 0.7 } = options;
  const vectorString = formatEmbedding(userEmbedding);

  // This would require a separate user_preferences table with embeddings
  // For now, return empty array as this feature needs additional schema
  console.warn('findSimilarContentPreferences: Not yet implemented - requires user preference embeddings');
  return [];
}

/**
 * Calculate cosine similarity between two embeddings
 * Useful for client-side similarity calculations
 */
export function calculateCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Batch process embeddings for multiple posts
 * Useful for initial data migration or bulk updates
 */
export async function batchStoreEmbeddings(
  embeddings: Array<{ postId: string; embedding: number[] }>
): Promise<void> {
  const batchSize = 100;
  
  for (let i = 0; i < embeddings.length; i += batchSize) {
    const batch = embeddings.slice(i, i + batchSize);
    
    const updatePromises = batch.map(({ postId, embedding }) =>
      storePostEmbedding(postId, embedding)
    );
    
    await Promise.all(updatePromises);
    
    // Small delay to avoid overwhelming the database
    if (i + batchSize < embeddings.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Get posts that need embeddings generated
 * Useful for background job processing
 */
export async function getPostsNeedingEmbeddings(limit = 50): Promise<Array<{
  id: string;
  content: string;
  authorType: string;
}>> {
  const posts = await prisma.post.findMany({
    where: {
      contentEmbedding: null,
      visibility: 'PUBLIC',
    },
    select: {
      id: true,
      content: true,
      authorType: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });

  return posts;
}