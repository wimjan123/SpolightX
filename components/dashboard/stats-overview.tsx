'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/utils'
import { 
  FileText, 
  Bot, 
  Heart, 
  TrendingUp,
  Users,
  Zap,
  MessageCircle,
  Eye
} from 'lucide-react'

interface StatItem {
  id: string
  label: string
  value: number
  change: {
    value: number
    trend: 'up' | 'down' | 'neutral'
    period: string
  }
  icon: React.ComponentType<{ className?: string }>
  color: string
  description: string
}

export function StatsOverview() {
  const { user } = useAuth()
  const [stats, setStats] = useState<StatItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Mock stats data - would come from tRPC in real app
  useEffect(() => {
    const mockStats: StatItem[] = [
      {
        id: 'posts',
        label: 'Your Posts',
        value: 42,
        change: { value: 12, trend: 'up', period: 'this week' },
        icon: FileText,
        color: 'text-blue-500',
        description: 'Posts you\'ve created'
      },
      {
        id: 'personas',
        label: 'AI Personas',
        value: 5,
        change: { value: 2, trend: 'up', period: 'this month' },
        icon: Bot,
        color: 'text-purple-500',
        description: 'Active AI personas'
      },
      {
        id: 'engagement',
        label: 'Total Likes',
        value: 1247,
        change: { value: 23, trend: 'up', period: 'today' },
        icon: Heart,
        color: 'text-red-500',
        description: 'Likes on your content'
      },
      {
        id: 'reach',
        label: 'Total Views',
        value: 8934,
        change: { value: -5, trend: 'down', period: 'this week' },
        icon: Eye,
        color: 'text-green-500',
        description: 'Views on your posts'
      }
    ]

    // Simulate API delay
    setTimeout(() => {
      setStats(mockStats)
      setIsLoading(false)
    }, 400)
  }, [user])

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="loading-skeleton h-4 w-16 mb-2" />
              <div className="loading-skeleton h-8 w-12 mb-2" />
              <div className="loading-skeleton h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <StatCard key={stat.id} stat={stat} />
      ))}
    </div>
  )
}

interface StatCardProps {
  stat: StatItem
}

function StatCard({ stat }: StatCardProps) {
  const Icon = stat.icon
  const isPositive = stat.change.trend === 'up'
  const isNeutral = stat.change.trend === 'neutral'

  const trendIcon = isPositive ? '↗' : stat.change.trend === 'down' ? '↘' : '→'
  const trendColor = isPositive 
    ? 'text-green-600 bg-green-50 dark:bg-green-900/20' 
    : stat.change.trend === 'down' 
      ? 'text-red-600 bg-red-50 dark:bg-red-900/20'
      : 'text-gray-600 bg-gray-50 dark:bg-gray-900/20'

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <Icon className={`h-4 w-4 ${stat.color}`} />
          <Badge variant="secondary" className="text-xs">
            Live
          </Badge>
        </div>

        {/* Value */}
        <div className="space-y-1">
          <div className="text-2xl font-bold">
            {formatNumber(stat.value)}
          </div>
          
          <div className="text-sm text-muted-foreground">
            {stat.label}
          </div>
        </div>

        {/* Change indicator */}
        <div className="flex items-center justify-between mt-3">
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${trendColor}`}>
            <span>{trendIcon}</span>
            <span>
              {!isNeutral && (isPositive ? '+' : '')}{stat.change.value}
            </span>
          </div>
          
          <span className="text-xs text-muted-foreground">
            {stat.change.period}
          </span>
        </div>

        {/* Description tooltip */}
        <div className="mt-2 pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            {stat.description}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// Alternative compact stats for smaller spaces
export function CompactStatsOverview() {
  const stats = [
    { label: 'Posts', value: 42, icon: FileText, color: 'text-blue-500' },
    { label: 'Personas', value: 5, icon: Bot, color: 'text-purple-500' },
    { label: 'Likes', value: 1247, icon: Heart, color: 'text-red-500' },
    { label: 'Views', value: 8934, icon: Eye, color: 'text-green-500' }
  ]

  return (
    <div className="flex items-center gap-6 text-sm">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <div key={stat.label} className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${stat.color}`} />
            <span className="font-medium">{formatNumber(stat.value)}</span>
            <span className="text-muted-foreground">{stat.label}</span>
          </div>
        )
      })}
    </div>
  )
}