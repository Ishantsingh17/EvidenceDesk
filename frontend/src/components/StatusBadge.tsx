import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { StatusPresentation, StatusTone } from '@/lib/status'
import { cn } from '@/lib/utils'

const toneStyles: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  neutral: { className: 'bg-neutral-soft text-muted-foreground border-border', icon: CircleDot },
  info: { className: 'bg-info-soft text-info border-info/20', icon: CircleDashed },
  success: { className: 'bg-success-soft text-success border-success/20', icon: CheckCircle2 },
  warning: { className: 'bg-warning-soft text-warning border-warning/25', icon: AlertTriangle },
  danger: { className: 'bg-danger-soft text-danger border-danger/20', icon: XCircle },
}

/** Status label with icon + colour + text (never colour alone). UI brief §4.2. */
export function StatusBadge({
  status,
  className,
}: {
  status: StatusPresentation
  className?: string
}) {
  const { className: toneClass, icon: Icon } = toneStyles[status.tone]
  return (
    <Badge
      variant="outline"
      data-tone={status.tone}
      className={cn('h-6 rounded-md px-2 font-medium', toneClass, className)}
    >
      <Icon aria-hidden="true" />
      {status.label}
    </Badge>
  )
}
