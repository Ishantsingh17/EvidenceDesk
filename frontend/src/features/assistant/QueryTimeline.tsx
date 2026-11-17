import { StageTimeline } from '@/components/StageTimeline'
import type { TimelineStage } from '@/lib/timeline'

function value(stage: TimelineStage, key: string): unknown {
  return stage.details?.[key]
}

/** One-line stage summary from real event details (schema §5.5). Durations are shown by StageTimeline. */
function describe(stage: TimelineStage): string | null {
  if (stage.state === 'skipped') return 'Skipped because the evidence check ended the query early'
  switch (stage.key) {
    case 'retrieval': {
      const count = value(stage, 'retrieved_count')
      return typeof count === 'number' ? `${count} passages retrieved` : null
    }
    case 'context_preparation': {
      const count = value(stage, 'evidence_count')
      const applied = value(stage, 'threshold_applied')
      if (typeof count !== 'number') return null
      return `${count} passages kept${applied === false ? ', evidence threshold not applied' : ''}`
    }
    case 'generation': {
      const model = value(stage, 'model_name')
      return typeof model === 'string' ? model : null
    }
    case 'citation_validation': {
      const count = value(stage, 'citation_count')
      const flagged = value(stage, 'flag_for_review')
      if (typeof count !== 'number') return null
      return `${count} citation${count === 1 ? '' : 's'} validated${flagged ? ', flagged for review' : ''}`
    }
    default:
      return null
  }
}

export function QueryTimeline({ stages, simulated }: { stages: TimelineStage[]; simulated: boolean }) {
  return <StageTimeline stages={stages} describe={describe} simulated={simulated} label="Query stages" />
}
