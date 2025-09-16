'use client'

import { useState, useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTimeAgo, getInitials } from '@/lib/utils'
import { 
  Bot, 
  Zap, 
  MessageCircle, 
  Clock, 
  ArrowUpRight,
  Pause,
  Play
} from 'lucide-react'
import Link from 'next/link'

interface PersonaActivity {
  id: string
  name: string
  username: string
  avatarUrl?: string
  status: 'active' | 'paused' | 'generating'
  lastActivity: string
  recentAction?: {
    type: 'post' | 'reply' | 'generation'
    description: string
    timestamp: string
  }
  stats: {
    postsToday: number
    totalPosts: number
    engagementRate: number
  }
}

interface PersonaActivityProps {
  limit?: number
  className?: string
}

export function PersonaActivity({ limit = 3, className }: PersonaActivityProps) {
  const [personas, setPersonas] = useState<PersonaActivity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Mock persona activity data - would come from tRPC in real app
  useEffect(() => {
    const mockPersonas: PersonaActivity[] = [
      {
        id: '1',
        name: 'TechGuru',
        username: 'techguru',
        avatarUrl: undefined,
        status: 'active',
        lastActivity: '2m ago',
        recentAction: {
          type: 'post',
          description: 'Shared insights about quantum computing',
          timestamp: '2m ago'
        },
        stats: {
          postsToday: 5,
          totalPosts: 342,
          engagementRate: 8.7
        }
      },
      {
        id: '2',
        name: 'CreativeBot',
        username: 'creativebot',
        avatarUrl: undefined,
        status: 'generating',
        lastActivity: '15m ago',
        recentAction: {
          type: 'generation',
          description: 'Generating response to trending topic',
          timestamp: '15m ago'
        },
        stats: {
          postsToday: 3,
          totalPosts: 156,
          engagementRate: 12.3
        }
      },
      {
        id: '3',
        name: 'Socialite',
        username: 'socialite',
        avatarUrl: undefined,
        status: 'paused',
        lastActivity: '1h ago',
        recentAction: {
          type: 'reply',
          description: 'Replied to conversation about art',
          timestamp: '1h ago'
        },
        stats: {
          postsToday: 1,
          totalPosts: 89,
          engagementRate: 15.1
        }
      },
    ]

    // Simulate API delay
    setTimeout(() => {
      setPersonas(mockPersonas.slice(0, limit))
      setIsLoading(false)
    }, 300)
  }, [limit])

  const togglePersonaStatus = async (personaId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active'
    
    setPersonas(prev => prev.map(persona => 
      persona.id === personaId 
        ? { ...persona, status: newStatus as any }
        : persona
    ))

    // Would call: await api.personas.toggleStatus.mutate({ personaId, status: newStatus })
  }

  if (isLoading) {
    return (
      <div className={className}>
        <div className="space-y-3">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="loading-skeleton h-8 w-8 rounded-full" />
              <div className="flex-1">
                <div className="loading-skeleton h-4 w-20 mb-1" />
                <div className="loading-skeleton h-3 w-16" />
              </div>
              <div className="loading-skeleton h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {personas.map((persona) => (
          <PersonaActivityItem
            key={persona.id}
            persona={persona}
            onToggleStatus={togglePersonaStatus}
          />
        ))}
      </div>

      {/* View All Link */}
      <div className="mt-4 pt-3 border-t">
        <Link href="/persona-lab">
          <Button variant="ghost" size="sm" className="w-full">
            Manage all personas
            <ArrowUpRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  )
}

interface PersonaActivityItemProps {
  persona: PersonaActivity
  onToggleStatus: (personaId: string, currentStatus: string) => void
}

function PersonaActivityItem({ persona, onToggleStatus }: PersonaActivityItemProps) {
  const statusConfig = {
    active: {
      color: 'bg-green-500',
      label: 'Active',
      icon: Bot
    },
    paused: {
      color: 'bg-gray-500',
      label: 'Paused',
      icon: Pause
    },
    generating: {
      color: 'bg-blue-500',
      label: 'Generating',
      icon: Zap
    }
  }

  const config = statusConfig[persona.status]
  const StatusIcon = config.icon

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors group">
      {/* Avatar with status indicator */}
      <div className="relative">
        <Avatar className="h-8 w-8">
          <AvatarImage src={persona.avatarUrl} alt={persona.name} />
          <AvatarFallback className="text-xs">
            {getInitials(persona.name)}
          </AvatarFallback>
        </Avatar>
        
        <div 
          className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-background ${config.color}`}
          title={config.label}
        />
      </div>

      {/* Persona Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link 
            href={`/persona/${persona.id}`}
            className="font-medium text-sm hover:underline truncate"
          >
            {persona.name}
          </Link>
          
          <Badge variant="secondary" className="text-xs">
            <StatusIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>

        {/* Recent Activity */}
        {persona.recentAction && (
          <p className="text-xs text-muted-foreground truncate mt-1">
            {persona.recentAction.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{persona.stats.postsToday} today</span>
          <span>•</span>
          <span>{persona.stats.engagementRate}% engagement</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleStatus(persona.id, persona.status)}
          className="h-7 w-7 p-0"
          title={persona.status === 'active' ? 'Pause persona' : 'Activate persona'}
        >
          {persona.status === 'active' ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </Button>

        <Link href={`/persona/${persona.id}/chat`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Chat with persona"
          >
            <MessageCircle className="h-3 w-3" />
          </Button>
        </Link>
      </div>

      {/* Last activity timestamp */}
      <div className="text-xs text-muted-foreground">
        <Clock className="h-3 w-3 inline mr-1" />
        {persona.lastActivity}
      </div>
    </div>
  )
}