import { FileText, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AsyncState } from '@/hooks/useAsync'
import { fileTypeLabel, formatDate } from '@/lib/format'
import { fadeInVariants } from '@/lib/motion'
import { documentStatus } from '@/lib/status'
import type { DocumentListItem, Paginated } from '@/types/api'

import { SectionCard } from './SectionCard'

export function RecentDocuments({
  state,
  onRetry,
  className,
}: {
  state: AsyncState<Paginated<DocumentListItem>>
  onRetry: () => void
  className?: string
}) {
  return (
    <SectionCard
      id="recent-documents"
      title="Recent documents"
      description="Latest uploads and where each one is in processing."
      demoData={state.status === 'success'}
      className={className}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/documents">View all</Link>
        </Button>
      }
    >
      {state.status === 'loading' && <TableSkeleton />}
      {state.status === 'error' && (
        <ErrorState error={state.error} subject="recent documents" onRetry={onRetry} />
      )}
      {state.status === 'success' && state.data.items.length === 0 && (
        <EmptyState
          icon={Upload}
          title="No documents yet"
          description="Upload text-based PDFs to start building the evidence base."
          action={
            <Button asChild size="sm">
              <Link to="/documents">Upload documents</Link>
            </Button>
          }
        />
      )}
      {state.status === 'success' && state.data.items.length > 0 && (
        <motion.div variants={fadeInVariants} initial="initial" animate="animate" className="-mx-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Uploaded</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="text-right">Pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.items.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="w-full max-w-0 whitespace-normal sm:whitespace-nowrap">
                    <span className="flex items-start gap-2 sm:items-center">
                      <FileText
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground sm:mt-0"
                      />
                      <span className="min-w-0 space-y-1.5">
                        {/* Wraps on phones; truncates (full name on hover) on wider screens. */}
                        <span className="block font-medium break-words sm:truncate" title={doc.filename}>
                          {doc.filename}
                        </span>
                        <StatusBadge status={documentStatus(doc)} className="sm:hidden" />
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {fileTypeLabel(doc.filename)}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                    <time dateTime={doc.created_at}>{formatDate(doc.created_at)}</time>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge status={documentStatus(doc)} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{doc.page_count ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </motion.div>
      )}
    </SectionCard>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading recent documents" role="status">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-6" />
        </div>
      ))}
    </div>
  )
}
