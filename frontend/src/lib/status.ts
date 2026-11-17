// Status -> label/tone mapping from docs/03-UI-UX-BRIEF.md §4.2.
// Labels always pair text with an icon and colour (never colour alone).

import type { DocumentListItem, HealthStatus, ProcessingStage, QueryListItem } from '@/types/api'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface StatusPresentation {
  label: string
  tone: StatusTone
}

const processingStageLabels: Record<ProcessingStage, string> = {
  validation: 'Validating',
  text_extraction: 'Extracting text',
  chunking: 'Preparing content',
  embedding_generation: 'Generating embeddings',
  vector_indexing: 'Indexing',
}

export function documentStatus(
  doc: Pick<DocumentListItem, 'status' | 'current_stage'>,
): StatusPresentation {
  switch (doc.status) {
    case 'queued':
      return { label: 'Queued', tone: 'neutral' }
    case 'processing':
      return {
        label: doc.current_stage ? processingStageLabels[doc.current_stage] : 'Processing',
        tone: 'info',
      }
    case 'completed':
      return { label: 'Indexed', tone: 'success' }
    case 'completed_with_warnings':
      return { label: 'Indexed with warnings', tone: 'warning' }
    case 'failed':
      return { label: 'Failed', tone: 'danger' }
    case 'needs_ocr':
      return { label: 'Needs OCR (not supported)', tone: 'warning' }
    case 'delete_failed':
      return { label: 'Deletion incomplete', tone: 'danger' }
  }
}

export function queryStatus(
  q: Pick<QueryListItem, 'status' | 'flag_for_review'>,
): StatusPresentation {
  switch (q.status) {
    case 'queued':
      return { label: 'Queued', tone: 'neutral' }
    case 'running':
      return { label: 'Running', tone: 'info' }
    case 'completed':
      return q.flag_for_review
        ? { label: 'Answer — flagged for review', tone: 'warning' }
        : { label: 'Answered', tone: 'success' }
    case 'insufficient_evidence':
      return { label: 'Insufficient evidence', tone: 'warning' }
    case 'failed':
      return { label: 'Failed', tone: 'danger' }
  }
}

export function healthStatus(status: HealthStatus): StatusPresentation {
  switch (status) {
    case 'healthy':
      return { label: 'Healthy', tone: 'success' }
    case 'starting':
      return { label: 'Starting', tone: 'info' }
    case 'degraded':
      return { label: 'Degraded', tone: 'warning' }
  }
}
