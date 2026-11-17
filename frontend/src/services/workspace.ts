import { env } from '@/lib/env'
import {
  ApiError,
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  apiUpload,
  subscribeEvents,
} from '@/services/api/client'
import { mockWorkspaceApi } from '@/services/mock/mockWorkspaceApi'
import type {
  DashboardSummary,
  DeleteResult,
  DocumentDetail,
  DocumentListItem,
  DocumentListParams,
  JobDetail,
  EvaluationDatasetSummary,
  EvaluationResultDetail,
  EvaluationReview,
  EvaluationRunDetail,
  EvaluationRunListItem,
  FeedbackRating,
  Paginated,
  QueryAccepted,
  QueryDetail,
  QueryListItem,
  QueryRequest,
  ReprocessAccepted,
  RunAccepted,
  SettingsStatus,
  UploadAccepted,
  WorkflowEvent,
} from '@/types/api'

export type EventHandler = (event: WorkflowEvent) => void
export type StreamErrorHandler = (error: ApiError) => void

/** Workspace data and actions used by the screens. Health is separate and always live. */
export interface WorkspaceApi {
  getDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary>
  getSettingsStatus(signal?: AbortSignal): Promise<SettingsStatus>

  listDocuments(params: DocumentListParams, signal?: AbortSignal): Promise<Paginated<DocumentListItem>>
  getDocument(id: string, signal?: AbortSignal): Promise<DocumentDetail>
  uploadDocument(file: File): Promise<UploadAccepted>
  reprocessDocument(id: string): Promise<ReprocessAccepted>
  deleteDocument(id: string): Promise<DeleteResult>
  getJob(jobId: string, signal?: AbortSignal): Promise<JobDetail>
  /** Progress events for a processing job, given the `events_url` from a 202 response. */
  subscribeJobEvents(eventsUrl: string, onEvent: EventHandler, onError: StreamErrorHandler): () => void

  listQueries(pageSize: number, signal?: AbortSignal): Promise<Paginated<QueryListItem>>
  submitQuery(request: QueryRequest): Promise<QueryAccepted>
  subscribeQueryEvents(eventsUrl: string, onEvent: EventHandler, onError: StreamErrorHandler): () => void
  getQuery(id: string, signal?: AbortSignal): Promise<QueryDetail>
  sendFeedback(queryId: string, rating: FeedbackRating): Promise<void>

  listEvaluationDatasets(signal?: AbortSignal): Promise<{ items: EvaluationDatasetSummary[] }>
  listEvaluationRuns(signal?: AbortSignal): Promise<Paginated<EvaluationRunListItem>>
  startEvaluationRun(datasetId: string): Promise<RunAccepted>
  getEvaluationRun(runId: string, signal?: AbortSignal): Promise<EvaluationRunDetail>
  getEvaluationResult(runId: string, resultId: string, signal?: AbortSignal): Promise<EvaluationResultDetail>
  saveReview(resultId: string, review: EvaluationReview): Promise<EvaluationReview>
  subscribeRunEvents(eventsUrl: string, onEvent: EventHandler, onError: StreamErrorHandler): () => void
}

function documentQuery({ pageSize, search, status }: DocumentListParams): string {
  const params = new URLSearchParams({ page_size: String(pageSize) })
  if (search) params.set('search', search)
  if (status) params.set('status', status)
  return params.toString()
}

const liveWorkspaceApi: WorkspaceApi = {
  getDashboardSummary: (signal) => apiGet('/dashboard/summary', signal),
  getSettingsStatus: (signal) => apiGet('/settings/status', signal),

  listDocuments: (params, signal) => apiGet(`/documents?${documentQuery(params)}`, signal),
  getDocument: (id, signal) => apiGet(`/documents/${encodeURIComponent(id)}`, signal),
  uploadDocument: (file) => {
    const form = new FormData()
    form.append('file', file)
    return apiUpload('/documents/upload', form)
  },
  reprocessDocument: (id) => apiPost(`/documents/${encodeURIComponent(id)}/reprocess`),
  deleteDocument: (id) => apiDelete(`/documents/${encodeURIComponent(id)}`),
  getJob: (jobId, signal) => apiGet(`/jobs/${encodeURIComponent(jobId)}`, signal),
  subscribeJobEvents: subscribeEvents,

  listQueries: (pageSize, signal) => apiGet(`/queries?page_size=${pageSize}`, signal),
  submitQuery: (request) => apiPost('/queries', request),
  subscribeQueryEvents: subscribeEvents,
  getQuery: (id, signal) => apiGet(`/queries/${encodeURIComponent(id)}`, signal),
  sendFeedback: async (queryId, rating) => {
    await apiPost(`/queries/${encodeURIComponent(queryId)}/feedback`, { rating })
  },

  listEvaluationDatasets: (signal) => apiGet('/evaluations/datasets', signal),
  listEvaluationRuns: (signal) => apiGet('/evaluations/runs?page_size=10', signal),
  startEvaluationRun: (datasetId) => apiPost('/evaluations/run', { dataset_id: datasetId }),
  getEvaluationRun: (runId, signal) => apiGet(`/evaluations/runs/${encodeURIComponent(runId)}`, signal),
  getEvaluationResult: (runId, resultId, signal) =>
    apiGet(`/evaluations/runs/${encodeURIComponent(runId)}/results/${encodeURIComponent(resultId)}`, signal),
  saveReview: (resultId, review) => apiPut(`/evaluations/results/${encodeURIComponent(resultId)}/review`, review),
  subscribeRunEvents: subscribeEvents,
}

/** Chosen once from VITE_API_MODE. Live mode never falls back to mock data. */
export const workspaceApi: WorkspaceApi =
  env.apiMode === 'mock' ? mockWorkspaceApi : liveWorkspaceApi
