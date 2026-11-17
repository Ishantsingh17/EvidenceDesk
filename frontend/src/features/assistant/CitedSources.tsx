import { FileText } from 'lucide-react'
import { motion } from 'motion/react'

import { cn } from '@/lib/utils'
import type { Citation } from '@/types/api'

/** Only the sources the answer cited and the backend validated (schema §7.3, D-12). */
export function CitedSources({ citations, highlighted }: { citations: Citation[]; highlighted: string | null }) {
  if (citations.length === 0) return null
  return (
    <section aria-labelledby="sources-heading" className="space-y-3">
      <div className="space-y-0.5">
        <h2 id="sources-heading" className="text-section font-semibold">
          Cited sources
        </h2>
        <p className="text-caption text-muted-foreground">
          Passages the answer relies on. File names and page numbers come from the retrieval metadata, never from the
          model.
        </p>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {citations.map((c) => (
          <motion.li
            key={c.citation_id}
            id={`citation-${c.citation_id}`}
            tabIndex={-1}
            animate={highlighted === c.citation_id ? { scale: [1, 1.01, 1] } : { scale: 1 }}
            transition={{ duration: 0.3 }}
            data-testid="citation-card"
            className={cn(
              'flex flex-col gap-2 rounded-lg border bg-card p-3 outline-none transition-colors',
              highlighted === c.citation_id ? 'border-primary ring-2 ring-primary/20' : 'border-border',
            )}
          >
            <div className="flex items-start gap-2">
              <span className="inline-flex h-5 shrink-0 items-center rounded-sm bg-accent px-1.5 text-caption font-semibold text-accent-foreground">
                {c.citation_id}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-medium">
                  <FileText aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate" title={c.filename}>
                    {c.filename}
                  </span>
                </p>
                <p className="text-caption text-muted-foreground">
                  Page {c.page_number}
                  {!c.document_available && ', document no longer available'}
                </p>
              </div>
            </div>
            <blockquote className="border-l-2 border-evidence/40 pl-2.5 text-caption leading-5 text-foreground/80">
              {c.excerpt}
            </blockquote>
          </motion.li>
        ))}
      </ol>
    </section>
  )
}
