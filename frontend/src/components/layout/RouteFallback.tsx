import { Skeleton } from '@/components/ui/skeleton'

/** Shown while a lazy-loaded page's code downloads on first load. */
export function RouteFallback() {
  return (
    <div role="status" aria-label="Loading page" className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
