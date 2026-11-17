import { cn } from '@/lib/utils'

/**
 * EvidenceDesk AI mark: a pair of citation brackets around a point of evidence,
 * the same idea as the [S1] source markers used in answers.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={cn('size-7 shrink-0', className)}>
      <rect width="28" height="28" rx="7" className="fill-sidebar-accent" />
      <path
        d="M10.5 7.5H8v13h2.5M17.5 7.5H20v13h-2.5"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-sidebar-primary"
      />
      <circle cx="14" cy="14" r="2.25" className="fill-sidebar-evidence" />
    </svg>
  )
}
