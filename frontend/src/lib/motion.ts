// Shared Motion presets (UI brief §7). Import animation primitives from 'motion/react'.
// Keep motion short and purposeful; MotionConfig reducedMotion="user" is set at the root.

import type { Transition, Variants } from 'motion/react'

export const ease = {
  /** Standard deceleration for entrances. */
  out: [0.22, 1, 0.36, 1],
} as const

export const duration = {
  fast: 0.15,
  base: 0.2,
} as const

/** Sidebar active indicator and other small position changes. */
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }

/** Page entrance: subtle fade with a small upward move (~200 ms). */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } },
}

/** Content replacing a loading skeleton. */
export const fadeInVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.fast, ease: ease.out } },
}

/** KPI ledger: one orchestrated reveal of the cells on first load. */
export const ledgerVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05 } },
}

export const ledgerCellVariants: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } },
}
