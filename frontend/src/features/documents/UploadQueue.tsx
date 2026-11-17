import { FileText, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'

import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { useEventTimeline } from '@/hooks/useEventTimeline'
import { env } from '@/lib/env'
import { formatBytes } from '@/lib/format'
import { fadeInVariants } from '@/lib/motion'
import { uploadErrorLabel, type StatusPresentation } from '@/lib/status'
import { jobStages } from '@/lib/timeline'
import { workspaceApi } from '@/services/workspace'

import { JobTimeline } from './JobTimeline'

export interface UploadItem {
  id: string
  name: string
  size: number
  phase: 'uploading' | 'accepted' | 'rejected'
  eventsUrl?: string
  error?: { code: string; message: string; existingFilename?: string }
}

const simulated = env.apiMode === 'mock'

export function UploadQueue({
  items,
  onClearFinished,
  onJobFinished,
}: {
  items: UploadItem[]
  onClearFinished: () => void
  onJobFinished: () => void
}) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="upload-queue-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="upload-queue-heading" className="font-semibold">
          Upload queue
        </h3>
        <Button variant="ghost" size="sm" onClick={onClearFinished}>
          Clear finished
        </Button>
      </div>
      <ul className="space-y-2" data-testid="upload-queue">
        {items.map((item) => (
          <UploadRow key={item.id} item={item} onJobFinished={onJobFinished} />
        ))}
      </ul>
    </section>
  )
}

function UploadRow({ item, onJobFinished }: { item: UploadItem; onJobFinished: () => void }) {
  const { timeline, streamError } = useEventTimeline(
    workspaceApi.subscribeJobEvents,
    jobStages,
    item.phase === 'accepted' ? (item.eventsUrl ?? null) : null,
    onJobFinished,
  )

  let status: StatusPresentation
  if (item.phase === 'uploading') status = { label: 'Uploading', tone: 'info' }
  else if (item.phase === 'rejected') status = { label: uploadErrorLabel(item.error?.code ?? ''), tone: 'danger' }
  else if (timeline.outcome === 'failed') status = { label: 'Processing failed', tone: 'danger' }
  else if (timeline.outcome) status = simulated ? { label: 'Simulation finished', tone: 'neutral' } : { label: 'Indexed', tone: 'success' }
  else status = { label: simulated ? 'Simulating processing' : 'Processing', tone: 'info' }

  return (
    <motion.li
      variants={fadeInVariants}
      initial="initial"
      animate="animate"
      data-testid="upload-item"
      data-phase={item.phase}
      className="rounded-lg border bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="text-caption text-muted-foreground">{formatBytes(item.size)}</p>
        </div>
        {item.phase === 'uploading' && <Loader2 aria-hidden="true" className="size-4 animate-spin text-info" />}
        <StatusBadge status={status} />
      </div>

      {item.phase === 'rejected' && item.error && (
        <p className="mt-2 text-caption text-danger">
          {item.error.message}
          {item.error.existingFilename && ` Existing document: ${item.error.existingFilename}.`}
        </p>
      )}

      {item.phase === 'accepted' && (
        <div className="mt-3 border-t pt-3">
          <JobTimeline stages={timeline.stages} simulated={simulated} />
          {simulated && timeline.outcome && (
            <p className="mt-2 text-caption text-muted-foreground" data-testid="simulation-result">
              Simulation finished. This file was not uploaded, stored or indexed, so it does not appear in the
              library.
            </p>
          )}
          {streamError && !timeline.outcome && (
            <p className="mt-2 text-caption text-danger">{streamError.message}</p>
          )}
        </div>
      )}
    </motion.li>
  )
}
