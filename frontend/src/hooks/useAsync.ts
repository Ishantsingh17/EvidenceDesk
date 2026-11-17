import { useCallback, useEffect, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown }

/**
 * Runs an abortable async loader on mount, whenever `load` changes, and on `reload()`.
 * `load` must be stable (module-level function or useCallback).
 * A reload keeps the previous result on screen until the new one arrives
 * (`refreshing` is true meanwhile), so content does not flash back to skeletons.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', error })
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false)
      })
    return () => controller.abort()
  }, [load, attempt])

  const reload = useCallback(() => {
    // Errors go back to loading (skeleton); successful data stays visible while refreshing.
    setState((s) => (s.status === 'error' ? { status: 'loading' } : s))
    setRefreshing(true)
    setAttempt((n) => n + 1)
  }, [])

  return { state, refreshing, reload }
}
