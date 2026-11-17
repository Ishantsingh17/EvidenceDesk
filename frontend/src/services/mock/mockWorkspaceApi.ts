import type { WorkspaceApi } from '@/services/workspace'

import {
  demoDashboardSummary,
  demoDocuments,
  demoQueries,
  demoSettingsStatus,
} from './fixtures'

// A short delay so loading states are visible and exercised in mock mode.
const MOCK_DELAY_MS = 350

function respond<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(structuredClone(value)), MOCK_DELAY_MS)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

function page<T>(items: T[], pageSize: number) {
  return { items: items.slice(0, pageSize), page: 1, page_size: pageSize, total: items.length }
}

/** Explicit mock adapter, selected only by VITE_API_MODE=mock. */
export const mockWorkspaceApi: WorkspaceApi = {
  getDashboardSummary: (signal) => respond(demoDashboardSummary, signal),
  listDocuments: (pageSize, signal) => respond(page(demoDocuments, pageSize), signal),
  listQueries: (pageSize, signal) => respond(page(demoQueries, pageSize), signal),
  getSettingsStatus: (signal) => respond(demoSettingsStatus, signal),
}
