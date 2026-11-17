import { useSyncExternalStore } from 'react'

/** Reads a design token (CSS custom property) so SVG libraries such as Recharts can use it. */
export function useCssVar(name: string): string {
  return useSyncExternalStore(
    () => () => {},
    () => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    () => '',
  )
}
