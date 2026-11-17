import { useState } from 'react'

import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiLedger } from '@/features/overview/KpiLedger'
import { QuickActions } from '@/features/overview/QuickActions'
import { RecentActivity } from '@/features/overview/RecentActivity'
import { RecentDocuments } from '@/features/overview/RecentDocuments'
import { SystemStatus } from '@/features/overview/SystemStatus'
import { useAsync } from '@/hooks/useAsync'
import { greetingFor } from '@/lib/format'
import { workspaceApi } from '@/services/workspace'

const RECENT_PAGE_SIZE = 5

// Stable loaders (module level) so useAsync runs each once per mount/reload.
const loadSummary = (signal: AbortSignal) => workspaceApi.getDashboardSummary(signal)
const loadDocuments = (signal: AbortSignal) => workspaceApi.listDocuments(RECENT_PAGE_SIZE, signal)
const loadQueries = (signal: AbortSignal) => workspaceApi.listQueries(RECENT_PAGE_SIZE, signal)
const loadSettings = (signal: AbortSignal) => workspaceApi.getSettingsStatus(signal)

export function OverviewPage() {
  // Lazy initial state: the greeting is computed once, when the page mounts.
  const [greeting] = useState(() => greetingFor(new Date()))
  const summary = useAsync(loadSummary)
  const documents = useAsync(loadDocuments)
  const queries = useAsync(loadQueries)
  const settings = useAsync(loadSettings)

  return (
    <PageContainer>
      <PageHeader
        title={greeting}
        description="See which documents are ready to answer from, what has been asked recently, and whether the system is available."
      />

      <KpiLedger state={summary.state} onRetry={summary.reload} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RecentDocuments
          state={documents.state}
          onRetry={documents.reload}
          className="lg:col-span-2"
        />
        <SystemStatus settings={settings.state} />
        <RecentActivity
          documents={documents.state}
          queries={queries.state}
          onRetry={() => {
            documents.reload()
            queries.reload()
          }}
          className="lg:col-span-2"
        />
        <QuickActions />
      </div>
    </PageContainer>
  )
}
