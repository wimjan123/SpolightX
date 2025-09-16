import { api } from '@/components/providers/trpc-provider'
import { useEffect, useState } from 'react'

// Custom hook for real-time feed updates
export function useRealTimeFeed(userId?: string, feedType: 'following' | 'discover' | 'hybrid' = 'hybrid') {
  const [newPostsCount, setNewPostsCount] = useState(0)
  const [lastUpdate, setLastUpdate] = useState<Date>()

  // Subscribe to feed updates
  api.social.feedUpdates.useSubscription(
    { userId, feedType },
    {
      onData: (update) => {
        switch (update.type) {
          case 'newPost':
            setNewPostsCount(prev => prev + 1)
            setLastUpdate(new Date())
            break
          case 'feedUpdate':
            setLastUpdate(new Date())
            break
        }
      },
      onError: (error) => {
        console.error('Feed subscription error:', error)
      },
    }
  )

  const resetNewPostsCount = () => setNewPostsCount(0)

  return {
    newPostsCount,
    lastUpdate,
    resetNewPostsCount,
  }
}

// Custom hook for real-time conversation updates
export function useRealTimeConversation(conversationId: string) {
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date>()

  // Subscribe to conversation updates
  api.social.conversationUpdates.useSubscription(
    { conversationId },
    {
      onData: (update) => {
        switch (update.type) {
          case 'newMessage':
            setNewMessagesCount(prev => prev + 1)
            setLastUpdate(new Date())
            break
          case 'typingUpdate':
            if (update.data.isTyping) {
              setTypingUsers(prev => [...new Set([...prev, update.data.userId])])
            } else {
              setTypingUsers(prev => prev.filter(id => id !== update.data.userId))
            }
            break
        }
      },
      onError: (error) => {
        console.error('Conversation subscription error:', error)
      },
    }
  )

  const resetNewMessagesCount = () => setNewMessagesCount(0)

  return {
    newMessagesCount,
    typingUsers,
    lastUpdate,
    resetNewMessagesCount,
  }
}

// Custom hook for real-time trending topics
export function useRealTimeTrends() {
  const [trendingUpdated, setTrendingUpdated] = useState<Date>()
  
  // Poll for trending updates every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setTrendingUpdated(new Date())
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  return {
    trendingUpdated,
  }
}

// Custom hook for real-time persona activity
export function useRealTimePersonaActivity(personaId?: string) {
  const [activityCount, setActivityCount] = useState(0)
  const [lastActivity, setLastActivity] = useState<Date>()

  // This would subscribe to persona-specific activity updates
  // For now, just provide the structure
  useEffect(() => {
    if (!personaId) return

    // Would subscribe to persona activity updates here
    // api.personas.activityUpdates.useSubscription({ personaId }, { ... })
  }, [personaId])

  const resetActivityCount = () => setActivityCount(0)

  return {
    activityCount,
    lastActivity,
    resetActivityCount,
  }
}

// Real-time notification system
export function useRealTimeNotifications(userId?: string) {
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  // This would subscribe to user notifications
  useEffect(() => {
    if (!userId) return

    // Would subscribe to notification updates here
    // api.notifications.updates.useSubscription({ userId }, { ... })
  }, [userId])

  const markAsRead = (notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  }
}