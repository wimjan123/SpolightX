/**
 * User Reporting System
 * 
 * Implements comprehensive user reporting functionality with automated triage,
 * escalation workflows, and appeals process. Supports community-driven moderation
 * with machine learning-enhanced report classification and abuse detection.
 * 
 * Integrates with moderation pipeline and risk assessment as outlined in research.md
 * for multi-tier safety approach with human review escalation.
 */

import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { contentModerator } from './moderation'
import { riskAssessment } from './risk-assessment'

// Core reporting types and structures
export type ReportReason = 
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'spam'
  | 'misinformation'
  | 'sexual_content'
  | 'self_harm'
  | 'impersonation'
  | 'copyright'
  | 'privacy'
  | 'other'

export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed' | 'escalated'
export type ReportSeverity = 'low' | 'medium' | 'high' | 'critical'
export type ReportAction = 'no_action' | 'warning' | 'content_removal' | 'account_restriction' | 'account_suspension' | 'account_ban'

export interface UserReport {
  id: string
  reporterId: string
  reportedUserId?: string
  reportedContentId?: string
  reportedContentType?: 'post' | 'message' | 'profile' | 'comment'
  reason: ReportReason
  customReason?: string
  description: string
  evidence?: {
    screenshots: string[]
    urls: string[]
    additionalInfo: string
  }
  status: ReportStatus
  severity: ReportSeverity
  priority: number // 1-10, higher = more urgent
  assignedTo?: string // moderator ID
  createdAt: Date
  updatedAt: Date
  resolvedAt?: Date
  resolution?: {
    action: ReportAction
    reasoning: string
    moderatorId: string
    appealable: boolean
    appealDeadline?: Date
  }
  metadata: {
    reportSource: 'user' | 'automated' | 'moderator'
    ipAddress?: string
    userAgent?: string
    sessionId?: string
    relatedReports: string[]
    automatedAnalysis?: any
  }
}

export interface ReportTriage {
  reportId: string
  automatedScore: number // 0-1, likelihood of being legitimate
  riskLevel: ReportSeverity
  recommendedAction: ReportAction
  confidence: number // 0-1
  flags: {
    duplicateReport: boolean
    potentialAbuse: boolean
    highRiskContent: boolean
    verifiedReporter: boolean
    repeatOffender: boolean
  }
  escalationRequired: boolean
  estimatedReviewTime: number // minutes
  similarReports: string[]
}

export interface ReportStats {
  totalReports: number
  byStatus: Record<ReportStatus, number>
  byReason: Record<ReportReason, number>
  bySeverity: Record<ReportSeverity, number>
  averageResolutionTime: number // hours
  escalationRate: number // percentage
  actionBreakdown: Record<ReportAction, number>
  reporterActivity: {
    uniqueReporters: number
    repeatReporters: number
    topReporters: { userId: string; count: number }[]
  }
  contentActivity: {
    mostReportedContent: { contentId: string; reports: number }[]
    mostReportedUsers: { userId: string; reports: number }[]
  }
}

export interface AppealRequest {
  id: string
  reportId: string
  appealerId: string
  reason: string
  evidence?: {
    explanation: string
    supportingDocs: string[]
    witnessAccounts: string[]
  }
  status: 'pending' | 'reviewing' | 'approved' | 'denied'
  submittedAt: Date
  reviewedAt?: Date
  reviewedBy?: string
  decision?: {
    outcome: 'upheld' | 'overturned' | 'modified'
    reasoning: string
    newAction?: ReportAction
  }
}

export class UserReportingSystem {
  private static readonly CACHE_TTL = 1800 // 30 minutes
  private static readonly AUTO_ESCALATION_THRESHOLD = 0.8
  private static readonly DUPLICATE_THRESHOLD = 0.9
  private static readonly APPEAL_WINDOW_DAYS = 7

  // Priority scoring weights
  private static readonly SEVERITY_WEIGHTS: Record<ReportSeverity, number> = {
    low: 1,
    medium: 3,
    high: 7,
    critical: 10
  }

  private static readonly REASON_WEIGHTS: Record<ReportReason, number> = {
    harassment: 0.8,
    hate_speech: 0.9,
    violence: 1.0,
    spam: 0.3,
    misinformation: 0.6,
    sexual_content: 0.7,
    self_harm: 1.0,
    impersonation: 0.5,
    copyright: 0.4,
    privacy: 0.6,
    other: 0.2
  }

  /**
   * Submit a new user report
   */
  static async submitReport(
    reportData: Omit<UserReport, 'id' | 'status' | 'severity' | 'priority' | 'createdAt' | 'updatedAt' | 'metadata'>
  ): Promise<{ report: UserReport; triage: ReportTriage }> {
    // Generate report ID
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Perform automated triage
    const triage = await this.performTriage(reportData, reportId)

    const report: UserReport = {
      ...reportData,
      id: reportId,
      status: triage.escalationRequired ? 'escalated' : 'pending',
      severity: triage.riskLevel,
      priority: this.calculatePriority(reportData.reason, triage.riskLevel, triage.flags),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        reportSource: 'user',
        relatedReports: triage.similarReports,
        automatedAnalysis: triage
      }
    }

    // Store report in database
    await this.storeReport(report)

    // Cache for quick access
    await this.cacheReport(report)

    // Queue for processing based on priority
    await this.queueForProcessing(report, triage)

    // Update reporter statistics
    await this.updateReporterStats(reportData.reporterId)

    return { report, triage }
  }

  /**
   * Process pending reports
   */
  static async processReport(
    reportId: string,
    moderatorId: string,
    action: ReportAction,
    reasoning: string
  ): Promise<UserReport> {
    const report = await this.getReport(reportId)
    if (!report) {
      throw new Error('Report not found')
    }

    // Update report with resolution
    const updatedReport: UserReport = {
      ...report,
      status: 'resolved',
      updatedAt: new Date(),
      resolvedAt: new Date(),
      assignedTo: moderatorId,
      resolution: {
        action,
        reasoning,
        moderatorId,
        appealable: action !== 'no_action',
        appealDeadline: action !== 'no_action' 
          ? new Date(Date.now() + this.APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000)
          : undefined
      }
    }

    // Store updated report
    await this.storeReport(updatedReport)

    // Execute the action if necessary
    if (action !== 'no_action') {
      await this.executeAction(updatedReport, action)
    }

    // Update statistics
    await this.updateReportStats(updatedReport)

    // Notify relevant parties
    await this.sendNotifications(updatedReport)

    return updatedReport
  }

  /**
   * Submit an appeal for a report resolution
   */
  static async submitAppeal(
    reportId: string,
    appealerId: string,
    reason: string,
    evidence?: AppealRequest['evidence']
  ): Promise<AppealRequest> {
    const report = await this.getReport(reportId)
    if (!report) {
      throw new Error('Report not found')
    }

    if (!report.resolution?.appealable) {
      throw new Error('This report is not appealable')
    }

    if (report.resolution.appealDeadline && new Date() > report.resolution.appealDeadline) {
      throw new Error('Appeal deadline has passed')
    }

    const appealId = `appeal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const appeal: AppealRequest = {
      id: appealId,
      reportId,
      appealerId,
      reason,
      evidence,
      status: 'pending',
      submittedAt: new Date()
    }

    // Store appeal
    await prisma.reportAppeal.create({
      data: {
        id: appeal.id,
        reportId: appeal.reportId,
        appealerId: appeal.appealerId,
        reason: appeal.reason,
        evidence: appeal.evidence || {},
        status: appeal.status,
        submittedAt: appeal.submittedAt
      }
    })

    // Queue for human review
    await this.queueAppealForReview(appeal)

    return appeal
  }

  /**
   * Get reporting statistics
   */
  static async getReportStats(
    timeframe: 'day' | 'week' | 'month' = 'week',
    moderatorId?: string
  ): Promise<ReportStats> {
    const timeframes = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    }

    const since = new Date(Date.now() - timeframes[timeframe])

    const baseQuery = {
      where: {
        createdAt: { gte: since },
        ...(moderatorId && { assignedTo: moderatorId })
      }
    }

    // Query various statistics
    const [
      totalReports,
      statusBreakdown,
      reasonBreakdown,
      severityBreakdown,
      actionBreakdown,
      resolutionTimes,
      reporterStats,
      contentStats
    ] = await Promise.all([
      prisma.userReport.count(baseQuery),
      
      prisma.userReport.groupBy({
        by: ['status'],
        _count: true,
        ...baseQuery
      }),
      
      prisma.userReport.groupBy({
        by: ['reason'],
        _count: true,
        ...baseQuery
      }),
      
      prisma.userReport.groupBy({
        by: ['severity'],
        _count: true,
        ...baseQuery
      }),
      
      this.getActionBreakdown(since, moderatorId),
      this.getResolutionTimes(since, moderatorId),
      this.getReporterStats(since),
      this.getContentStats(since)
    ])

    return {
      totalReports,
      byStatus: this.mapGroupedResults(statusBreakdown, 'status') as Record<ReportStatus, number>,
      byReason: this.mapGroupedResults(reasonBreakdown, 'reason') as Record<ReportReason, number>,
      bySeverity: this.mapGroupedResults(severityBreakdown, 'severity') as Record<ReportSeverity, number>,
      averageResolutionTime: resolutionTimes.average,
      escalationRate: this.calculateEscalationRate(statusBreakdown),
      actionBreakdown,
      reporterActivity: reporterStats,
      contentActivity: contentStats
    }
  }

  /**
   * Get reports assigned to a moderator
   */
  static async getModeratorQueue(
    moderatorId: string,
    status: ReportStatus[] = ['pending', 'reviewing'],
    limit: number = 50
  ): Promise<UserReport[]> {
    const reports = await prisma.userReport.findMany({
      where: {
        assignedTo: moderatorId,
        status: { in: status }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ],
      take: limit
    })

    return reports as UserReport[]
  }

  /**
   * Auto-assign reports to moderators based on workload and expertise
   */
  static async autoAssignReports(batchSize: number = 10): Promise<void> {
    // Get unassigned reports
    const unassignedReports = await prisma.userReport.findMany({
      where: {
        assignedTo: null,
        status: { in: ['pending', 'escalated'] }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ],
      take: batchSize
    })

    if (unassignedReports.length === 0) return

    // Get available moderators (this would be implemented based on your moderator system)
    const availableModerators = await this.getAvailableModerators()

    // Assign reports based on workload balancing
    for (const report of unassignedReports) {
      const bestModerator = this.selectBestModerator(report as UserReport, availableModerators)
      
      if (bestModerator) {
        await prisma.userReport.update({
          where: { id: report.id },
          data: {
            assignedTo: bestModerator.id,
            status: 'reviewing',
            updatedAt: new Date()
          }
        })
      }
    }
  }

  // Private helper methods

  private static async performTriage(
    reportData: Omit<UserReport, 'id' | 'status' | 'severity' | 'priority' | 'createdAt' | 'updatedAt' | 'metadata'>,
    reportId: string
  ): Promise<ReportTriage> {
    // Check for similar/duplicate reports
    const similarReports = await this.findSimilarReports(reportData)
    const duplicateReport = similarReports.length > 0

    // Analyze reported content if available
    let automatedScore = 0.5
    let riskLevel: ReportSeverity = 'medium'
    let highRiskContent = false

    if (reportData.reportedContentId) {
      const contentAnalysis = await this.analyzeReportedContent(reportData.reportedContentId)
      automatedScore = contentAnalysis.riskScore
      highRiskContent = contentAnalysis.highRisk
      riskLevel = this.scoreToSeverity(automatedScore)
    }

    // Check reporter credibility
    const reporterCredibility = await this.assessReporterCredibility(reportData.reporterId)
    
    // Adjust score based on reporter credibility
    automatedScore = automatedScore * (0.5 + reporterCredibility * 0.5)

    // Check if reported user is a repeat offender
    const repeatOffender = await this.isRepeatOffender(reportData.reportedUserId)

    const flags = {
      duplicateReport,
      potentialAbuse: reporterCredibility < 0.3,
      highRiskContent,
      verifiedReporter: reporterCredibility > 0.8,
      repeatOffender
    }

    const escalationRequired = automatedScore > this.AUTO_ESCALATION_THRESHOLD || 
                              riskLevel === 'critical' ||
                              flags.highRiskContent

    return {
      reportId,
      automatedScore,
      riskLevel,
      recommendedAction: this.scoreToAction(automatedScore),
      confidence: Math.min(0.7 + reporterCredibility * 0.3, 0.95),
      flags,
      escalationRequired,
      estimatedReviewTime: this.estimateReviewTime(riskLevel, flags),
      similarReports: similarReports.map(r => r.id)
    }
  }

  private static async analyzeReportedContent(contentId: string): Promise<{ riskScore: number; highRisk: boolean }> {
    try {
      // Use existing content moderation and risk assessment
      const [moderationResult, riskProfile] = await Promise.all([
        contentModerator.moderateContent('', contentId, 'post', ''),
        riskAssessment.assessContentRisk('', '', 'user', {})
      ])

      const riskScore = Math.max(
        1 - moderationResult.confidence,
        riskProfile.score
      )

      return {
        riskScore,
        highRisk: riskScore > 0.7 || moderationResult.decision === 'blocked'
      }
    } catch (error) {
      console.error('Error analyzing reported content:', error)
      return { riskScore: 0.5, highRisk: false }
    }
  }

  private static async assessReporterCredibility(reporterId: string): Promise<number> {
    // Get reporter's history
    const reportHistory = await prisma.userReport.findMany({
      where: { reporterId },
      select: { resolution: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    if (reportHistory.length === 0) return 0.5 // neutral for new reporters

    // Calculate credibility based on report accuracy
    const validReports = reportHistory.filter(r => 
      r.resolution && r.resolution.action !== 'no_action'
    ).length

    const credibility = validReports / reportHistory.length
    
    // Adjust for report volume (too many reports might indicate abuse)
    const recentReports = reportHistory.filter(r => 
      new Date(Date.now() - 24 * 60 * 60 * 1000) // last 24 hours
    ).length

    if (recentReports > 10) {
      return Math.max(credibility * 0.5, 0.1) // penalty for excessive reporting
    }

    return credibility
  }

  private static async isRepeatOffender(userId?: string): Promise<boolean> {
    if (!userId) return false

    const recentReports = await prisma.userReport.count({
      where: {
        reportedUserId: userId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // last 30 days
        resolution: { path: ['action'], not: 'no_action' }
      }
    })

    return recentReports >= 3
  }

  private static calculatePriority(
    reason: ReportReason,
    severity: ReportSeverity,
    flags: ReportTriage['flags']
  ): number {
    let priority = this.SEVERITY_WEIGHTS[severity] * this.REASON_WEIGHTS[reason]

    // Adjust based on flags
    if (flags.highRiskContent) priority *= 1.5
    if (flags.repeatOffender) priority *= 1.3
    if (flags.verifiedReporter) priority *= 1.2
    if (flags.potentialAbuse) priority *= 0.5

    return Math.min(Math.ceil(priority), 10)
  }

  private static scoreToSeverity(score: number): ReportSeverity {
    if (score >= 0.8) return 'critical'
    if (score >= 0.6) return 'high'
    if (score >= 0.4) return 'medium'
    return 'low'
  }

  private static scoreToAction(score: number): ReportAction {
    if (score >= 0.9) return 'account_suspension'
    if (score >= 0.7) return 'content_removal'
    if (score >= 0.5) return 'warning'
    if (score >= 0.3) return 'account_restriction'
    return 'no_action'
  }

  private static estimateReviewTime(severity: ReportSeverity, flags: ReportTriage['flags']): number {
    const baseTime = {
      low: 60,      // 1 hour
      medium: 120,  // 2 hours
      high: 30,     // 30 minutes
      critical: 15  // 15 minutes
    }

    let time = baseTime[severity]
    
    if (flags.highRiskContent) time = Math.min(time * 0.5, 30)
    if (flags.duplicateReport) time *= 0.7
    if (flags.verifiedReporter) time *= 0.8

    return Math.max(time, 5) // minimum 5 minutes
  }

  private static async findSimilarReports(
    reportData: Omit<UserReport, 'id' | 'status' | 'severity' | 'priority' | 'createdAt' | 'updatedAt' | 'metadata'>
  ): Promise<UserReport[]> {
    const similarityQueries = []

    // Same content reported
    if (reportData.reportedContentId) {
      similarityQueries.push({
        reportedContentId: reportData.reportedContentId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // last 24 hours
      })
    }

    // Same user reported for same reason
    if (reportData.reportedUserId) {
      similarityQueries.push({
        reportedUserId: reportData.reportedUserId,
        reason: reportData.reason,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // last 7 days
      })
    }

    if (similarityQueries.length === 0) return []

    const similar = await prisma.userReport.findMany({
      where: { OR: similarityQueries },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    return similar as UserReport[]
  }

  private static async storeReport(report: UserReport): Promise<void> {
    await prisma.userReport.create({
      data: {
        id: report.id,
        reporterId: report.reporterId,
        reportedUserId: report.reportedUserId,
        reportedContentId: report.reportedContentId,
        reportedContentType: report.reportedContentType,
        reason: report.reason,
        customReason: report.customReason,
        description: report.description,
        evidence: report.evidence || {},
        status: report.status,
        severity: report.severity,
        priority: report.priority,
        assignedTo: report.assignedTo,
        resolution: report.resolution || {},
        metadata: report.metadata,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        resolvedAt: report.resolvedAt
      }
    })
  }

  private static async cacheReport(report: UserReport): Promise<void> {
    try {
      await redis.setex(`report:${report.id}`, this.CACHE_TTL, JSON.stringify(report))
    } catch (error) {
      console.warn('Failed to cache report:', error)
    }
  }

  private static async getReport(reportId: string): Promise<UserReport | null> {
    // Try cache first
    try {
      const cached = await redis.get(`report:${reportId}`)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch (error) {
      console.warn('Cache error:', error)
    }

    // Fallback to database
    const report = await prisma.userReport.findUnique({
      where: { id: reportId }
    })

    return report as UserReport | null
  }

  private static async queueForProcessing(report: UserReport, triage: ReportTriage): Promise<void> {
    const queueName = triage.escalationRequired ? 'reports:escalated' : 'reports:standard'
    
    await redis.zadd(queueName, report.priority, JSON.stringify({
      reportId: report.id,
      priority: report.priority,
      severity: report.severity,
      estimatedTime: triage.estimatedReviewTime
    }))
  }

  private static async executeAction(report: UserReport, action: ReportAction): Promise<void> {
    // This would integrate with user management and content management systems
    console.log(`Executing action ${action} for report ${report.id}`)
    
    // Example implementations:
    switch (action) {
      case 'content_removal':
        if (report.reportedContentId) {
          // Remove or hide the content
        }
        break
      case 'account_restriction':
        if (report.reportedUserId) {
          // Apply account restrictions
        }
        break
      case 'account_suspension':
        if (report.reportedUserId) {
          // Suspend the account
        }
        break
      // ... other actions
    }
  }

  private static async updateReporterStats(reporterId: string): Promise<void> {
    // Update reporter statistics in Redis
    await redis.incr(`reporter_stats:${reporterId}:total`)
    await redis.incr(`reporter_stats:daily:${new Date().toISOString().split('T')[0]}`)
  }

  private static async updateReportStats(report: UserReport): Promise<void> {
    // Update various statistics
    const today = new Date().toISOString().split('T')[0]
    await redis.incr(`report_stats:${today}:resolved`)
    await redis.incr(`report_stats:${today}:action:${report.resolution?.action}`)
  }

  private static async sendNotifications(report: UserReport): Promise<void> {
    // Send notifications to relevant parties
    console.log(`Sending notifications for resolved report ${report.id}`)
  }

  private static async queueAppealForReview(appeal: AppealRequest): Promise<void> {
    await redis.lpush('appeals:queue', JSON.stringify(appeal))
  }

  private static async getAvailableModerators(): Promise<{ id: string; workload: number; expertise: ReportReason[] }[]> {
    // This would query your moderator system
    return []
  }

  private static selectBestModerator(
    report: UserReport,
    moderators: { id: string; workload: number; expertise: ReportReason[] }[]
  ): { id: string } | null {
    // Simple workload-based assignment
    const available = moderators.filter(m => m.workload < 20)
    if (available.length === 0) return null

    // Prefer moderators with relevant expertise
    const expert = available.find(m => m.expertise.includes(report.reason))
    if (expert) return expert

    // Fallback to least loaded moderator
    return available.sort((a, b) => a.workload - b.workload)[0]
  }

  private static mapGroupedResults(results: any[], field: string): Record<string, number> {
    return results.reduce((acc, item) => {
      acc[item[field]] = item._count
      return acc
    }, {})
  }

  private static calculateEscalationRate(statusBreakdown: any[]): number {
    const total = statusBreakdown.reduce((sum, item) => sum + item._count, 0)
    const escalated = statusBreakdown.find(item => item.status === 'escalated')?._count || 0
    return total > 0 ? (escalated / total) * 100 : 0
  }

  private static async getActionBreakdown(since: Date, moderatorId?: string): Promise<Record<ReportAction, number>> {
    // This would query action statistics
    return {
      no_action: 0,
      warning: 0,
      content_removal: 0,
      account_restriction: 0,
      account_suspension: 0,
      account_ban: 0
    }
  }

  private static async getResolutionTimes(since: Date, moderatorId?: string): Promise<{ average: number }> {
    // This would calculate average resolution times
    return { average: 2.5 } // hours
  }

  private static async getReporterStats(since: Date): Promise<ReportStats['reporterActivity']> {
    // This would calculate reporter statistics
    return {
      uniqueReporters: 0,
      repeatReporters: 0,
      topReporters: []
    }
  }

  private static async getContentStats(since: Date): Promise<ReportStats['contentActivity']> {
    // This would calculate content statistics
    return {
      mostReportedContent: [],
      mostReportedUsers: []
    }
  }
}

// Export the singleton
export const userReporting = UserReportingSystem

// Extend Prisma schema for user reports and appeals (this would go in schema.prisma)
/*
model UserReport {
  id                   String    @id
  reporterId           String
  reportedUserId       String?
  reportedContentId    String?
  reportedContentType  String?
  reason               String
  customReason         String?
  description          String
  evidence             Json?
  status               String
  severity             String
  priority             Int
  assignedTo           String?
  resolution           Json?
  metadata             Json
  createdAt            DateTime
  updatedAt            DateTime
  resolvedAt           DateTime?
  
  @@index([status, priority])
  @@index([reportedUserId, createdAt])
  @@index([reportedContentId])
  @@map("user_reports")
}

model ReportAppeal {
  id          String    @id
  reportId    String
  appealerId  String
  reason      String
  evidence    Json?
  status      String
  submittedAt DateTime
  reviewedAt  DateTime?
  reviewedBy  String?
  decision    Json?
  
  @@map("report_appeals")
}
*/