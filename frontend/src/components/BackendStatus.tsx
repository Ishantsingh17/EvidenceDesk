import { AlertTriangle, CheckCircle2, Loader2, RotateCw, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { useBackendHealth } from '@/hooks/useBackendHealth'

// Phase 1 connectivity check: shows the real result of GET /health.
export function BackendStatus() {
  const { state, retry } = useBackendHealth()

  let icon = <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
  let text = 'Checking backend connection…'

  if (state.phase === 'connected') {
    const { status } = state.health
    if (status === 'healthy') {
      icon = <CheckCircle2 aria-hidden="true" className="size-4 text-green-700" />
      text = 'Backend connected: healthy'
    } else {
      icon = <AlertTriangle aria-hidden="true" className="size-4 text-amber-600" />
      text = `Backend connected: ${status}`
    }
  } else if (state.phase === 'error') {
    icon = <XCircle aria-hidden="true" className="size-4 text-destructive" />
    text = `Backend unavailable. ${state.message}`
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={text}
          role="status"
          data-testid="backend-status"
          data-phase={state.phase}
          className="flex items-center gap-2 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {icon}
          <span>{text}</span>
        </motion.p>
      </AnimatePresence>
      {state.phase === 'error' && (
        <Button variant="outline" size="sm" onClick={retry}>
          <RotateCw aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  )
}
