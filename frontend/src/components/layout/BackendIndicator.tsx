import { useHealth } from '@/app/health-context'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Compact live backend status for the top bar. Click to re-check. */
export function BackendIndicator() {
  const { state, refreshing, refresh } = useHealth()

  let label = 'Checking backend'
  let dot = 'bg-muted-foreground animate-pulse'
  if (state.phase === 'connected') {
    const status = state.health.status
    label = status === 'healthy' ? 'Backend healthy' : `Backend ${status}`
    dot = status === 'healthy' ? 'bg-success' : 'bg-warning'
  } else if (state.phase === 'error') {
    label = 'Backend unreachable'
    dot = 'bg-danger'
  }

  const detail =
    state.phase === 'checking'
      ? 'Checking GET /health now.'
      : `Live check of GET /health. Last checked at ${formatTime(state.checkedAt)}. Click to check again.`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing && state.phase === 'checking'}
          data-testid="backend-indicator"
          data-phase={state.phase}
          className="inline-flex h-8 items-center gap-2 rounded-md border bg-card px-2.5 text-body font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true" className={cn('size-2 rounded-full', dot)} />
          <span className="sr-only sm:not-sr-only">{label}</span>
          <span className="sr-only">. Check again</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        {detail}
      </TooltipContent>
    </Tooltip>
  )
}
