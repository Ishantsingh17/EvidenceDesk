import { createBrowserRouter, Navigate } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { PlannedPage } from '@/pages/PlannedPage'

import { navItems } from './navigation'

// Screens not built yet get an honest placeholder page so navigation never dead-ends.
const plannedRoutes = navItems
  .filter((item) => item.path !== '/dashboard')
  .map((item) => ({ path: item.path.slice(1), element: <PlannedPage item={item} /> }))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <OverviewPage /> },
      ...plannedRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
