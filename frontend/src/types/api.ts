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
