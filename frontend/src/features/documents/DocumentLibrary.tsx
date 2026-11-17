import { FileText, Search, Upload } from 'lucide-react'
import { motion } from 'motion/react'

import { DemoDataTag } from '@/components/DemoDataTag'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AsyncState } from '@/hooks/useAsync'
import { formatBytes, formatDate } from '@/lib/format'
import { fadeInVariants } from '@/lib/motion'
import { documentStatus } from '@/lib/status'
import type { DocumentListItem, DocumentStatus, Paginated } from '@/types/api'

const statusOptions: DocumentStatus[] = [
  'queued',
  'processing',
  'completed',
  'completed_with_warnings',
  'failed',
  'needs_ocr',
  'delete_failed',
]

export function DocumentLibrary({
  state,
  onRetry,
  search,
  onSearchChange,
  status,
  onStatusChange,
  onOpen,
  onUpload,
}: {
  state: AsyncState<Paginated<DocumentListItem>>
  onRetry: () => void
  search: string
  onSearchChange: (value: string) => void
  status: DocumentStatus | 'all'
  onStatusChange: (value: DocumentStatus | 'all') => void
  onOpen: (id: string) => void
  onUpload: () => void
}) {
  const filtered = search.trim() !== '' || status !== 'all'
  return (
    <Card role="region" aria-labelledby="library-heading" className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="library-heading" className="text-section font-semibold">
            Document library
          </h2>
          {state.status === 'success' && <DemoDataTag />}
        </div>
        <CardDescription>
          {state.status === 'success'
            ? `${state.data.total} document${state.data.total === 1 ? '' : 's'}${filtered ? ' match the filters' : ''}.`
            : 'Every uploaded PDF and its processing status.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search aria-hidden="true" className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by filename"
              aria-label="Search documents by filename"
              className="pl-8"
            />
          </div>
          <Select value={status} onValueChange={(v) => onStatusChange(v as DocumentStatus | 'all')}>
            <SelectTrigger aria-label="Filter by status" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {documentStatus({ status: s, current_stage: null }).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {state.status === 'loading' && <LibrarySkeleton />}
        {state.status === 'error' && <ErrorState error={state.error} subject="documents" onRetry={onRetry} />}
        {state.status === 'success' && state.data.items.length === 0 && (
          filtered ? (
            <EmptyState
              icon={Search}
              title="No documents match"
              description="Try another filename or choose a different status."
              action={
                <Button variant="outline" size="sm" onClick={() => { onSearchChange(''); onStatusChange('all') }}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Upload}
              title="No documents yet"
              description="Upload text-based PDFs to build the evidence base the assistant answers from."
              action={<Button size="sm" onClick={onUpload}>Upload documents</Button>}
            />
          )
        )}
        {state.status === 'success' && state.data.items.length > 0 && (
          <motion.div variants={fadeInVariants} initial="initial" animate="animate" className="-mx-2">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Document</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Size</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Pages</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Chunks</TableHead>
                  <TableHead className="hidden md:table-cell">Uploaded</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.data.items.map((doc) => (
                  <TableRow key={doc.id} data-testid="document-row">
                    <TableCell className="w-full max-w-0 whitespace-normal sm:whitespace-nowrap">
                      <span className="flex items-start gap-2 sm:items-center">
                        <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground sm:mt-0" />
                        <span className="flex min-w-0 flex-col items-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpen(doc.id)}
                            title={doc.filename}
                            className="block max-w-full text-left leading-5 font-medium break-words underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:truncate"
                          >
                            {doc.filename}
                          </button>
                          <StatusBadge status={documentStatus(doc)} className="sm:hidden" />
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                      {formatBytes(doc.file_size_bytes)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{doc.page_count ?? '—'}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{doc.chunk_count ?? '—'}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                      <time dateTime={doc.created_at}>{formatDate(doc.created_at)}</time>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge status={documentStatus(doc)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}

function LibrarySkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading documents">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  )
}
