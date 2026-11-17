import { env } from '@/lib/env'
import type { WorkflowEvent } from '@/types/api'

const REQUEST_TIMEOUT_MS = 10_000

/** A failed API call, with the stable error code from schema §10 when available. */
export class ApiError extends Error {
  readonly status: number | null
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(
    status: number | null,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** True when the backend does not offer this endpoint yet (or the resource is missing). */
  get isNotAvailable(): boolean {
    return this.status === 404 && this.code === 'NOT_AVAILABLE'
  }
}

function readErrorBody(
  body: unknown,
): { code: string; message: string; details: Record<string, unknown> } | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null
  const error = (body as { error: unknown }).error
  if (typeof error !== 'object' || error === null) return null
  const { code, message, details } = error as Record<string, unknown>
  if (typeof code !== 'string' || typeof message !== 'string') return null
  const safeDetails =
    typeof details === 'object' && details !== null ? (details as Record<string, unknown>) : {}
  return { code, message, details: safeDetails }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: { body?: unknown; formData?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const combined = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (options.formData) {
    body = options.formData
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, { method, headers, body, signal: combined })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new ApiError(null, 'NETWORK_ERROR', 'The backend could not be reached.')
  }

  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = readErrorBody(json)
    if (parsed) throw new ApiError(response.status, parsed.code, parsed.message, parsed.details)
    if (response.status === 404 || response.status === 405) {
      throw new ApiError(404, 'NOT_AVAILABLE', 'The backend does not provide this yet.')
    }
    throw new ApiError(response.status, 'HTTP_ERROR', `The backend returned HTTP ${response.status}.`)
  }
  return json as T
}

/** Live backend calls. They never fall back to mock data. */
export const apiGet = <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, { signal })
export const apiPost = <T>(path: string, body?: unknown) => request<T>('POST', path, { body })
export const apiUpload = <T>(path: string, formData: FormData) =>
  request<T>('POST', path, { formData })
export const apiPut = <T>(path: string, body: unknown) => request<T>('PUT', path, { body })
export const apiDelete = <T>(path: string) => request<T>('DELETE', path)

/**
 * Subscribes to an SSE stream (schema §6). `eventsUrl` is an absolute path from the
 * API origin and is resolved with new URL(path, base), never concatenated.
 */
export function subscribeEvents(
  eventsUrl: string,
  onEvent: (event: WorkflowEvent) => void,
  onError: (error: ApiError) => void,
): () => void {
  const source = new EventSource(new URL(eventsUrl, env.apiBaseUrl))
  const handle = (message: MessageEvent<string>) => {
    try {
      const event = JSON.parse(message.data) as WorkflowEvent
      onEvent(event)
      if (event.event_type === 'terminal') source.close()
    } catch {
      onError(new ApiError(null, 'INVALID_EVENT', 'The backend sent an unreadable event.'))
    }
  }
  source.addEventListener('stage', handle)
  source.addEventListener('terminal', handle)
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      onError(new ApiError(null, 'STREAM_CLOSED', 'The progress connection was lost.'))
    }
  }
  return () => source.close()
}
