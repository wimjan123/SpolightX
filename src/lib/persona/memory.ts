/**
 * Persona memory systems for maintaining context and relationships
 * Based on research.md GABM memory architecture recommendations
 */

import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { generateEmbedding } from '@/lib/ai/embedding';

export interface ShortTermMemory {
  id: string;
  personaId: string;
  type: 'interaction' | 'content' | 'event' | 'conversation';
  data: {
    content: string;
    context: any;
    entities: string[];
    sentiment: number;
    importance: number; // 0-1 scale
  };
  timestamp: Date;
  expiresAt: Date;
  embedding?: number[];
}

export interface LongTermMemory {
  id: string;
  personaId: string;
  type: 'relationship' | 'preference' | 'knowledge' | 'pattern';
  summary: string;
  details: any;
  strength: number; // 0-1, how well-established this memory is
  lastAccessed: Date;
  createdAt: Date;
  associations: string[]; // Related memory IDs
  embedding?: number[];
}

export interface MemoryRetrievalQuery {
  personaId: string;
  query: string;
  type?: ShortTermMemory['type'] | LongTermMemory['type'];
  timeWindow?: {
    start: Date;
    end: Date;
  };
  limit?: number;
  similarityThreshold?: number;
}

export interface MemoryRetrievalResult {
  shortTerm: ShortTermMemory[];
  longTerm: LongTermMemory[];
  relevanceScores: Map<string, number>;
  totalMemories: number;
}

/**
 * Persona memory management system
 */
export class PersonaMemorySystem {
  private static readonly SHORT_TERM_DURATION = {
    interaction: 2 * 60 * 60 * 1000,    // 2 hours
    content: 6 * 60 * 60 * 1000,       // 6 hours
    event: 24 * 60 * 60 * 1000,        // 24 hours
    conversation: 48 * 60 * 60 * 1000,  // 48 hours
  };

  private static readonly LONG_TERM_THRESHOLD = {
    minInteractions: 3,     // Minimum interactions to form long-term memory
    minImportance: 0.6,     // Minimum importance score for consolidation
    minStrength: 0.7,       // Minimum strength for retention
  };

  private static readonly MEMORY_WEIGHTS = {
    recency: 0.3,           // How recent the memory is
    frequency: 0.3,         // How often it's been accessed
    importance: 0.4,        // Inherent importance of the memory
  };

  /**
   * Store new short-term memory
   */
  async storeShortTermMemory(memory: Omit<ShortTermMemory, 'id' | 'expiresAt' | 'embedding'>): Promise<string> {
    const duration = PersonaMemorySystem.SHORT_TERM_DURATION[memory.type];
    const expiresAt = new Date(Date.now() + duration);
    
    // Generate embedding for semantic search
    const embedding = await this.generateMemoryEmbedding(memory.data.content);
    
    const fullMemory: ShortTermMemory = {
      ...memory,
      id: `stm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      expiresAt,
      embedding,
    };
    
    // Store in Redis for fast access
    const redisKey = `memory:short:${memory.personaId}:${fullMemory.id}`;
    await redis.setex(
      redisKey,
      Math.floor(duration / 1000),
      JSON.stringify(fullMemory)
    );
    
    // Add to persona's memory index
    await this.addToMemoryIndex(memory.personaId, fullMemory.id, 'short');
    
    // Check if this should trigger consolidation
    await this.checkConsolidationTriggers(memory.personaId, fullMemory);
    
    console.log(`Stored short-term memory ${fullMemory.id} for persona ${memory.personaId}`);
    return fullMemory.id;
  }

  /**
   * Store new long-term memory
   */
  async storeLongTermMemory(memory: Omit<LongTermMemory, 'id' | 'lastAccessed' | 'createdAt' | 'embedding'>): Promise<string> {
    // Generate embedding for semantic search
    const embedding = await this.generateMemoryEmbedding(memory.summary);
    
    const fullMemory: LongTermMemory = {
      ...memory,
      id: `ltm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      lastAccessed: new Date(),
      createdAt: new Date(),
      embedding,
    };
    
    // Store in database for persistence
    await prisma.$executeRaw`
      INSERT INTO persona_memories (
        id, persona_id, type, summary, details, strength, 
        last_accessed, created_at, associations, embedding
      ) VALUES (
        ${fullMemory.id}, ${memory.personaId}, ${memory.type}, 
        ${memory.summary}, ${JSON.stringify(memory.details)}, ${memory.strength},
        ${fullMemory.lastAccessed}, ${fullMemory.createdAt}, 
        ${JSON.stringify(memory.associations)}, ${JSON.stringify(embedding)}::vector
      )
    `;
    
    // Add to persona's memory index
    await this.addToMemoryIndex(memory.personaId, fullMemory.id, 'long');
    
    console.log(`Stored long-term memory ${fullMemory.id} for persona ${memory.personaId}`);
    return fullMemory.id;
  }

  /**
   * Retrieve memories based on query
   */
  async retrieveMemories(query: MemoryRetrievalQuery): Promise<MemoryRetrievalResult> {
    const {
      personaId,
      query: searchQuery,
      type,
      timeWindow,
      limit = 20,
      similarityThreshold = 0.7,
    } = query;

    // Generate query embedding for semantic search
    const queryEmbedding = await this.generateMemoryEmbedding(searchQuery);
    
    // Retrieve short-term memories
    const shortTermMemories = await this.retrieveShortTermMemories(
      personaId,
      queryEmbedding,
      type as ShortTermMemory['type'],
      timeWindow,
      Math.floor(limit / 2)
    );
    
    // Retrieve long-term memories
    const longTermMemories = await this.retrieveLongTermMemories(
      personaId,
      queryEmbedding,
      type as LongTermMemory['type'],
      timeWindow,
      Math.floor(limit / 2),
      similarityThreshold
    );
    
    // Calculate relevance scores
    const relevanceScores = new Map<string, number>();
    
    shortTermMemories.forEach(memory => {
      const score = this.calculateMemoryRelevance(memory, queryEmbedding, 'short');
      relevanceScores.set(memory.id, score);
    });
    
    longTermMemories.forEach(memory => {
      const score = this.calculateMemoryRelevance(memory, queryEmbedding, 'long');
      relevanceScores.set(memory.id, score);
    });
    
    // Sort by relevance
    const sortedShortTerm = shortTermMemories.sort((a, b) => 
      (relevanceScores.get(b.id) || 0) - (relevanceScores.get(a.id) || 0)
    );
    
    const sortedLongTerm = longTermMemories.sort((a, b) => 
      (relevanceScores.get(b.id) || 0) - (relevanceScores.get(a.id) || 0)
    );
    
    return {
      shortTerm: sortedShortTerm,
      longTerm: sortedLongTerm,
      relevanceScores,
      totalMemories: shortTermMemories.length + longTermMemories.length,
    };
  }

  /**
   * Consolidate short-term memories into long-term storage
   */
  async consolidateMemories(personaId: string): Promise<number> {
    const shortTermMemories = await this.getAllShortTermMemories(personaId);
    let consolidatedCount = 0;
    
    // Group related memories
    const memoryGroups = await this.groupRelatedMemories(shortTermMemories);
    
    for (const group of memoryGroups) {
      const longTermMemory = await this.createLongTermFromGroup(group, personaId);
      
      if (longTermMemory) {
        await this.storeLongTermMemory(longTermMemory);
        consolidatedCount++;
        
        // Mark original short-term memories as consolidated
        for (const memory of group) {
          await this.markMemoryConsolidated(memory.id);
        }
      }
    }
    
    console.log(`Consolidated ${consolidatedCount} memory groups for persona ${personaId}`);
    return consolidatedCount;
  }

  /**
   * Update memory strength based on access patterns
   */
  async updateMemoryStrength(memoryId: string, accessType: 'retrieve' | 'reference' | 'modify'): Promise<void> {
    const weights = {
      retrieve: 0.1,
      reference: 0.05,
      modify: 0.2,
    };
    
    const strengthIncrement = weights[accessType];
    
    try {
      // Update in database
      await prisma.$executeRaw`
        UPDATE persona_memories 
        SET strength = LEAST(1.0, strength + ${strengthIncrement}),
            last_accessed = NOW()
        WHERE id = ${memoryId}
      `;
      
      // Update access count in Redis
      const accessKey = `memory:access:${memoryId}`;
      await redis.incr(accessKey);
      await redis.expire(accessKey, 30 * 24 * 60 * 60); // 30 days
      
    } catch (error) {
      console.warn(`Failed to update memory strength for ${memoryId}:`, error);
    }
  }

  /**
   * Prune old and weak memories
   */
  async pruneMemories(personaId: string): Promise<{ removedShortTerm: number; removedLongTerm: number }> {
    let removedShortTerm = 0;
    let removedLongTerm = 0;
    
    // Remove expired short-term memories (Redis handles TTL automatically)
    const shortTermKeys = await redis.keys(`memory:short:${personaId}:*`);
    for (const key of shortTermKeys) {
      const ttl = await redis.ttl(key);
      if (ttl <= 0) {
        await redis.del(key);
        removedShortTerm++;
      }
    }
    
    // Remove weak long-term memories
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
    
    const weakMemories = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM persona_memories 
      WHERE persona_id = ${personaId}
        AND strength < ${PersonaMemorySystem.LONG_TERM_THRESHOLD.minStrength}
        AND last_accessed < ${cutoffDate}
    `;
    
    if (weakMemories.length > 0) {
      const memoryIds = weakMemories.map(m => m.id);
      
      await prisma.$executeRaw`
        DELETE FROM persona_memories 
        WHERE id = ANY(${memoryIds})
      `;
      
      removedLongTerm = weakMemories.length;
    }
    
    console.log(`Pruned ${removedShortTerm} short-term and ${removedLongTerm} long-term memories for persona ${personaId}`);
    
    return { removedShortTerm, removedLongTerm };
  }

  /**
   * Get memory summary for persona
   */
  async getMemorySummary(personaId: string): Promise<{
    shortTermCount: number;
    longTermCount: number;
    strongMemories: number;
    recentActivity: number;
    topTopics: string[];
  }> {
    const shortTermCount = await this.getShortTermMemoryCount(personaId);
    
    const longTermStats = await prisma.$queryRaw<Array<{
      total_count: number;
      strong_count: number;
      recent_count: number;
    }>>`
      SELECT 
        COUNT(*) as total_count,
        COUNT(CASE WHEN strength >= ${PersonaMemorySystem.LONG_TERM_THRESHOLD.minStrength} THEN 1 END) as strong_count,
        COUNT(CASE WHEN last_accessed >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_count
      FROM persona_memories 
      WHERE persona_id = ${personaId}
    `;
    
    const stats = longTermStats[0] || { total_count: 0, strong_count: 0, recent_count: 0 };
    
    // Extract top topics from recent memories
    const topTopics = await this.extractTopTopics(personaId);
    
    return {
      shortTermCount,
      longTermCount: Number(stats.total_count),
      strongMemories: Number(stats.strong_count),
      recentActivity: Number(stats.recent_count),
      topTopics,
    };
  }

  /**
   * Generate embedding for memory content
   */
  private async generateMemoryEmbedding(content: string): Promise<number[]> {
    try {
      return await generateEmbedding(content);
    } catch (error) {
      console.warn('Failed to generate memory embedding:', error);
      return new Array(1536).fill(0); // Fallback empty embedding
    }
  }

  /**
   * Add memory to persona's index
   */
  private async addToMemoryIndex(personaId: string, memoryId: string, type: 'short' | 'long'): Promise<void> {
    const indexKey = `memory:index:${personaId}:${type}`;
    await redis.zadd(indexKey, Date.now(), memoryId);
    
    // Keep index size manageable
    const maxSize = type === 'short' ? 1000 : 5000;
    await redis.zremrangebyrank(indexKey, 0, -(maxSize + 1));
  }

  /**
   * Check if consolidation should be triggered
   */
  private async checkConsolidationTriggers(personaId: string, memory: ShortTermMemory): Promise<void> {
    if (memory.data.importance < PersonaMemorySystem.LONG_TERM_THRESHOLD.minImportance) {
      return;
    }
    
    // Check if we have enough related memories to consolidate
    const relatedMemories = await this.findRelatedShortTermMemories(personaId, memory);
    
    if (relatedMemories.length >= PersonaMemorySystem.LONG_TERM_THRESHOLD.minInteractions) {
      // Schedule consolidation job
      await this.scheduleConsolidation(personaId, [memory, ...relatedMemories]);
    }
  }

  /**
   * Retrieve short-term memories
   */
  private async retrieveShortTermMemories(
    personaId: string,
    queryEmbedding: number[],
    type?: ShortTermMemory['type'],
    timeWindow?: { start: Date; end: Date },
    limit?: number
  ): Promise<ShortTermMemory[]> {
    const indexKey = `memory:index:${personaId}:short`;
    const memoryIds = await redis.zrevrange(indexKey, 0, -1);
    
    const memories: ShortTermMemory[] = [];
    
    for (const memoryId of memoryIds.slice(0, limit || 50)) {
      try {
        const memoryKey = `memory:short:${personaId}:${memoryId}`;
        const memoryData = await redis.get(memoryKey);
        
        if (memoryData) {
          const memory: ShortTermMemory = JSON.parse(memoryData);
          
          // Apply filters
          if (type && memory.type !== type) continue;
          if (timeWindow && (memory.timestamp < timeWindow.start || memory.timestamp > timeWindow.end)) continue;
          
          memories.push(memory);
        }
      } catch (error) {
        console.warn(`Failed to retrieve short-term memory ${memoryId}:`, error);
      }
    }
    
    return memories;
  }

  /**
   * Retrieve long-term memories
   */
  private async retrieveLongTermMemories(
    personaId: string,
    queryEmbedding: number[],
    type?: LongTermMemory['type'],
    timeWindow?: { start: Date; end: Date },
    limit?: number,
    similarityThreshold?: number
  ): Promise<LongTermMemory[]> {
    let query = `
      SELECT id, persona_id, type, summary, details, strength, 
             last_accessed, created_at, associations, embedding,
             1 - (embedding <-> $1::vector) as similarity
      FROM persona_memories 
      WHERE persona_id = $2
    `;
    
    const params: any[] = [JSON.stringify(queryEmbedding), personaId];
    let paramIndex = 2;
    
    if (type) {
      query += ` AND type = $${++paramIndex}`;
      params.push(type);
    }
    
    if (timeWindow) {
      query += ` AND created_at BETWEEN $${++paramIndex} AND $${++paramIndex}`;
      params.push(timeWindow.start, timeWindow.end);
    }
    
    if (similarityThreshold) {
      query += ` AND 1 - (embedding <-> $1::vector) >= $${++paramIndex}`;
      params.push(similarityThreshold);
    }
    
    query += ` ORDER BY similarity DESC`;
    
    if (limit) {
      query += ` LIMIT $${++paramIndex}`;
      params.push(limit);
    }
    
    try {
      const results = await prisma.$queryRawUnsafe<any[]>(query, ...params);
      
      return results.map(row => ({
        id: row.id,
        personaId: row.persona_id,
        type: row.type,
        summary: row.summary,
        details: JSON.parse(row.details),
        strength: row.strength,
        lastAccessed: row.last_accessed,
        createdAt: row.created_at,
        associations: JSON.parse(row.associations),
        embedding: JSON.parse(row.embedding),
      }));
      
    } catch (error) {
      console.error('Failed to retrieve long-term memories:', error);
      return [];
    }
  }

  /**
   * Calculate memory relevance score
   */
  private calculateMemoryRelevance(
    memory: ShortTermMemory | LongTermMemory,
    queryEmbedding: number[],
    type: 'short' | 'long'
  ): number {
    if (!memory.embedding) return 0;
    
    // Calculate semantic similarity
    const similarity = this.cosineSimilarity(memory.embedding, queryEmbedding);
    
    // Calculate temporal relevance
    const now = Date.now();
    const memoryTime = 'timestamp' in memory ? memory.timestamp.getTime() : memory.lastAccessed.getTime();
    const age = now - memoryTime;
    const maxAge = type === 'short' ? 48 * 60 * 60 * 1000 : 365 * 24 * 60 * 60 * 1000; // 48h for short, 1 year for long
    const recency = Math.max(0, 1 - (age / maxAge));
    
    // Calculate importance
    const importance = 'data' in memory ? memory.data.importance : memory.strength;
    
    // Combine factors
    return (
      similarity * PersonaMemorySystem.MEMORY_WEIGHTS.importance +
      recency * PersonaMemorySystem.MEMORY_WEIGHTS.recency +
      importance * PersonaMemorySystem.MEMORY_WEIGHTS.frequency
    );
  }

  /**
   * Calculate cosine similarity between vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get all short-term memories for a persona
   */
  private async getAllShortTermMemories(personaId: string): Promise<ShortTermMemory[]> {
    const indexKey = `memory:index:${personaId}:short`;
    const memoryIds = await redis.zrevrange(indexKey, 0, -1);
    
    const memories: ShortTermMemory[] = [];
    
    for (const memoryId of memoryIds) {
      try {
        const memoryKey = `memory:short:${personaId}:${memoryId}`;
        const memoryData = await redis.get(memoryKey);
        
        if (memoryData) {
          memories.push(JSON.parse(memoryData));
        }
      } catch (error) {
        console.warn(`Failed to retrieve memory ${memoryId}:`, error);
      }
    }
    
    return memories;
  }

  /**
   * Group related memories for consolidation
   */
  private async groupRelatedMemories(memories: ShortTermMemory[]): Promise<ShortTermMemory[][]> {
    const groups: ShortTermMemory[][] = [];
    const processed = new Set<string>();
    
    for (const memory of memories) {
      if (processed.has(memory.id)) continue;
      
      const group = [memory];
      processed.add(memory.id);
      
      // Find related memories
      for (const otherMemory of memories) {
        if (processed.has(otherMemory.id)) continue;
        
        const similarity = memory.embedding && otherMemory.embedding
          ? this.cosineSimilarity(memory.embedding, otherMemory.embedding)
          : 0;
        
        if (similarity > 0.8) {
          group.push(otherMemory);
          processed.add(otherMemory.id);
        }
      }
      
      if (group.length >= PersonaMemorySystem.LONG_TERM_THRESHOLD.minInteractions) {
        groups.push(group);
      }
    }
    
    return groups;
  }

  /**
   * Create long-term memory from group of related short-term memories
   */
  private async createLongTermFromGroup(
    group: ShortTermMemory[],
    personaId: string
  ): Promise<Omit<LongTermMemory, 'id' | 'lastAccessed' | 'createdAt' | 'embedding'> | null> {
    if (group.length === 0) return null;
    
    // Determine memory type based on group content
    const types = group.map(m => m.type);
    const dominantType = this.getMostFrequent(types);
    
    let longTermType: LongTermMemory['type'];
    switch (dominantType) {
      case 'interaction':
        longTermType = 'relationship';
        break;
      case 'conversation':
        longTermType = 'relationship';
        break;
      case 'content':
        longTermType = 'preference';
        break;
      case 'event':
        longTermType = 'knowledge';
        break;
      default:
        longTermType = 'pattern';
    }
    
    // Create summary from group
    const contents = group.map(m => m.data.content);
    const summary = this.summarizeContents(contents);
    
    // Calculate average importance as strength
    const avgImportance = group.reduce((sum, m) => sum + m.data.importance, 0) / group.length;
    
    // Extract entities for associations
    const allEntities = group.flatMap(m => m.data.entities);
    const uniqueEntities = [...new Set(allEntities)];
    
    return {
      personaId,
      type: longTermType,
      summary,
      details: {
        sourceMemories: group.map(m => m.id),
        entities: uniqueEntities,
        timespan: {
          start: Math.min(...group.map(m => m.timestamp.getTime())),
          end: Math.max(...group.map(m => m.timestamp.getTime())),
        },
        frequency: group.length,
      },
      strength: Math.min(1.0, avgImportance * 1.2), // Boost for consolidation
      associations: uniqueEntities.slice(0, 10), // Limit associations
    };
  }

  /**
   * Get most frequent item in array
   */
  private getMostFrequent<T>(items: T[]): T {
    const counts = new Map<T, number>();
    items.forEach(item => {
      counts.set(item, (counts.get(item) || 0) + 1);
    });
    
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)[0][0];
  }

  /**
   * Summarize multiple content pieces
   */
  private summarizeContents(contents: string[]): string {
    if (contents.length === 1) return contents[0];
    
    // Simple summarization - could be enhanced with LLM
    const uniqueContents = [...new Set(contents)];
    
    if (uniqueContents.length <= 3) {
      return uniqueContents.join('; ');
    }
    
    return `Multiple interactions involving: ${uniqueContents.slice(0, 3).join(', ')}... (${contents.length} total)`;
  }

  /**
   * Placeholder methods for future implementation
   */
  private async findRelatedShortTermMemories(personaId: string, memory: ShortTermMemory): Promise<ShortTermMemory[]> {
    // TODO: Implement related memory finding
    return [];
  }

  private async scheduleConsolidation(personaId: string, memories: ShortTermMemory[]): Promise<void> {
    // TODO: Implement consolidation scheduling
  }

  private async markMemoryConsolidated(memoryId: string): Promise<void> {
    // TODO: Mark memory as consolidated
  }

  private async getShortTermMemoryCount(personaId: string): Promise<number> {
    const indexKey = `memory:index:${personaId}:short`;
    return await redis.zcard(indexKey);
  }

  private async extractTopTopics(personaId: string): Promise<string[]> {
    // TODO: Extract top topics from memories
    return [];
  }
}

/**
 * Singleton memory system instance
 */
export const personaMemorySystem = new PersonaMemorySystem();

/**
 * Helper function to store interaction memory
 */
export async function storeInteractionMemory(
  personaId: string,
  content: string,
  context: any,
  importance: number = 0.5
): Promise<string> {
  return await personaMemorySystem.storeShortTermMemory({
    personaId,
    type: 'interaction',
    data: {
      content,
      context,
      entities: [], // TODO: Extract entities
      sentiment: 0, // TODO: Calculate sentiment
      importance,
    },
    timestamp: new Date(),
  });
}

/**
 * Helper function to retrieve relevant memories for content generation
 */
export async function getRelevantMemories(
  personaId: string,
  context: string,
  limit: number = 10
): Promise<MemoryRetrievalResult> {
  return await personaMemorySystem.retrieveMemories({
    personaId,
    query: context,
    limit,
    similarityThreshold: 0.6,
  });
}