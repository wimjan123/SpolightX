'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { formatNumber, formatTimeAgo } from '@/lib/utils'
import { api } from '@/components/providers/trpc-provider'
import { 
  TrendingUp,
  Hash,
  Search,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Globe,
  Filter,
  Plus,
  Zap,
  Eye,
  MessageCircle
} from 'lucide-react'
import Link from 'next/link'

interface TrendItem {
  id: string
  topic: string
  description?: string
  velocity: number
  confidence: number
  categories: string[]
  region: string
  postsCount: number
  engagementRate: number
  isRising: boolean
  peakAt?: string
  expiresAt: string
  updatedAt: string
  relatedTopics?: string[]
}

interface TrendingPanelProps {
  limit?: number
  showHeader?: boolean
  showFilters?: boolean
  showDraftButton?: boolean
  region?: string
  category?: string
  className?: string
}

export function TrendingPanel({ 
  limit = 10,
  showHeader = true,
  showFilters = true,
  showDraftButton = true,
  region = 'global',
  category = 'all',
  className 
}: TrendingPanelProps) {
  const { toast } = useToast()
  const [trends, setTrends] = useState<TrendItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRegion, setSelectedRegion] = useState(region)
  const [selectedCategory, setSelectedCategory] = useState(category)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  const regions = [
    { value: 'global', label: 'Global' },
    { value: 'us', label: 'United States' },
    { value: 'eu', label: 'Europe' },
    { value: 'asia', label: 'Asia' },
  ]

  const categories = [
    { value: 'all', label: 'All Topics' },
    { value: 'technology', label: 'Technology' },
    { value: 'politics', label: 'Politics' },
    { value: 'business', label: 'Business' },
    { value: 'entertainment', label: 'Entertainment' },
    { value: 'sports', label: 'Sports' },
    { value: 'science', label: 'Science' },
  ]

  // Update trends when data changes
  useEffect(() => {
    if (trendsData) {
      setTrends(trendsData)
      setLastUpdated(new Date().toISOString())
    }
  }, [trendsData])

  // Handle errors
  useEffect(() => {
    if (error) {
      toast({
        title: 'Failed to load trends',
        description: 'Could not fetch trending topics. Please try again.',
        variant: 'destructive'
      })
    }
  }, [error, toast])

  // Auto-refresh is handled by tRPC refetchInterval

  // Use tRPC for fetching trends
  const { data: trendsData, isLoading, error, refetch } = api.trends.list.useQuery({
    limit,
    region: selectedRegion,
    category: selectedCategory
  }, {
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  })

  const loadTrends = async () => {
    try {
      await refetch()
      setLastUpdated(new Date().toISOString())
    } catch (error) {
      toast({
        title: 'Failed to load trends',
        description: 'Could not fetch trending topics. Please try again.',
        variant: 'destructive'
      })
    }
  }

  const refreshTrends = async () => {
    setIsRefreshing(true)
    try {
      await refetch()
      toast({
        title: 'Trends updated',
        description: 'Latest trending topics have been loaded.',
      })
    } catch (error) {
      console.error('Refresh failed:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDraftFromTrend = (trend: TrendItem) => {
    // Navigate to composer with trend pre-filled
    const composerUrl = `/compose?trend=${encodeURIComponent(trend.topic)}&description=${encodeURIComponent(trend.description || '')}`
    window.open(composerUrl, '_blank')
    
    toast({
      title: 'Draft composer opened',
      description: `Creating content about "${trend.topic}"`,
    })
  }

  const filteredTrends = trends.filter(trend => 
    !searchQuery || 
    trend.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
    trend.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              Trending Topics
            </div>
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(lastUpdated)}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshTrends}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
      )}

      <CardContent className="space-y-4">
        {/* Filters */}
        {showFilters && (
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search trends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Region & Category filters */}
            <div className="flex gap-2">
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.value} value={region.value}>
                      <div className="flex items-center gap-2">
                        <Globe className="h-3 w-3" />
                        {region.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <TrendItemSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Trends List */}
        {!isLoading && (
          <div className="space-y-2">
            {filteredTrends.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No trending topics found</p>
                <p className="text-xs">Try adjusting your filters</p>
              </div>
            ) : (
              filteredTrends.map((trend, index) => (
                <TrendItem
                  key={trend.id}
                  trend={trend}
                  rank={index + 1}
                  onDraftFromTrend={showDraftButton ? handleDraftFromTrend : undefined}
                />
              ))
            )}
          </div>
        )}

        {/* View More */}
        {!isLoading && filteredTrends.length >= limit && (
          <div className="pt-3 border-t">
            <Link href="/trends">
              <Button variant="ghost" size="sm" className="w-full">
                View all trends
                <ArrowUpRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface TrendItemProps {
  trend: TrendItem
  rank: number
  onDraftFromTrend?: (trend: TrendItem) => void
}

function TrendItem({ trend, rank, onDraftFromTrend }: TrendItemProps) {
  const isHashtag = trend.topic.startsWith('#')
  
  return (
    <div className="group flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
      {/* Rank */}
      <div className="flex-shrink-0 w-6 text-center">
        <span className="text-sm font-bold text-muted-foreground">
          {rank}
        </span>
      </div>

      {/* Trend Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* Topic */}
            <div className="flex items-center gap-2 mb-1">
              {isHashtag ? (
                <Hash className="h-3 w-3 text-primary flex-shrink-0" />
              ) : (
                <TrendingUp className="h-3 w-3 text-orange-500 flex-shrink-0" />
              )}
              
              <Link href={`/trends/${encodeURIComponent(trend.topic)}`}>
                <span className="font-medium hover:text-primary transition-colors cursor-pointer truncate">
                  {trend.topic}
                </span>
              </Link>

              {/* Rising indicator */}
              {trend.isRising && (
                <Badge variant="secondary" className="text-xs flex-shrink-0">
                  <ArrowUpRight className="h-2 w-2 mr-1" />
                  Rising
                </Badge>
              )}
            </div>

            {/* Description */}
            {trend.description && (
              <p className="text-xs text-muted-foreground truncate mb-1">
                {trend.description}
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {formatNumber(trend.postsCount)} posts
              </div>
              
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {Math.round(trend.velocity)}% velocity
              </div>

              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {trend.engagementRate}% eng.
              </div>
            </div>

            {/* Categories */}
            {trend.categories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {trend.categories.slice(0, 2).map((category) => (
                  <Badge key={category} variant="outline" className="text-xs">
                    {category}
                  </Badge>
                ))}
                {trend.categories.length > 2 && (
                  <Badge variant="outline" className="text-xs">
                    +{trend.categories.length - 2}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 ml-3">
            {onDraftFromTrend && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDraftFromTrend(trend)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                title="Draft from trend"
              >
                <Plus className="h-3 w-3 mr-1" />
                Draft
              </Button>
            )}
          </div>
        </div>

        {/* Time info */}
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Updated {formatTimeAgo(trend.updatedAt)}</span>
          {trend.expiresAt && (
            <>
              <span>•</span>
              <span>Expires {formatTimeAgo(trend.expiresAt)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TrendItemSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3">
      <div className="w-6 text-center">
        <div className="loading-skeleton h-4 w-3" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="loading-skeleton h-4 w-32" />
        <div className="loading-skeleton h-3 w-48" />
        <div className="flex gap-2">
          <div className="loading-skeleton h-3 w-16" />
          <div className="loading-skeleton h-3 w-16" />
          <div className="loading-skeleton h-3 w-16" />
        </div>
      </div>
    </div>
  )
}

// Helper function to generate mock trends data
function generateMockTrends(limit: number, category: string, region: string): TrendItem[] {
  const baseTrends: Omit<TrendItem, 'id' | 'updatedAt'>[] = [
    {
      topic: '#AI',
      description: 'Artificial Intelligence developments and breakthroughs',
      velocity: 95.8,
      confidence: 0.92,
      categories: ['technology', 'innovation'],
      region: 'global',
      postsCount: 12500,
      engagementRate: 8.7,
      isRising: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      topic: 'OpenAI',
      description: 'Latest OpenAI news and model releases',
      velocity: 87.3,
      confidence: 0.89,
      categories: ['technology', 'business'],
      region: 'global',
      postsCount: 8900,
      engagementRate: 12.3,
      isRising: true,
      expiresAt: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
    },
    {
      topic: 'Climate Change',
      description: 'Environmental discussions and climate action',
      velocity: 72.1,
      confidence: 0.85,
      categories: ['environment', 'politics'],
      region: 'global',
      postsCount: 5600,
      engagementRate: 6.8,
      isRising: false,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    },
    {
      topic: '#MachineLearning',
      description: 'ML research, applications, and tutorials',
      velocity: 68.9,
      confidence: 0.81,
      categories: ['technology', 'research'],
      region: 'global',
      postsCount: 4200,
      engagementRate: 9.4,
      isRising: true,
      expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
    },
    {
      topic: 'SpaceX',
      description: 'Space exploration and rocket launches',
      velocity: 64.7,
      confidence: 0.78,
      categories: ['technology', 'science'],
      region: 'us',
      postsCount: 3800,
      engagementRate: 11.2,
      isRising: false,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    },
    {
      topic: 'Cryptocurrency',
      description: 'Bitcoin, Ethereum, and digital asset news',
      velocity: 58.4,
      confidence: 0.75,
      categories: ['business', 'technology'],
      region: 'global',
      postsCount: 7200,
      engagementRate: 5.9,
      isRising: false,
      expiresAt: new Date(Date.now() + 16 * 60 * 60 * 1000).toISOString(),
    },
  ]

  // Filter by category and region
  let filteredTrends = baseTrends
  
  if (category !== 'all') {
    filteredTrends = filteredTrends.filter(trend => 
      trend.categories.includes(category)
    )
  }
  
  if (region !== 'global') {
    filteredTrends = filteredTrends.filter(trend => 
      trend.region === region || trend.region === 'global'
    )
  }

  // Generate IDs and timestamps
  return filteredTrends.slice(0, limit).map((trend, index) => ({
    ...trend,
    id: `trend-${index}`,
    updatedAt: new Date(Date.now() - Math.random() * 60 * 60 * 1000).toISOString(), // Random time in last hour
  }))
}