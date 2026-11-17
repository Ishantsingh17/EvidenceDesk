import { FlaskConical } from 'lucide-react'

import { env } from '@/lib/env'

/** Marks a panel whose data comes from the mock adapter. Renders nothing in live mode. */
export function DemoDataTag() {
  if (env.apiMode !== 'mock') return null
  return (
    <span
      data-testid="demo-data-tag"
      className="inline-flex h-5 items-center gap-1 rounded-sm border border-warning/25 bg-warning-soft px-1.5 text-caption font-medium text-warning"
    >
      <FlaskConical aria-hidden="true" className="size-3" />
      Demo data
    </span>
  )
}
