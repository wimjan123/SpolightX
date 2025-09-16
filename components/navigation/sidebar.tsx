'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { getInitials, cn } from '@/lib/utils'
import { 
  Home,
  Search,
  Bell,
  Mail,
  Bookmark,
  User,
  Settings,
  Zap,
  TrendingUp,
  Bot,
  Calendar,
  BarChart3,
  Shield,
  LogOut,
  Plus
} from 'lucide-react'

interface NavigationItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
  description?: string
}

const mainNavigation: NavigationItem[] = [
  {
    name: 'Home',
    href: '/',
    icon: Home,
    description: 'Your main feed and dashboard'
  },
  {
    name: 'Explore',
    href: '/explore',
    icon: Search,
    description: 'Discover trending topics and content'
  },
  {
    name: 'Notifications',
    href: '/notifications',
    icon: Bell,
    badge: 3, // This would come from real data
    description: 'View your latest notifications'
  },
  {
    name: 'Messages',
    href: '/messages',
    icon: Mail,
    badge: 2, // This would come from real data
    description: 'Chat with personas and users'
  },
  {
    name: 'Bookmarks',
    href: '/bookmarks',
    icon: Bookmark,
    description: 'Your saved posts and content'
  }
]

const aiFeatures: NavigationItem[] = [
  {
    name: 'Persona Lab',
    href: '/persona-lab',
    icon: Bot,
    description: 'Create and manage AI personas'
  },
  {
    name: 'Content Generator',
    href: '/compose',
    icon: Zap,
    description: 'AI-powered content creation'
  },
  {
    name: 'Trending Analysis',
    href: '/trends',
    icon: TrendingUp,
    description: 'Real-time trend insights'
  },
  {
    name: 'Content Calendar',
    href: '/calendar',
    icon: Calendar,
    description: 'Schedule and plan content'
  },
  {
    name: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    description: 'Performance metrics and insights'
  }
]

const userNavigation: NavigationItem[] = [
  {
    name: 'Profile',
    href: '/profile',
    icon: User,
    description: 'Your profile and posts'
  },
  {
    name: 'Safety Center',
    href: '/safety',
    icon: Shield,
    description: 'Content moderation and safety'
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'Account and app preferences'
  }
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <div className="flex h-full flex-col bg-card border-r border-border">
      {/* Logo and Brand */}
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground text-sm font-bold">
            SX
          </div>
          <span className="text-lg font-bold">SpotlightX</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {/* Main Navigation */}
        <div>
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Navigation
          </h3>
          <ul className="space-y-1">
            {mainNavigation.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                isActive={pathname === item.href}
              />
            ))}
          </ul>
        </div>

        {/* AI Features */}
        <div>
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            AI Features
          </h3>
          <ul className="space-y-1">
            {aiFeatures.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                isActive={pathname === item.href || pathname.startsWith(item.href)}
              />
            ))}
          </ul>
        </div>

        {/* User Navigation */}
        <div>
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Account
          </h3>
          <ul className="space-y-1">
            {userNavigation.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                isActive={pathname === item.href || pathname.startsWith(item.href)}
              />
            ))}
          </ul>
        </div>
      </nav>

      {/* Quick Create Button */}
      <div className="px-4 py-2">
        <Button className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Create Post
        </Button>
      </div>

      {/* User Profile */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user?.avatarUrl} alt={user?.displayName} />
            <AvatarFallback>
              {user?.displayName ? getInitials(user.displayName) : 'U'}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user?.displayName || 'User'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              @{user?.username || 'username'}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            className="h-8 w-8 p-0"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Sign out</span>
          </Button>
        </div>

        {/* User Stats */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="font-medium">42</div>
            <div className="text-muted-foreground">Posts</div>
          </div>
          <div className="text-center">
            <div className="font-medium">5</div>
            <div className="text-muted-foreground">Personas</div>
          </div>
          <div className="text-center">
            <div className="font-medium">1.2K</div>
            <div className="text-muted-foreground">Likes</div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface NavItemProps {
  item: NavigationItem
  isActive: boolean
}

function NavItem({ item, isActive }: NavItemProps) {
  const Icon = item.icon

  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          'nav-link group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all',
          isActive 
            ? 'bg-accent text-accent-foreground' 
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        )}
        title={item.description}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="truncate">{item.name}</span>
        
        {item.badge && item.badge > 0 && (
          <Badge variant="secondary" className="ml-auto h-5 w-auto min-w-[1.25rem] px-1 text-xs">
            {item.badge > 99 ? '99+' : item.badge}
          </Badge>
        )}

        {/* Active indicator */}
        {isActive && (
          <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-primary" />
        )}
      </Link>
    </li>
  )
}