import { FlaskConical } from 'lucide-react'

import { env } from '@/lib/env'

/** Persistent notice on every page in mock mode (UI brief §4.1). Never shown in live mode. */
export function MockModeBanner() {
  if (env.apiMode !== 'mock') return null
  return (
    <div
      role="note"
      data-testid="mock-mode-banner"
      className="flex items-start gap-2 border-b border-warning/25 bg-warning-soft px-4 py-2 text-body text-warning sm:px-6 lg:px-8"
    >
      <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        <span className="font-semibold">Mock data, not connected to the backend.</span>{' '}
        Documents, questions and metrics are demo fixtures. Backend status is still checked live.
      </p>
    </div>
  )
}
