'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { getInitials, formatNumber } from '@/lib/utils'
import { 
  Bot,
  MoreHorizontal,
  Play,
  Pause,
  Edit,
  Trash2,
  MessageCircle,
  BarChart3,
  Copy,
  ExternalLink,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react'
import Link from 'next/link'

interface PersonaCardProps {
  persona: {
    id: string
    name: string
    username: string
    bio: string
    archetype: string
    isActive: boolean
    avatarUrl?: string
    stats?: {
      posts: number
      engagement: number
      followers?: number
      likes?: number
    }
  }
  onToggleStatus?: (id: string) => void
  onDelete?: (id: string) => void
  onEdit?: (id: string) => void
  showStats?: boolean
  compact?: boolean
}

export function PersonaCard({ 
  persona, 
  onToggleStatus, 
  onDelete, 
  onEdit,
  showStats = true,
  compact = false
}: PersonaCardProps) {
  const { toast } = useToast()
  const [isToggling, setIsToggling] = useState(false)

  const handleToggleStatus = async () => {
    setIsToggling(true)
    try {
      await onToggleStatus?.(persona.id)
      toast({
        title: persona.isActive ? 'Persona paused' : 'Persona activated',
        description: `${persona.name} is now ${persona.isActive ? 'paused' : 'active'}.`,
      })
    } catch (error) {
      toast({
        title: 'Failed to update persona',
        description: 'Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsToggling(false)
    }
  }

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${persona.name}? This action cannot be undone.`)) {
      onDelete?.(persona.id)
      toast({
        title: 'Persona deleted',
        description: `${persona.name} has been deleted permanently.`,
      })
    }
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(persona.id)
    toast({
      title: 'ID copied',
      description: 'Persona ID copied to clipboard.',
    })
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
        <Avatar className="h-8 w-8">
          <AvatarImage src={persona.avatarUrl} alt={persona.name} />
          <AvatarFallback className="text-xs">
            {getInitials(persona.name)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm truncate">{persona.name}</h3>
            <Badge 
              variant={persona.isActive ? "default" : "secondary"}
              className="text-xs"
            >
              {persona.isActive ? 'Active' : 'Paused'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            @{persona.username}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleStatus}
          disabled={isToggling}
        >
          {persona.isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </Button>
      </div>
    )
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-12 w-12">
                <AvatarImage src={persona.avatarUrl} alt={persona.name} />
                <AvatarFallback>
                  {getInitials(persona.name)}
                </AvatarFallback>
              </Avatar>
              
              {/* Status indicator */}
              <div 
                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center ${
                  persona.isActive 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-500 text-white'
                }`}
              >
                <Bot className="h-2 w-2" />
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{persona.name}</h3>
              <p className="text-sm text-muted-foreground truncate">
                @{persona.username}
              </p>
            </div>
          </div>

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit?.(persona.id)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit persona
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={handleToggleStatus} disabled={isToggling}>
                {persona.isActive ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Pause persona
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Activate persona
                  </>
                )}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <Link href={`/persona/${persona.id}`}>
                <DropdownMenuItem>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View profile
                </DropdownMenuItem>
              </Link>

              <Link href={`/persona/${persona.id}/chat`}>
                <DropdownMenuItem>
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Start chat
                </DropdownMenuItem>
              </Link>

              <Link href={`/persona/${persona.id}/analytics`}>
                <DropdownMenuItem>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View analytics
                </DropdownMenuItem>
              </Link>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleCopyId}>
                <Copy className="h-4 w-4 mr-2" />
                Copy ID
              </DropdownMenuItem>

              <DropdownMenuItem 
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete persona
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Bio */}
        {persona.bio && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {persona.bio}
          </p>
        )}

        {/* Tags */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {persona.archetype}
          </Badge>
          <Badge 
            variant={persona.isActive ? "default" : "secondary"}
            className="text-xs"
          >
            {persona.isActive ? 'Active' : 'Paused'}
          </Badge>
        </div>

        {/* Stats */}
        {showStats && persona.stats && (
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-lg font-bold">
                {formatNumber(persona.stats.posts)}
              </div>
              <div className="text-xs text-muted-foreground">Posts</div>
            </div>
            <div>
              <div className="text-lg font-bold">
                {persona.stats.engagement}%
              </div>
              <div className="text-xs text-muted-foreground">Engagement</div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleStatus}
            disabled={isToggling}
            className="flex-1"
          >
            {persona.isActive ? (
              <>
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Activate
              </>
            )}
          </Button>

          <Link href={`/persona/${persona.id}/chat`}>
            <Button variant="outline" size="sm">
              <MessageCircle className="h-4 w-4 mr-1" />
              Chat
            </Button>
          </Link>
        </div>

        {/* Last activity indicator */}
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          {persona.isActive ? (
            <>
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              Active now
            </>
          ) : (
            <>
              <div className="h-2 w-2 bg-gray-400 rounded-full" />
              Paused
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}