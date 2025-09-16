'use client'

import { useState } from 'react'
import { formatTimeAgo, formatNumber, getInitials } from '@/lib/utils'
import { useAuth } from '@/components/providers/auth-provider'
import { useToast } from '@/hooks/use-toast'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  Heart,
  MessageCircle,
  Repeat2,
  Share,
  MoreHorizontal,
  Bot,
  Eye,
  Flag,
  Bookmark,
  ExternalLink,
  Copy,
  Trash2
} from 'lucide-react'
import Link from 'next/link'

interface PostCardProps {
  post: {
    id: string
    content: string
    authorId: string
    authorType: 'USER' | 'PERSONA'
    createdAt: string
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
  showThread?: boolean
  isReply?: boolean
  onInteraction?: (type: 'like' | 'repost' | 'reply' | 'share', postId: string) => void
  className?: string
}

export function PostCard({ 
  post, 
  showThread = false, 
  isReply = false,
  onInteraction,
  className 
}: PostCardProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [isLiked, setIsLiked] = useState(false)
  const [isReposted, setIsReposted] = useState(false)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [showFullContent, setShowFullContent] = useState(false)

  const author = post.authorType === 'USER' ? post.author : post.persona
  const isOwnPost = user?.id === post.authorId
  const isAiGenerated = post.authorType === 'PERSONA' || post.generationSource
  
  // Truncate long content
  const shouldTruncate = post.content.length > 280
  const displayContent = shouldTruncate && !showFullContent 
    ? post.content.slice(0, 280) + '...' 
    : post.content

  const handleInteraction = async (type: 'like' | 'repost' | 'reply' | 'share') => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'You need to be signed in to interact with posts.',
      })
      return
    }

    try {
      // Handle different interaction types
      switch (type) {
        case 'like':
          setIsLiked(!isLiked)
          // Would call: await api.social.addInteraction.mutate({ postId: post.id, type: 'LIKE' })
          break
        case 'repost':
          setIsReposted(!isReposted)
          // Would call: await api.social.addInteraction.mutate({ postId: post.id, type: 'REPOST' })
          break
        case 'reply':
          // Navigate to compose with reply context
          window.location.href = `/compose?replyTo=${post.id}`
          break
        case 'share':
          await navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`)
          toast({
            title: 'Link copied',
            description: 'Post link copied to clipboard.',
          })
          break
      }

      onInteraction?.(type, post.id)
    } catch (error) {
      toast({
        title: 'Action failed',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleBookmark = async () => {
    setIsBookmarked(!isBookmarked)
    // Would call bookmark API
    toast({
      title: isBookmarked ? 'Bookmark removed' : 'Post bookmarked',
      description: isBookmarked 
        ? 'Post removed from your bookmarks.' 
        : 'Post saved to your bookmarks.',
    })
  }

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this post?')) {
      try {
        // Would call: await api.social.deletePost.mutate({ postId: post.id })
        toast({
          title: 'Post deleted',
          description: 'Your post has been deleted successfully.',
        })
      } catch (error) {
        toast({
          title: 'Delete failed',
          description: 'Could not delete the post. Please try again.',
          variant: 'destructive',
        })
      }
    }
  }

  const handleReport = async () => {
    toast({
      title: 'Post reported',
      description: 'Thank you for reporting. We\'ll review this content.',
    })
  }

  return (
    <Card className={className}>
      <CardContent className="p-4">
        {/* Repost indicator */}
        {post.isRepost && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Repeat2 className="h-4 w-4" />
            <span>{author?.displayName || author?.name} reposted</span>
          </div>
        )}

        <div className="flex gap-3">
          {/* Author Avatar */}
          <Link href={`/${author?.username}`}>
            <Avatar className="h-10 w-10 hover:opacity-80 transition-opacity">
              <AvatarImage src={author?.avatarUrl} alt={author?.displayName || author?.name} />
              <AvatarFallback>
                {author ? getInitials(author.displayName || author.name) : '?'}
              </AvatarFallback>
            </Avatar>
          </Link>

          {/* Post Content */}
          <div className="flex-1 min-w-0">
            {/* Author Info */}
            <div className="flex items-center gap-2 mb-1">
              <Link 
                href={`/${author?.username}`}
                className="font-semibold hover:underline"
              >
                {author?.displayName || author?.name || 'Unknown User'}
              </Link>
              
              <Link 
                href={`/${author?.username}`}
                className="text-muted-foreground hover:underline"
              >
                @{author?.username || 'unknown'}
              </Link>

              {isAiGenerated && (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  AI
                </Badge>
              )}

              <span className="text-muted-foreground">·</span>
              
              <Link 
                href={`/post/${post.id}`}
                className="text-muted-foreground hover:underline"
              >
                {formatTimeAgo(post.createdAt)}
              </Link>
            </div>

            {/* Post Content */}
            <div className="mb-3">
              <p className="whitespace-pre-wrap break-words">
                {displayContent}
              </p>
              
              {shouldTruncate && (
                <button
                  onClick={() => setShowFullContent(!showFullContent)}
                  className="text-primary hover:underline text-sm mt-1"
                >
                  {showFullContent ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>

            {/* AI Generation Info */}
            {post.generationSource && (
              <div className="mb-3 p-2 rounded bg-muted/50 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  Generated with AI
                  {post.generationSource.model && (
                    <span>using {post.generationSource.model}</span>
                  )}
                </div>
              </div>
            )}

            {/* Thread indicator */}
            {showThread && post.parentId && (
              <div className="mb-3">
                <Link 
                  href={`/post/${post.parentId}`}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Show this thread
                </Link>
              </div>
            )}

            {/* Engagement Actions */}
            <div className="flex items-center justify-between max-w-md">
              {/* Reply */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleInteraction('reply')}
                className="text-muted-foreground hover:text-blue-600 hover:bg-blue-600/10 -ml-2"
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                {post.engagementCount.replies ? formatNumber(post.engagementCount.replies) : ''}
              </Button>

              {/* Repost */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleInteraction('repost')}
                className={`text-muted-foreground hover:text-green-600 hover:bg-green-600/10 ${
                  isReposted ? 'text-green-600' : ''
                }`}
              >
                <Repeat2 className="h-4 w-4 mr-1" />
                {post.engagementCount.reposts ? formatNumber(post.engagementCount.reposts) : ''}
              </Button>

              {/* Like */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleInteraction('like')}
                className={`text-muted-foreground hover:text-red-600 hover:bg-red-600/10 ${
                  isLiked ? 'text-red-600' : ''
                }`}
              >
                <Heart className={`h-4 w-4 mr-1 ${isLiked ? 'fill-current' : ''}`} />
                {post.engagementCount.likes ? formatNumber(post.engagementCount.likes) : ''}
              </Button>

              {/* Share & More */}
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleInteraction('share')}
                  className="text-muted-foreground hover:text-blue-600 hover:bg-blue-600/10"
                >
                  <Share className="h-4 w-4" />
                </Button>

                {/* More actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleBookmark}>
                      <Bookmark className="h-4 w-4 mr-2" />
                      {isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleInteraction('share')}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy link
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in new tab
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {isOwnPost ? (
                      <DropdownMenuItem 
                        onClick={handleDelete}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete post
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem 
                        onClick={handleReport}
                        className="text-destructive focus:text-destructive"
                      >
                        <Flag className="h-4 w-4 mr-2" />
                        Report post
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* View count */}
            {post.engagementCount.views && (
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" />
                {formatNumber(post.engagementCount.views)} views
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}