import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { fetchHealth, HealthCheckError } from '@/services/health'

import { HealthContext, type HealthState } from './health-context'

const POLL_INTERVAL_MS = 30_000

/** Checks the real backend in every API mode; mock mode never fakes health. */
export function HealthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HealthState>({ phase: 'checking' })
  // Starts true because the first check begins on mount.
  const [refreshing, setRefreshing] = useState(true)
  const controllerRef = useRef<AbortController | null>(null)

  /** Runs one check. Callers set `refreshing` before calling (never inside an effect body). */
  const runCheck = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    // State is only updated in promise callbacks, i.e. after the request settles.
    return fetchHealth(controller.signal)
      .then(
        (health) => setState({ phase: 'connected', health, checkedAt: new Date() }),
        (error: unknown) => {
          if (controller.signal.aborted) return
          const message =
            error instanceof HealthCheckError ? error.message : 'The health check failed.'
          setState({ phase: 'error', message, checkedAt: new Date() })
        },
      )
      .finally(() => {
        if (controllerRef.current === controller) setRefreshing(false)
      })
  }, [])

  const refresh = useCallback(() => {
    setRefreshing(true)
    void runCheck()
  }, [runCheck])

  useEffect(() => {
    void runCheck()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_INTERVAL_MS)
    return () => {
      clearInterval(timer)
      controllerRef.current?.abort()
    }
  }, [runCheck, refresh])

  const value = useMemo(() => ({ state, refreshing, refresh }), [state, refreshing, refresh])
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>
}
