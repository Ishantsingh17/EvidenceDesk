import { createBrowserRouter, Navigate } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'
import { RouteFallback } from '@/components/layout/RouteFallback'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OverviewPage } from '@/pages/OverviewPage'

// Overview is the landing page and loads eagerly. The other four screens are
// lazy-loaded so each one (and heavy libraries such as Recharts) gets its own chunk.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    HydrateFallback: RouteFallback,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <OverviewPage /> },
      {
        path: 'documents',
        lazy: async () => ({ Component: (await import('@/pages/DocumentsPage')).DocumentsPage }),
      },
      {
        path: 'assistant',
        lazy: async () => ({ Component: (await import('@/pages/AssistantPage')).AssistantPage }),
      },
      {
        path: 'evaluations',
        lazy: async () => ({ Component: (await import('@/pages/EvaluationPage')).EvaluationPage }),
      },
      {
        path: 'settings',
        lazy: async () => ({ Component: (await import('@/pages/SettingsPage')).SettingsPage }),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
