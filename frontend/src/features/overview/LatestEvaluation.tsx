import { FlaskConical } from 'lucide-react'
import { Link } from 'react-router'

import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AsyncState } from '@/hooks/useAsync'
import { formatDateTime } from '@/lib/format'
import { evaluationRunStatus } from '@/lib/status'
import type { DashboardSummary } from '@/types/api'

import { SectionCard } from './SectionCard'

/** Latest evaluation run from GET /dashboard/summary. Shows "Not run yet" until a real run exists. */
export function LatestEvaluation({ state, className }: { state: AsyncState<DashboardSummary>; className?: string }) {
  const run = state.status === 'success' ? state.data.latest_evaluation : null
  return (
    <SectionCard
      id="latest-evaluation"
      title="Latest evaluation"
      description="Quality checks against the labelled test dataset."
      className={className}
    >
      {state.status === 'loading' && <Skeleton className="h-24 w-full" />}
      {state.status === 'error' && <p className="text-muted-foreground">Not available yet.</p>}
      {state.status === 'success' && (
        <div className="space-y-4" data-testid="latest-evaluation">
          {run ? (
            <div className="space-y-2">
              <StatusBadge status={evaluationRunStatus(run.status)} />
              <p>
                {run.case_count} cases, run {formatDateTime(run.created_at)}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <FlaskConical aria-hidden="true" className="size-4" />
              </span>
              <div className="space-y-0.5">
                <p className="font-medium">Not run yet</p>
                <p className="text-caption text-muted-foreground">
                  No evaluation has been run, so there are no quality metrics to show.
                </p>
              </div>
            </div>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/evaluations">Open evaluation</Link>
          </Button>
        </div>
      )}
    </SectionCard>
  )
}
