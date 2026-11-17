import type { ReactNode } from 'react'

import { DemoDataTag } from '@/components/DemoDataTag'
import { Card, CardAction, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Overview panel with an h2 title, a description and an optional header action. */
export function SectionCard({
  id,
  title,
  description,
  action,
  demoData = false,
  className,
  children,
}: {
  id: string
  title: string
  description: string
  action?: ReactNode
  /** Show the "Demo data" tag (mock mode only). */
  demoData?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Card role="region" aria-labelledby={`${id}-heading`} className={cn('min-w-0', className)}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${id}-heading`} className="text-section font-semibold">
            {title}
          </h2>
          {demoData && <DemoDataTag />}
        </div>
        <CardDescription>{description}</CardDescription>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  )
}
