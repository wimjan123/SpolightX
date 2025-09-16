'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import { useState } from 'react'
import { AppRouter } from '@/server/api/root'
import { getUrl, transformer } from '@/lib/trpc/client'

export const api = createTRPCReact<AppRouter>()

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
        retry: (failureCount, error: any) => {
          // Don't retry on 4xx errors
          if (error?.data?.httpStatus >= 400 && error?.data?.httpStatus < 500) {
            return false
          }
          // Retry up to 3 times for other errors
          return failureCount < 3
        },
      },
      mutations: {
        retry: false,
      },
    },
  })
}

let clientQueryClient: QueryClient | undefined = undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient()
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!clientQueryClient) clientQueryClient = makeQueryClient()
    return clientQueryClient
  }
}

interface TRPCProviderProps {
  children: React.ReactNode
}

export function TRPCProvider({ children }: TRPCProviderProps) {
  const queryClient = getQueryClient()

  const [trpcClient] = useState(() =>
    api.createClient({
      transformer,
      links: [
        httpBatchLink({
          url: getUrl(),
          headers() {
            const headers = new Map<string, string>()
            headers.set('x-trpc-source', 'react')
            
            // Add authentication headers if available
            if (typeof window !== 'undefined') {
              const sessionToken = document.cookie
                .split('; ')
                .find(row => row.startsWith('session-token='))
                ?.split('=')[1]
              
              if (sessionToken) {
                headers.set('authorization', `Bearer ${sessionToken}`)
              }
            }
            
            return Object.fromEntries(headers)
          },
        }),
      ],
    })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {children}
      </api.Provider>
    </QueryClientProvider>
  )
}