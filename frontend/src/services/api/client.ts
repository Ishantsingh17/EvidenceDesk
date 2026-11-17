import { env } from '@/lib/env'

const REQUEST_TIMEOUT_MS = 10_000

/** A failed API call, with the stable error code from schema §10 when available. */
export class ApiError extends Error {
  readonly status: number | null
  readonly code: string

  constructor(status: number | null, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  /** True when the backend does not offer this endpoint yet (or the resource is missing). */
  get isNotAvailable(): boolean {
    return this.status === 404
  }
}

function readErrorBody(body: unknown): { code: string; message: string } | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null
  const error = (body as { error: unknown }).error
  if (typeof error !== 'object' || error === null) return null
  const { code, message } = error as Record<string, unknown>
  return typeof code === 'string' && typeof message === 'string' ? { code, message } : null
}

/** GET a JSON resource from the live backend. Never falls back to mock data. */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      signal: combined,
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError(null, 'NETWORK_ERROR', 'The backend could not be reached.')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = readErrorBody(body)
    if (parsed) throw new ApiError(response.status, parsed.code, parsed.message)
    if (response.status === 404) {
      throw new ApiError(404, 'NOT_AVAILABLE', 'The backend does not provide this data yet.')
    }
    throw new ApiError(response.status, 'HTTP_ERROR', `The backend returned HTTP ${response.status}.`)
  }
  return body as T
}
