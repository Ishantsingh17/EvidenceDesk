import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { duration, ease } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { QueryDetail } from '@/types/api'

/** Every retrieved passage in rank order, separate from the citations (D-12). */
export function RetrievalDetails({ details }: { details: QueryDetail['retrieval_details'] }) {
  const [open, setOpen] = useState(false)
  if (details.chunks.length === 0) return null
  return (
    <section aria-labelledby="retrieval-heading" className="rounded-lg border bg-card">
      <h2 id="retrieval-heading">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="retrieval-panel"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            <span className="block text-section font-semibold">Retrieval details</span>
            <span className="block text-caption font-normal text-muted-foreground">
              All {details.chunks.length} retrieved passages, top {details.top_k}, cited or not
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="retrieval-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.base, ease: ease.out }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t px-4 py-3">
              <p className="text-caption text-muted-foreground">
                Distance is cosine distance: lower is closer. It is not a percentage.{' '}
                {details.threshold_applied
                  ? `Passages above ${details.max_distance} were not used as evidence.`
                  : 'No evidence threshold was applied.'}
              </p>
              <div className="-mx-2">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Rank</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Distance</TableHead>
                      <TableHead className="hidden sm:table-cell">Evidence</TableHead>
                      <TableHead>Cited</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.chunks.map((chunk) => (
                      <TableRow key={chunk.rank}>
                        <TableCell className="tabular-nums">{chunk.rank}</TableCell>
                        <TableCell className="w-full max-w-0">
                          <span className="block truncate font-medium" title={chunk.filename}>
                            {chunk.source_label && <span className="text-muted-foreground">{chunk.source_label} </span>}
                            {chunk.filename}
                          </span>
                          <span className="block text-caption text-muted-foreground">
                            Page {chunk.page_number}
                            {!chunk.document_available && ', document no longer available'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{chunk.distance.toFixed(2)}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {details.threshold_applied ? (chunk.passed_threshold ? 'Passed' : 'Below threshold') : 'Not applied'}
                        </TableCell>
                        <TableCell>{chunk.is_cited ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
