import { StageTimeline } from '@/components/StageTimeline'
import type { TimelineStage } from '@/lib/timeline'

function num(details: Record<string, unknown> | null, key: string): number | null {
  const value = details?.[key]
  return typeof value === 'number' ? value : null
}

/** Real counts from event details only; nothing is estimated. */
function describeJobStage(stage: TimelineStage): string | null {
  const d = stage.details
  switch (stage.key) {
    case 'validation': {
      const pages = num(d, 'page_count')
      return pages !== null ? `${pages} pages` : null
    }
    case 'text_extraction': {
      const ok = num(d, 'pages_ok')
      const warnings = num(d, 'warning_count')
      if (ok === null) return null
      return warnings ? `${ok} pages with text, ${warnings} with warnings` : `${ok} pages with text`
    }
    case 'chunking': {
      const chunks = num(d, 'chunk_count')
      return chunks !== null ? `${chunks} chunks` : null
    }
    case 'embedding_generation': {
      const done = num(d, 'completed_items')
      const total = num(d, 'total_items')
      return done !== null && total !== null ? `${done} of ${total} chunks embedded` : null
    }
    default:
      return null
  }
}

export function JobTimeline({ stages, simulated }: { stages: TimelineStage[]; simulated: boolean }) {
  return (
    <StageTimeline
      stages={stages}
      describe={describeJobStage}
      simulated={simulated}
      label="Processing stages"
    />
  )
}
