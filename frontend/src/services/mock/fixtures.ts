// Demo fixtures for VITE_API_MODE=mock only.
// Real values: filenames, SHA-256 hashes, file sizes, page counts and per-page
// character/word counts of the committed sample-corpus PDFs.
// Demo values (invented, labelled "Demo data" in the UI): token and chunk counts,
// timestamps, durations, query counts and latency.

import type {
  DashboardSummary,
  DocumentDetail,
  DocumentPage,
  SettingsStatus,
} from '@/types/api'

interface CorpusFile {
  n: number
  filename: string
  sha256: string
  size: number
  /** [characters, words] per page, measured with PyMuPDF. */
  pages: [number, number][]
  createdAt: string
}

export const corpusFiles: CorpusFile[] = [
  { n: 1, filename: '01-payment-approval-policy-v1.pdf', sha256: 'e5f0adff85b205218f38238c6d4f14463dd7e84d259138f5eabee230f2ad4da4', size: 5162, pages: [[1762, 262], [1508, 238]], createdAt: '2026-11-16T15:55:00Z' },
  { n: 2, filename: '02-accounts-payable-sop.pdf', sha256: '2dbd087d62bd5e1dbf0477a5d7433bb60d98bf3014d2d581c19c3bab4170aec9', size: 5304, pages: [[1698, 239], [1738, 270]], createdAt: '2026-11-16T15:58:00Z' },
  { n: 3, filename: '03-vendor-onboarding-policy.pdf', sha256: 'cd435b8d10db935fd1214c5b8db9cb6c8cbf3b0d183b35aac95381600cbc138f', size: 5156, pages: [[1778, 261], [1623, 252]], createdAt: '2026-11-16T16:01:00Z' },
  { n: 4, filename: '04-invoice-processing-guidelines.pdf', sha256: '4b7cb62264e76c6f234bde3a08dc49c5a2e7857698152b1e844f74ff6b721432', size: 4923, pages: [[1504, 230], [1372, 218]], createdAt: '2026-11-16T16:03:00Z' },
  { n: 5, filename: '05-expense-reimbursement-policy.pdf', sha256: 'f5561992641a5cc679d9bbf130e68ebd5ac2884996391fb9a047883849e998f9', size: 4891, pages: [[1465, 211], [1350, 202]], createdAt: '2026-11-16T16:05:00Z' },
  { n: 6, filename: '06-payment-approval-policy-v2.pdf', sha256: 'cfcdc595b96f2744999a65263f6b297c73b2a1c56290f1322d9b29f95e2364ac', size: 4996, pages: [[1520, 223], [1523, 226]], createdAt: '2026-11-17T09:40:00Z' },
  { n: 7, filename: '07-malicious-invoice-prompt-injection-test.pdf', sha256: '24c050a401f8ed632b3411eb58d966c84d167e44b08cddb65381c7b7b7137f1e', size: 4984, pages: [[1569, 223], [1229, 194]], createdAt: '2026-11-17T09:42:00Z' },
]

export const demoDocumentId = (n: number) => `demo-doc-${n}`

const CHUNKS_PER_PAGE = 3 // demo value

function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString()
}

export function buildDemoDocument(file: CorpusFile): DocumentDetail {
  const pages: DocumentPage[] = file.pages.map(([chars, words], i) => ({
    page_number: i + 1,
    char_count: chars,
    word_count: words,
    token_count: Math.round(words * 1.3), // demo value
    chunk_count: CHUNKS_PER_PAGE,
    text_status: 'ok',
    warning_code: null,
    warning_message: null,
  }))
  const indexedAt = addSeconds(file.createdAt, 3)
  return {
    id: demoDocumentId(file.n),
    filename: file.filename,
    mime_type: 'application/pdf',
    file_size_bytes: file.size,
    file_hash: file.sha256,
    page_count: pages.length,
    chunk_count: pages.length * CHUNKS_PER_PAGE,
    status: 'completed',
    status_message: null,
    embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
    embedding_dimension: 384,
    chunk_size_tokens: 220,
    chunk_overlap_tokens: 40,
    created_at: file.createdAt,
    updated_at: indexedAt,
    indexed_at: indexedAt,
    diagnostics: {
      pages_total: pages.length,
      pages_ok: pages.length,
      pages_low_text: 0,
      pages_no_text: 0,
      total_characters: pages.reduce((sum, p) => sum + p.char_count, 0),
      warnings: [],
    },
    pages,
    latest_job: {
      job_id: `demo-job-${file.n}-1`,
      attempt_number: 1,
      trigger: 'upload',
      status: 'completed',
      current_stage: null,
      started_at: file.createdAt,
      completed_at: indexedAt,
      duration_ms: 2600 + file.n * 40, // demo value
      error_code: null,
      error_message: null,
      events_url: `/api/v1/jobs/demo-job-${file.n}-1/events`,
    },
    actions: { can_reprocess: true, can_delete: true, disabled_reason: null },
  }
}

export const demoQueryStats = {
  queries_total: 12,
  queries_insufficient_evidence: 3,
  median_query_latency_ms: 1840,
  query_latency_sample_count: 12,
}

export function buildDashboardSummary(docs: DocumentDetail[]): DashboardSummary {
  const indexed = docs.filter((d) => d.status === 'completed' || d.status === 'completed_with_warnings')
  const hasDocs = docs.length > 0
  return {
    documents_total: docs.length,
    documents_indexed: indexed.length,
    documents_with_warnings: docs.filter((d) => d.status === 'completed_with_warnings').length,
    documents_failed: docs.filter((d) => d.status === 'failed').length,
    documents_needs_ocr: docs.filter((d) => d.status === 'needs_ocr').length,
    queries_total: hasDocs ? demoQueryStats.queries_total : 0,
    queries_insufficient_evidence: hasDocs ? demoQueryStats.queries_insufficient_evidence : 0,
    median_query_latency_ms: hasDocs ? demoQueryStats.median_query_latency_ms : null,
    query_latency_sample_count: hasDocs ? demoQueryStats.query_latency_sample_count : 0,
    latest_evaluation: null, // no evaluation has ever been run
  }
}

export const demoSettingsStatus: SettingsStatus = {
  environment: 'development',
  backend_status: 'healthy',
  vector_store_status: 'available',
  embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
  embedding_dimension: 384,
  embedding_model_loaded: true,
  llm_provider: 'Groq',
  llm_model: 'openai/gpt-oss-20b',
  upload_limit_mb: 20,
  retrieval_top_k_default: 4,
  retrieval_top_k_max: 10,
  retrieval_max_distance: null,
  evidence_threshold_calibrated: false,
}
