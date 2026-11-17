import { LayoutGroup, motion } from 'motion/react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink, useMatch } from 'react-router'

import { navItems } from '@/app/navigation'
import { BrandMark } from '@/components/BrandMark'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { env } from '@/lib/env'
import { springSnappy } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface SidebarNavigationProps {
  /** Icon-only rail. Not used inside the mobile drawer. */
  collapsed?: boolean
  onToggleCollapsed?: () => void
  /** Called after a link is chosen (closes the mobile drawer). */
  onNavigate?: () => void
  /** Scopes the animated active indicator so two instances never share it. */
  layoutId: string
}

export function SidebarNavigation({
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
  layoutId,
}: SidebarNavigationProps) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn('flex h-14 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
        <BrandMark />
        {!collapsed && (
          <span className="truncate text-[0.9375rem] font-semibold tracking-tight text-white">
            EvidenceDesk <span className="font-normal text-sidebar-muted">AI</span>
          </span>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 px-3 pt-4">
        <LayoutGroup id={layoutId}>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavItemLink
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </LayoutGroup>
      </nav>

      <div className={cn('space-y-3 border-t border-sidebar-border p-3', collapsed && 'px-2')}>
        {!collapsed && (
          <div className="px-2 text-caption text-sidebar-muted">
            <p className="font-medium text-sidebar-foreground">Local proof of concept</p>
            <p>{env.apiMode === 'mock' ? 'Mock data mode' : 'Live API mode'}</p>
          </div>
        )}
        {onToggleCollapsed && (
          <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapsed} />
        )}
      </div>
    </div>
  )
}

function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: (typeof navItems)[number]
  collapsed: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  // Computed here (not via NavLink's function props) because the tooltip trigger
  // merges className as a string and would drop a className function.
  const isActive = useMatch({ path: item.path, end: false }) !== null
  const link = (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        'relative flex h-9 items-center gap-3 rounded-md px-3 text-body font-medium outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        collapsed && 'justify-center px-0',
        isActive
          ? 'text-sidebar-accent-foreground'
          : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
      )}
    >
      {isActive && (
        <motion.span
          layoutId="nav-active"
          transition={springSnappy}
          className="absolute inset-0 rounded-md bg-sidebar-accent"
        >
          <span className="absolute inset-y-2 left-0 w-0.75 rounded-full bg-sidebar-primary" />
        </motion.span>
      )}
      <Icon aria-hidden="true" className="relative size-4 shrink-0" />
      {!collapsed && <span className="relative truncate">{item.label}</span>}
    </NavLink>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  const button = (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={!collapsed}
      className={cn(
        'flex h-9 w-full items-center gap-3 rounded-md px-3 text-body text-sidebar-muted outline-none transition-colors',
        'hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {!collapsed && <span>Collapse</span>}
    </button>
  )
  if (!collapsed) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
