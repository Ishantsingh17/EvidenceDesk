import { MessageSquareText } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AsyncState } from '@/hooks/useAsync'
import { formatDateTime, formatDuration } from '@/lib/format'
import { fadeInVariants } from '@/lib/motion'
import { queryStatus } from '@/lib/status'
import type { Paginated, QueryListItem } from '@/types/api'

import { SectionCard } from './SectionCard'

export function RecentQueries({
  state,
  onRetry,
  className,
}: {
  state: AsyncState<Paginated<QueryListItem>>
  onRetry: () => void
  className?: string
}) {
  return (
    <SectionCard
      id="recent-queries"
      title="Recent queries"
      description="The latest questions and how each one was answered."
      demoData={state.status === 'success' && state.data.items.length > 0}
      className={className}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/assistant">Open assistant</Link>
        </Button>
      }
    >
      {state.status === 'loading' && (
        <div className="space-y-3" role="status" aria-label="Loading recent queries">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}
      {state.status === 'error' && <ErrorState error={state.error} subject="recent queries" onRetry={onRetry} />}
      {state.status === 'success' && state.data.items.length === 0 && (
        <EmptyState
          icon={MessageSquareText}
          title="No questions yet"
          description="Ask the assistant a question about your documents."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/assistant">Ask a question</Link>
            </Button>
          }
        />
      )}
      {state.status === 'success' && state.data.items.length > 0 && (
        <motion.ul variants={fadeInVariants} initial="initial" animate="animate" className="divide-y" data-testid="recent-queries">
          {state.data.items.map((q) => (
            <li key={q.id} className="py-2.5 first:pt-0 last:pb-0">
              <Link
                to={`/assistant?query=${encodeURIComponent(q.id)}`}
                className="block space-y-1.5 rounded-md outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="line-clamp-2 font-medium">{q.question}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
                  <StatusBadge status={queryStatus(q)} />
                  <span>
                    {q.citation_count} citation{q.citation_count === 1 ? '' : 's'}
                  </span>
                  {q.total_duration_ms !== null && <span>{formatDuration(q.total_duration_ms)}</span>}
                  <time dateTime={q.created_at}>{formatDateTime(q.created_at)}</time>
                </span>
              </Link>
            </li>
          ))}
        </motion.ul>
      )}
    </SectionCard>
  )
}
