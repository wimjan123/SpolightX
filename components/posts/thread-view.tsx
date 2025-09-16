'use client'

import { useState, useEffect, useRef } from 'react'
import { PostCard } from './post-card'
import { PostComposer } from '@/components/composer/post-composer'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/components/providers/auth-provider'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { 
  MessageCircle, 
  ArrowUp, 
  ArrowDown, 
  MoreVertical,
  Loader2,
  AlertCircle,
  Bot,
  Users,
  Eye,
  RefreshCw
} from 'lucide-react'

interface ThreadPost {
  id: string
  content: string
  authorId: string
  authorType: 'USER' | 'PERSONA'
  createdAt: string
  parentId?: string
  depth: number
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
  children?: ThreadPost[]
  isExpanded?: boolean
  generationSource?: any
}

interface ThreadViewProps {
  rootPostId: string
  className?: string
  maxDepth?: number
  autoRefresh?: boolean
}

export function ThreadView({ 
  rootPostId, 
  className, 
  maxDepth = 5,
  autoRefresh = false
}: ThreadViewProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [threadData, setThreadData] = useState<{
    rootPost: ThreadPost | null
    replies: ThreadPost[]
    totalCount: number
  }>({
    rootPost: null,
    replies: [],
    totalCount: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showReplyComposer, setShowReplyComposer] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'chronological' | 'engagement'>('chronological')
  const [filterType, setFilterType] = useState<'all' | 'users' | 'personas'>('all')

  const replyComposerRef = useRef<HTMLDivElement>(null)

  // Load thread data
  useEffect(() => {
    loadThread()
  }, [rootPostId, sortOrder, filterType])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      refreshThread()
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [autoRefresh])

  const loadThread = async () => {
    setIsLoading(true)
    try {
      // Mock thread data - would use tRPC in real app
      const mockThread = generateMockThread(rootPostId)
      setThreadData(mockThread)
    } catch (error) {
      toast({
        title: 'Failed to load thread',
        description: 'Could not load the conversation. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const refreshThread = async () => {
    setIsRefreshing(true)
    try {
      await loadThread()
    } catch (error) {
      console.error('Thread refresh failed:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleReply = (parentId: string) => {
    setReplyingTo(parentId)
    setShowReplyComposer(true)
    
    // Scroll to composer
    setTimeout(() => {
      replyComposerRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      })
    }, 100)
  }

  const handleReplySubmit = async (content: string, settings?: any) => {
    if (!replyingTo) return

    try {
      // Would call: await api.social.createReply.mutate({ content, parentId: replyingTo, ...settings })
      
      toast({
        title: 'Reply posted!',
        description: 'Your reply has been added to the conversation.',
      })

      // Refresh thread to show new reply
      await loadThread()
      
      // Reset reply state
      setShowReplyComposer(false)
      setReplyingTo(null)
    } catch (error) {
      toast({
        title: 'Failed to post reply',
        description: 'Could not post your reply. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const togglePostExpansion = (postId: string) => {
    setThreadData(prev => ({
      ...prev,
      replies: toggleExpansionRecursive(prev.replies, postId)
    }))
  }

  const toggleExpansionRecursive = (posts: ThreadPost[], targetId: string): ThreadPost[] => {
    return posts.map(post => ({
      ...post,
      isExpanded: post.id === targetId ? !post.isExpanded : post.isExpanded,
      children: post.children ? toggleExpansionRecursive(post.children, targetId) : undefined
    }))
  }

  if (isLoading) {
    return <ThreadSkeleton className={className} />
  }

  if (!threadData.rootPost) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Thread not found</h3>
          <p className="text-muted-foreground">
            The conversation you're looking for doesn't exist or has been deleted.
          </p>
        </CardContent>
      </Card>
    )
  }

  const aiRepliesCount = threadData.replies.filter(r => r.authorType === 'PERSONA').length
  const userRepliesCount = threadData.replies.filter(r => r.authorType === 'USER').length

  return (
    <div className={className}>
      {/* Thread Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Conversation</h1>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {threadData.totalCount} replies
            </Badge>
            
            {aiRepliesCount > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Bot className="h-3 w-3" />
                {aiRepliesCount} AI
              </Badge>
            )}
            
            {userRepliesCount > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {userRepliesCount} users
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort Options */}
          <select 
            value={sortOrder} 
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="chronological">Chronological</option>
            <option value="engagement">Most Engaged</option>
          </select>

          {/* Filter Options */}
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value as any)}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="all">All Replies</option>
            <option value="users">Users Only</option>
            <option value="personas">AI Only</option>
          </select>

          {/* Refresh */}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={refreshThread}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Root Post */}
      <div className="mb-6">
        <PostCard 
          post={threadData.rootPost}
          showThread={false}
          onInteraction={(type, postId) => {
            if (type === 'reply') {
              handleReply(postId)
            }
          }}
          className="border-l-4 border-primary"
        />
      </div>

      {/* Quick Reply */}
      {user && (
        <div className="mb-6">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => handleReply(threadData.rootPost!.id)}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Reply to this conversation...
          </Button>
        </div>
      )}

      {/* Reply Composer */}
      {showReplyComposer && replyingTo && (
        <div ref={replyComposerRef} className="mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <MessageCircle className="h-4 w-4" />
                Replying to conversation
              </div>
              
              <PostComposer
                placeholder="Write your reply..."
                onPost={handleReplySubmit}
                maxLength={1000}
              />
              
              <div className="flex justify-end gap-2 mt-4">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setShowReplyComposer(false)
                    setReplyingTo(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Thread Replies */}
      <div className="space-y-4">
        {threadData.replies.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No replies yet</h3>
              <p className="text-muted-foreground mb-4">
                Be the first to join this conversation!
              </p>
              {user && (
                <Button onClick={() => handleReply(threadData.rootPost!.id)}>
                  Write a reply
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          renderThreadReplies(threadData.replies, 0)
        )}
      </div>

      {/* Load More */}
      {threadData.replies.length < threadData.totalCount && (
        <div className="mt-6 text-center">
          <Button variant="outline" onClick={loadThread}>
            <Loader2 className="h-4 w-4 mr-2" />
            Load more replies
          </Button>
        </div>
      )}
    </div>
  )

  function renderThreadReplies(replies: ThreadPost[], depth: number): React.ReactNode {
    return replies.map((reply) => (
      <ThreadReplyItem
        key={reply.id}
        post={reply}
        depth={depth}
        maxDepth={maxDepth}
        onReply={handleReply}
        onToggleExpansion={togglePostExpansion}
      />
    ))
  }
}

interface ThreadReplyItemProps {
  post: ThreadPost
  depth: number
  maxDepth: number
  onReply: (postId: string) => void
  onToggleExpansion: (postId: string) => void
}

function ThreadReplyItem({ 
  post, 
  depth, 
  maxDepth, 
  onReply, 
  onToggleExpansion 
}: ThreadReplyItemProps) {
  const hasChildren = post.children && post.children.length > 0
  const isExpanded = post.isExpanded ?? true
  const isMaxDepth = depth >= maxDepth

  return (
    <div className={cn(
      "relative",
      depth > 0 && "ml-6 border-l-2 border-muted pl-4"
    )}>
      {/* Depth indicator */}
      {depth > 0 && (
        <div className="absolute -left-[9px] top-4 w-4 h-4 bg-background border-2 border-muted rounded-full" />
      )}

      <PostCard
        post={post}
        isReply={true}
        onInteraction={(type, postId) => {
          if (type === 'reply') {
            onReply(postId)
          }
        }}
        className="mb-4"
      />

      {/* Expansion Controls */}
      {hasChildren && (
        <div className="mb-4 ml-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleExpansion(post.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <>
                <ArrowUp className="h-4 w-4 mr-1" />
                Hide {post.children!.length} replies
              </>
            ) : (
              <>
                <ArrowDown className="h-4 w-4 mr-1" />
                Show {post.children!.length} replies
              </>
            )}
          </Button>
        </div>
      )}

      {/* Nested Replies */}
      {hasChildren && isExpanded && !isMaxDepth && (
        <div className="space-y-4">
          {post.children!.map((child) => (
            <ThreadReplyItem
              key={child.id}
              post={child}
              depth={depth + 1}
              maxDepth={maxDepth}
              onReply={onReply}
              onToggleExpansion={onToggleExpansion}
            />
          ))}
        </div>
      )}

      {/* Max depth indicator */}
      {hasChildren && isExpanded && isMaxDepth && (
        <div className="ml-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <MoreVertical className="h-4 w-4 inline mr-2" />
          Thread continues... 
          <Button variant="link" size="sm" className="p-0 ml-2">
            View full thread
          </Button>
        </div>
      )}
    </div>
  )
}

function ThreadSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="loading-skeleton h-6 w-32" />
          <div className="loading-skeleton h-6 w-24" />
        </div>

        {/* Root post skeleton */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-3">
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

        {/* Replies skeleton */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="ml-6 border-l-2 border-muted pl-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className="loading-skeleton h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="loading-skeleton h-3 w-24" />
                    <div className="loading-skeleton h-3 w-full" />
                    <div className="loading-skeleton h-3 w-2/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}

// Helper function to generate mock thread data
function generateMockThread(rootPostId: string): {
  rootPost: ThreadPost
  replies: ThreadPost[]
  totalCount: number
} {
  const mockRootPost: ThreadPost = {
    id: rootPostId,
    content: "This is a fascinating discussion about AI in social media. What do you all think about the implications for human creativity?",
    authorId: 'user1',
    authorType: 'USER',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    depth: 0,
    author: {
      id: 'user1',
      username: 'techthought',
      displayName: 'Tech Thought Leader',
      avatarUrl: undefined
    },
    engagementCount: {
      likes: 23,
      reposts: 5,
      replies: 8,
      views: 342
    }
  }

  const mockReplies: ThreadPost[] = [
    {
      id: 'reply1',
      content: "I think AI will augment human creativity rather than replace it. The best results come from human-AI collaboration!",
      authorId: 'persona1',
      authorType: 'PERSONA',
      createdAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
      parentId: rootPostId,
      depth: 1,
      persona: {
        id: 'persona1',
        username: 'creativebot',
        name: 'CreativeBot'
      },
      engagementCount: {
        likes: 12,
        reposts: 2,
        replies: 3
      },
      generationSource: { model: 'gpt-4', confidence: 0.89 },
      isExpanded: true,
      children: [
        {
          id: 'reply1a',
          content: "Totally agree! I've been experimenting with AI tools and they're amazing for brainstorming.",
          authorId: 'user2',
          authorType: 'USER',
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          parentId: 'reply1',
          depth: 2,
          author: {
            id: 'user2',
            username: 'designer_jane',
            displayName: 'Jane Designer'
          },
          engagementCount: {
            likes: 5,
            replies: 1
          }
        }
      ]
    },
    {
      id: 'reply2',
      content: "The key is maintaining human oversight and ensuring AI serves our creative goals, not the other way around.",
      authorId: 'user3',
      authorType: 'USER',
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      parentId: rootPostId,
      depth: 1,
      author: {
        id: 'user3',
        username: 'ethicist',
        displayName: 'AI Ethics Researcher'
      },
      engagementCount: {
        likes: 18,
        reposts: 4,
        replies: 2
      },
      isExpanded: true
    }
  ]

  return {
    rootPost: mockRootPost,
    replies: mockReplies,
    totalCount: 8
  }
}