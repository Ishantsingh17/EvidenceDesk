// Turns workflow events (schema §6.1) into per-stage state for a timeline.
// A stage only becomes "completed" when its completed event arrives (CLAUDE.md §5).

import type { ProcessingStage, QueryStage, StageState, WorkflowEvent } from '@/types/api'

export interface TimelineStage {
  key: string
  label: string
  state: StageState
  details: Record<string, unknown> | null
  startedAt: string | null
  completedAt: string | null
  message: string | null
}

export interface TimelineState {
  stages: TimelineStage[]
  /** Terminal resource status once the terminal event arrives. */
  outcome: string | null
  errorCode: string | null
  lastSequence: number
}

export const jobStages: { key: ProcessingStage; label: string }[] = [
  { key: 'validation', label: 'Validating file' },
  { key: 'text_extraction', label: 'Extracting text' },
  { key: 'chunking', label: 'Preparing content' },
  { key: 'embedding_generation', label: 'Generating embeddings' },
  { key: 'vector_indexing', label: 'Indexing' },
]

/** Labels from UI brief §5 Screen 3 / App Flow §4. */
export const queryStages: { key: QueryStage; label: string }[] = [
  { key: 'query_received', label: 'Question received' },
  { key: 'query_embedding', label: 'Embedding the question' },
  { key: 'retrieval', label: 'Searching documents' },
  { key: 'context_preparation', label: 'Preparing supporting context' },
  { key: 'generation', label: 'Generating answer (Groq)' },
  { key: 'citation_validation', label: 'Checking references' },
]

export function initialTimeline(definition: { key: string; label: string }[]): TimelineState {
  return {
    stages: definition.map((s) => ({
      ...s,
      state: 'pending',
      details: null,
      startedAt: null,
      completedAt: null,
      message: null,
    })),
    outcome: null,
    errorCode: null,
    lastSequence: 0,
  }
}

export function applyEvent(state: TimelineState, event: WorkflowEvent): TimelineState {
  // Replayed events may arrive twice (reconnect); ignore anything already applied.
  if (event.sequence_number <= state.lastSequence) return state
  const next: TimelineState = { ...state, lastSequence: event.sequence_number }

  if (event.event_type === 'terminal') {
    next.outcome = event.status
    next.errorCode = event.error_code
    // A stage still "active" at a failed terminal event is shown as failed.
    if (event.status === 'failed') {
      next.stages = state.stages.map((s) => (s.state === 'active' ? { ...s, state: 'failed' } : s))
    }
    return next
  }

  next.stages = state.stages.map((s) => {
    if (s.key !== event.stage || !event.stage_status) return s
    const state: StageState =
      event.stage_status === 'started' ? 'active' : event.stage_status === 'completed' ? 'completed' : event.stage_status
    return {
      ...s,
      state,
      details: event.details ?? s.details,
      message: event.message,
      // Only a real "started" event sets a start time, so durations are never invented.
      startedAt: event.stage_status === 'started' ? event.timestamp : s.startedAt,
      completedAt: event.stage_status === 'started' ? null : event.timestamp,
    }
  })
  return next
}

/** Elapsed time between a stage's start and end events, if both are known. */
export function stageDurationMs(stage: TimelineStage): number | null {
  if (!stage.startedAt || !stage.completedAt) return null
  return Math.max(0, Date.parse(stage.completedAt) - Date.parse(stage.startedAt))
}
