/**
 * Content Filtering Rules System
 * 
 * Implements configurable content filtering rules with pattern matching,
 * keyword detection, and context-aware filtering for different content types.
 * 
 * Supports tiered filtering levels (Safe, Low, Medium, High) as outlined in
 * research.md for Azure OpenAI Content Filtering compatibility.
 */

import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

// Core filtering types and structures
export type FilterLevel = 'safe' | 'low' | 'medium' | 'high' | 'maximum'
export type FilterCategory = 
  | 'profanity'
  | 'spam'
  | 'offensive'
  | 'inappropriate'
  | 'political'
  | 'controversial'
  | 'commercial'
  | 'personal_info'
  | 'nsfw'
  | 'violence'

export type FilterAction = 'allow' | 'warn' | 'flag' | 'block' | 'escalate'
export type ContentContext = 'public_post' | 'private_message' | 'profile' | 'comment' | 'bio'

export interface FilterRule {
  id: string
  name: string
  category: FilterCategory
  level: FilterLevel
  patterns: {
    keywords: string[]
    regex: string[]
    phrases: string[]
  }
  context: ContentContext[]
  action: FilterAction
  severity: number // 0-10
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  metadata: {
    description?: string
    examples?: string[]
    falsePositiveRate?: number
    effectiveness?: number
  }
}

export interface FilterConfig {
  level: FilterLevel
  categories: {
    [K in FilterCategory]: {
      enabled: boolean
      threshold: number // 0-1
      action: FilterAction
      customRules: string[] // rule IDs
    }
  }
  contexts: {
    [K in ContentContext]: {
      strictness: FilterLevel
      inheritGlobal: boolean
    }
  }
  exceptions: {
    allowedDomains: string[]
    trustedUsers: string[]
    whitelistPatterns: string[]
  }
}

export interface FilterResult {
  id: string
  contentId: string
  decision: FilterAction
  triggeredRules: {
    ruleId: string
    category: FilterCategory
    severity: number
    matchedPattern: string
    confidence: number
  }[]
  score: number // 0-1, overall risk score
  context: ContentContext
  bypassReasons: string[]
  processingTime: number
  timestamp: Date
}

export interface FilterStats {
  totalProcessed: number
  blocked: number
  flagged: number
  warned: number
  allowed: number
  byCategory: Record<FilterCategory, number>
  topTriggeredRules: {
    ruleId: string
    name: string
    count: number
  }[]
  falsePositiveRate: number
  averageProcessingTime: number
}

export class ContentFilteringSystem {
  private static readonly CACHE_TTL = 3600 // 1 hour
  private static readonly DEFAULT_THRESHOLD = 0.5
  private static readonly MAX_PATTERN_LENGTH = 500
  
  private static defaultConfig: FilterConfig = {
    level: 'medium',
    categories: {
      profanity: { enabled: true, threshold: 0.3, action: 'warn', customRules: [] },
      spam: { enabled: true, threshold: 0.4, action: 'flag', customRules: [] },
      offensive: { enabled: true, threshold: 0.3, action: 'flag', customRules: [] },
      inappropriate: { enabled: true, threshold: 0.4, action: 'warn', customRules: [] },
      political: { enabled: false, threshold: 0.6, action: 'allow', customRules: [] },
      controversial: { enabled: false, threshold: 0.7, action: 'allow', customRules: [] },
      commercial: { enabled: true, threshold: 0.5, action: 'warn', customRules: [] },
      personal_info: { enabled: true, threshold: 0.2, action: 'block', customRules: [] },
      nsfw: { enabled: true, threshold: 0.3, action: 'block', customRules: [] },
      violence: { enabled: true, threshold: 0.2, action: 'block', customRules: [] }
    },
    contexts: {
      public_post: { strictness: 'medium', inheritGlobal: true },
      private_message: { strictness: 'low', inheritGlobal: true },
      profile: { strictness: 'high', inheritGlobal: true },
      comment: { strictness: 'medium', inheritGlobal: true },
      bio: { strictness: 'high', inheritGlobal: true }
    },
    exceptions: {
      allowedDomains: ['wikipedia.org', 'github.com', 'stackoverflow.com'],
      trustedUsers: [],
      whitelistPatterns: ['@mention', '#hashtag']
    }
  }

  /**
   * Apply content filtering to text content
   */
  static async filterContent(
    content: string,
    contentId: string,
    context: ContentContext,
    authorId?: string,
    customConfig?: Partial<FilterConfig>
  ): Promise<FilterResult> {
    const startTime = Date.now()
    const config = await this.getEffectiveConfig(customConfig)
    
    // Check cache first
    const cacheKey = this.generateCacheKey(content, context, config.level)
    const cachedResult = await this.getCachedResult(cacheKey)
    
    if (cachedResult) {
      return {
        ...cachedResult,
        id: `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        contentId,
        processingTime: Date.now() - startTime
      }
    }

    try {
      // Apply context-specific configuration
      const contextConfig = this.applyContextRules(config, context)
      
      // Check for bypass conditions
      const bypassReasons = await this.checkBypassConditions(
        content, 
        authorId, 
        contextConfig.exceptions
      )
      
      if (bypassReasons.length > 0) {
        const result = this.createBypassResult(contentId, context, bypassReasons, startTime)
        await this.cacheResult(cacheKey, result)
        return result
      }

      // Load applicable rules
      const rules = await this.getApplicableRules(context, contextConfig)
      
      // Apply filtering rules
      const triggeredRules = await this.applyFilteringRules(content, rules)
      
      // Calculate overall score and decision
      const score = this.calculateRiskScore(triggeredRules)
      const decision = this.makeFilterDecision(score, triggeredRules, contextConfig)
      
      const result: FilterResult = {
        id: `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        contentId,
        decision,
        triggeredRules,
        score,
        context,
        bypassReasons: [],
        processingTime: Date.now() - startTime,
        timestamp: new Date()
      }

      // Cache and store result
      await this.cacheResult(cacheKey, result)
      await this.storeFilterResult(result, authorId)

      return result

    } catch (error) {
      console.error('Content filtering error:', error)
      
      // Return safe fallback
      return this.createFallbackResult(contentId, context, startTime)
    }
  }

  /**
   * Create or update a filtering rule
   */
  static async createFilterRule(rule: Omit<FilterRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<FilterRule> {
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const newRule: FilterRule = {
      ...rule,
      id: ruleId,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // Validate rule patterns
    this.validateRulePatterns(newRule.patterns)
    
    // Store in database
    await prisma.filterRule.create({
      data: {
        id: newRule.id,
        name: newRule.name,
        category: newRule.category,
        level: newRule.level,
        patterns: newRule.patterns,
        context: newRule.context,
        action: newRule.action,
        severity: newRule.severity,
        isActive: newRule.isActive,
        metadata: newRule.metadata
      }
    })

    // Invalidate rule cache
    await this.invalidateRuleCache()

    return newRule
  }

  /**
   * Update filtering configuration
   */
  static async updateFilterConfig(
    userId: string,
    newConfig: Partial<FilterConfig>
  ): Promise<FilterConfig> {
    const currentConfig = await this.getUserConfig(userId)
    const mergedConfig = this.mergeConfigs(currentConfig, newConfig)
    
    // Store configuration
    await prisma.setting.upsert({
      where: {
        userId_category_key: {
          userId,
          category: 'content_filtering',
          key: 'config'
        }
      },
      update: {
        value: mergedConfig
      },
      create: {
        userId,
        category: 'content_filtering',
        key: 'config',
        value: mergedConfig
      }
    })

    // Cache the new config
    await redis.setex(`filter_config:${userId}`, this.CACHE_TTL, JSON.stringify(mergedConfig))

    return mergedConfig
  }

  /**
   * Get filtering statistics
   */
  static async getFilterStats(
    timeframe: 'hour' | 'day' | 'week' = 'day',
    category?: FilterCategory
  ): Promise<FilterStats> {
    const timeframes = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000
    }

    const since = new Date(Date.now() - timeframes[timeframe])

    // Query statistics from database
    const baseQuery = {
      where: {
        createdAt: { gte: since },
        ...(category && { category })
      }
    }

    const [total, decisions, categories, topRules] = await Promise.all([
      prisma.filterResult.count(baseQuery),
      
      prisma.filterResult.groupBy({
        by: ['decision'],
        _count: true,
        ...baseQuery
      }),
      
      prisma.filterResult.groupBy({
        by: ['category'],
        _count: true,
        ...baseQuery
      }),
      
      prisma.filterResult.groupBy({
        by: ['ruleId'],
        _count: true,
        orderBy: { _count: { ruleId: 'desc' } },
        take: 10,
        ...baseQuery
      })
    ])

    // Calculate statistics
    const decisionCounts = decisions.reduce((acc, item) => {
      acc[item.decision] = item._count
      return acc
    }, {} as Record<string, number>)

    const categoryCounts = categories.reduce((acc, item) => {
      acc[item.category as FilterCategory] = item._count
      return acc
    }, {} as Record<FilterCategory, number>)

    // Get rule names for top triggered rules
    const ruleIds = topRules.map(r => r.ruleId)
    const ruleDetails = await prisma.filterRule.findMany({
      where: { id: { in: ruleIds } },
      select: { id: true, name: true }
    })

    const topTriggeredRules = topRules.map(rule => ({
      ruleId: rule.ruleId,
      name: ruleDetails.find(r => r.id === rule.ruleId)?.name || 'Unknown',
      count: rule._count
    }))

    return {
      totalProcessed: total,
      blocked: decisionCounts.block || 0,
      flagged: decisionCounts.flag || 0,
      warned: decisionCounts.warn || 0,
      allowed: decisionCounts.allow || 0,
      byCategory: categoryCounts,
      topTriggeredRules,
      falsePositiveRate: 0.02, // Would be calculated from feedback data
      averageProcessingTime: 15 // ms, would be calculated from actual data
    }
  }

  /**
   * Bulk filter multiple content items
   */
  static async filterBatch(
    items: {
      content: string
      contentId: string
      context: ContentContext
      authorId?: string
    }[],
    config?: Partial<FilterConfig>
  ): Promise<FilterResult[]> {
    const results = await Promise.all(
      items.map(item => 
        this.filterContent(
          item.content,
          item.contentId,
          item.context,
          item.authorId,
          config
        )
      )
    )

    return results
  }

  // Private helper methods

  private static generateCacheKey(content: string, context: ContentContext, level: FilterLevel): string {
    const contentHash = require('crypto')
      .createHash('sha256')
      .update(content + context + level)
      .digest('hex')
    return `filter:${contentHash}`
  }

  private static async getCachedResult(cacheKey: string): Promise<FilterResult | null> {
    try {
      const cached = await redis.get(cacheKey)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  private static async cacheResult(cacheKey: string, result: FilterResult): Promise<void> {
    try {
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result))
    } catch (error) {
      console.warn('Failed to cache filter result:', error)
    }
  }

  private static async getEffectiveConfig(customConfig?: Partial<FilterConfig>): Promise<FilterConfig> {
    const systemConfig = await this.getSystemConfig()
    return this.mergeConfigs(systemConfig, customConfig || {})
  }

  private static async getSystemConfig(): Promise<FilterConfig> {
    try {
      const setting = await prisma.setting.findUnique({
        where: {
          userId_category_key: {
            userId: 'system',
            category: 'content_filtering',
            key: 'config'
          }
        }
      })

      if (setting?.value) {
        return setting.value as FilterConfig
      }
    } catch (error) {
      console.warn('Failed to load system filter config:', error)
    }

    return this.defaultConfig
  }

  private static async getUserConfig(userId: string): Promise<FilterConfig> {
    try {
      const cached = await redis.get(`filter_config:${userId}`)
      if (cached) {
        return JSON.parse(cached)
      }

      const setting = await prisma.setting.findUnique({
        where: {
          userId_category_key: {
            userId,
            category: 'content_filtering',
            key: 'config'
          }
        }
      })

      if (setting?.value) {
        const config = setting.value as FilterConfig
        await redis.setex(`filter_config:${userId}`, this.CACHE_TTL, JSON.stringify(config))
        return config
      }
    } catch (error) {
      console.warn('Failed to load user filter config:', error)
    }

    return this.defaultConfig
  }

  private static applyContextRules(config: FilterConfig, context: ContentContext): FilterConfig {
    const contextSettings = config.contexts[context]
    
    if (!contextSettings.inheritGlobal) {
      // Use context-specific strictness level
      return {
        ...config,
        level: contextSettings.strictness
      }
    }

    return config
  }

  private static async checkBypassConditions(
    content: string,
    authorId?: string,
    exceptions?: FilterConfig['exceptions']
  ): Promise<string[]> {
    const bypassReasons: string[] = []

    if (!exceptions) return bypassReasons

    // Check trusted users
    if (authorId && exceptions.trustedUsers.includes(authorId)) {
      bypassReasons.push('trusted_user')
    }

    // Check whitelisted patterns
    for (const pattern of exceptions.whitelistPatterns) {
      if (content.toLowerCase().includes(pattern.toLowerCase())) {
        bypassReasons.push(`whitelisted_pattern:${pattern}`)
      }
    }

    // Check allowed domains
    const urlRegex = /https?:\/\/(www\.)?([^\/\s]+)/g
    const matches = content.match(urlRegex)
    if (matches) {
      for (const url of matches) {
        const domain = url.replace(/https?:\/\/(www\.)?/, '')
        if (exceptions.allowedDomains.some(allowed => domain.includes(allowed))) {
          bypassReasons.push(`allowed_domain:${domain}`)
        }
      }
    }

    return bypassReasons
  }

  private static async getApplicableRules(
    context: ContentContext,
    config: FilterConfig
  ): Promise<FilterRule[]> {
    const cacheKey = `rules:${context}:${config.level}`
    const cached = await redis.get(cacheKey)
    
    if (cached) {
      return JSON.parse(cached)
    }

    // Get rules from database
    const rules = await prisma.filterRule.findMany({
      where: {
        isActive: true,
        context: { has: context },
        level: { in: this.getLevelHierarchy(config.level) }
      }
    })

    // Add custom rules for enabled categories
    const customRuleIds: string[] = []
    for (const [category, settings] of Object.entries(config.categories)) {
      if (settings.enabled && settings.customRules.length > 0) {
        customRuleIds.push(...settings.customRules)
      }
    }

    if (customRuleIds.length > 0) {
      const customRules = await prisma.filterRule.findMany({
        where: {
          id: { in: customRuleIds },
          isActive: true
        }
      })
      rules.push(...customRules)
    }

    // Cache the rules
    await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(rules))

    return rules as FilterRule[]
  }

  private static getLevelHierarchy(level: FilterLevel): FilterLevel[] {
    const hierarchy = {
      safe: ['safe'],
      low: ['safe', 'low'],
      medium: ['safe', 'low', 'medium'],
      high: ['safe', 'low', 'medium', 'high'],
      maximum: ['safe', 'low', 'medium', 'high', 'maximum']
    }

    return hierarchy[level] || ['safe', 'low', 'medium']
  }

  private static async applyFilteringRules(
    content: string,
    rules: FilterRule[]
  ): Promise<FilterResult['triggeredRules']> {
    const triggeredRules: FilterResult['triggeredRules'] = []
    const normalizedContent = content.toLowerCase().trim()

    for (const rule of rules) {
      const matches = this.checkRuleMatches(normalizedContent, rule)
      
      if (matches.length > 0) {
        for (const match of matches) {
          triggeredRules.push({
            ruleId: rule.id,
            category: rule.category,
            severity: rule.severity,
            matchedPattern: match.pattern,
            confidence: match.confidence
          })
        }
      }
    }

    return triggeredRules
  }

  private static checkRuleMatches(
    content: string,
    rule: FilterRule
  ): { pattern: string; confidence: number }[] {
    const matches: { pattern: string; confidence: number }[] = []

    // Check keywords
    for (const keyword of rule.patterns.keywords) {
      if (content.includes(keyword.toLowerCase())) {
        matches.push({
          pattern: keyword,
          confidence: 0.8 // Keyword matches have high confidence
        })
      }
    }

    // Check phrases
    for (const phrase of rule.patterns.phrases) {
      if (content.includes(phrase.toLowerCase())) {
        matches.push({
          pattern: phrase,
          confidence: 0.9 // Phrase matches have higher confidence
        })
      }
    }

    // Check regex patterns
    for (const regexPattern of rule.patterns.regex) {
      try {
        const regex = new RegExp(regexPattern, 'gi')
        const regexMatches = content.match(regex)
        
        if (regexMatches && regexMatches.length > 0) {
          matches.push({
            pattern: regexPattern,
            confidence: 0.7 // Regex matches have moderate confidence
          })
        }
      } catch (error) {
        console.warn(`Invalid regex pattern in rule ${rule.id}:`, regexPattern)
      }
    }

    return matches
  }

  private static calculateRiskScore(triggeredRules: FilterResult['triggeredRules']): number {
    if (triggeredRules.length === 0) return 0

    // Calculate weighted average based on severity and confidence
    const totalWeight = triggeredRules.reduce((sum, rule) => {
      return sum + (rule.severity * rule.confidence)
    }, 0)

    const maxPossibleWeight = triggeredRules.reduce((sum, rule) => {
      return sum + (10 * 1.0) // max severity * max confidence
    }, 0)

    return maxPossibleWeight > 0 ? Math.min(totalWeight / maxPossibleWeight, 1.0) : 0
  }

  private static makeFilterDecision(
    score: number,
    triggeredRules: FilterResult['triggeredRules'],
    config: FilterConfig
  ): FilterAction {
    if (triggeredRules.length === 0) return 'allow'

    // Find the highest severity action from triggered rules
    let maxAction: FilterAction = 'allow'
    let maxSeverity = 0

    for (const rule of triggeredRules) {
      if (rule.severity > maxSeverity) {
        maxSeverity = rule.severity
        
        // Determine action based on category configuration
        const categoryKey = rule.category as keyof FilterConfig['categories']
        const categoryConfig = config.categories[categoryKey]
        
        if (categoryConfig && score >= categoryConfig.threshold) {
          maxAction = categoryConfig.action
        }
      }
    }

    return maxAction
  }

  private static createBypassResult(
    contentId: string,
    context: ContentContext,
    bypassReasons: string[],
    startTime: number
  ): FilterResult {
    return {
      id: `filter_bypass_${Date.now()}`,
      contentId,
      decision: 'allow',
      triggeredRules: [],
      score: 0,
      context,
      bypassReasons,
      processingTime: Date.now() - startTime,
      timestamp: new Date()
    }
  }

  private static createFallbackResult(
    contentId: string,
    context: ContentContext,
    startTime: number
  ): FilterResult {
    return {
      id: `filter_error_${Date.now()}`,
      contentId,
      decision: 'escalate', // Safe fallback
      triggeredRules: [],
      score: 0.5,
      context,
      bypassReasons: ['filtering_service_error'],
      processingTime: Date.now() - startTime,
      timestamp: new Date()
    }
  }

  private static async storeFilterResult(result: FilterResult, authorId?: string): Promise<void> {
    try {
      await prisma.filterResult.create({
        data: {
          id: result.id,
          contentId: result.contentId,
          decision: result.decision,
          score: result.score,
          context: result.context,
          triggeredRules: result.triggeredRules,
          bypassReasons: result.bypassReasons,
          processingTime: result.processingTime,
          authorId: authorId || null,
          createdAt: result.timestamp
        }
      })
    } catch (error) {
      console.error('Failed to store filter result:', error)
    }
  }

  private static validateRulePatterns(patterns: FilterRule['patterns']): void {
    // Validate patterns for safety and performance
    for (const pattern of [...patterns.keywords, ...patterns.phrases]) {
      if (pattern.length > this.MAX_PATTERN_LENGTH) {
        throw new Error(`Pattern too long: ${pattern.substring(0, 50)}...`)
      }
    }

    for (const regex of patterns.regex) {
      try {
        new RegExp(regex)
      } catch (error) {
        throw new Error(`Invalid regex pattern: ${regex}`)
      }
    }
  }

  private static mergeConfigs(base: FilterConfig, override: Partial<FilterConfig>): FilterConfig {
    return {
      level: override.level || base.level,
      categories: { ...base.categories, ...override.categories },
      contexts: { ...base.contexts, ...override.contexts },
      exceptions: { ...base.exceptions, ...override.exceptions }
    }
  }

  private static async invalidateRuleCache(): Promise<void> {
    const pattern = 'rules:*'
    const keys = await redis.keys(pattern)
    
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  }
}

// Export the singleton
export const contentFilter = ContentFilteringSystem

// Extend Prisma schema for filter rules and results (this would go in schema.prisma)
/*
model FilterRule {
  id        String   @id
  name      String
  category  String
  level     String
  patterns  Json
  context   String[]
  action    String
  severity  Int
  isActive  Boolean
  metadata  Json?
  createdAt DateTime
  updatedAt DateTime
  
  @@map("filter_rules")
}

model FilterResult {
  id              String   @id
  contentId       String
  decision        String
  score           Float
  context         String
  triggeredRules  Json
  bypassReasons   String[]
  processingTime  Int
  authorId        String?
  createdAt       DateTime
  
  @@map("filter_results")
}
*/