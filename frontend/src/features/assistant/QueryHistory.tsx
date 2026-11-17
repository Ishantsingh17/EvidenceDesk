import { History } from 'lucide-react'

import { DemoDataTag } from '@/components/DemoDataTag'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { StatusBadge } from '@/components/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import type { AsyncState } from '@/hooks/useAsync'
import { formatDateTime } from '@/lib/format'
import { queryStatus } from '@/lib/status'
import { cn } from '@/lib/utils'
import type { Paginated, QueryListItem } from '@/types/api'

export function QueryHistory({
  state,
  activeId,
  onOpen,
  onRetry,
}: {
  state: AsyncState<Paginated<QueryListItem>>
  activeId: string | null
  onOpen: (id: string) => void
  onRetry: () => void
}) {
  return (
    <section aria-labelledby="history-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id="history-heading" className="text-section font-semibold">
          Recent questions
        </h2>
        {state.status === 'success' && state.data.items.length > 0 && <DemoDataTag />}
      </div>
      {state.status === 'loading' && (
        <div className="space-y-2" role="status" aria-label="Loading recent questions">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {state.status === 'error' && <ErrorState error={state.error} subject="question history" onRetry={onRetry} />}
      {state.status === 'success' && state.data.items.length === 0 && (
        <EmptyState icon={History} title="No questions yet" description="Questions you ask appear here." />
      )}
      {state.status === 'success' && state.data.items.length > 0 && (
        <ul className="space-y-1.5" data-testid="query-history">
          {state.data.items.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onOpen(q.id)}
                aria-current={activeId === q.id ? 'true' : undefined}
                className={cn(
                  'w-full space-y-1.5 rounded-lg border p-2.5 text-left outline-none transition-colors hover:border-primary/30 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring',
                  activeId === q.id ? 'border-primary/40 bg-accent/50' : 'bg-card',
                )}
              >
                <span className="line-clamp-2 block font-medium">{q.question}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge status={queryStatus(q)} />
                  <time dateTime={q.created_at} className="text-caption text-muted-foreground">
                    {formatDateTime(q.created_at)}
                  </time>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
