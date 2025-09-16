'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { 
  Brain,
  Shuffle,
  Info,
  Target,
  Heart,
  Users,
  Shield,
  Zap
} from 'lucide-react'

interface PersonalityTraits {
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
}

interface PersonalityEditorProps {
  personality: PersonalityTraits
  onPersonalityChange: (trait: string, value: number[]) => void
  onRandomize?: () => void
  className?: string
}

const traitDefinitions = {
  openness: {
    name: 'Openness',
    icon: Brain,
    color: 'text-purple-500',
    description: 'Curiosity, creativity, and willingness to try new things',
    low: 'Traditional, practical, prefers routine',
    high: 'Creative, curious, open to new experiences'
  },
  conscientiousness: {
    name: 'Conscientiousness',
    icon: Target,
    color: 'text-blue-500',
    description: 'Organization, discipline, and goal-directed behavior',
    low: 'Spontaneous, flexible, casual',
    high: 'Organized, disciplined, detail-oriented'
  },
  extraversion: {
    name: 'Extraversion',
    icon: Users,
    color: 'text-green-500',
    description: 'Sociability, assertiveness, and positive emotions',
    low: 'Reserved, quiet, prefers solitude',
    high: 'Outgoing, energetic, talkative'
  },
  agreeableness: {
    name: 'Agreeableness',
    icon: Heart,
    color: 'text-red-500',
    description: 'Compassion, cooperation, and trust in others',
    low: 'Competitive, skeptical, direct',
    high: 'Cooperative, trusting, empathetic'
  },
  neuroticism: {
    name: 'Neuroticism',
    icon: Zap,
    color: 'text-orange-500',
    description: 'Emotional stability and stress response',
    low: 'Calm, stable, resilient',
    high: 'Anxious, sensitive, emotionally reactive'
  }
}

export function PersonalityEditor({ 
  personality, 
  onPersonalityChange, 
  onRandomize, 
  className 
}: PersonalityEditorProps) {
  
  const getPersonalityInsights = (traits: PersonalityTraits) => {
    const insights = []
    
    if (traits.openness > 0.7 && traits.conscientiousness > 0.7) {
      insights.push('Innovative yet disciplined')
    }
    
    if (traits.extraversion > 0.7 && traits.agreeableness > 0.7) {
      insights.push('Natural leader and collaborator')
    }
    
    if (traits.openness < 0.3 && traits.conscientiousness > 0.7) {
      insights.push('Reliable traditionalist')
    }
    
    if (traits.neuroticism < 0.3 && traits.conscientiousness > 0.6) {
      insights.push('Calm and organized')
    }
    
    if (traits.extraversion < 0.3 && traits.openness > 0.6) {
      insights.push('Thoughtful introvert')
    }
    
    return insights
  }

  const personalityInsights = getPersonalityInsights(personality)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Personality Traits
          </div>
          {onRandomize && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRandomize}
              className="flex items-center gap-2"
            >
              <Shuffle className="h-4 w-4" />
              Randomize
            </Button>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure personality using the Big Five model
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Personality Sliders */}
        <div className="space-y-4">
          {Object.entries(traitDefinitions).map(([key, trait]) => {
            const value = personality[key as keyof PersonalityTraits]
            const Icon = trait.icon
            
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${trait.color}`} />
                    <Label className="font-medium">{trait.name}</Label>
                    <div className="group relative">
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-popover border rounded-md shadow-md text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <p className="font-medium mb-1">{trait.description}</p>
                        <p className="text-muted-foreground">
                          Low: {trait.low}
                        </p>
                        <p className="text-muted-foreground">
                          High: {trait.high}
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-medium">
                    {Math.round(value * 100)}%
                  </span>
                </div>
                
                <Slider
                  value={[value]}
                  onValueChange={(newValue) => onPersonalityChange(key, newValue)}
                  max={1}
                  min={0}
                  step={0.05}
                  className="w-full"
                />
                
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Personality Insights */}
        {personalityInsights.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Personality Insights</Label>
            <div className="flex flex-wrap gap-2">
              {personalityInsights.map((insight, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {insight}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Personality Summary */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <Label className="text-sm font-medium">Personality Summary</Label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(personality).map(([trait, value]) => (
              <div key={trait} className="flex justify-between">
                <span className="capitalize">{trait}:</span>
                <span className={`font-medium ${
                  value > 0.7 ? 'text-green-600' : 
                  value < 0.3 ? 'text-red-600' : 'text-orange-600'
                }`}>
                  {value > 0.7 ? 'High' : value < 0.3 ? 'Low' : 'Medium'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Personality Archetype Suggestion */}
        <div className="text-xs text-muted-foreground">
          <p>
            💡 <strong>Tip:</strong> High openness + high conscientiousness = Innovative but reliable.
            High extraversion + high agreeableness = Natural collaborator.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}