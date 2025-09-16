'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { getInitials, formatTimeAgo } from '@/lib/utils'
import { api } from '@/components/providers/trpc-provider'
import { useRealTimeConversation } from '@/lib/trpc/real-time'
import { 
  Send,
  ArrowLeft,
  MoreHorizontal,
  Phone,
  Video,
  Info,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  Circle
} from 'lucide-react'

interface Message {
  id: string
  content: string
  senderId: string
  recipientId: string
  timestamp: string
  status: 'sending' | 'sent' | 'delivered' | 'read'
  isFromUser: boolean
}

interface Participant {
  id: string
  name: string
  username: string
  avatarUrl?: string
  isOnline: boolean
  lastSeen?: string
  isTyping?: boolean
}

interface DMInterfaceProps {
  conversationId: string
  participant: Participant
  onClose?: () => void
  className?: string
}

export function DMInterface({ 
  conversationId, 
  participant, 
  onClose,
  className 
}: DMInterfaceProps) {
  const { toast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Real-time conversation updates
  const { newMessagesCount, typingUsers, resetNewMessagesCount } = useRealTimeConversation(conversationId)
  
  // Check if participant is typing
  const isParticipantTyping = typingUsers.includes(participant.id)

  useEffect(() => {
    if (messagesData) {
      setMessages(messagesData)
    }
  }, [messagesData])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    markMessagesAsRead()
  }, [messages])

  // Use tRPC for messages
  const { data: messagesData, isLoading, refetch } = api.social.getConversation.useQuery({
    conversationId
  })
  
  const sendMessageMutation = api.social.sendMessage.useMutation({
    onSuccess: () => {
      refetch()
    },
    onError: (error) => {
      toast({
        title: 'Failed to send message',
        description: error.message || 'Please try again.',
        variant: 'destructive'
      })
    }
  })

  const loadMessages = async () => {
    try {
      await refetch()
    } catch (error) {
      toast({
        title: 'Failed to load messages',
        description: 'Could not fetch conversation history.',
        variant: 'destructive'
      })
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || isSending) return

    const messageContent = newMessage.trim()
    setNewMessage('')
    setIsSending(true)

    try {
      await sendMessageMutation.mutateAsync({
        conversationId,
        recipientId: participant.id,
        content: messageContent
      })
    } catch (error) {
      // Error handled by mutation
    } finally {
      setIsSending(false)
    }
  }

  const markMessagesAsRead = async () => {
    // Mark unread messages as read
    setMessages(prev => prev.map(msg => 
      !msg.isFromUser && msg.status !== 'read' 
        ? { ...msg, status: 'read' }
        : msg
    ))
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <Card className={className}>
      {/* Header */}
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="mr-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            
            <div className="relative">
              <Avatar className="h-10 w-10">
                <AvatarImage src={participant.avatarUrl} alt={participant.name} />
                <AvatarFallback>
                  {getInitials(participant.name)}
                </AvatarFallback>
              </Avatar>
              
              {/* Online status */}
              {participant.isOnline && (
                <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-500 border-2 border-background rounded-full" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{participant.name}</h3>
              <p className="text-xs text-muted-foreground truncate">
                {isParticipantTyping ? (
                  <span className="flex items-center gap-1">
                    <Circle className="h-2 w-2 animate-pulse" />
                    Typing...
                  </span>
                ) : participant.isOnline ? (
                  'Active now'
                ) : participant.lastSeen ? (
                  `Active ${formatTimeAgo(participant.lastSeen)}`
                ) : (
                  '@' + participant.username
                )}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm">
              <Phone className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Video className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Info className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex flex-col h-[600px]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>Start a conversation with {participant.name}</p>
              <p className="text-xs mt-1">Messages are end-to-end encrypted</p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble 
                key={message.id} 
                message={message}
                participant={participant}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Paperclip className="h-4 w-4" />
            </Button>
            
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={`Message ${participant.name}...`}
                disabled={isSending}
                className="pr-10"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                <Smile className="h-4 w-4" />
              </Button>
            </div>

            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || isSending}
              size="sm"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          
          {isParticipantTyping && (
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <Avatar className="h-4 w-4">
                <AvatarImage src={participant.avatarUrl} alt={participant.name} />
                <AvatarFallback className="text-xs">
                  {getInitials(participant.name)}
                </AvatarFallback>
              </Avatar>
              <span>{participant.name} is typing...</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface MessageBubbleProps {
  message: Message
  participant: Participant
}

function MessageBubble({ message, participant }: MessageBubbleProps) {
  const StatusIcon = () => {
    switch (message.status) {
      case 'sending':
        return <Circle className="h-3 w-3 animate-pulse text-muted-foreground" />
      case 'sent':
        return <Check className="h-3 w-3 text-muted-foreground" />
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />
      case 'read':
        return <CheckCheck className="h-3 w-3 text-primary" />
      default:
        return null
    }
  }

  return (
    <div className={`flex gap-3 ${message.isFromUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar for AI messages */}
      {!message.isFromUser && (
        <Avatar className="h-6 w-6 mt-1">
          <AvatarImage src={participant.avatarUrl} alt={participant.name} />
          <AvatarFallback className="text-xs">
            {getInitials(participant.name)}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={`flex flex-col max-w-[70%] ${message.isFromUser ? 'items-end' : ''}`}>
        {/* Message bubble */}
        <div 
          className={`px-4 py-2 rounded-2xl ${
            message.isFromUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Timestamp and status */}
        <div className={`flex items-center gap-1 mt-1 text-xs text-muted-foreground ${
          message.isFromUser ? 'flex-row-reverse' : ''
        }`}>
          <span>{formatTimeAgo(message.timestamp)}</span>
          {message.isFromUser && <StatusIcon />}
        </div>
      </div>
    </div>
  )
}

// Helper function to generate mock messages
function generateMockMessages(conversationId: string, participant: Participant): Message[] {
  return [
    {
      id: 'msg-1',
      content: "Hey there! I'm excited to chat with you. What would you like to know about me?",
      senderId: participant.id,
      recipientId: 'user-id',
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      status: 'read',
      isFromUser: false
    },
    {
      id: 'msg-2',
      content: "Tell me about your background",
      senderId: 'user-id',
      recipientId: participant.id,
      timestamp: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
      status: 'read',
      isFromUser: true
    },
    {
      id: 'msg-3',
      content: `Well, I'm ${participant.name} and I've been designed to be helpful and engaging. I love discussing various topics and getting to know people through our conversations. What brings you here today?`,
      senderId: participant.id,
      recipientId: 'user-id',
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      status: 'read',
      isFromUser: false
    }
  ]
}

// Helper function to generate AI responses
function generateAIResponse(userMessage: string, participant: Participant): string {
  const responses = {
    background: `I'm ${participant.name}, and I've been created to be a helpful and engaging conversation partner. I enjoy learning about people and discussing various topics that interest them.`,
    hello: `Hello! It's great to meet you. I'm ${participant.name}, and I'm here to have meaningful conversations with you.`,
    hobbies: "I'm fascinated by technology, human behavior, and creative expression. I love exploring new ideas and helping people think through complex topics.",
    work: "I spend my time engaging in conversations, helping people explore ideas, and learning from every interaction I have.",
    default: "That's an interesting point! I'd love to hear more about your thoughts on this. What aspects are you most curious about?"
  }

  const lowerMessage = userMessage.toLowerCase()
  
  if (lowerMessage.includes('background') || lowerMessage.includes('about you')) {
    return responses.background
  } else if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return responses.hello
  } else if (lowerMessage.includes('hobby') || lowerMessage.includes('interest')) {
    return responses.hobbies
  } else if (lowerMessage.includes('work') || lowerMessage.includes('job')) {
    return responses.work
  } else {
    return responses.default
  }
}