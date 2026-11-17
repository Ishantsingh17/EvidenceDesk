import { env } from '@/lib/env'
import type { HealthResponse, HealthStatus } from '@/types/api'

const HEALTH_TIMEOUT_MS = 5000
const HEALTH_STATUSES: readonly HealthStatus[] = ['starting', 'healthy', 'degraded']

export class HealthCheckError extends Error {
  readonly kind: 'unreachable' | 'http' | 'invalid_response'

  constructor(kind: HealthCheckError['kind'], message: string) {
    super(message)
    this.name = 'HealthCheckError'
    this.kind = kind
  }
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const activity = v.activity as Record<string, unknown> | undefined
  return (
    HEALTH_STATUSES.includes(v.status as HealthStatus) &&
    typeof v.service === 'string' &&
    typeof v.timestamp === 'string' &&
    typeof activity?.ingestion_active === 'boolean' &&
    typeof activity?.evaluation_active === 'boolean'
  )
}

/** Calls GET /health on the live backend. Never falls back to mock data. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const timeout = AbortSignal.timeout(HEALTH_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}/health`, {
      signal: combined,
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new HealthCheckError('unreachable', 'The backend could not be reached.')
  }

  if (!response.ok) {
    throw new HealthCheckError('http', `The backend returned HTTP ${response.status}.`)
  }

  const body: unknown = await response.json().catch(() => null)
  if (!isHealthResponse(body)) {
    throw new HealthCheckError('invalid_response', 'The backend sent an unexpected response.')
  }
  return body
}
