import { ClipboardList, History } from 'lucide-react'
import { useCallback, useState } from 'react'

import { navItemFor } from '@/app/navigation'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CaseDetailSheet } from '@/features/evaluation/CaseDetailSheet'
import { CorpusReadiness } from '@/features/evaluation/CorpusReadiness'
import { DatasetPanel } from '@/features/evaluation/DatasetPanel'
import { MetricGroups } from '@/features/evaluation/MetricGroups'
import { RunProgress } from '@/features/evaluation/RunProgress'
import { CaseTable, RunSummary } from '@/features/evaluation/RunResults'
import { useAsync } from '@/hooks/useAsync'
import { formatDateTime, formatDuration } from '@/lib/format'
import { evaluationRunStatus } from '@/lib/status'
import { ApiError } from '@/services/api/client'
import { workspaceApi } from '@/services/workspace'

const loadDatasets = (signal: AbortSignal) => workspaceApi.listEvaluationDatasets(signal)
const loadRuns = (signal: AbortSignal) => workspaceApi.listEvaluationRuns(signal)
const eventsUrlFor = (runId: string) => `/api/v1/evaluations/runs/${encodeURIComponent(runId)}/events`

export function EvaluationPage() {
  const nav = navItemFor('/evaluations')!
  const datasets = useAsync(loadDatasets)
  const runs = useAsync(loadRuns)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [startedUrl, setStartedUrl] = useState<string | null>(null)
  const [openResult, setOpenResult] = useState<string | null>(null)

  const runItems = runs.state.status === 'success' ? runs.state.data.items : []
  // The selected run, or the latest one. An unfinished run is followed through its event stream.
  const runId = selectedId ?? runItems[0]?.run_id ?? null
  const listed = runItems.find((r) => r.run_id === runId)
  const unfinished = listed && (listed.status === 'queued' || listed.status === 'running')
  const eventsUrl = startedUrl ?? (unfinished && runId ? eventsUrlFor(runId) : null)

  const loadRun = useCallback(
    (signal: AbortSignal) => (runId ? workspaceApi.getEvaluationRun(runId, signal) : Promise.resolve(null)),
    [runId],
  )
  const run = useAsync(loadRun)

  const startRun = async (datasetId: string): Promise<string | null> => {
    try {
      const accepted = await workspaceApi.startEvaluationRun(datasetId)
      setSelectedId(accepted.run_id)
      setStartedUrl(accepted.events_url)
      return null
    } catch (error) {
      return error instanceof ApiError ? error.message : 'The evaluation could not be started.'
    }
  }

  const finished = () => {
    setStartedUrl(null)
    runs.reload()
    run.reload()
    datasets.reload()
  }

  const detail = run.state.status === 'success' ? run.state.data : null

  return (
    <PageContainer>
      <PageHeader
        title={nav.label}
        description="Results depend on the selected dataset and on how each metric is scored. Every value is shown with its method and sample count."
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <DatasetPanel state={datasets.state} onRetry={datasets.reload} className="lg:col-span-2" />
        <CorpusReadiness state={datasets.state} running={eventsUrl !== null} onRun={startRun} />
      </div>

      {eventsUrl && <RunProgress key={eventsUrl} eventsUrl={eventsUrl} onFinished={finished} />}

      {detail && !eventsUrl && <RunSummary run={detail} />}

      <MetricGroups summary={!eventsUrl && detail?.summary ? detail.summary : null} />

      {detail && !eventsUrl && detail.results.length > 0 && <CaseTable run={detail} onOpen={setOpenResult} />}
      {run.state.status === 'error' && (
        <ErrorState error={run.state.error} subject="this evaluation run" onRetry={run.reload} />
      )}

      <Card role="region" aria-labelledby="runs-heading">
        <CardHeader>
          <h2 id="runs-heading" className="text-section font-semibold">
            Run history
          </h2>
          <CardDescription>Select a run to see its metrics and case results.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.state.status === 'loading' && <Skeleton className="h-24 w-full" />}
          {runs.state.status === 'error' && <ErrorState error={runs.state.error} subject="evaluation runs" onRetry={runs.reload} />}
          {runs.state.status === 'success' && runItems.length === 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <EmptyState icon={History} title="Not run yet" description="No evaluation has been run, so there are no results to show." />
              <EmptyState
                icon={ClipboardList}
                title="Case results and reviews"
                description="After a run, each case shows expected and retrieved sources, its outcome and a review form for correctness, faithfulness and citation validity."
              />
            </div>
          )}
          {runItems.length > 0 && (
            <ul className="divide-y" data-testid="run-history">
              {runItems.map((r) => (
                <li key={r.run_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.run_id)}
                    aria-current={r.run_id === runId ? 'true' : undefined}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md px-2 py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{formatDateTime(r.created_at)}</span>
                      <span className="block text-caption text-muted-foreground">
                        {r.dataset.name} {r.dataset.version}, {r.completed_case_count} of {r.case_count} cases
                        {r.failed_case_count > 0 && `, ${r.failed_case_count} failed`}
                        {r.duration_ms !== null && `, ${formatDuration(r.duration_ms)}`}
                      </span>
                    </span>
                    <StatusBadge status={evaluationRunStatus(r.status)} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {runId && (
        <CaseDetailSheet runId={runId} resultId={openResult} onClose={() => setOpenResult(null)} onReviewed={run.reload} />
      )}
    </PageContainer>
  )
}
