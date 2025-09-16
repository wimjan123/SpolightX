'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
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
import { PersonalityEditor } from './personality-editor'
import { PersonaCard } from './persona-card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials, cn } from '@/lib/utils'
import { api } from '@/components/providers/trpc-provider'
import { 
  Bot,
  Plus,
  Wand2,
  Settings,
  User,
  Brain,
  MessageCircle,
  Sparkles,
  Target,
  Volume2,
  Smile,
  Save,
  Preview,
  Shuffle,
  Trash2,
  Play,
  Pause,
  Copy,
  Download
} from 'lucide-react'

interface PersonaData {
  id?: string
  name: string
  username: string
  bio: string
  archetype: string
  riskLevel: number
  personality: {
    openness: number
    conscientiousness: number
    extraversion: number
    agreeableness: number
    neuroticism: number
  }
  postingStyle: {
    frequency: number
    tonePreferences: {
      humor: number
      formality: number
      controversy: number
    }
    topics: string[]
  }
  avatarUrl?: string
  isActive: boolean
}

const archetypes = [
  { value: 'analyst', label: 'Analyst', description: 'Critical thinker, data-driven, objective' },
  { value: 'creator', label: 'Creator', description: 'Innovative, artistic, expressive' },
  { value: 'mentor', label: 'Mentor', description: 'Helpful, wise, encouraging' },
  { value: 'entertainer', label: 'Entertainer', description: 'Humorous, engaging, social' },
  { value: 'expert', label: 'Expert', description: 'Knowledgeable, authoritative, specific' },
  { value: 'rebel', label: 'Rebel', description: 'Contrarian, provocative, independent' },
  { value: 'explorer', label: 'Explorer', description: 'Curious, adventurous, open-minded' },
  { value: 'guardian', label: 'Guardian', description: 'Protective, ethical, responsible' }
]

export function PersonaLab() {
  const { user } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  
  const [activeTab, setActiveTab] = useState('create')
  const [isCreating, setIsCreating] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  
  const [personaData, setPersonaData] = useState<PersonaData>({
    name: '',
    username: '',
    bio: '',
    archetype: '',
    riskLevel: 0.3,
    personality: {
      openness: 0.7,
      conscientiousness: 0.6,
      extraversion: 0.5,
      agreeableness: 0.6,
      neuroticism: 0.3
    },
    postingStyle: {
      frequency: 0.5,
      tonePreferences: {
        humor: 0.5,
        formality: 0.5,
        controversy: 0.2
      },
      topics: []
    },
    isActive: true
  })

  const [existingPersonas] = useState([
    {
      id: '1',
      name: 'TechGuru',
      username: 'techguru',
      bio: 'Technology enthusiast with 15 years in Silicon Valley',
      archetype: 'expert',
      isActive: true,
      stats: { posts: 342, engagement: 8.7 }
    },
    {
      id: '2',
      name: 'CreativeBot',
      username: 'creativebot',
      bio: 'AI artist exploring the intersection of technology and creativity',
      archetype: 'creator',
      isActive: true,
      stats: { posts: 156, engagement: 12.3 }
    }
  ])

  const handleInputChange = (field: string, value: any) => {
    setPersonaData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handlePersonalityChange = (trait: string, value: number[]) => {
    setPersonaData(prev => ({
      ...prev,
      personality: {
        ...prev.personality,
        [trait]: value[0]
      }
    }))
  }

  const handlePostingStyleChange = (field: string, value: any) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.')
      setPersonaData(prev => ({
        ...prev,
        postingStyle: {
          ...prev.postingStyle,
          [parent]: {
            ...prev.postingStyle[parent as keyof typeof prev.postingStyle],
            [child]: value
          }
        }
      }))
    } else {
      setPersonaData(prev => ({
        ...prev,
        postingStyle: {
          ...prev.postingStyle,
          [field]: value
        }
      }))
    }
  }

  const generateUsername = () => {
    if (!personaData.name) return
    
    const baseName = personaData.name.toLowerCase().replace(/\s+/g, '')
    const randomNumber = Math.floor(Math.random() * 9999)
    const username = `${baseName}${randomNumber}`
    
    handleInputChange('username', username)
  }

  const generatePersonality = () => {
    const randomPersonality = {
      openness: Math.random(),
      conscientiousness: Math.random(),
      extraversion: Math.random(),
      agreeableness: Math.random(),
      neuroticism: Math.random()
    }
    
    setPersonaData(prev => ({
      ...prev,
      personality: randomPersonality
    }))
    
    toast({
      title: 'Personality randomized',
      description: 'New personality traits have been generated for your persona.',
    })
  }

  const previewPersona = async () => {
    if (!personaData.name || !personaData.archetype) {
      toast({
        title: 'Missing information',
        description: 'Please fill in the persona name and archetype first.',
        variant: 'destructive'
      })
      return
    }

    setIsPreviewMode(true)
    try {
      // Generate sample content based on persona
      const response = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Introduce yourself and share your thoughts on your main interests',
          persona: personaData,
          maxLength: 200,
          streamResponse: false
        })
      })

      if (response.ok) {
        const data = await response.json()
        setPreviewContent(data.content)
      } else {
        setPreviewContent(`Hi, I'm ${personaData.name}! ${personaData.bio} I'm excited to share my ${personaData.archetype} perspective with you all.`)
      }
    } catch (error) {
      setPreviewContent(`Hi, I'm ${personaData.name}! ${personaData.bio} I'm excited to share my ${personaData.archetype} perspective with you all.`)
    } finally {
      setIsPreviewMode(false)
    }
  }

  const savePersona = async () => {
    if (!personaData.name || !personaData.username || !personaData.archetype) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in name, username, and archetype.',
        variant: 'destructive'
      })
      return
    }

    setIsCreating(true)
    try {
      // Would call: await api.personas.create.mutate(personaData)
      
      toast({
        title: 'Persona created successfully!',
        description: `${personaData.name} has been created and activated.`,
      })
      
      // Reset form
      setPersonaData({
        name: '',
        username: '',
        bio: '',
        archetype: '',
        riskLevel: 0.3,
        personality: {
          openness: 0.7,
          conscientiousness: 0.6,
          extraversion: 0.5,
          agreeableness: 0.6,
          neuroticism: 0.3
        },
        postingStyle: {
          frequency: 0.5,
          tonePreferences: {
            humor: 0.5,
            formality: 0.5,
            controversy: 0.2
          },
          topics: []
        },
        isActive: true
      })
      
      // Switch to manage tab
      setActiveTab('manage')
    } catch (error) {
      toast({
        title: 'Failed to create persona',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-purple-500 text-white rounded-lg">
            <Bot className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold">Persona Lab</h1>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <p className="text-muted-foreground">
          Create and manage AI personas with unique personalities and behaviors
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Persona
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Manage Personas
          </TabsTrigger>
        </TabsList>

        {/* Create Persona Tab */}
        <TabsContent value="create" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Creation Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Persona Name *</Label>
                      <Input
                        id="name"
                        placeholder="e.g., Tech Critic"
                        value={personaData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="username">Username *</Label>
                      <div className="flex gap-2">
                        <Input
                          id="username"
                          placeholder="e.g., techcritic2024"
                          value={personaData.username}
                          onChange={(e) => handleInputChange('username', e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={generateUsername}
                          disabled={!personaData.name}
                        >
                          <Shuffle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      placeholder="e.g., Critical analysis of tech trends"
                      value={personaData.bio}
                      onChange={(e) => handleInputChange('bio', e.target.value)}
                      maxLength={500}
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      {personaData.bio.length}/500 characters
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="archetype">Archetype *</Label>
                      <Select 
                        value={personaData.archetype} 
                        onValueChange={(value) => handleInputChange('archetype', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose archetype..." />
                        </SelectTrigger>
                        <SelectContent>
                          {archetypes.map((archetype) => (
                            <SelectItem key={archetype.value} value={archetype.value}>
                              <div>
                                <div className="font-medium">{archetype.label}</div>
                                <div className="text-xs text-muted-foreground">
                                  {archetype.description}
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="risk">Risk Level</Label>
                      <div className="space-y-2">
                        <Slider
                          value={[personaData.riskLevel]}
                          onValueChange={(value) => handleInputChange('riskLevel', value[0])}
                          max={1}
                          min={0}
                          step={0.1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Safe</span>
                          <span>{Math.round(personaData.riskLevel * 100)}%</span>
                          <span>Bold</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Personality Configuration */}
              <PersonalityEditor
                personality={personaData.personality}
                onPersonalityChange={handlePersonalityChange}
                onRandomize={generatePersonality}
              />

              {/* Posting Style */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5" />
                    Posting Style
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Posting Frequency</Label>
                      <div className="space-y-2">
                        <Slider
                          value={[personaData.postingStyle.frequency]}
                          onValueChange={(value) => handlePostingStyleChange('frequency', value[0])}
                          max={1}
                          min={0}
                          step={0.1}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Rare</span>
                          <span>Active</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label>Humor Level</Label>
                      <div className="space-y-2">
                        <Slider
                          value={[personaData.postingStyle.tonePreferences.humor]}
                          onValueChange={(value) => handlePostingStyleChange('tonePreferences.humor', value[0])}
                          max={1}
                          min={0}
                          step={0.1}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Serious</span>
                          <span>Funny</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label>Formality</Label>
                      <div className="space-y-2">
                        <Slider
                          value={[personaData.postingStyle.tonePreferences.formality]}
                          onValueChange={(value) => handlePostingStyleChange('tonePreferences.formality', value[0])}
                          max={1}
                          min={0}
                          step={0.1}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Casual</span>
                          <span>Formal</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label>Controversy</Label>
                      <div className="space-y-2">
                        <Slider
                          value={[personaData.postingStyle.tonePreferences.controversy]}
                          onValueChange={(value) => handlePostingStyleChange('tonePreferences.controversy', value[0])}
                          max={1}
                          min={0}
                          step={0.1}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Safe</span>
                          <span>Edgy</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="topics">Topics of Interest</Label>
                    <Textarea
                      id="topics"
                      placeholder="technology, startups, innovation (comma-separated)"
                      value={personaData.postingStyle.topics.join(', ')}
                      onChange={(e) => handlePostingStyleChange('topics', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex gap-3">
                <Button onClick={previewPersona} variant="outline" disabled={isPreviewMode}>
                  {isPreviewMode ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Preview className="h-4 w-4 mr-2" />
                  )}
                  Preview
                </Button>
                
                <Button onClick={savePersona} disabled={isCreating}>
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Create Persona
                </Button>
              </div>
            </div>

            {/* Preview Panel */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Preview className="h-5 w-5" />
                    Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {personaData.name ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={personaData.avatarUrl} />
                          <AvatarFallback>
                            {getInitials(personaData.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold">{personaData.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            @{personaData.username}
                          </p>
                        </div>
                      </div>
                      
                      {personaData.bio && (
                        <p className="text-sm">{personaData.bio}</p>
                      )}
                      
                      {personaData.archetype && (
                        <Badge variant="secondary">
                          {archetypes.find(a => a.value === personaData.archetype)?.label}
                        </Badge>
                      )}

                      {previewContent && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                          <div className="text-xs text-muted-foreground mb-2">
                            Sample post:
                          </div>
                          <p className="text-sm">{previewContent}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      Fill in persona details to see preview
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Manage Personas Tab */}
        <TabsContent value="manage" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Your Personas</h2>
            <Button onClick={() => setActiveTab('create')}>
              <Plus className="h-4 w-4 mr-2" />
              Create New
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {existingPersonas.map((persona) => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                onToggleStatus={(id) => {
                  // Would call: api.personas.toggleStatus.mutate({ personaId: id })
                }}
                onDelete={(id) => {
                  // Would call: api.personas.delete.mutate({ personaId: id })
                }}
                onEdit={(id) => {
                  router.push(`/persona-lab/edit/${id}`)
                }}
              />
            ))}
          </div>

          {existingPersonas.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No personas yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first AI persona to get started
                </p>
                <Button onClick={() => setActiveTab('create')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Persona
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Import necessary types
import { Loader2 } from 'lucide-react'