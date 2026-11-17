import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import type { StatusTone } from '@/lib/status'
import { cn } from '@/lib/utils'

const tones: Record<Exclude<StatusTone, 'neutral'>, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'border-info/20 bg-info-soft text-info' },
  success: { icon: CheckCircle2, className: 'border-success/20 bg-success-soft text-success' },
  warning: { icon: AlertTriangle, className: 'border-warning/25 bg-warning-soft text-warning' },
  danger: { icon: XCircle, className: 'border-danger/20 bg-danger-soft text-danger' },
}

/** Inline message for results, warnings and errors. Text always accompanies the colour. */
export function InlineNotice({
  tone,
  title,
  children,
  onDismiss,
  className,
}: {
  tone: Exclude<StatusTone, 'neutral'>
  title: string
  children?: ReactNode
  onDismiss?: () => void
  className?: string
}) {
  const { icon: Icon, className: toneClass } = tones[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5', toneClass, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-foreground/80">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="-m-1 rounded-sm p-1 opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  )
}
