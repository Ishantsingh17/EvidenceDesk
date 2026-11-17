import { env } from '@/lib/env'
import { apiGet } from '@/services/api/client'
import { mockWorkspaceApi } from '@/services/mock/mockWorkspaceApi'
import type {
  DashboardSummary,
  DocumentListItem,
  Paginated,
  QueryListItem,
  SettingsStatus,
} from '@/types/api'

/** Workspace data used by the screens. Health is separate and always live. */
export interface WorkspaceApi {
  getDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary>
  listDocuments(pageSize: number, signal?: AbortSignal): Promise<Paginated<DocumentListItem>>
  listQueries(pageSize: number, signal?: AbortSignal): Promise<Paginated<QueryListItem>>
  getSettingsStatus(signal?: AbortSignal): Promise<SettingsStatus>
}

const liveWorkspaceApi: WorkspaceApi = {
  getDashboardSummary: (signal) => apiGet('/dashboard/summary', signal),
  listDocuments: (pageSize, signal) => apiGet(`/documents?page_size=${pageSize}`, signal),
  listQueries: (pageSize, signal) => apiGet(`/queries?page_size=${pageSize}`, signal),
  getSettingsStatus: (signal) => apiGet('/settings/status', signal),
}

/** Chosen once from VITE_API_MODE. Live mode never falls back to mock data. */
export const workspaceApi: WorkspaceApi =
  env.apiMode === 'mock' ? mockWorkspaceApi : liveWorkspaceApi
