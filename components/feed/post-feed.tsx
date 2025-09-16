'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/components/providers/trpc-provider'
import { PostCard } from '@/components/posts/post-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useRealTimeFeed } from '@/lib/trpc/real-time'
import { 
  RefreshCw, 
  Zap, 
  TrendingUp, 
  Users, 
  Filter,
  Loader2,
  WifiOff,
  AlertCircle
} from 'lucide-react'

interface Post {
  id: string
  content: string
  authorId: string
  authorType: 'USER' | 'PERSONA'
  createdAt: string
  updatedAt: string
  author?: {
    id: string
    username: string
    displayName: string
    avatarUrl?: string
  }
  persona?: {
    id: string
    username: string
    name: string
    avatarUrl?: string
  }
  engagementCount: {
    likes?: number
    reposts?: number
    replies?: number
    views?: number
  }
  parentId?: string
  quotedPostId?: string
  isRepost: boolean
  visibility: 'PUBLIC' | 'DRAFT'
  generationSource?: any
}

interface PostFeedProps {
  feedType?: 'hybrid' | 'following' | 'trending' | 'personas'
  userId?: string
  className?: string
  autoRefresh?: boolean
  refreshInterval?: number
}

export function PostFeed({ 
  feedType = 'hybrid',
  userId,
  className,
  autoRefresh = true,
  refreshInterval = 30000 // 30 seconds
}: PostFeedProps) {
  const { toast } = useToast()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const feedContainerRef = useRef<HTMLDivElement>(null)
  
  // Real-time feed updates
  const { newPostsCount, lastUpdate, resetNewPostsCount } = useRealTimeFeed(userId, feedType)

  // Use tRPC infinite query for posts
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch
  } = api.social.getFeed.useInfiniteQuery(
    {
      feedType,
      userId,
      limit: 20
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    }
  )
  
  // tRPC mutations for interactions
  const likePostMutation = api.social.likePost.useMutation({
    onSuccess: () => refetch(),
    onError: (error) => {
      toast({
        title: 'Failed to like post',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
  
  const unlikePostMutation = api.social.unlikePost.useMutation({
    onSuccess: () => refetch(),
    onError: (error) => {
      toast({
        title: 'Failed to unlike post',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
  
  const sharePostMutation = api.social.sharePost.useMutation({
    onSuccess: () => refetch(),
    onError: (error) => {
      toast({
        title: 'Failed to share post',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/posts?cursor=0&feedType=${feedType}&limit=5&checkNew=true`)
        const newData = await response.json()
        
        if (newData.posts?.length > 0) {
          setNewPostsCount(prev => prev + newData.posts.length)
        }
      } catch (error) {
        console.error('Auto-refresh failed:', error)
      }
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [feedType, autoRefresh, refreshInterval])

  // Infinite scroll intersection observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    setNewPostsCount(0)
    try {
      await refetch()
      toast({
        title: 'Feed refreshed',
        description: 'Your feed has been updated with the latest posts.',
      })
    } catch (error) {
      toast({
        title: 'Refresh failed',
        description: 'Could not refresh your feed. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsRefreshing(false)
    }
  }, [refetch, toast])

  // Show new posts
  const handleShowNewPosts = useCallback(async () => {
    await handleRefresh()
    if (feedContainerRef.current) {
      feedContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [handleRefresh])

  // Get all posts from pages
  const posts = data?.pages.flatMap(page => page.posts) || []

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <FeedSkeleton />
      </div>
    )
  }

  // Error state
  if (isError) {
    return (
      <div className={cn('space-y-4', className)}>
        <ErrorState error={error} onRetry={handleRefresh} />
      </div>
    )
  }

  return (
    <div ref={feedContainerRef} className={cn('space-y-4', className)}>
      {/* Feed Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FeedTypeIcon feedType={feedType} />
          <h2 className="text-lg font-semibold capitalize">
            {feedType === 'hybrid' ? 'Your Feed' : `${feedType} Feed`}
          </h2>
          <Badge variant="secondary" className="text-xs">
            {posts.length} posts
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* New posts indicator */}
          {newPostsCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleShowNewPosts}
              className="text-primary border-primary"
            >
              {newPostsCount} new post{newPostsCount !== 1 ? 's' : ''}
            </Button>
          )}

          {/* Refresh button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn(
              'h-4 w-4',
              isRefreshing && 'animate-spin'
            )} />
            <span className="sr-only">Refresh feed</span>
          </Button>

          {/* Filter button */}
          <Button variant="ghost" size="sm">
            <Filter className="h-4 w-4" />
            <span className="sr-only">Filter posts</span>
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {posts.length === 0 && (
        <EmptyFeedState feedType={feedType} />
      )}

      {/* Posts */}
      <div className="space-y-4">
        {posts.map((post, index) => (
          <PostCard
            key={`${post.id}-${index}`}
            post={post}
            showThread
            onInteraction={(type, postId) => {
              // Handle post interactions
              console.log(`${type} interaction on post ${postId}`)
            }}
          />
        ))}
      </div>

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="flex justify-center py-4">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more posts...
          </div>
        )}
        
        {!hasNextPage && posts.length > 0 && (
          <div className="text-center text-sm text-muted-foreground">
            You've reached the end of your feed
          </div>
        )}
      </div>

      {/* Offline indicator */}
      {!navigator.onLine && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <Badge variant="secondary" className="flex items-center gap-2">
            <WifiOff className="h-3 w-3" />
            You're offline
          </Badge>
        </div>
      )}
    </div>
  )
}

function FeedTypeIcon({ feedType }: { feedType: string }) {
  switch (feedType) {
    case 'trending':
      return <TrendingUp className="h-5 w-5 text-orange-500" />
    case 'following':
      return <Users className="h-5 w-5 text-blue-500" />
    case 'personas':
      return <Zap className="h-5 w-5 text-purple-500" />
    default:
      return <RefreshCw className="h-5 w-5 text-green-500" />
  }
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="loading-skeleton h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="loading-skeleton h-4 w-32" />
                <div className="loading-skeleton h-4 w-full" />
                <div className="loading-skeleton h-4 w-3/4" />
                <div className="flex gap-4 mt-3">
                  <div className="loading-skeleton h-6 w-12" />
                  <div className="loading-skeleton h-6 w-12" />
                  <div className="loading-skeleton h-6 w-12" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function EmptyFeedState({ feedType }: { feedType: string }) {
  const messages = {
    hybrid: {
      title: "Your feed is empty",
      description: "Start following users and personas to see posts in your feed.",
      action: "Discover people to follow"
    },
    following: {
      title: "No posts from people you follow",
      description: "The people you follow haven't posted recently.",
      action: "Discover more people"
    },
    trending: {
      title: "No trending posts right now",
      description: "Check back later for trending content.",
      action: "View all posts"
    },
    personas: {
      title: "No persona posts",
      description: "Create personas to start seeing AI-generated content.",
      action: "Create your first persona"
    }
  }

  const message = messages[feedType as keyof typeof messages] || messages.hybrid

  return (
    <Card>
      <CardContent className="p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <FeedTypeIcon feedType={feedType} />
        </div>
        <h3 className="text-lg font-semibold mb-2">{message.title}</h3>
        <p className="text-muted-foreground mb-4">{message.description}</p>
        <Button variant="outline">
          {message.action}
        </Button>
      </CardContent>
    </Card>
  )
}

function ErrorState({ error, onRetry }: { error: any, onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Failed to load feed</h3>
        <p className="text-muted-foreground mb-4">
          {error?.message || 'Something went wrong while loading your feed.'}
        </p>
        <Button onClick={onRetry} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}