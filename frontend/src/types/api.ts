// Shared API types mirroring docs/04-BACKEND-SCHEMA.md. Field names stay snake_case.

export type HealthStatus = 'starting' | 'healthy' | 'degraded'

export interface HealthResponse {
  status: HealthStatus
  service: string
  activity: {
    ingestion_active: boolean
    evaluation_active: boolean
  }
  timestamp: string
}

export type DocumentStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'needs_ocr'
  | 'delete_failed'

export type ProcessingStage =
  | 'validation'
  | 'text_extraction'
  | 'chunking'
  | 'embedding_generation'
  | 'vector_indexing'

export type QueryStatus = 'queued' | 'running' | 'completed' | 'insufficient_evidence' | 'failed'

export type EvaluationRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'

export interface Paginated<T> {
  items: T[]
  page: number
  page_size: number
  total: number
}

/** GET /dashboard/summary (schema §5.2). Null means "cannot be calculated". */
export interface DashboardSummary {
  documents_total: number
  documents_indexed: number
  documents_with_warnings: number
  documents_failed: number
  documents_needs_ocr: number
  queries_total: number
  queries_insufficient_evidence: number
  median_query_latency_ms: number | null
  query_latency_sample_count: number
  latest_evaluation: {
    run_id: string
    status: EvaluationRunStatus
    case_count: number
    created_at: string
  } | null
}

/** Item of GET /documents (schema §5.3). */
export interface DocumentListItem {
  id: string
  filename: string
  file_size_bytes: number
  page_count: number | null
  chunk_count: number | null
  pages_with_warnings: number | null
  status: DocumentStatus
  status_message: string | null
  current_stage: ProcessingStage | null
  created_at: string
  updated_at: string
}

/** Item of GET /queries (schema §5.5). */
export interface QueryListItem {
  id: string
  question: string
  status: QueryStatus
  insufficient_evidence: boolean
  flag_for_review: boolean
  citation_count: number
  total_duration_ms: number | null
  created_at: string
  completed_at: string | null
}

export type VectorStoreStatus = 'available' | 'unavailable' | 'model_mismatch'

/** GET /settings/status (schema §5.8). Never contains secrets. */
export interface SettingsStatus {
  environment: string
  backend_status: HealthStatus
  vector_store_status: VectorStoreStatus
  embedding_model: string
  embedding_dimension: number | null
  embedding_model_loaded: boolean
  llm_provider: string
  llm_model: string
  upload_limit_mb: number
  retrieval_top_k_default: number
  retrieval_top_k_max: number
  retrieval_max_distance: number | null
  evidence_threshold_calibrated: boolean
}

// ---------- Documents (schema §5.3) ----------

export type JobStatus = 'queued' | 'running' | 'completed' | 'completed_with_warnings' | 'failed'
export type StageState = 'pending' | 'active' | 'completed' | 'failed' | 'skipped'
export type StageStatus = 'started' | 'completed' | 'failed' | 'skipped'
export type PageTextStatus = 'ok' | 'low_text' | 'no_text'

export interface DocumentPage {
  page_number: number
  char_count: number
  word_count: number
  token_count: number
  chunk_count: number
  text_status: PageTextStatus
  warning_code: string | null
  warning_message: string | null
}

export interface JobSummary {
  job_id: string
  attempt_number: number
  trigger: 'upload' | 'reprocess'
  status: JobStatus
  current_stage: ProcessingStage | null
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  error_code: string | null
  error_message: string | null
  events_url: string
}

/** GET /documents/{id}. Never contains file paths or storage names. */
export interface DocumentDetail {
  id: string
  filename: string
  mime_type: string
  file_size_bytes: number
  file_hash: string
  page_count: number | null
  chunk_count: number | null
  status: DocumentStatus
  status_message: string | null
  embedding_model: string | null
  embedding_dimension: number | null
  chunk_size_tokens: number | null
  chunk_overlap_tokens: number | null
  created_at: string
  updated_at: string
  indexed_at: string | null
  diagnostics: {
    pages_total: number
    pages_ok: number
    pages_low_text: number
    pages_no_text: number
    total_characters: number
    warnings: { page_number: number; code: string; message: string }[]
  }
  pages: DocumentPage[]
  latest_job: JobSummary | null
  actions: { can_reprocess: boolean; can_delete: boolean; disabled_reason: string | null }
}

export interface DocumentListParams {
  pageSize: number
  search?: string
  status?: DocumentStatus
}

/** 202 from POST /documents/upload. */
export interface UploadAccepted {
  document_id: string
  filename: string
  status: 'queued'
  job_id: string
  events_url: string
}

/** 202 from POST /documents/{id}/reprocess. */
export interface ReprocessAccepted {
  document_id: string
  job_id: string
  attempt_number: number
  status: 'queued'
  events_url: string
}

/** 200 from DELETE /documents/{id}. */
export interface DeleteResult {
  document_id: string
  result: 'deleted' | 'partially_deleted'
  vectors_removed: boolean
  file_removed: boolean
  metadata_removed: boolean
  warnings: string[]
}

// ---------- Workflow events (schema §6.1) ----------

export interface WorkflowEvent {
  event_id: number
  sequence_number: number
  resource_type: 'document_job' | 'query' | 'evaluation_run'
  resource_id: string
  event_type: 'stage' | 'terminal'
  status: string
  stage: string | null
  stage_status: StageStatus | null
  message: string | null
  details: Record<string, unknown> | null
  error_code: string | null
  timestamp: string
}

// ---------- Queries (schema §5.5) ----------

export type QueryStage =
  | 'query_received'
  | 'query_embedding'
  | 'retrieval'
  | 'context_preparation'
  | 'generation'
  | 'citation_validation'

export type AbstentionReason =
  | 'no_retrieval_results'
  | 'below_evidence_threshold'
  | 'model_reported_insufficient'
  | 'no_valid_citations'

export type ReviewReason = 'MODEL_FLAGGED' | 'UNKNOWN_SOURCE_LABEL' | 'UNCITED_ANSWER'

export interface QueryRequest {
  question: string
  document_ids: string[] | null
  top_k?: number
}

export interface QueryAccepted {
  query_id: string
  status: 'queued'
  events_url: string
  result_url: string
}

export interface Citation {
  citation_id: string
  document_id: string
  document_available: boolean
  filename: string
  page_number: number
  chunk_index: number
  excerpt: string
  retrieval_rank: number
  distance: number
}

export interface RetrievedChunk {
  rank: number
  source_label: string | null
  is_cited: boolean
  passed_threshold: boolean
  document_id: string
  document_available: boolean
  filename: string
  page_number: number
  chunk_index: number
  distance: number
  excerpt: string
}

/** GET /queries/{id}. */
export interface QueryDetail {
  id: string
  status: QueryStatus
  question: string
  answer: string | null
  insufficient_evidence: boolean
  abstention_reason: AbstentionReason | null
  flag_for_review: boolean
  review_reasons: ReviewReason[]
  citations: Citation[]
  retrieval_details: {
    top_k: number
    threshold_applied: boolean
    max_distance: number | null
    evidence_threshold_calibrated: boolean
    chunks: RetrievedChunk[]
  }
  metrics: {
    query_embedding_duration_ms: number | null
    retrieval_duration_ms: number | null
    generation_duration_ms: number | null
    total_duration_ms: number | null
    retrieved_count: number
    evidence_count: number
    model_name: string | null
  }
  error_code: string | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export type FeedbackRating = 'helpful' | 'not_helpful'

// ---------- Evaluation (schema §5.7) ----------

export type EvaluationCategory =
  | 'direct'
  | 'multi_document'
  | 'ambiguous'
  | 'conflicting_documents'
  | 'unanswerable'
  | 'out_of_scope'
  | 'prompt_injection'

/** Item of GET /evaluations/datasets. */
export interface EvaluationDatasetSummary {
  id: string
  name: string
  version: string
  description: string
  case_count: number
  categories: Partial<Record<EvaluationCategory, number>>
  corpus: { document_key: string; filename: string; file_hash: string; indexed: boolean }[]
  corpus_ready: boolean
}

/** Item of GET /evaluations/runs (summary fields only). */
export interface EvaluationRunListItem {
  run_id: string
  dataset: { name: string; version: string }
  status: EvaluationRunStatus
  case_count: number
  completed_case_count: number
  failed_case_count: number
  created_at: string
  duration_ms: number | null
}

/** GET /jobs/{id}: persisted job state and stage history (schema §5.4). */
export interface JobDetail extends JobSummary {
  document_id: string
  stages: {
    stage: ProcessingStage
    state: StageState
    started_at: string | null
    completed_at: string | null
    duration_ms: number | null
    details: Record<string, unknown> | null
  }[]
  last_sequence_number: number
}
