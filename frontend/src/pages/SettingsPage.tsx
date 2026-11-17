import { Lock, RotateCw, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

import { useHealth } from '@/app/health-context'
import { navItemFor } from '@/app/navigation'
import { DemoDataTag } from '@/components/DemoDataTag'
import { ErrorState } from '@/components/feedback/ErrorState'
import { InlineNotice } from '@/components/feedback/InlineNotice'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/useAsync'
import { env } from '@/lib/env'
import { formatTime } from '@/lib/format'
import { healthStatus, type StatusPresentation } from '@/lib/status'
import { workspaceApi } from '@/services/workspace'
import type { SettingsStatus, VectorStoreStatus } from '@/types/api'

/** Frontend build version (matches the backend APP_VERSION for this POC). */
const APP_VERSION = '0.1.0'
const loadSettings = (signal: AbortSignal) => workspaceApi.getSettingsStatus(signal)

const vectorStore: Record<VectorStoreStatus, StatusPresentation> = {
  available: { label: 'Available', tone: 'success' },
  unavailable: { label: 'Unavailable', tone: 'danger' },
  model_mismatch: { label: 'Model mismatch', tone: 'warning' },
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[14rem_1fr] sm:gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Section({
  id,
  title,
  description,
  action,
  demo,
  children,
}: {
  id: string
  title: string
  description: string
  action?: ReactNode
  demo?: boolean
  children: ReactNode
}) {
  return (
    <Card role="region" aria-labelledby={`${id}-heading`}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${id}-heading`} className="text-section font-semibold">{title}</h2>
          {demo && <DemoDataTag />}
        </div>
        <CardDescription>{description}</CardDescription>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const nav = navItemFor('/settings')!
  const { state: health, refreshing, refresh } = useHealth()
  const settings = useAsync(loadSettings)

  return (
    <PageContainer>
      <PageHeader title={nav.label} description={nav.description} />

      <InlineNotice tone="info" title="Read-only">
        These values come from the backend configuration (<code className="rounded-sm bg-card px-1">backend/.env</code>) and
        this frontend build. Change them there and restart; they cannot be edited here. Secrets such as the Groq API key
        are never shown.
      </InlineNotice>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section id="application" title="Application" description="This frontend build and how it connects.">
          <Rows
            rows={[
              ['Version', `${APP_VERSION} (local proof of concept)`],
              ['API mode', env.apiMode === 'mock' ? 'Mock data (VITE_API_MODE=mock)' : 'Live backend (VITE_API_MODE=live)'],
              ['API base URL', <code key="url" className="text-caption">{env.apiBaseUrl}</code>],
            ]}
          />
        </Section>

        <Section
          id="health"
          title="Backend health"
          description="Live check of GET /health, refreshed every 30 seconds."
          action={
            <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
              <RotateCw aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
              Check now
            </Button>
          }
        >
          {health.phase === 'checking' ? (
            <Skeleton className="h-24 w-full" />
          ) : health.phase === 'error' ? (
            <Rows
              rows={[
                ['Status', <StatusBadge key="s" status={{ label: 'Unreachable', tone: 'danger' }} />],
                ['Details', health.message],
                ['Last checked', formatTime(health.checkedAt)],
              ]}
            />
          ) : (
            <Rows
              rows={[
                ['Status', <StatusBadge key="s" status={healthStatus(health.health.status)} />],
                ['Document processing', health.health.activity.ingestion_active ? 'A job is running' : 'No jobs running'],
                ['Evaluation', health.health.activity.evaluation_active ? 'A run is in progress' : 'No run in progress'],
                ['Last checked', formatTime(health.checkedAt)],
              ]}
            />
          )}
        </Section>
      </div>

      <Section
        id="models"
        title="Models and retrieval"
        description="Reported by GET /settings/status."
        demo={settings.state.status === 'success'}
      >
        {settings.state.status === 'loading' && <Skeleton className="h-64 w-full" />}
        {settings.state.status === 'error' && (
          <ErrorState error={settings.state.error} subject="model and retrieval settings" onRetry={settings.reload} />
        )}
        {settings.state.status === 'success' && <ModelSettings s={settings.state.data} />}
      </Section>

      <Section id="privacy" title="Privacy" description="How this proof of concept handles documents.">
        <ul className="space-y-2">
          <li className="flex items-start gap-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-evidence" />
            Use synthetic or public, non-confidential documents only.
          </li>
          <li className="flex items-start gap-2">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-evidence" />
            Uploaded files, the search index and the database are stored locally on this machine. Question text and
            retrieved passages are sent to Groq to generate answers.
          </li>
        </ul>
      </Section>
    </PageContainer>
  )
}

function ModelSettings({ s }: { s: SettingsStatus }) {
  return (
    <div className="space-y-4">
      {s.vector_store_status === 'model_mismatch' && (
        <InlineNotice tone="warning" title="Embedding model mismatch">
          The search index was built with a different embedding model. Uploads, questions and evaluations are blocked
          until it is reset: stop the backend, delete <code>data/chroma/</code>, restart and reprocess the documents
          (or configure a new collection name).
        </InlineNotice>
      )}
      <Rows
        rows={[
          ['Backend environment', s.environment],
          ['Vector store', <StatusBadge key="vs" status={vectorStore[s.vector_store_status]} />],
          ['Embedding model', s.embedding_model],
          ['Embedding dimension', s.embedding_dimension?.toString() ?? 'Unknown'],
          ['Embedding model loaded', s.embedding_model_loaded ? 'Yes' : 'No, still loading'],
          ['Language model', `${s.llm_provider}, ${s.llm_model}`],
          ['Upload limit', `${s.upload_limit_mb} MB per file`],
          ['Retrieval top-k', `${s.retrieval_top_k_default} by default, up to ${s.retrieval_top_k_max}`],
          [
            'Evidence threshold',
            s.evidence_threshold_calibrated && s.retrieval_max_distance !== null
              ? `Cosine distance up to ${s.retrieval_max_distance}`
              : 'Not yet calibrated',
          ],
        ]}
      />
    </div>
  )
}
