import { BookOpen, Building2, ChevronDown, Settings } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { env } from '@/lib/env'

const apiDocsUrl = `${new URL(env.apiBaseUrl).origin}/docs`

/**
 * Workspace identity. The POC has no authentication (UI brief §4.1), so this is
 * a local workspace menu, not a user profile.
 */
export function WorkspaceMenu() {
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 gap-2 px-2" aria-label="Workspace menu">
          <span className="flex size-6 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Building2 aria-hidden="true" className="size-3.5" />
          </span>
          <span className="hidden text-body font-medium md:inline">Local workspace</span>
          <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5 py-2">
          <p className="text-body font-medium text-foreground">Local workspace</p>
          <p className="text-caption font-normal text-muted-foreground">
            Single user. No sign-in in this proof of concept.
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={apiDocsUrl} target="_blank" rel="noreferrer">
            <BookOpen aria-hidden="true" />
            API reference
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-caption text-muted-foreground">
          API mode: {env.apiMode === 'mock' ? 'mock data' : 'live backend'}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
