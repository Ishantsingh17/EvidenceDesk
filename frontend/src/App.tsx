import { FileSearch } from 'lucide-react'
import { MotionConfig } from 'motion/react'

import { BackendStatus } from '@/components/BackendStatus'
import { env } from '@/lib/env'

// Phase 1 setup check only. Real screens arrive in Phase 2 (design system + shell).
function App() {
  return (
    <MotionConfig reducedMotion="user">
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-4 text-foreground">
        <div className="flex items-center gap-3">
          <FileSearch aria-hidden="true" className="size-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold">EvidenceDesk AI</h1>
        </div>
        {env.apiMode === 'mock' ? (
          <p role="status" className="rounded-md border px-3 py-1 text-sm font-medium">
            Mock data mode: the backend connection is not checked.
          </p>
        ) : (
          <BackendStatus />
        )}
      </main>
    </MotionConfig>
  )
}

export default App
