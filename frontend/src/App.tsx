import { MotionConfig } from 'motion/react'
import { RouterProvider } from 'react-router/dom'

import { HealthProvider } from '@/app/HealthProvider'
import { router } from '@/app/router'
import { TooltipProvider } from '@/components/ui/tooltip'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        <HealthProvider>
          <RouterProvider router={router} />
        </HealthProvider>
      </TooltipProvider>
    </MotionConfig>
  )
}

export default App
