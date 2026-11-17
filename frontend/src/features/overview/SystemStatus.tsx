import { Bot, FileCog, RotateCw, Server, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useHealth, type HealthState } from '@/app/health-context'
import { DemoDataTag } from '@/components/DemoDataTag'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AsyncState } from '@/hooks/useAsync'
import { formatTime } from '@/lib/format'
import { healthStatus, type StatusPresentation } from '@/lib/status'
import { ApiError } from '@/services/api/client'
import type { SettingsStatus } from '@/types/api'

import { SectionCard } from './SectionCard'

interface StatusRowData {
  status: StatusPresentation | null // null = still checking
  detail: ReactNode
}

function backendRow(state: HealthState): StatusRowData {
  if (state.phase === 'checking') return { status: null, detail: 'Checking GET /health' }
  if (state.phase === 'error') {
    return { status: { label: 'Unreachable', tone: 'danger' }, detail: state.message }
  }
  return {
    status: healthStatus(state.health.status),
    detail: `Live health check passed at ${formatTime(state.checkedAt)}.`,
  }
}

function processingRow(state: HealthState): StatusRowData {
  if (state.phase === 'checking') return { status: null, detail: 'Waiting for backend status' }
  if (state.phase === 'error') {
    return {
      status: { label: 'Unknown', tone: 'neutral' },
      detail: 'Processing status needs a reachable backend.',
    }
  }
  const { ingestion_active, evaluation_active } = state.health.activity
  if (evaluation_active) {
    return {
      status: { label: 'Paused', tone: 'warning' },
      detail: 'Uploads wait while an evaluation run is in progress.',
    }
  }
  if (ingestion_active) {
    return { status: { label: 'Processing', tone: 'info' }, detail: 'A document is being processed.' }
  }
  return {
    status: { label: 'Idle', tone: 'neutral' },
    detail: 'No processing jobs running.',
  }
}

function aiRow(state: AsyncState<SettingsStatus>): StatusRowData {
  if (state.status === 'loading') return { status: null, detail: 'Loading AI settings' }
  if (state.status === 'error') {
    const notAvailable = state.error instanceof ApiError && state.error.isNotAvailable
    return {
      status: { label: notAvailable ? 'Not reported' : 'Unavailable', tone: 'neutral' },
      detail: notAvailable
        ? 'The backend does not report AI settings yet.'
        : "Couldn't load AI settings.",
    }
  }
  const s = state.data
  return {
    status: { label: 'Model configured', tone: 'info' },
    detail: (
      <>
        {s.llm_provider}, <span className="font-medium text-foreground">{s.llm_model}</span>.{' '}
        {s.evidence_threshold_calibrated
          ? 'Evidence threshold calibrated.'
          : 'Evidence threshold not calibrated yet.'}{' '}
        <DemoDataTag />
      </>
    ),
  }
}

export function SystemStatus({
  settings,
  className,
}: {
  settings: AsyncState<SettingsStatus>
  className?: string
}) {
  const { state, refreshing, refresh } = useHealth()
  return (
    <SectionCard
      id="system-status"
      title="System status"
      description="Live backend checks, refreshed every 30 seconds."
      className={className}
      action={
        <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
          <RotateCw aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
          Check now
        </Button>
      }
    >
      <ul className="divide-y" data-testid="system-status">
        <StatusRow icon={Server} title="Backend API" testId="status-backend" {...backendRow(state)} />
        <StatusRow
          icon={FileCog}
          title="Document processing"
          testId="status-processing"
          {...processingRow(state)}
        />
        <StatusRow icon={Bot} title="AI service" testId="status-ai" {...aiRow(settings)} />
      </ul>
    </SectionCard>
  )
}

function StatusRow({
  icon: Icon,
  title,
  status,
  detail,
  testId,
}: StatusRowData & { icon: LucideIcon; title: string; testId: string }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0" data-testid={testId}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{title}</p>
          {status ? <StatusBadge status={status} /> : <Skeleton className="h-6 w-20" />}
        </div>
        <p className="text-caption text-muted-foreground">{detail}</p>
      </div>
    </li>
  )
}
