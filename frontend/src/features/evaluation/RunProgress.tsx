import { StageTimeline } from '@/components/StageTimeline'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useEventTimeline } from '@/hooks/useEventTimeline'
import type { TimelineStage } from '@/lib/timeline'
import { workspaceApi } from '@/services/workspace'

const evaluationStages = [
  { key: 'preflight', label: 'Preflight checks' },
  { key: 'case_execution', label: 'Running cases' },
  { key: 'metric_aggregation', label: 'Calculating metrics' },
]

function num(stage: TimelineStage | undefined, key: string): number | null {
  const v = stage?.details?.[key]
  return typeof v === 'number' ? v : null
}

/** Live evaluation progress from persisted SSE events (schema §5.7 run events). */
export function RunProgress({ eventsUrl, onFinished }: { eventsUrl: string; onFinished: () => void }) {
  const { timeline, streamError } = useEventTimeline(workspaceApi.subscribeRunEvents, evaluationStages, eventsUrl, onFinished)
  const cases = timeline.stages.find((s) => s.key === 'case_execution')
  const done = num(cases, 'completed_items')
  const total = num(cases, 'total_items')
  const attempt = num(cases, 'llm_attempt')
  const caseKey = cases?.details?.case_key

  return (
    <Card role="region" aria-labelledby="run-progress-heading" data-testid="run-progress">
      <CardHeader>
        <h2 id="run-progress-heading" className="text-section font-semibold">
          Evaluation in progress
        </h2>
        <CardDescription>Cases run one at a time through the same pipeline as user questions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {done !== null && total !== null && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-caption text-muted-foreground">
              <span>
                {done} of {total} cases{typeof caseKey === 'string' && done < total ? `, now ${caseKey}` : ''}
              </span>
              {attempt !== null && cases?.state === 'active' && (
                <span className="font-medium text-warning">Retrying (attempt {attempt} of 3)</span>
              )}
            </div>
            <Progress value={(done / total) * 100} aria-label={`${done} of ${total} cases completed`} />
          </div>
        )}
        <StageTimeline stages={timeline.stages} label="Evaluation stages" />
        {streamError && !timeline.outcome && <p className="text-caption text-danger">{streamError.message}</p>}
      </CardContent>
    </Card>
  )
}
