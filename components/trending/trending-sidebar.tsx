'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'
import { TrendingUp, Hash, ArrowUpRight, MoreHorizontal } from 'lucide-react'
import Link from 'next/link'

interface Trend {
  id: string
  topic: string
  description?: string
  velocity: number
  confidence: number
  categories: string[]
  region?: string
  postsCount: number
  isRising: boolean
}

interface TrendingSidebarProps {
  limit?: number
  className?: string
}

export function TrendingSidebar({ limit = 5, className }: TrendingSidebarProps) {
  const [trends, setTrends] = useState<Trend[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Mock trends data - would come from tRPC in real app
  useEffect(() => {
    const mockTrends: Trend[] = [
      {
        id: '1',
        topic: '#AI',
        description: 'Artificial Intelligence developments',
        velocity: 95.8,
        confidence: 0.92,
        categories: ['technology', 'innovation'],
        postsCount: 12500,
        isRising: true,
      },
      {
        id: '2',
        topic: 'OpenAI',
        description: 'Latest news and updates',
        velocity: 87.3,
        confidence: 0.89,
        categories: ['technology', 'business'],
        postsCount: 8900,
        isRising: true,
      },
      {
        id: '3',
        topic: 'Climate Change',
        description: 'Environmental discussions',
        velocity: 72.1,
        confidence: 0.85,
        categories: ['environment', 'politics'],
        postsCount: 5600,
        isRising: false,
      },
      {
        id: '4',
        topic: '#MachineLearning',
        description: 'ML research and applications',
        velocity: 68.9,
        confidence: 0.81,
        categories: ['technology', 'research'],
        postsCount: 4200,
        isRising: true,
      },
      {
        id: '5',
        topic: 'SpaceX',
        description: 'Space exploration news',
        velocity: 64.7,
        confidence: 0.78,
        categories: ['technology', 'science'],
        postsCount: 3800,
        isRising: false,
      },
    ]

    // Simulate API delay
    setTimeout(() => {
      setTrends(mockTrends.slice(0, limit))
      setIsLoading(false)
    }, 500)
  }, [limit])

  const categories = ['all', 'technology', 'politics', 'business', 'entertainment', 'sports']

  if (isLoading) {
    return (
      <div className={className}>
        <div className="space-y-3">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3">
              <div className="flex-1">
                <div className="loading-skeleton h-4 w-24 mb-1" />
                <div className="loading-skeleton h-3 w-16" />
              </div>
              <div className="loading-skeleton h-6 w-8" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Category Filter */}
      <div className="flex flex-wrap gap-1 mb-4">
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "ghost"}
            size="sm"
            onClick={() => setSelectedCategory(category)}
            className="text-xs h-7"
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </Button>
        ))}
      </div>

      {/* Trends List */}
      <div className="space-y-2">
        {trends.map((trend, index) => (
          <TrendItem
            key={trend.id}
            trend={trend}
            rank={index + 1}
          />
        ))}
      </div>

      {/* View More */}
      <div className="mt-4 pt-3 border-t">
        <Link href="/trends">
          <Button variant="ghost" size="sm" className="w-full">
            View all trends
            <ArrowUpRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  )
}

interface TrendItemProps {
  trend: Trend
  rank: number
}

function TrendItem({ trend, rank }: TrendItemProps) {
  const isHashtag = trend.topic.startsWith('#')
  
  return (
    <Link href={`/trends/${encodeURIComponent(trend.topic)}`}>
      <div className="trend-item group">
        <div className="flex items-start gap-3 flex-1">
          {/* Rank */}
          <div className="text-lg font-bold text-muted-foreground w-6">
            {rank}
          </div>

          {/* Trend Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isHashtag ? (
                <Hash className="h-3 w-3 text-primary" />
              ) : (
                <TrendingUp className="h-3 w-3 text-orange-500" />
              )}
              
              <span className="font-medium truncate group-hover:text-primary transition-colors">
                {trend.topic}
              </span>

              {trend.isRising && (
                <Badge variant="secondary" className="text-xs">
                  Rising
                </Badge>
              )}
            </div>
            
            {trend.description && (
              <p className="text-xs text-muted-foreground truncate mb-1">
                {trend.description}
              </p>
            )}
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatNumber(trend.postsCount)} posts</span>
              <span>•</span>
              <span>{Math.round(trend.velocity)}% velocity</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center">
          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Link>
  )
}