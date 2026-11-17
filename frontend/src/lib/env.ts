// Frontend configuration (TRD §5.1, §17). Only these two values exist and
// neither may contain a secret.

export type ApiMode = 'live' | 'mock'

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1'

function parseApiMode(value: string | undefined): ApiMode {
  if (value === undefined || value === '' || value === 'live') return 'live'
  if (value === 'mock') return 'mock'
  throw new Error(`VITE_API_MODE must be "live" or "mock", got "${value}"`)
}

function parseBaseUrl(value: string | undefined): string {
  const raw = value && value.trim() !== '' ? value.trim() : DEFAULT_API_BASE_URL
  // Throws on an invalid URL so misconfiguration fails loudly.
  return new URL(raw).toString().replace(/\/$/, '')
}

export const env = {
  apiBaseUrl: parseBaseUrl(import.meta.env.VITE_API_BASE_URL),
  apiMode: parseApiMode(import.meta.env.VITE_API_MODE),
} as const
