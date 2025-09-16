import { type AppRouter } from '@/server/api/root'
import { createTRPCReact } from '@trpc/react-query'
import superjson from 'superjson'

/**
 * tRPC client configuration for Next.js App Router
 * Handles both server-side and client-side requests
 */

export const transformer = superjson

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // Client-side: use relative URL
    return ''
  }
  
  if (process.env.VERCEL_URL) {
    // Vercel deployment
    return `https://${process.env.VERCEL_URL}`
  }
  
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    // Railway deployment
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  }
  
  if (process.env.RENDER_EXTERNAL_URL) {
    // Render deployment
    return process.env.RENDER_EXTERNAL_URL
  }
  
  // Local development
  return `http://localhost:${process.env.PORT ?? 3000}`
}

export function getUrl() {
  return getBaseUrl() + '/api/trpc'
}

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>

import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server'

/**
 * React tRPC client
 */
export const api = createTRPCReact<AppRouter>()