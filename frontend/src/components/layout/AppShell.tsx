import { motion } from 'motion/react'
import { useState } from 'react'
import { useLocation, useOutlet } from 'react-router'

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { duration, ease, pageVariants } from '@/lib/motion'

import { MockModeBanner } from './MockModeBanner'
import { SidebarNavigation } from './SidebarNavigation'
import { TopBar } from './TopBar'

const SIDEBAR_WIDTH = 240
const SIDEBAR_RAIL_WIDTH = 64

/**
 * Responsive shell (UI brief §9): full sidebar >= 1280px, icon rail 1024–1279px
 * (both can be toggled), drawer below 1024px.
 */
export function AppShell() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isWide = useMediaQuery('(min-width: 1280px)')
  // null = follow the breakpoint default; a boolean = the user's explicit choice.
  const [collapsedChoice, setCollapsedChoice] = useState<boolean | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const collapsed = collapsedChoice ?? !isWide

  const { pathname } = useLocation()
  const outlet = useOutlet()

  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 font-medium shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {isDesktop && (
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH }}
          transition={{ duration: duration.base, ease: ease.out }}
          className="shrink-0 self-stretch overflow-hidden border-r border-sidebar-border bg-sidebar"
        >
          {/* The column fills the page height; its contents stay pinned while scrolling. */}
          <div className="sticky top-0 h-svh">
            <SidebarNavigation
              layoutId="sidebar"
              collapsed={collapsed}
              onToggleCollapsed={() => setCollapsedChoice(!collapsed)}
            />
          </div>
        </motion.aside>
      )}

      {!isDesktop && (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent
            side="left"
            className="w-72 max-w-[85vw] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>[data-slot=sheet-close]]:text-sidebar-muted [&>[data-slot=sheet-close]]:hover:bg-sidebar-accent [&>[data-slot=sheet-close]]:hover:text-white"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Main application navigation</SheetDescription>
            <SidebarNavigation layoutId="drawer" onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenNavigation={isDesktop ? undefined : () => setDrawerOpen(true)} />
        <MockModeBanner />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <motion.div key={pathname} variants={pageVariants} initial="initial" animate="animate">
            {outlet}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
