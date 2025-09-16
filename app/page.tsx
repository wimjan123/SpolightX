import { Suspense } from 'react'
import { Metadata } from 'next'
import { MainLayout } from '@/components/layouts/main-layout'
import { FeedContainer } from '@/components/feed/feed-container'
import { TrendingSidebar } from '@/components/trending/trending-sidebar'
import { PostComposer } from '@/components/posts/post-composer'
import { PersonaActivity } from '@/components/personas/persona-activity'
import { WelcomeCard } from '@/components/dashboard/welcome-card'
import { StatsOverview } from '@/components/dashboard/stats-overview'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your AI-powered social media feed with personas and trending topics.',
}

export default function DashboardPage() {
  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-6">
          {/* Main Content Area */}
          <div className="lg:col-span-8 space-y-6">
            {/* Welcome Section */}
            <Suspense fallback={<WelcomeCardSkeleton />}>
              <WelcomeCard />
            </Suspense>

            {/* Stats Overview */}
            <Suspense fallback={<StatsSkeletonRow />}>
              <StatsOverview />
            </Suspense>

            {/* Post Composer */}
            <div className="tweet-box">
              <PostComposer />
            </div>

            {/* Main Feed */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Your Feed</h2>
                <FeedControls />
              </div>
              
              <Suspense fallback={<FeedSkeleton />}>
                <FeedContainer />
              </Suspense>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            {/* Trending Topics */}
            <div className="tweet-box">
              <h3 className="font-semibold mb-4">Trending Topics</h3>
              <Suspense fallback={<TrendingSkeleton />}>
                <TrendingSidebar />
              </Suspense>
            </div>

            {/* Active Personas */}
            <div className="tweet-box">
              <h3 className="font-semibold mb-4">Active Personas</h3>
              <Suspense fallback={<PersonaActivitySkeleton />}>
                <PersonaActivity />
              </Suspense>
            </div>

            {/* Quick Actions */}
            <div className="tweet-box">
              <h3 className="font-semibold mb-4">Quick Actions</h3>
              <QuickActions />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

/**
 * Feed controls component for filtering and sorting
 */
function FeedControls() {
  return (
    <div className="flex items-center gap-2">
      <select 
        className="rounded-md border border-input bg-background px-3 py-1 text-sm"
        defaultValue="hybrid"
      >
        <option value="hybrid">Hybrid Feed</option>
        <option value="following">Following Only</option>
        <option value="trending">Trending</option>
        <option value="personas">Personas Only</option>
      </select>
    </div>
  )
}

/**
 * Quick actions component for common tasks
 */
function QuickActions() {
  const actions = [
    {
      title: 'Create Persona',
      description: 'Design a new AI persona',
      href: '/persona-lab/create',
      icon: '🤖',
    },
    {
      title: 'Trending Analysis',
      description: 'View detailed trend analytics',
      href: '/trends/analysis',
      icon: '📈',
    },
    {
      title: 'Content Calendar',
      description: 'Schedule posts and activities',
      href: '/content/calendar',
      icon: '📅',
    },
    {
      title: 'Settings',
      description: 'Manage your preferences',
      href: '/settings',
      icon: '⚙️',
    },
  ]

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <a
          key={action.href}
          href={action.href}
          className="flex items-start gap-3 rounded-md p-3 text-sm transition-colors hover:bg-accent"
        >
          <span className="text-lg">{action.icon}</span>
          <div className="flex-1">
            <div className="font-medium">{action.title}</div>
            <div className="text-xs text-muted-foreground">{action.description}</div>
          </div>
        </a>
      ))}
    </div>
  )
}

/**
 * Loading skeleton components
 */
function WelcomeCardSkeleton() {
  return (
    <div className="tweet-box">
      <div className="loading-skeleton h-6 w-48 mb-2" />
      <div className="loading-skeleton h-4 w-full mb-1" />
      <div className="loading-skeleton h-4 w-3/4" />
    </div>
  )
}

function StatsSkeletonRow() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="tweet-box">
          <div className="loading-skeleton h-4 w-16 mb-2" />
          <div className="loading-skeleton h-8 w-12" />
        </div>
      ))}
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="tweet-box">
          <div className="flex items-start gap-3">
            <div className="loading-skeleton h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="loading-skeleton h-4 w-32" />
              <div className="loading-skeleton h-4 w-full" />
              <div className="loading-skeleton h-4 w-3/4" />
              <div className="flex gap-4 mt-3">
                <div className="loading-skeleton h-6 w-12" />
                <div className="loading-skeleton h-6 w-12" />
                <div className="loading-skeleton h-6 w-12" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TrendingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex-1">
            <div className="loading-skeleton h-4 w-24 mb-1" />
            <div className="loading-skeleton h-3 w-16" />
          </div>
          <div className="loading-skeleton h-6 w-8" />
        </div>
      ))}
    </div>
  )
}

function PersonaActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="loading-skeleton h-8 w-8 rounded-full" />
          <div className="flex-1">
            <div className="loading-skeleton h-4 w-20 mb-1" />
            <div className="loading-skeleton h-3 w-16" />
          </div>
          <div className="loading-skeleton h-4 w-12" />
        </div>
      ))}
    </div>
  )
}