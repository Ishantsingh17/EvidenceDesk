import { FileUp, MessageSquareText, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { StatusBadge } from '@/components/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import type { AsyncState } from '@/hooks/useAsync'
import { formatDateTime } from '@/lib/format'
import { fadeInVariants } from '@/lib/motion'
import { documentStatus, queryStatus, type StatusPresentation } from '@/lib/status'
import type { DocumentListItem, Paginated, QueryListItem } from '@/types/api'

import { SectionCard } from './SectionCard'

interface ActivityItem {
  id: string
  icon: LucideIcon
  kind: string
  text: string
  status: StatusPresentation
  at: string
}

const MAX_ITEMS = 6

/** Uploads and questions merged into one timeline, newest first. */
function toActivity(docs: DocumentListItem[], queries: QueryListItem[]): ActivityItem[] {
  const uploads = docs.map<ActivityItem>((d) => ({
    id: `doc-${d.id}`,
    icon: FileUp,
    kind: 'Uploaded',
    text: d.filename,
    status: documentStatus(d),
    at: d.created_at,
  }))
  const asked = queries.map<ActivityItem>((q) => ({
    id: `query-${q.id}`,
    icon: MessageSquareText,
    kind: 'Asked',
    text: q.question,
    status: queryStatus(q),
    at: q.created_at,
  }))
  return [...uploads, ...asked]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_ITEMS)
}

export function RecentActivity({
  documents,
  queries,
  onRetry,
  className,
}: {
  documents: AsyncState<Paginated<DocumentListItem>>
  queries: AsyncState<Paginated<QueryListItem>>
  onRetry: () => void
  className?: string
}) {
  const failed =
    documents.status === 'error' ? documents : queries.status === 'error' ? queries : null
  const ready = documents.status === 'success' && queries.status === 'success'
  const items = ready ? toActivity(documents.data.items, queries.data.items) : []

  return (
    <SectionCard
      id="recent-activity"
      title="Recent activity"
      description="Uploads and questions across the workspace."
      demoData={ready}
      className={className}
    >
      {failed && <ErrorState error={failed.error} subject="recent activity" onRetry={onRetry} />}
      {!failed && !ready && <ActivitySkeleton />}
      {ready && items.length === 0 && (
        <EmptyState
          icon={MessageSquareText}
          title="No activity yet"
          description="Uploads and questions will appear here as they happen."
        />
      )}
      {ready && items.length > 0 && (
        <motion.ol variants={fadeInVariants} initial="initial" animate="animate" className="relative">
          {items.map((item, index) => (
            <ActivityRow key={item.id} item={item} last={index === items.length - 1} />
          ))}
        </motion.ol>
      )}
    </SectionCard>
  )
}

function ActivityRow({ item, last }: { item: ActivityItem; last: boolean }) {
  const Icon = item.icon
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last && <span aria-hidden="true" className="absolute top-8 bottom-1 left-3.5 w-px bg-border" />}
      <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
        <p className="line-clamp-2 break-words">
          <span className="text-muted-foreground">{item.kind} </span>
          <span className="font-medium">{item.text}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={item.status} />
          <time dateTime={item.at} className="text-caption text-muted-foreground">
            {formatDateTime(item.at)}
          </time>
        </div>
      </div>
    </li>
  )
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading recent activity">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
