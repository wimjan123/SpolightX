'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getInitials, extractHashtags, extractMentions } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/components/providers/trpc-provider'
import { 
  ImageIcon,
  Smile,
  MapPin,
  Calendar,
  Zap,
  Settings2,
  Send,
  Bot,
  Sparkles,
  Target,
  Volume2,
  Shuffle
} from 'lucide-react'

interface ToneSettings {
  creativity: number
  formality: number
  humor: number
  controversy: number
}

interface PostComposerProps {
  initialContent?: string
  onPost?: (content: string, settings?: any) => void
  placeholder?: string
  maxLength?: number
}

export function PostComposer({ 
  initialContent = '',
  onPost,
  placeholder = "What's happening?",
  maxLength = 280
}: PostComposerProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const [content, setContent] = useState(initialContent)
  const [isPosting, setIsPosting] = useState(false)
  const [selectedPersona, setSelectedPersona] = useState<string>('')
  const [aiAssisted, setAiAssisted] = useState(false)
  const [toneSettings, setToneSettings] = useState<ToneSettings>({
    creativity: 0.7,
    formality: 0.5,
    humor: 0.5,
    controversy: 0.2,
  })

  // Mock personas data - would come from API in real app
  const personas = [
    { id: 'techguru', name: 'TechGuru', description: 'Tech enthusiast' },
    { id: 'creativebot', name: 'CreativeBot', description: 'Creative writer' },
    { id: 'socialite', name: 'Socialite', description: 'Social butterfly' },
  ]

  const remainingChars = maxLength - content.length
  const hashtags = extractHashtags(content)
  const mentions = extractMentions(content)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [content])

  const handlePost = async () => {
    if (!content.trim() || remainingChars < 0 || isPosting) return

    setIsPosting(true)
    try {
      // Call onPost callback or default post action
      if (onPost) {
        await onPost(content, {
          persona: selectedPersona,
          toneSettings: aiAssisted ? toneSettings : undefined,
        })
      } else {
        // Default post submission - would call tRPC mutation
        console.log('Posting:', { content, persona: selectedPersona, toneSettings })
        // await api.social.createPost.mutate({ content, ... })
      }

      // Reset form
      setContent('')
      setSelectedPersona('')
      setAiAssisted(false)
      
      toast({
        title: 'Post created!',
        description: 'Your post has been published successfully.',
      })
    } catch (error) {
      toast({
        title: 'Failed to post',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsPosting(false)
    }
  }

  const generateAiContent = async () => {
    if (!content.trim()) return

    setIsPosting(true)
    try {
      // This would call the AI content generation API
      const response = await fetch('/api/compose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: content,
          persona: selectedPersona,
          toneSettings,
          maxLength,
          streamResponse: false,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setContent(data.content)
        toast({
          title: 'AI content generated!',
          description: 'Your content has been enhanced with AI.',
        })
      }
    } catch (error) {
      toast({
        title: 'AI generation failed',
        description: 'Could not generate AI content. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsPosting(false)
    }
  }

  const updateToneSetting = (key: keyof ToneSettings, value: number[]) => {
    setToneSettings(prev => ({ ...prev, [key]: value[0] }))
  }

  return (
    <Card className="w-full">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* User Avatar */}
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarImage src={user?.avatarUrl} alt={user?.displayName} />
            <AvatarFallback>
              {user?.displayName ? getInitials(user.displayName) : 'U'}
            </AvatarFallback>
          </Avatar>

          {/* Composer Content */}
          <div className="flex-1 space-y-4">
            {/* Persona Selection */}
            {aiAssisted && (
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <Select value={selectedPersona} onValueChange={setSelectedPersona}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Choose persona..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Use my voice</SelectItem>
                    {personas.map((persona) => (
                      <SelectItem key={persona.id} value={persona.id}>
                        {persona.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Text Input */}
            <Textarea
              ref={textareaRef}
              placeholder={placeholder}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[100px] resize-none border-none p-0 text-lg placeholder:text-muted-foreground focus-visible:ring-0"
              disabled={isPosting}
            />

            {/* Content Analysis */}
            {content && (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {hashtags.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {hashtags.length} hashtag{hashtags.length !== 1 ? 's' : ''}
                  </Badge>
                )}
                {mentions.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {mentions.length} mention{mentions.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            )}

            {/* AI Tone Controls */}
            {aiAssisted && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    AI Tone Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 pt-0">
                  {/* Creativity */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Creativity
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(toneSettings.creativity * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[toneSettings.creativity]}
                      onValueChange={(value) => updateToneSetting('creativity', value)}
                      max={1}
                      min={0}
                      step={0.1}
                      className="w-full"
                    />
                  </div>

                  {/* Formality */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        Formality
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(toneSettings.formality * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[toneSettings.formality]}
                      onValueChange={(value) => updateToneSetting('formality', value)}
                      max={1}
                      min={0}
                      step={0.1}
                      className="w-full"
                    />
                  </div>

                  {/* Humor */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1">
                        <Smile className="h-3 w-3" />
                        Humor
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(toneSettings.humor * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[toneSettings.humor]}
                      onValueChange={(value) => updateToneSetting('humor', value)}
                      max={1}
                      min={0}
                      step={0.1}
                      className="w-full"
                    />
                  </div>

                  {/* Controversy */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1">
                        <Volume2 className="h-3 w-3" />
                        Controversy
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(toneSettings.controversy * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[toneSettings.controversy]}
                      onValueChange={(value) => updateToneSetting('controversy', value)}
                      max={1}
                      min={0}
                      step={0.1}
                      className="w-full"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions Bar */}
            <div className="flex items-center justify-between pt-2 border-t">
              {/* Left Actions */}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <ImageIcon className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <Smile className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                </Button>
                
                {/* AI Toggle */}
                <Button 
                  variant={aiAssisted ? "default" : "ghost"} 
                  size="sm" 
                  onClick={() => setAiAssisted(!aiAssisted)}
                  className="text-xs"
                >
                  <Zap className="h-4 w-4 mr-1" />
                  AI
                </Button>
              </div>

              {/* Right Actions */}
              <div className="flex items-center gap-3">
                {/* Character Count */}
                <div className={`text-sm ${
                  remainingChars < 0 ? 'text-destructive' : 
                  remainingChars < 20 ? 'text-amber-500' : 'text-muted-foreground'
                }`}>
                  {remainingChars < 20 && remainingChars}
                </div>

                {/* AI Generate Button */}
                {aiAssisted && content.trim() && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateAiContent}
                    disabled={isPosting}
                  >
                    <Shuffle className="h-4 w-4 mr-1" />
                    Enhance
                  </Button>
                )}

                {/* Post Button */}
                <Button 
                  onClick={handlePost} 
                  disabled={!content.trim() || remainingChars < 0 || isPosting}
                  size="sm"
                >
                  {isPosting ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" />
                      Post
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}