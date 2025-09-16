'use client'

import { useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { getInitials } from '@/lib/utils'
import { 
  Menu,
  Search,
  Bell,
  Mail,
  Settings,
  User,
  Moon,
  Sun,
  LogOut,
  Shield,
  HelpCircle,
  Zap
} from 'lucide-react'

interface HeaderProps {
  onMenuClick?: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Mobile menu button and search */}
        <div className="flex items-center gap-3 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="h-9 w-9"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open sidebar</span>
          </Button>
          
          <div className="flex-1 max-w-sm">
            <SearchInput value={searchQuery} onChange={setSearchQuery} />
          </div>
        </div>

        {/* Desktop search */}
        <div className="hidden lg:block lg:max-w-md lg:flex-1">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {/* Quick Actions */}
          <Button variant="ghost" size="icon" className="hidden sm:flex">
            <Zap className="h-5 w-5" />
            <span className="sr-only">AI Composer</span>
          </Button>

          {/* Notifications */}
          <NotificationDropdown />

          {/* Messages */}
          <Button variant="ghost" size="icon" className="relative">
            <Mail className="h-5 w-5" />
            <Badge className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs">
              2
            </Badge>
            <span className="sr-only">Messages (2 unread)</span>
          </Button>

          {/* User menu */}
          <UserDropdown user={user} onLogout={logout} theme={theme} setTheme={setTheme} />
        </div>
      </div>
    </header>
  )
}

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
}

function SearchInput({ value, onChange }: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search posts, personas, trends..."
        className="pl-10 pr-4"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function NotificationDropdown() {
  const [notifications] = useState([
    {
      id: '1',
      type: 'like',
      message: 'TechGuru liked your post about AI trends',
      time: '2m ago',
      unread: true,
    },
    {
      id: '2',
      type: 'mention',
      message: 'You were mentioned in a conversation',
      time: '1h ago',
      unread: true,
    },
    {
      id: '3',
      type: 'follow',
      message: 'CreativeBot started following you',
      time: '3h ago',
      unread: false,
    },
  ])

  const unreadCount = notifications.filter(n => n.unread).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">
            Notifications {unreadCount > 0 && `(${unreadCount} unread)`}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem key={notification.id} className="p-3">
                <div className="flex w-full items-start gap-3">
                  <div className={`h-2 w-2 rounded-full ${
                    notification.unread ? 'bg-blue-500' : 'bg-transparent'
                  }`} />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm">{notification.message}</p>
                    <p className="text-xs text-muted-foreground">{notification.time}</p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-center">
          <Button variant="ghost" size="sm" className="w-full">
            View all notifications
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface UserDropdownProps {
  user: any
  onLogout: () => void
  theme?: string
  setTheme: (theme: string) => void
}

function UserDropdown({ user, onLogout, theme, setTheme }: UserDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user?.avatarUrl} alt={user?.displayName} />
            <AvatarFallback>
              {user?.displayName ? getInitials(user.displayName) : 'U'}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user?.displayName || 'User'}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              @{user?.username || 'username'}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Shield className="mr-2 h-4 w-4" />
            <span>Safety Center</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? (
            <Sun className="mr-2 h-4 w-4" />
          ) : (
            <Moon className="mr-2 h-4 w-4" />
          )}
          <span>Toggle theme</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>Help</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}