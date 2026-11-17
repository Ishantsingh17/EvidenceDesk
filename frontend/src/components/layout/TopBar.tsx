import { Menu } from 'lucide-react'
import { useLocation } from 'react-router'

import { navItemFor } from '@/app/navigation'
import { Button } from '@/components/ui/button'

import { BackendIndicator } from './BackendIndicator'
import { WorkspaceMenu } from './WorkspaceMenu'

export function TopBar({ onOpenNavigation }: { onOpenNavigation?: () => void }) {
  const { pathname } = useLocation()
  const current = navItemFor(pathname)?.label ?? 'Page not found'

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6 lg:px-8">
      {onOpenNavigation && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
          className="-ml-1"
        >
          <Menu aria-hidden="true" />
        </Button>
      )}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-2 text-body">
          <li className="hidden text-muted-foreground sm:block">Workspace</li>
          <li aria-hidden="true" className="hidden text-border sm:block">
            /
          </li>
          <li aria-current="page" className="truncate font-medium">
            {current}
          </li>
        </ol>
      </nav>
      <div className="flex items-center gap-2">
        <BackendIndicator />
        <WorkspaceMenu />
      </div>
    </header>
  )
}
