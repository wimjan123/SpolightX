'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { 
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  Eye,
  EyeOff,
  Info,
  Zap,
  Globe,
  Users,
  MessageCircle,
  Image,
  Video,
  FileText
} from 'lucide-react'

interface SafetySettings {
  safetyMode: boolean
  riskTolerance: 'low' | 'medium' | 'high'
  contentFiltering: {
    violence: boolean
    harassment: boolean
    hateSpeech: boolean
    sexualContent: boolean
    selfHarm: boolean
    illegalActivities: boolean
  }
  simulationMode: boolean
  showWarnings: boolean
  autoModeration: boolean
  communityReporting: boolean
}

interface SafetyControlsProps {
  className?: string
}

export function SafetyControls({ className }: SafetyControlsProps) {
  const { toast } = useToast()
  const [settings, setSettings] = useState<SafetySettings>({
    safetyMode: true,
    riskTolerance: 'medium',
    contentFiltering: {
      violence: true,
      harassment: true,
      hateSpeech: true,
      sexualContent: true,
      selfHarm: true,
      illegalActivities: true
    },
    simulationMode: true,
    showWarnings: true,
    autoModeration: true,
    communityReporting: true
  })
  const [isSaving, setIsSaving] = useState(false)

  const handleSettingChange = (key: keyof SafetySettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleContentFilterChange = (key: keyof SafetySettings['contentFiltering'], value: boolean) => {
    setSettings(prev => ({
      ...prev,
      contentFiltering: {
        ...prev.contentFiltering,
        [key]: value
      }
    }))
  }

  const saveSettings = async () => {
    setIsSaving(true)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      toast({
        title: 'Safety settings updated',
        description: 'Your safety preferences have been saved.',
      })
    } catch (error) {
      toast({
        title: 'Failed to update settings',
        description: 'Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const resetToDefaults = () => {
    setSettings({
      safetyMode: true,
      riskTolerance: 'medium',
      contentFiltering: {
        violence: true,
        harassment: true,
        hateSpeech: true,
        sexualContent: true,
        selfHarm: true,
        illegalActivities: true
      },
      simulationMode: true,
      showWarnings: true,
      autoModeration: true,
      communityReporting: true
    })
    
    toast({
      title: 'Settings reset',
      description: 'Safety settings have been reset to defaults.',
    })
  }

  const riskLevels = [
    { 
      value: 'low', 
      label: 'Low Risk',
      description: 'Maximum safety, some content may be blocked',
      color: 'text-green-600'
    },
    { 
      value: 'medium', 
      label: 'Medium Risk',
      description: 'Balanced approach with warnings',
      color: 'text-orange-600'
    },
    { 
      value: 'high', 
      label: 'High Risk',
      description: 'Minimal filtering, user discretion advised',
      color: 'text-red-600'
    }
  ]

  const contentCategories = [
    { key: 'violence', label: 'Violence & Graphic Content', icon: AlertTriangle },
    { key: 'harassment', label: 'Harassment & Bullying', icon: Users },
    { key: 'hateSpeech', label: 'Hate Speech', icon: MessageCircle },
    { key: 'sexualContent', label: 'Sexual Content', icon: Eye },
    { key: 'selfHarm', label: 'Self-Harm', icon: Shield },
    { key: 'illegalActivities', label: 'Illegal Activities', icon: XCircle }
  ]

  return (
    <div className={className}>
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="filtering">Content Filtering</TabsTrigger>
          <TabsTrigger value="moderation">Moderation</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Global Safety Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className={`h-5 w-5 ${settings.safetyMode ? 'text-green-600' : 'text-gray-400'}`} />
                Safety Mode
                <Badge variant={settings.safetyMode ? "default" : "secondary"}>
                  {settings.safetyMode ? 'Enabled' : 'Disabled'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enable global safety protections</p>
                  <p className="text-xs text-muted-foreground">
                    Activates content filtering, warnings, and moderation
                  </p>
                </div>
                <Button
                  variant={settings.safetyMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSettingChange('safetyMode', !settings.safetyMode)}
                >
                  {settings.safetyMode ? (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Enabled
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-4 w-4 mr-2" />
                      Disabled
                    </>
                  )}
                </Button>
              </div>

              {/* Risk Tolerance */}
              <div className="space-y-2">
                <Label>Risk Tolerance</Label>
                <Select 
                  value={settings.riskTolerance} 
                  onValueChange={(value: 'low' | 'medium' | 'high') => 
                    handleSettingChange('riskTolerance', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {riskLevels.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full bg-current ${level.color}`} />
                          <div>
                            <div className="font-medium">{level.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {level.description}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Simulation Mode Notice */}
          {settings.simulationMode && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Zap className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-orange-900">Simulation Mode Active</h3>
                    <p className="text-sm text-orange-700 mt-1">
                      This platform creates AI-generated content for simulation purposes. 
                      All personas, conversations, and posts are artificial and should not 
                      be considered real social media interactions.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => handleSettingChange('simulationMode', false)}
                    >
                      Hide Notice
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Safety Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {Object.values(settings.contentFiltering).filter(Boolean).length}
                  </div>
                  <div className="text-xs text-muted-foreground">Filters Active</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {settings.riskTolerance === 'low' ? '90%' : settings.riskTolerance === 'medium' ? '70%' : '30%'}
                  </div>
                  <div className="text-xs text-muted-foreground">Protection Level</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {settings.autoModeration ? '24/7' : 'Manual'}
                  </div>
                  <div className="text-xs text-muted-foreground">Monitoring</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {settings.showWarnings ? 'On' : 'Off'}
                  </div>
                  <div className="text-xs text-muted-foreground">Warnings</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filtering" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Content Categories</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose which types of content to filter or warn about
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {contentCategories.map((category) => {
                const Icon = category.icon
                const isEnabled = settings.contentFiltering[category.key as keyof SafetySettings['contentFiltering']]
                
                return (
                  <div key={category.key} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${isEnabled ? 'text-red-500' : 'text-gray-400'}`} />
                      <div>
                        <p className="font-medium">{category.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {isEnabled ? 'Content will be filtered or warned' : 'No filtering applied'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={isEnabled ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => handleContentFilterChange(category.key as keyof SafetySettings['contentFiltering'], !isEnabled)}
                    >
                      {isEnabled ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Filtering
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 mr-1" />
                          Disabled
                        </>
                      )}
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Content Type Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Media Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    <span className="text-sm font-medium">Image Filtering</span>
                  </div>
                  <Badge variant="default">Active</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    <span className="text-sm font-medium">Video Filtering</span>
                  </div>
                  <Badge variant="default">Active</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm font-medium">Text Analysis</span>
                  </div>
                  <Badge variant="default">Active</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span className="text-sm font-medium">Link Scanning</span>
                  </div>
                  <Badge variant="secondary">Manual</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="moderation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Automated Moderation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto-moderation</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically review and moderate content
                  </p>
                </div>
                <Button
                  variant={settings.autoModeration ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSettingChange('autoModeration', !settings.autoModeration)}
                >
                  {settings.autoModeration ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Community Reporting</p>
                  <p className="text-xs text-muted-foreground">
                    Allow users to report inappropriate content
                  </p>
                </div>
                <Button
                  variant={settings.communityReporting ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSettingChange('communityReporting', !settings.communityReporting)}
                >
                  {settings.communityReporting ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Show Warnings</p>
                  <p className="text-xs text-muted-foreground">
                    Display warnings before showing flagged content
                  </p>
                </div>
                <Button
                  variant={settings.showWarnings ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSettingChange('showWarnings', !settings.showWarnings)}
                >
                  {settings.showWarnings ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Advanced Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-medium mb-2">Data Processing</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  All content filtering happens locally and on secure servers. 
                  No personal content is stored for safety processing.
                </p>
                <Badge variant="outline">GDPR Compliant</Badge>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-medium mb-2">AI Safety Models</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Using industry-standard AI safety models for content classification 
                  and risk assessment.
                </p>
                <Badge variant="outline">OpenAI Moderation API</Badge>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={saveSettings}
                  disabled={isSaving}
                  className="flex-1"
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetToDefaults}
                  disabled={isSaving}
                >
                  Reset to Defaults
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}