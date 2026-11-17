// Shared API types mirroring docs/04-BACKEND-SCHEMA.md. Field names stay snake_case.

export type HealthStatus = 'starting' | 'healthy' | 'degraded'

export interface HealthResponse {
  status: HealthStatus
  service: string
  activity: {
    ingestion_active: boolean
    evaluation_active: boolean
  }
  timestamp: string
}
