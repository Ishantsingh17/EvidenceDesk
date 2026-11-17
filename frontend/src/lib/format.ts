const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const number = new Intl.NumberFormat('en-GB')

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))
export const formatDate = (iso: string) => date.format(new Date(iso))
export const formatTime = (iso: string | Date) => time.format(new Date(iso))
export const formatNumber = (n: number) => number.format(n)

/** Milliseconds as a short human value, e.g. 1840 -> "1.84 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/** File type label derived from the filename extension (the list API has no type field). */
export function fileTypeLabel(filename: string): string {
  const ext = filename.split('.').pop()
  return ext && ext !== filename ? ext.toUpperCase() : 'File'
}

/** Time-of-day greeting with a time-independent fallback. */
export function greetingFor(now: Date): string {
  const hour = now.getHours()
  if (Number.isNaN(hour)) return 'Welcome to EvidenceDesk AI'
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${part}, welcome to EvidenceDesk AI`
}

/** Bytes as KB/MB, e.g. 5162 -> "5.0 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** First and last characters of a long hash, e.g. "e5f0adff…2ad4da4". */
export function truncateHash(hash: string, keep = 8): string {
  return hash.length <= keep * 2 ? hash : `${hash.slice(0, keep)}…${hash.slice(-keep)}`
}
