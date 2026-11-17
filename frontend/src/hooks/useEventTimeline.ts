import { useEffect, useState } from 'react'

import { applyEvent, initialTimeline, type TimelineState } from '@/lib/timeline'
import type { ApiError } from '@/services/api/client'
import type { EventHandler, StreamErrorHandler } from '@/services/workspace'

type Subscribe = (eventsUrl: string, onEvent: EventHandler, onError: StreamErrorHandler) => () => void

/**
 * Follows a job or query event stream and folds events into timeline state.
 * Pass `eventsUrl = null` to stay idle. `onTerminal` runs once when the stream ends.
 */
export function useEventTimeline(
  subscribe: Subscribe,
  definition: { key: string; label: string }[],
  eventsUrl: string | null,
  onTerminal?: (outcome: string) => void,
) {
  const [state, setState] = useState<{ url: string | null; timeline: TimelineState; error: ApiError | null }>(
    () => ({ url: eventsUrl, timeline: initialTimeline(definition), error: null }),
  )

  // Reset when a new stream starts (state derived from props, no effect needed).
  if (state.url !== eventsUrl) {
    setState({ url: eventsUrl, timeline: initialTimeline(definition), error: null })
  }

  useEffect(() => {
    if (!eventsUrl) return
    return subscribe(
      eventsUrl,
      (event) => {
        setState((s) => (s.url === eventsUrl ? { ...s, timeline: applyEvent(s.timeline, event) } : s))
        if (event.event_type === 'terminal') onTerminal?.(event.status)
      },
      (error) => setState((s) => (s.url === eventsUrl ? { ...s, error } : s)),
    )
    // onTerminal is intentionally excluded: a new callback must not restart the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsUrl, subscribe])

  return { timeline: state.timeline, streamError: state.error }
}
