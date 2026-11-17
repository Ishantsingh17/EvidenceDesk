import { useCallback, useEffect, useState } from 'react'

import { fetchHealth, HealthCheckError } from '@/services/health'
import type { HealthResponse } from '@/types/api'

export type HealthState =
  | { phase: 'checking' }
  | { phase: 'connected'; health: HealthResponse }
  | { phase: 'error'; message: string }

export function useBackendHealth() {
  const [state, setState] = useState<HealthState>({ phase: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then((health) => setState({ phase: 'connected', health }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message =
          error instanceof HealthCheckError ? error.message : 'The health check failed.'
        setState({ phase: 'error', message })
      })
    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => {
    setState({ phase: 'checking' })
    setAttempt((n) => n + 1)
  }, [])

  return { state, retry }
}
