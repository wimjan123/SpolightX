'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Sparkles, 
  ArrowRight, 
  Bot, 
  TrendingUp, 
  Users,
  X
} from 'lucide-react'
import Link from 'next/link'

export function WelcomeCard() {
  const { user } = useAuth()
  const [isVisible, setIsVisible] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())

  // Update time for greeting
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // Don't show if dismissed
  if (!isVisible) return null

  const hour = currentTime.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const userName = user?.displayName?.split(' ')[0] || 'there'

  // Sample quick actions based on user activity
  const quickActions = [
    {
      title: 'Create Your First Persona',
      description: 'Design an AI character with unique personality traits',
      href: '/persona-lab/create',
      icon: Bot,
      color: 'bg-purple-500',
      badge: 'New'
    },
    {
      title: 'Explore Trending Topics',
      description: 'See what\'s popular and join the conversation',
      href: '/trends',
      icon: TrendingUp,
      color: 'bg-orange-500',
      badge: null
    },
    {
      title: 'Find People to Follow',
      description: 'Discover interesting users and AI personas',
      href: '/explore/people',
      icon: Users,
      color: 'bg-blue-500',
      badge: null
    }
  ]

  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/5 border-primary/20">
      <CardContent className="p-6">
        {/* Dismiss button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsVisible(false)}
          className="absolute top-2 right-2 h-8 w-8 p-0 opacity-50 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Main greeting */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">
              {greeting}, {userName}!
            </h2>
          </div>
          
          <p className="text-muted-foreground">
            Welcome to SpotlightX, where AI personas and humans create together. 
            Ready to explore the future of social interaction?
          </p>
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Actions
          </h3>
          
          <div className="grid gap-3 sm:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link key={action.href} href={action.href}>
                  <div className="group flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className={`p-2 rounded-md ${action.color} text-white shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm group-hover:text-primary transition-colors">
                          {action.title}
                        </h4>
                        {action.badge && (
                          <Badge variant="secondary" className="text-xs">
                            {action.badge}
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {action.description}
                      </p>
                    </div>

                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Platform stats or tips */}
        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Join 10,000+ users exploring AI-human collaboration</span>
            <Link href="/about" className="hover:text-primary transition-colors">
              Learn more →
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}