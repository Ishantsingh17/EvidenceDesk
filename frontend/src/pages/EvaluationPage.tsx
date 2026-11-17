import { ClipboardList, History } from 'lucide-react'

import { navItemFor } from '@/app/navigation'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CorpusReadiness } from '@/features/evaluation/CorpusReadiness'
import { DatasetPanel } from '@/features/evaluation/DatasetPanel'
import { MetricGroups } from '@/features/evaluation/MetricGroups'
import { useAsync } from '@/hooks/useAsync'
import { workspaceApi } from '@/services/workspace'

const loadDatasets = (signal: AbortSignal) => workspaceApi.listEvaluationDatasets(signal)
const loadRuns = (signal: AbortSignal) => workspaceApi.listEvaluationRuns(signal)

export function EvaluationPage() {
  const nav = navItemFor('/evaluations')!
  const datasets = useAsync(loadDatasets)
  const runs = useAsync(loadRuns)

  return (
    <PageContainer>
      <PageHeader
        title={nav.label}
        description="Results depend on the selected dataset and on how each metric is scored. Every value is shown with its method and sample count."
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <DatasetPanel state={datasets.state} onRetry={datasets.reload} className="lg:col-span-2" />
        <CorpusReadiness state={datasets.state} />
      </div>

      <MetricGroups />

      <Card role="region" aria-labelledby="runs-heading">
        <CardHeader>
          <h2 id="runs-heading" className="text-section font-semibold">
            Runs and case results
          </h2>
          <CardDescription>Each run's status, failure counts and per-case results, with human review.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.state.status === 'loading' && <Skeleton className="h-24 w-full" />}
          {runs.state.status === 'error' && <ErrorState error={runs.state.error} subject="evaluation runs" onRetry={runs.reload} />}
          {runs.state.status === 'success' && runs.state.data.items.length === 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <EmptyState
                icon={History}
                title="Not run yet"
                description="No evaluation has been run, so there are no results to show."
              />
              <EmptyState
                icon={ClipboardList}
                title="Case results and reviews"
                description="After a run, each case shows expected and retrieved sources, its outcome and a review form for correctness, faithfulness and citation validity."
              />
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}
