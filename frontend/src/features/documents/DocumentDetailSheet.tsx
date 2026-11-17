import { Check, Copy, RotateCw, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'

import { useHealth } from '@/app/health-context'
import { DemoDataTag } from '@/components/DemoDataTag'
import { ErrorState } from '@/components/feedback/ErrorState'
import { InlineNotice } from '@/components/feedback/InlineNotice'
import { StatusBadge } from '@/components/StatusBadge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsync } from '@/hooks/useAsync'
import { useEventTimeline } from '@/hooks/useEventTimeline'
import { env } from '@/lib/env'
import { formatBytes, formatDateTime, formatNumber, truncateHash } from '@/lib/format'
import { documentStatus, pageTextStatus } from '@/lib/status'
import { jobStages, type TimelineStage } from '@/lib/timeline'
import { ApiError } from '@/services/api/client'
import { workspaceApi } from '@/services/workspace'
import type { DocumentDetail, JobDetail } from '@/types/api'

import { JobTimeline } from './JobTimeline'

const simulated = env.apiMode === 'mock'

export interface DetailResult {
  tone: 'success' | 'warning' | 'danger'
  title: string
  text: string
}

/** Detail drawer: metadata, hash, page diagnostics, latest job timeline, reprocess and delete. */
export function DocumentDetailSheet({
  documentId,
  onClose,
  onChanged,
  onDeleted,
}: {
  documentId: string | null
  onClose: () => void
  onChanged: () => void
  onDeleted: (result: DetailResult) => void
}) {
  return (
    <Sheet open={documentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {documentId && (
          <DetailBody key={documentId} documentId={documentId} onChanged={onChanged} onDeleted={onDeleted} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailBody({
  documentId,
  onChanged,
  onDeleted,
}: {
  documentId: string
  onChanged: () => void
  onDeleted: (result: DetailResult) => void
}) {
  const loadDocument = useCallback((signal: AbortSignal) => workspaceApi.getDocument(documentId, signal), [documentId])
  const { state, reload } = useAsync(loadDocument)
  const [liveEventsUrl, setLiveEventsUrl] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onJobFinished = useCallback(() => {
    reload()
    onChanged()
  }, [reload, onChanged])

  const live = useEventTimeline(workspaceApi.subscribeJobEvents, jobStages, liveEventsUrl, onJobFinished)

  const reprocess = async () => {
    setActionError(null)
    setBusy(true)
    try {
      const accepted = await workspaceApi.reprocessDocument(documentId)
      setLiveEventsUrl(accepted.events_url)
      reload()
      onChanged()
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Reprocessing could not start.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (filename: string) => {
    setActionError(null)
    setBusy(true)
    try {
      const result = await workspaceApi.deleteDocument(documentId)
      const partial = result.result === 'partially_deleted'
      onDeleted({
        tone: partial ? 'warning' : 'success',
        title: partial ? `${filename} was only partly deleted` : `${filename} deleted`,
        text: [
          partial ? 'The search index entries were removed but the file could not be. Try deleting again.' : 'The file, its search index entries and its page diagnostics were removed.',
          ...result.warnings,
        ].join(' '),
      })
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'The document could not be deleted.')
      setBusy(false)
    }
  }

  if (state.status === 'loading') return <DetailSkeleton />
  if (state.status === 'error') {
    return (
      <div className="p-6">
        <SheetHeader className="p-0 pb-4">
          <SheetTitle>Document details</SheetTitle>
          <SheetDescription>Details could not be loaded.</SheetDescription>
        </SheetHeader>
        <ErrorState error={state.error} subject="document details" onRetry={reload} />
      </div>
    )
  }

  const doc = state.data
  return (
    <div className="flex flex-col">
      <SheetHeader className="gap-2 border-b p-5 pr-12">
        <SheetTitle className="text-section leading-snug break-words">{doc.filename}</SheetTitle>
        <SheetDescription className="sr-only">Metadata, page diagnostics and processing history</SheetDescription>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={documentStatus({ status: doc.status, current_stage: doc.latest_job?.current_stage ?? null })} />
          <DemoDataTag />
        </div>
      </SheetHeader>

      <div className="space-y-6 p-5">
        <DocumentActions doc={doc} busy={busy} onReprocess={reprocess} onDelete={() => remove(doc.filename)} />
        {actionError && <InlineNotice tone="danger" title="Action failed">{actionError}</InlineNotice>}
        {doc.status_message && <InlineNotice tone="warning" title="Status">{doc.status_message}</InlineNotice>}

        <MetadataSection doc={doc} />
        <PageDiagnostics doc={doc} />

        <section aria-labelledby="timeline-heading" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="timeline-heading" className="font-semibold">Processing timeline</h3>
            {doc.latest_job && (
              <span className="text-caption text-muted-foreground">
                Attempt {doc.latest_job.attempt_number}, {doc.latest_job.trigger === 'upload' ? 'upload' : 'reprocess'}
              </span>
            )}
          </div>
          {liveEventsUrl ? (
            <>
              <JobTimeline stages={live.timeline.stages} simulated={simulated} />
              {live.streamError && !live.timeline.outcome && (
                <p className="text-caption text-danger">{live.streamError.message}</p>
              )}
            </>
          ) : doc.latest_job ? (
            <StoredJobTimeline jobId={doc.latest_job.job_id} />
          ) : (
            <p className="text-muted-foreground">No processing job yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function DocumentActions({
  doc,
  busy,
  onReprocess,
  onDelete,
}: {
  doc: DocumentDetail
  busy: boolean
  onReprocess: () => void
  onDelete: () => void
}) {
  const { state } = useHealth()
  const evaluationRunning = state.phase === 'connected' && state.health.activity.evaluation_active
  const reason = evaluationRunning ? 'Evaluation run in progress' : doc.actions.disabled_reason
  const canReprocess = doc.actions.can_reprocess && !evaluationRunning && !busy
  const canDelete = doc.actions.can_delete && !evaluationRunning && !busy

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onReprocess} disabled={!canReprocess}>
          <RotateCw aria-hidden="true" />
          Reprocess
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={!canDelete}>
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {doc.filename}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the file, its search index entries and its page diagnostics. Past questions
                and evaluation results keep their saved snapshots, marked as no longer available.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep document</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDelete}>
                Delete document
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {reason && <p className="text-caption text-muted-foreground">Unavailable: {reason}.</p>}
      {simulated && (
        <p className="text-caption text-muted-foreground">
          In mock mode, reprocessing is simulated and deleting only affects this browser session.
        </p>
      )}
    </div>
  )
}

function MetadataSection({ doc }: { doc: DocumentDetail }) {
  const [copied, setCopied] = useState(false)
  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(doc.file_hash)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  const rows: [string, string][] = [
    ['File size', formatBytes(doc.file_size_bytes)],
    ['Pages', doc.page_count?.toString() ?? '—'],
    ['Chunks', doc.chunk_count?.toString() ?? '—'],
    ['Uploaded', formatDateTime(doc.created_at)],
    ['Last indexed', doc.indexed_at ? formatDateTime(doc.indexed_at) : 'Not indexed'],
    ['Embedding model', doc.embedding_model ? `${doc.embedding_model} (${doc.embedding_dimension} dimensions)` : '—'],
    ['Chunking', doc.chunk_size_tokens ? `${doc.chunk_size_tokens} tokens, ${doc.chunk_overlap_tokens} overlap` : '—'],
  ]
  return (
    <section aria-labelledby="metadata-heading" className="space-y-3">
      <h3 id="metadata-heading" className="font-semibold">Details</h3>
      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">File hash (SHA-256)</dt>
        <dd className="flex min-w-0 items-center gap-1.5">
          <code className="truncate rounded-sm bg-muted px-1.5 py-0.5 text-caption" title={doc.file_hash}>
            {truncateHash(doc.file_hash)}
          </code>
          <Button variant="ghost" size="icon-xs" onClick={copyHash} aria-label={copied ? 'Hash copied' : 'Copy file hash'}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </Button>
        </dd>
      </dl>
    </section>
  )
}

function PageDiagnostics({ doc }: { doc: DocumentDetail }) {
  const d = doc.diagnostics
  return (
    <section aria-labelledby="pages-heading" className="space-y-3">
      <div className="space-y-1">
        <h3 id="pages-heading" className="font-semibold">Page diagnostics</h3>
        <p className="text-caption text-muted-foreground">
          {d.pages_ok} of {d.pages_total} pages with text, {formatNumber(d.total_characters)} characters extracted.
          {d.pages_low_text + d.pages_no_text > 0 && ` ${d.pages_low_text + d.pages_no_text} pages need attention.`}
        </p>
      </div>
      <div className="-mx-2">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Page</TableHead>
              <TableHead className="text-right">Characters</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Words</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Tokens</TableHead>
              <TableHead className="text-right">Chunks</TableHead>
              <TableHead>Text</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {doc.pages.map((p) => (
              <TableRow key={p.page_number}>
                <TableCell className="tabular-nums">{p.page_number}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(p.char_count)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(p.word_count)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(p.token_count)}</TableCell>
                <TableCell className="text-right tabular-nums">{p.chunk_count}</TableCell>
                <TableCell>
                  <StatusBadge status={pageTextStatus(p.text_status)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {d.warnings.length > 0 && (
        <ul className="space-y-1">
          {d.warnings.map((w) => (
            <li key={w.page_number} className="text-caption text-warning">{w.message}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function toStages(job: JobDetail): TimelineStage[] {
  return jobStages.map(({ key, label }) => {
    const s = job.stages.find((stage) => stage.stage === key)
    return {
      key,
      label,
      state: s?.state ?? 'pending',
      details: s?.details ?? null,
      startedAt: s?.started_at ?? null,
      completedAt: s?.completed_at ?? null,
      message: null,
    }
  })
}

function StoredJobTimeline({ jobId }: { jobId: string }) {
  const loadJob = useCallback((signal: AbortSignal) => workspaceApi.getJob(jobId, signal), [jobId])
  const { state, reload } = useAsync(loadJob)
  if (state.status === 'loading') return <Skeleton className="h-40 w-full" />
  if (state.status === 'error') return <ErrorState error={state.error} subject="the processing history" onRetry={reload} />
  // Stored history is not live; in mock mode its durations are demo values.
  return <JobTimeline stages={toStages(state.data)} simulated={false} />
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-5" role="status" aria-label="Loading document details">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
