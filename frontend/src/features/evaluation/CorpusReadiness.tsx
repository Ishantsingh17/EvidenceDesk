import { FlaskConical } from 'lucide-react'

import { useHealth } from '@/app/health-context'
import { DemoDataTag } from '@/components/DemoDataTag'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { AsyncState } from '@/hooks/useAsync'
import { truncateHash } from '@/lib/format'
import type { EvaluationDatasetSummary } from '@/types/api'

/** Why "Run evaluation" is unavailable, in priority order. Always returns a reason in this build. */
function runBlockedReason(
  state: AsyncState<{ items: EvaluationDatasetSummary[] }>,
  ingestionActive: boolean,
): string {
  if (state.status === 'loading') return 'Loading the dataset.'
  if (state.status === 'error' || !state.data.items[0]) return 'The backend does not provide evaluation datasets yet.'
  if (ingestionActive) return 'Wait for document processing to finish.'
  const missing = state.data.items[0].corpus.filter((d) => !d.indexed)
  if (missing.length > 0) return `Index the missing documents first: ${missing.map((d) => d.filename).join(', ')}.`
  return 'Evaluation runs need the backend evaluation engine, which is not built yet. No results are simulated.'
}

export function CorpusReadiness({
  state,
  className,
}: {
  state: AsyncState<{ items: EvaluationDatasetSummary[] }>
  className?: string
}) {
  const { state: health } = useHealth()
  const ingestionActive = health.phase === 'connected' && health.health.activity.ingestion_active
  const dataset = state.status === 'success' ? state.data.items[0] : undefined
  const indexedCount = dataset?.corpus.filter((d) => d.indexed).length ?? 0

  return (
    <Card role="region" aria-labelledby="readiness-heading" className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="readiness-heading" className="text-section font-semibold">
            Corpus readiness
          </h2>
          {dataset && <DemoDataTag />}
        </div>
        <CardDescription>
          {dataset
            ? `${indexedCount} of ${dataset.corpus.length} documents this dataset needs are indexed.`
            : 'Documents the dataset refers to must be indexed before a run.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.status === 'loading' && <Skeleton className="h-40 w-full" />}
        {dataset && (
          <ul className="divide-y" data-testid="corpus-readiness">
            {dataset.corpus.map((doc) => (
              <li key={doc.file_hash} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium" title={doc.filename}>{doc.filename}</span>
                  <code className="text-caption text-muted-foreground" title={doc.file_hash}>
                    {truncateHash(doc.file_hash, 6)}
                  </code>
                </span>
                <StatusBadge status={doc.indexed ? { label: 'Indexed', tone: 'success' } : { label: 'Missing', tone: 'danger' }} />
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 border-t pt-4">
          <Button disabled className="w-full" aria-describedby="run-blocked-reason">
            <FlaskConical aria-hidden="true" />
            Run evaluation
          </Button>
          <p id="run-blocked-reason" className="text-caption text-muted-foreground" data-testid="run-blocked-reason">
            {runBlockedReason(state, ingestionActive)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
