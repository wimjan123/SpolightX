'use client'

import { useState } from 'react'
import { PostFeed } from './post-feed'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useAuth } from '@/components/providers/auth-provider'
import { 
  Home,
  TrendingUp,
  Users,
  Bot,
  Settings
} from 'lucide-react'

type FeedType = 'hybrid' | 'following' | 'trending' | 'personas'

interface FeedContainerProps {
  className?: string
}

export function FeedContainer({ className }: FeedContainerProps) {
  const { user } = useAuth()
  const [activeFeed, setActiveFeed] = useState<FeedType>('hybrid')
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'relevance'>('recent')

  const feedOptions = [
    {
      id: 'hybrid' as FeedType,
      name: 'For You',
      description: 'Personalized mix of content',
      icon: Home,
      color: 'text-blue-500'
    },
    {
      id: 'following' as FeedType,
      name: 'Following',
      description: 'Posts from people you follow',
      icon: Users,
      color: 'text-green-500'
    },
    {
      id: 'trending' as FeedType,
      name: 'Trending',
      description: 'What\'s happening now',
      icon: TrendingUp,
      color: 'text-orange-500'
    },
    {
      id: 'personas' as FeedType,
      name: 'AI Personas',
      description: 'Content from AI personas',
      icon: Bot,
      color: 'text-purple-500'
    }
  ]

  return (
    <div className={className}>
      <Tabs value={activeFeed} onValueChange={(value) => setActiveFeed(value as FeedType)}>
        {/* Feed Type Tabs */}
        <div className="flex items-center justify-between mb-6">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            {feedOptions.map((option) => {
              const Icon = option.icon
              return (
                <TabsTrigger 
                  key={option.id}
                  value={option.id}
                  className="flex items-center gap-2"
                >
                  <Icon className={`h-4 w-4 ${option.color}`} />
                  <span className="hidden sm:inline">{option.name}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          {/* Sort Controls */}
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recent</SelectItem>
                <SelectItem value="popular">Popular</SelectItem>
                <SelectItem value="relevance">Relevance</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
              <span className="sr-only">Feed settings</span>
            </Button>
          </div>
        </div>

        {/* Feed Content */}
        {feedOptions.map((option) => (
          <TabsContent key={option.id} value={option.id} className="space-y-4">
            {/* Feed Description */}
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
              <div className="flex items-center gap-3">
                <option.icon className={`h-5 w-5 ${option.color}`} />
                <div>
                  <h3 className="font-medium">{option.name}</h3>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
              </div>
              
              {/* Feed Stats */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">Live</Badge>
                <span>Updated 2m ago</span>
              </div>
            </div>

            {/* Actual Feed */}
            <PostFeed
              feedType={option.id}
              userId={user?.id}
              autoRefresh={true}
              refreshInterval={activeFeed === 'trending' ? 15000 : 30000} // Trending updates faster
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}