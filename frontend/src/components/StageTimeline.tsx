import { CheckCircle2, Circle, FlaskConical, MinusCircle, XCircle } from 'lucide-react'
import { motion } from 'motion/react'

import { formatDuration } from '@/lib/format'
import { stageDurationMs, type TimelineStage } from '@/lib/timeline'
import { cn } from '@/lib/utils'
import type { StageState } from '@/types/api'

const stateText: Record<StageState, string> = {
  pending: 'Pending',
  active: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
}

/** Ordered stage list for processing and query timelines (UI brief §4.2 / §7). */
export function StageTimeline({
  stages,
  describe,
  simulated = false,
  label,
}: {
  stages: TimelineStage[]
  /** Optional one-line summary of a stage's counts, e.g. "6 chunks". */
  describe?: (stage: TimelineStage) => string | null
  /** Shows that the events come from the mock adapter, not the backend. */
  simulated?: boolean
  /** Accessible name of the list. */
  label: string
}) {
  return (
    <div className="space-y-3">
      {simulated && (
        <p
          data-testid="simulated-notice"
          className="flex items-start gap-1.5 rounded-md border border-warning/25 bg-warning-soft px-2.5 py-1.5 text-caption text-warning"
        >
          <FlaskConical aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          Simulated events from the mock adapter. Nothing is really being processed.
        </p>
      )}
      <ol aria-label={label} className="relative">
        {stages.map((stage, index) => (
          <StageRow
            key={stage.key}
            stage={stage}
            summary={describe?.(stage) ?? null}
            last={index === stages.length - 1}
          />
        ))}
      </ol>
    </div>
  )
}

function StageIcon({ state }: { state: StageState }) {
  const base = 'relative size-5 shrink-0 bg-card'
  switch (state) {
    case 'completed':
      return <CheckCircle2 aria-hidden="true" className={cn(base, 'text-success')} />
    case 'failed':
      return <XCircle aria-hidden="true" className={cn(base, 'text-danger')} />
    case 'skipped':
      return <MinusCircle aria-hidden="true" className={cn(base, 'text-muted-foreground')} />
    case 'active':
      return (
        <span aria-hidden="true" className={cn(base, 'flex items-center justify-center')}>
          <span className="absolute size-5 animate-ping rounded-full bg-info/25" />
          <span className="size-2.5 rounded-full bg-info" />
        </span>
      )
    default:
      return <Circle aria-hidden="true" className={cn(base, 'text-border')} />
  }
}

function StageRow({ stage, summary, last }: { stage: TimelineStage; summary: string | null; last: boolean }) {
  // Prefer the backend-measured stage duration; fall back to the time between events.
  const measured = stage.details?.duration_ms
  const duration = typeof measured === 'number' ? measured : stageDurationMs(stage)
  const done = stage.state === 'completed'
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0" data-stage={stage.key} data-state={stage.state}>
      {!last && (
        <span
          aria-hidden="true"
          className={cn('absolute top-6 bottom-0 left-2.5 w-px -translate-x-1/2', done ? 'bg-success/40' : 'bg-border')}
        />
      )}
      <motion.span
        key={stage.state}
        initial={{ scale: 0.8, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="relative"
      >
        <StageIcon state={stage.state} />
      </motion.span>
      <div className="min-w-0 flex-1 pt-px">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className={cn('font-medium', stage.state === 'pending' && 'text-muted-foreground')}>{stage.label}</p>
          <span className="text-caption text-muted-foreground">
            {stateText[stage.state]}
            {duration !== null && done ? `, ${formatDuration(duration)}` : ''}
          </span>
        </div>
        {summary && <p className="text-caption text-muted-foreground">{summary}</p>}
      </div>
    </li>
  )
}
