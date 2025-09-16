import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { TRPCProvider } from '@/components/providers/trpc-provider'
import { AuthProvider } from '@/components/providers/auth-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { ToastProvider } from '@/components/providers/toast-provider'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'SpotlightX',
    template: '%s | SpotlightX',
  },
  description: 'AI-powered social media simulation platform with realistic persona interactions and real-time content generation.',
  keywords: [
    'AI social media',
    'persona simulation',
    'content generation',
    'social platform',
    'artificial intelligence',
    'machine learning',
  ],
  authors: [{ name: 'SpotlightX Team' }],
  creator: 'SpotlightX',
  publisher: 'SpotlightX',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://spotlightx.ai',
    title: 'SpotlightX - AI Social Media Simulation',
    description: 'Experience the future of social media with AI-powered personas and real-time content generation.',
    siteName: 'SpotlightX',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SpotlightX - AI Social Media Simulation',
    description: 'Experience the future of social media with AI-powered personas and real-time content generation.',
    creator: '@spotlightx',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <TRPCProvider>
              <div className="relative flex min-h-screen flex-col">
                {/* Skip to main content for accessibility */}
                <a
                  href="#main-content"
                  className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  Skip to main content
                </a>

                {/* Main application content */}
                <main id="main-content" className="flex-1">
                  {children}
                </main>

                {/* Global toast notifications */}
                <ToastProvider />
              </div>
            </TRPCProvider>
          </AuthProvider>
        </ThemeProvider>

        {/* Development tools */}
        {process.env.NODE_ENV === 'development' && (
          <div className="fixed bottom-4 right-4 z-50">
            <details className="group">
              <summary className="cursor-pointer rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
                Dev Tools
              </summary>
              <div className="absolute bottom-full right-0 mb-2 min-w-[200px] rounded-md border bg-white p-4 shadow-lg dark:bg-gray-900">
                <div className="space-y-2 text-xs">
                  <div>Environment: {process.env.NODE_ENV}</div>
                  <div>Version: {process.env.APP_VERSION || '1.0.0'}</div>
                  <div>Build: {process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local'}</div>
                  <hr className="my-2" />
                  <a
                    href="/api/health"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline"
                  >
                    Health Check
                  </a>
                  <a
                    href="/api/health?detailed=true"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline"
                  >
                    Detailed Health
                  </a>
                </div>
              </div>
            </details>
          </div>
        )}
      </body>
    </html>
  )
}