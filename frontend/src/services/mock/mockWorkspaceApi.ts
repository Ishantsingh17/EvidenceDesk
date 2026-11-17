// Explicit mock adapter, selected only by VITE_API_MODE=mock (CLAUDE.md §4).
// State lives in memory for this browser session only; a reload restores the fixtures.
// Every "processing" or "answering" flow here is a simulation: nothing is uploaded,
// extracted, embedded, indexed or sent to an LLM.

import { applyEvent, initialTimeline, jobStages } from '@/lib/timeline'
import { ApiError } from '@/services/api/client'
import type { EventHandler, StreamErrorHandler, WorkspaceApi } from '@/services/workspace'
import type {
  DocumentDetail,
  DocumentListItem,
  EvaluationCategory,
  EvaluationDatasetSummary,
  JobDetail,
  Paginated,
  ProcessingStage,
  QueryDetail,
  QueryListItem,
  QueryStage,
  WorkflowEvent,
} from '@/types/api'

import { demoAnswers, findDemoAnswer, type DemoAnswer } from './demoAnswers'
import {
  buildDashboardSummary,
  buildDemoDocument,
  corpusFiles,
  demoDocumentId,
  demoSettingsStatus,
} from './fixtures'

const RESPONSE_DELAY_MS = 350
const MAX_UPLOAD_BYTES = demoSettingsStatus.upload_limit_mb * 1024 * 1024
const QUERY_MAX_CHARS = 1000

/** `?mock=empty` starts the mock workspace with no documents or queries. */
const emptyScenario =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === 'empty'

// ---------------------------------------------------------------- session state

const documents: DocumentDetail[] = emptyScenario ? [] : corpusFiles.map(buildDemoDocument).reverse()
const queries: QueryDetail[] = []
/** Hashes of files "uploaded" in this session (simulated; never stored). */
const simulatedUploadHashes = new Map<string, string>()
let idCounter = 0
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`

const isSearchable = (d: DocumentDetail) =>
  d.status === 'completed' || d.status === 'completed_with_warnings'

function respond<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(structuredClone(value)), RESPONSE_DELAY_MS)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

function toListItem(d: DocumentDetail): DocumentListItem {
  return {
    id: d.id,
    filename: d.filename,
    file_size_bytes: d.file_size_bytes,
    page_count: d.page_count,
    chunk_count: d.chunk_count,
    pages_with_warnings: d.diagnostics.pages_low_text + d.diagnostics.pages_no_text,
    status: d.status,
    status_message: d.status_message,
    current_stage: d.latest_job?.current_stage ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at,
  }
}

function toQueryItem(q: QueryDetail): QueryListItem {
  return {
    id: q.id,
    question: q.question,
    status: q.status,
    insufficient_evidence: q.insufficient_evidence,
    flag_for_review: q.flag_for_review,
    citation_count: q.citations.length,
    total_duration_ms: q.metrics.total_duration_ms,
    created_at: q.created_at,
    completed_at: q.completed_at,
  }
}

// ---------------------------------------------------------------- simulated event streams

interface Stream {
  events: WorkflowEvent[]
  listeners: Set<EventHandler>
}
const streams = new Map<string, Stream>()
let eventCounter = 0

interface Step {
  delay: number
  stage: string | null
  stageStatus: WorkflowEvent['stage_status']
  status: string
  message: string
  details?: Record<string, unknown> | null
  terminal?: boolean
  apply?: () => void
}

/** Plays steps into a replayable stream, like the backend's persisted SSE events. */
function playStream(eventsUrl: string, resourceType: WorkflowEvent['resource_type'], resourceId: string, steps: Step[]) {
  const stream: Stream = { events: [], listeners: new Set() }
  streams.set(eventsUrl, stream)
  let elapsed = 0
  steps.forEach((step, index) => {
    elapsed += step.delay
    setTimeout(() => {
      step.apply?.()
      const event: WorkflowEvent = {
        event_id: ++eventCounter,
        sequence_number: index + 1,
        resource_type: resourceType,
        resource_id: resourceId,
        event_type: step.terminal ? 'terminal' : 'stage',
        status: step.status,
        stage: step.stage,
        stage_status: step.stageStatus,
        message: step.message,
        details: { ...(step.details ?? {}), simulated: true },
        error_code: null,
        timestamp: new Date().toISOString(),
      }
      stream.events.push(event)
      stream.listeners.forEach((listener) => listener(event))
    }, elapsed)
  })
}

function subscribe(eventsUrl: string, onEvent: EventHandler, onError: StreamErrorHandler) {
  const stream = streams.get(eventsUrl)
  if (!stream) {
    // e.g. the stored job of a fixture document: there is nothing live to replay.
    setTimeout(() => onError(new ApiError(404, 'JOB_NOT_FOUND', 'No live events for this job.')), 0)
    return () => {}
  }
  stream.events.forEach(onEvent)
  if (stream.events.at(-1)?.event_type === 'terminal') return () => {}
  stream.listeners.add(onEvent)
  return () => stream.listeners.delete(onEvent)
}

const jobStageMessages: Record<ProcessingStage, string> = {
  validation: 'File validated',
  text_extraction: 'Extracting text',
  chunking: 'Preparing content',
  embedding_generation: 'Generating embeddings',
  vector_indexing: 'Indexing',
}

/** Simulated processing job. `doc` is set for reprocess of a demo document. */
function simulateJob(jobId: string, doc: DocumentDetail | null) {
  const eventsUrl = `/api/v1/jobs/${jobId}/events`
  const pages = doc?.page_count ?? null
  const chunks = doc?.chunk_count ?? null
  const setStage = (stage: ProcessingStage | null) => () => {
    if (!doc?.latest_job) return
    doc.status = stage ? 'processing' : doc.status
    doc.latest_job.status = stage ? 'running' : doc.latest_job.status
    doc.latest_job.current_stage = stage
  }
  const stage = (s: ProcessingStage, details: Record<string, unknown> | null, delay = 650): Step[] => [
    { delay: 250, stage: s, stageStatus: 'started', status: 'running', message: jobStageMessages[s], apply: setStage(s) },
    { delay, stage: s, stageStatus: 'completed', status: 'running', message: `${jobStageMessages[s]}: done`, details },
  ]
  const steps: Step[] = [
    { delay: 0, stage: 'validation', stageStatus: 'completed', status: 'queued', message: 'File validated', details: pages ? { page_count: pages } : null },
    ...stage('text_extraction', pages ? { pages_ok: pages, warning_count: 0 } : null),
    ...stage('chunking', chunks ? { chunk_count: chunks } : null, 450),
    ...stage('embedding_generation', chunks ? { completed_items: chunks, total_items: chunks } : null, 900),
    ...stage('vector_indexing', null, 500),
    {
      delay: 250,
      stage: null,
      stageStatus: null,
      status: 'completed',
      message: doc ? 'Simulated reprocessing finished' : 'Simulation finished. Nothing was stored or indexed.',
      terminal: true,
      apply: () => {
        if (!doc?.latest_job) return
        const now = new Date().toISOString()
        doc.status = 'completed'
        doc.updated_at = now
        doc.indexed_at = now
        doc.latest_job.status = 'completed'
        doc.latest_job.current_stage = null
        doc.latest_job.completed_at = now
        doc.latest_job.duration_ms = 4500
        doc.actions = { can_reprocess: true, can_delete: true, disabled_reason: null }
      },
    },
  ]
  playStream(eventsUrl, 'document_job', jobId, steps)
  return eventsUrl
}

/** Demo stage durations (ms) for the stored jobs of the fixture documents. */
const demoStageDurations: Record<ProcessingStage, number> = {
  validation: 40,
  text_extraction: 310,
  chunking: 30,
  embedding_generation: 1900,
  vector_indexing: 210,
}

function buildJobDetail(doc: DocumentDetail): JobDetail {
  const job = doc.latest_job!
  const stream = streams.get(job.events_url)
  let stages: JobDetail['stages']
  if (stream) {
    // Simulated in this session: rebuild the stage history from its events.
    const state = stream.events.reduce(applyEvent, initialTimeline(jobStages))
    stages = state.stages.map((s) => ({
      stage: s.key as ProcessingStage,
      state: s.state,
      started_at: s.startedAt,
      completed_at: s.completedAt,
      duration_ms: s.startedAt && s.completedAt ? Date.parse(s.completedAt) - Date.parse(s.startedAt) : null,
      details: s.details,
    }))
  } else {
    let cursor = Date.parse(job.started_at ?? doc.created_at)
    const details: Record<ProcessingStage, Record<string, unknown>> = {
      validation: { page_count: doc.page_count },
      text_extraction: { pages_ok: doc.diagnostics.pages_ok, warning_count: 0 },
      chunking: { chunk_count: doc.chunk_count },
      embedding_generation: { completed_items: doc.chunk_count, total_items: doc.chunk_count },
      vector_indexing: {},
    }
    stages = jobStages.map(({ key }) => {
      const started = new Date(cursor).toISOString()
      cursor += demoStageDurations[key]
      return {
        stage: key,
        state: 'completed' as const,
        started_at: started,
        completed_at: new Date(cursor).toISOString(),
        duration_ms: demoStageDurations[key],
        details: details[key],
      }
    })
  }
  return { ...job, document_id: doc.id, stages, last_sequence_number: stream?.events.length ?? 11 }
}

// ---------------------------------------------------------------- queries

function buildQuery(id: string, demo: DemoAnswer, createdAt: string, done: boolean): QueryDetail {
  const chunks = demo.chunks.map((chunk, i) => {
    const docId = demoDocumentId(chunk.doc)
    return {
      rank: i + 1,
      source_label: chunk.label,
      is_cited: chunk.cited,
      passed_threshold: true,
      document_id: docId,
      document_available: documents.some((d) => d.id === docId),
      filename: corpusFiles[chunk.doc - 1].filename,
      page_number: chunk.page,
      chunk_index: chunk.chunkIndex,
      distance: chunk.distance,
      excerpt: chunk.excerpt,
    }
  })
  const flagged = demo.reviewReasons.length > 0
  return {
    id,
    status: done ? demo.outcome : 'queued',
    question: demo.question,
    answer: done ? demo.answer : null,
    insufficient_evidence: done && demo.outcome === 'insufficient_evidence',
    abstention_reason: done ? demo.abstentionReason : null,
    flag_for_review: done && flagged,
    review_reasons: done ? demo.reviewReasons : [],
    citations: done
      ? chunks
          .filter((ch) => ch.is_cited)
          .map((ch) => ({
            citation_id: ch.source_label ?? '',
            document_id: ch.document_id,
            document_available: ch.document_available,
            filename: ch.filename,
            page_number: ch.page_number,
            chunk_index: ch.chunk_index,
            excerpt: ch.excerpt,
            retrieval_rank: ch.rank,
            distance: ch.distance,
          }))
      : [],
    retrieval_details: {
      top_k: demoSettingsStatus.retrieval_top_k_default,
      threshold_applied: false,
      max_distance: null,
      evidence_threshold_calibrated: false,
      chunks: done ? chunks : [],
    },
    metrics: {
      query_embedding_duration_ms: done ? 14 : null,
      retrieval_duration_ms: done ? 88 : null,
      generation_duration_ms: done ? 1160 : null,
      total_duration_ms: done ? 1420 : null,
      retrieved_count: done ? chunks.length : 0,
      evidence_count: done ? chunks.length : 0,
      model_name: done ? demoSettingsStatus.llm_model : null,
    },
    error_code: null,
    error_message: null,
    created_at: createdAt,
    completed_at: done ? createdAt : null,
  }
}

if (!emptyScenario) {
  // Query history fixtures: five dataset questions with prepared answers.
  const history: [string, string][] = [
    ['AP-CON-003', '2026-11-17T10:18:00Z'],
    ['AP-UN-001', '2026-11-17T10:12:00Z'],
    ['AP-PI-001', '2026-11-17T10:05:00Z'],
    ['AP-DIR-002', '2026-11-17T09:58:00Z'],
    ['AP-DIR-003', '2026-11-17T09:51:00Z'],
  ]
  history.forEach(([caseId, at], i) => {
    const demo = demoAnswers.find((a) => a.caseId === caseId)
    if (demo) queries.push(buildQuery(`demo-query-${5 - i}`, demo, at, true))
  })
}

const queryStageMessages: Record<QueryStage, string> = {
  query_received: 'Question received',
  query_embedding: 'Embedding the question',
  retrieval: 'Searching documents',
  context_preparation: 'Preparing supporting context',
  generation: 'Generating answer',
  citation_validation: 'Checking references',
}

function simulateQuery(record: QueryDetail, demo: DemoAnswer) {
  const eventsUrl = `/api/v1/queries/${record.id}/events`
  const final = buildQuery(record.id, demo, record.created_at, true)
  const stage = (s: QueryStage, delay: number, details: Record<string, unknown>): Step[] => [
    { delay: 120, stage: s, stageStatus: 'started', status: 'running', message: queryStageMessages[s], apply: () => { record.status = 'running' } },
    { delay, stage: s, stageStatus: 'completed', status: 'running', message: `${queryStageMessages[s]}: done`, details },
  ]
  const cited = final.citations.length
  const steps: Step[] = [
    { delay: 150, stage: 'query_received', stageStatus: 'completed', status: 'queued', message: 'Question received' },
    ...stage('query_embedding', 380, { duration_ms: final.metrics.query_embedding_duration_ms }),
    ...stage('retrieval', 520, { retrieved_count: final.metrics.retrieved_count, duration_ms: final.metrics.retrieval_duration_ms }),
    ...stage('context_preparation', 360, { evidence_count: final.metrics.evidence_count, threshold_applied: false }),
    ...stage('generation', 1300, { model_name: final.metrics.model_name, duration_ms: final.metrics.generation_duration_ms }),
    ...stage('citation_validation', 320, { citation_count: cited, flag_for_review: final.flag_for_review }),
    {
      delay: 150,
      stage: null,
      stageStatus: null,
      status: final.status,
      message: final.status === 'insufficient_evidence' ? 'Insufficient evidence' : 'Answer ready',
      terminal: true,
      apply: () => Object.assign(record, final),
    },
  ]
  playStream(eventsUrl, 'query', record.id, steps)
  return eventsUrl
}

// ---------------------------------------------------------------- uploads

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------- dataset (real seed file)

/** Seed file format, schema §8 (validated by backend/tests/test_evaluation_dataset.py). */
interface SeedDataset {
  dataset: { name: string; version: string; description: string | null }
  documents: { document_key: string; filename: string; file_hash: string }[]
  cases: { case_key: string; category: EvaluationCategory }[]
}

async function loadDatasetSummary(): Promise<EvaluationDatasetSummary> {
  const seed = (await import('@evaluation/ap-policies-v1.1.0.json')).default as SeedDataset
  const categories: Partial<Record<EvaluationCategory, number>> = {}
  seed.cases.forEach((c) => {
    categories[c.category] = (categories[c.category] ?? 0) + 1
  })
  const corpus = seed.documents.map((doc) => ({
    document_key: doc.document_key,
    filename: doc.filename,
    file_hash: doc.file_hash,
    indexed: documents.some((d) => d.file_hash === doc.file_hash && isSearchable(d)),
  }))
  return {
    id: `${seed.dataset.name}@${seed.dataset.version}`,
    name: seed.dataset.name,
    version: seed.dataset.version,
    description: seed.dataset.description ?? '',
    case_count: seed.cases.length,
    categories,
    corpus,
    corpus_ready: corpus.every((f) => f.indexed),
  }
}

// ---------------------------------------------------------------- adapter

function paginate<T>(items: T[], pageSize: number): Paginated<T> {
  return { items: items.slice(0, pageSize), page: 1, page_size: pageSize, total: items.length }
}

function findDocument(id: string): DocumentDetail {
  const doc = documents.find((d) => d.id === id)
  if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'This document no longer exists.')
  return doc
}

export const mockWorkspaceApi: WorkspaceApi = {
  getDashboardSummary: (signal) => respond(buildDashboardSummary(documents), signal),
  getSettingsStatus: (signal) => respond(demoSettingsStatus, signal),

  listDocuments: ({ pageSize, search, status }, signal) => {
    const term = search?.trim().toLowerCase()
    const items = documents
      .filter((d) => (!term || d.filename.toLowerCase().includes(term)) && (!status || d.status === status))
      .map(toListItem)
    return respond(paginate(items, pageSize), signal)
  },

  getDocument: async (id, signal) => respond(findDocument(id), signal),

  uploadDocument: async (file) => {
    await respond(null)
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      throw new ApiError(400, 'INVALID_FILE_TYPE', 'Only PDF files are supported.')
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiError(413, 'FILE_TOO_LARGE', `The file is larger than ${demoSettingsStatus.upload_limit_mb} MB.`)
    }
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer())
    if (signature !== '%PDF-') {
      throw new ApiError(400, 'INVALID_FILE_TYPE', 'The file is not a valid PDF.')
    }
    const hash = await sha256Hex(file)
    const existing = documents.find((d) => d.file_hash === hash)
    if (existing) {
      throw new ApiError(409, 'DUPLICATE_DOCUMENT', 'This file has already been uploaded.', {
        existing_document_id: existing.id,
        existing_filename: existing.filename,
      })
    }
    const earlier = simulatedUploadHashes.get(hash)
    if (earlier) {
      throw new ApiError(409, 'DUPLICATE_DOCUMENT', 'This file was already uploaded in this session.', {
        existing_filename: earlier,
      })
    }
    simulatedUploadHashes.set(hash, file.name)
    const jobId = nextId('sim-job')
    const eventsUrl = simulateJob(jobId, null)
    return {
      document_id: nextId('sim-doc'),
      filename: file.name,
      status: 'queued',
      job_id: jobId,
      events_url: eventsUrl,
    }
  },

  reprocessDocument: async (id) => {
    await respond(null)
    const doc = findDocument(id)
    if (!doc.actions.can_reprocess) {
      throw new ApiError(409, 'DOCUMENT_BUSY', doc.actions.disabled_reason ?? 'Document is busy.')
    }
    const jobId = nextId('sim-job')
    const attempt = (doc.latest_job?.attempt_number ?? 0) + 1
    doc.status = 'queued'
    doc.actions = { can_reprocess: false, can_delete: false, disabled_reason: 'Document is processing' }
    doc.latest_job = {
      job_id: jobId,
      attempt_number: attempt,
      trigger: 'reprocess',
      status: 'queued',
      current_stage: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      duration_ms: null,
      error_code: null,
      error_message: null,
      events_url: `/api/v1/jobs/${jobId}/events`,
    }
    const eventsUrl = simulateJob(jobId, doc)
    return { document_id: doc.id, job_id: jobId, attempt_number: attempt, status: 'queued', events_url: eventsUrl }
  },

  deleteDocument: async (id) => {
    await respond(null)
    const doc = findDocument(id)
    if (!doc.actions.can_delete) {
      throw new ApiError(409, 'DOCUMENT_BUSY', doc.actions.disabled_reason ?? 'Document is busy.')
    }
    documents.splice(documents.indexOf(doc), 1)
    return {
      document_id: id,
      result: 'deleted',
      vectors_removed: true,
      file_removed: true,
      metadata_removed: true,
      warnings: ['Mock mode: removed from this browser session only. Reload restores the demo data.'],
    }
  },

  getJob: async (jobId, signal) => {
    const doc = documents.find((d) => d.latest_job?.job_id === jobId)
    if (!doc?.latest_job) throw new ApiError(404, 'JOB_NOT_FOUND', 'This processing job was not found.')
    return respond(buildJobDetail(doc), signal)
  },

  subscribeJobEvents: subscribe,

  listQueries: (pageSize, signal) => respond(paginate(queries.map(toQueryItem), pageSize), signal),

  submitQuery: async ({ question }) => {
    await respond(null)
    const trimmed = question.trim()
    if (trimmed.length < 3 || trimmed.length > QUERY_MAX_CHARS) {
      throw new ApiError(422, 'VALIDATION_ERROR', `Questions must be 3 to ${QUERY_MAX_CHARS} characters.`)
    }
    if (!documents.some(isSearchable)) {
      throw new ApiError(409, 'NO_INDEXED_DOCUMENTS', 'There are no indexed documents to search yet.')
    }
    const demo = findDemoAnswer(trimmed)
    if (!demo) {
      throw new ApiError(
        422,
        'MOCK_QUESTION_UNSUPPORTED',
        'Mock mode only has prepared answers for the example questions. Choose one of them, or run the app against the live backend.',
      )
    }
    const record = buildQuery(nextId('sim-query'), demo, new Date().toISOString(), false)
    queries.unshift(record)
    const eventsUrl = simulateQuery(record, demo)
    return { query_id: record.id, status: 'queued', events_url: eventsUrl, result_url: `/api/v1/queries/${record.id}` }
  },

  subscribeQueryEvents: subscribe,

  getQuery: async (id, signal) => {
    const q = queries.find((item) => item.id === id)
    if (!q) throw new ApiError(404, 'QUERY_NOT_FOUND', 'This question was not found.')
    return respond(q, signal)
  },

  sendFeedback: async () => {
    await respond(null)
  },

  listEvaluationDatasets: async (signal) => {
    const summary = await loadDatasetSummary()
    return respond({ items: [summary] }, signal)
  },

  // Evaluation results are never simulated (DD-40): mock mode has no runs and cannot start one.
  listEvaluationRuns: (signal) => respond(paginate([], 10), signal),
  startEvaluationRun: async () => {
    await respond(null)
    throw new ApiError(
      409,
      'MOCK_EVALUATION_UNSUPPORTED',
      'Evaluation runs need the live backend. Mock mode never simulates evaluation results.',
    )
  },
  getEvaluationRun: async () => {
    throw new ApiError(404, 'EVALUATION_RUN_NOT_FOUND', 'Mock mode has no evaluation runs.')
  },
  getEvaluationResult: async () => {
    throw new ApiError(404, 'EVALUATION_RESULT_NOT_FOUND', 'Mock mode has no evaluation results.')
  },
  saveReview: async () => {
    throw new ApiError(409, 'REVIEW_NOT_ALLOWED', 'Mock mode has no evaluation results to review.')
  },
  subscribeRunEvents: subscribe,
}
