import { CircleSlash, RotateCw, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ApiError } from '@/services/api/client'

/** Explains why data is missing and how to recover. */
export function ErrorState({
  error,
  subject,
  onRetry,
  className,
}: {
  error: unknown
  /** What failed to load, e.g. "recent documents". */
  subject: string
  onRetry?: () => void
  className?: string
}) {
  const notAvailable = error instanceof ApiError && error.isNotAvailable
  const Icon = notAvailable ? CircleSlash : WifiOff
  const title = notAvailable ? 'Not available yet' : `Couldn't load ${subject}`
  const description = notAvailable
    ? `The backend does not provide ${subject} yet.`
    : error instanceof Error
      ? error.message
      : 'Something went wrong while loading this data.'

  return (
    <div
      role="status"
      data-state={notAvailable ? 'not-available' : 'error'}
      className={cn('flex flex-col items-start gap-3 rounded-lg border bg-muted/40 p-5', className)}
    >
      <span className="flex size-9 items-center justify-center rounded-md border bg-card text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-prose text-muted-foreground">{description}</p>
      </div>
      {onRetry && !notAvailable && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  )
}
