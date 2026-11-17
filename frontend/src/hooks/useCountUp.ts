import { animate } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { ease } from '@/lib/motion'

import { useMediaQuery } from './useMediaQuery'

/**
 * Counts from 0 to `target` once, on the first value received (UI brief §7).
 * After that, and always under reduced motion, the real value is shown directly.
 */
export function useCountUp(target: number | null): number | null {
  // Read synchronously: Motion's useReducedMotion() is false on the first render,
  // which would briefly start a count-up for reduced-motion users.
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const startedRef = useRef(false)
  const [value, setValue] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (target === null || reduceMotion || startedRef.current) return
    startedRef.current = true
    let finished = false
    const controls = animate(0, target, {
      duration: 0.6,
      ease: ease.out,
      onUpdate: (v) => setValue(v),
      onComplete: () => {
        finished = true
        setDone(true)
      },
    })
    return () => {
      controls.stop()
      // An interrupted run (e.g. React StrictMode remount) may start again.
      if (!finished) startedRef.current = false
    }
  }, [target, reduceMotion])

  if (target === null) return null
  return reduceMotion || done ? target : value
}
