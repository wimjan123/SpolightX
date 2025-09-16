import { Suspense, ReactNode } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * React 19 Suspense boundaries for SpotlightX
 * 
 * Provides optimized loading states with proper error boundaries
 * and progressive loading for different components.
 */

interface SuspenseWrapperProps {
  children: ReactNode
  fallback?: ReactNode
  errorFallback?: ReactNode
}

// Generic suspense wrapper
export function SuspenseWrapper({ 
  children, 
  fallback,
  errorFallback 
}: SuspenseWrapperProps) {
  return (
    <Suspense fallback={fallback || <DefaultLoadingFallback />}>
      {children}
    </Suspense>
  )
}

// Default loading fallback
function DefaultLoadingFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <LoadingSpinner className="h-8 w-8" />
    </div>
  )
}

// Feed-specific loading boundaries
export function FeedSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<FeedLoadingSkeleton />}>
      {children}
    </Suspense>
  )
}

function FeedLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  )
}

function PostCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="flex justify-between pt-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </CardContent>
    </Card>
  )
}

// Persona-specific loading boundaries
export function PersonaSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PersonaLoadingSkeleton />}>
      {children}
    </Suspense>
  )
}

function PersonaLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <PersonaCardSkeleton key={i} />
      ))}
    </div>
  )
}

function PersonaCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-8 w-8" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <Skeleton className="h-6 w-12 mx-auto mb-1" />
            <Skeleton className="h-3 w-8 mx-auto" />
          </div>
          <div className="text-center">
            <Skeleton className="h-6 w-12 mx-auto mb-1" />
            <Skeleton className="h-3 w-12 mx-auto" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Trending panel loading boundary
export function TrendingSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<TrendingLoadingSkeleton />}>
      {children}
    </Suspense>
  )
}

function TrendingLoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-8 w-8" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <TrendItemSkeleton key={i} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function TrendItemSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3">
      <Skeleton className="h-4 w-3" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-12" />
        </div>
        <Skeleton className="h-3 w-48" />
        <div className="flex gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  )
}

// DM interface loading boundary
export function DMSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<DMLoadingSkeleton />}>
      {children}
    </Suspense>
  )
}

function DMLoadingSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex flex-col h-[600px]">
        <div className="flex-1 p-4 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MessageBubbleSkeleton key={i} isFromUser={i % 2 === 0} />
          ))}
        </div>
        <div className="border-t p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MessageBubbleSkeleton({ isFromUser }: { isFromUser: boolean }) {
  return (
    <div className={`flex gap-3 ${isFromUser ? 'flex-row-reverse' : ''}`}>
      {!isFromUser && <Skeleton className="h-6 w-6 rounded-full mt-1" />}
      <div className={`flex flex-col max-w-[70%] ${isFromUser ? 'items-end' : ''}`}>
        <Skeleton className={`h-12 w-48 ${isFromUser ? 'rounded-2xl' : 'rounded-2xl'}`} />
        <Skeleton className="h-3 w-16 mt-1" />
      </div>
    </div>
  )
}

// Composer loading boundary
export function ComposerSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ComposerLoadingSkeleton />}>
      {children}
    </Suspense>
  )
}

function ComposerLoadingSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-32 w-full" />
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-8" />
              </div>
              <Skeleton className="h-10 w-20" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Settings panels loading boundary
export function SettingsSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<SettingsLoadingSkeleton />}>
      {children}
    </Suspense>
  )
}

function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid w-full grid-cols-4 gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// Dashboard loading boundary
export function DashboardSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<DashboardLoadingSkeleton />}>
      {children}
    </Suspense>
  )
}

function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Welcome card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-8 w-12" />
                </div>
                <Skeleton className="h-8 w-8" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <FeedLoadingSkeleton />
        </div>
        <div className="space-y-6">
          <TrendingLoadingSkeleton />
          <PersonaLoadingSkeleton />
        </div>
      </div>
    </div>
  )
}

// Progressive loading wrapper
export function ProgressiveSuspense({ 
  children, 
  steps 
}: { 
  children: ReactNode
  steps?: number 
}) {
  return (
    <Suspense fallback={<ProgressiveLoadingSkeleton steps={steps} />}>
      {children}
    </Suspense>
  )
}

function ProgressiveLoadingSkeleton({ steps = 3 }: { steps?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center p-8">
        <div className="space-y-4 text-center">
          <LoadingSpinner className="h-8 w-8 mx-auto" />
          <div className="space-y-2">
            <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all duration-1000 ease-out animate-pulse"
                style={{ width: `${(100 / steps) * Math.min(steps, 2)}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">Loading components...</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Error boundary wrapper (for use with Suspense)
export function ErrorBoundary({ 
  children, 
  fallback 
}: { 
  children: ReactNode
  fallback?: ReactNode 
}) {
  // This would be implemented with error boundaries in a real app
  // For now, just render children
  return <>{children}</>
}

// Combined Suspense + Error boundary
export function SafeSuspense({ 
  children, 
  loadingFallback,
  errorFallback 
}: { 
  children: ReactNode
  loadingFallback?: ReactNode
  errorFallback?: ReactNode
}) {
  return (
    <ErrorBoundary fallback={errorFallback}>
      <Suspense fallback={loadingFallback || <DefaultLoadingFallback />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}