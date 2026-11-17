import { createContext, useContext } from 'react'

import type { HealthResponse } from '@/types/api'

export type HealthState =
  | { phase: 'checking' }
  | { phase: 'connected'; health: HealthResponse; checkedAt: Date }
  | { phase: 'error'; message: string; checkedAt: Date }

export interface HealthContextValue {
  state: HealthState
  /** True while a re-check is running after the first result. */
  refreshing: boolean
  refresh: () => void
}

export const HealthContext = createContext<HealthContextValue | null>(null)

/** Live backend health from GET /health, shared by the whole app. */
export function useHealth(): HealthContextValue {
  const value = useContext(HealthContext)
  if (!value) throw new Error('useHealth must be used inside <HealthProvider>')
  return value
}
