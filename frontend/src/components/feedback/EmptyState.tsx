import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** An empty area that tells the user what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-dashed bg-muted/40 p-5',
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-md border bg-card text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-prose text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}
