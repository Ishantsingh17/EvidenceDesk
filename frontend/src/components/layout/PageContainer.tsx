import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Consistent page width and gutters: 16px mobile, 24px tablet, 32px desktop. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
        className,
      )}
    >
      {children}
    </div>
  )
}
