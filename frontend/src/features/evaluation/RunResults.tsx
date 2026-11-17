import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react'

import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { categoryLabels } from '@/lib/evaluation'
import { formatDateTime, formatDuration } from '@/lib/format'
import { evaluationRunStatus } from '@/lib/status'
import type { EvaluationResultItem, EvaluationRunDetail } from '@/types/api'

function Check({ value, label }: { value: boolean | null; label: string }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground" title={`${label}: not applicable`}>
        <MinusCircle aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{label}: not applicable</span>
      </span>
    )
  }
  const Icon = value ? CheckCircle2 : XCircle
  return (
    <span className={value ? 'text-success' : 'text-danger'} title={`${label}: ${value ? 'pass' : 'fail'}`}>
      <Icon aria-hidden="true" className="size-4" />
      <span className="sr-only">
        {label}: {value ? 'pass' : 'fail'}
      </span>
    </span>
  )
}

function outcome(r: EvaluationResultItem): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (r.execution_status === 'failed') {
    return { label: r.failure_type === 'infrastructure' ? 'Infrastructure failure' : 'Pipeline failure', tone: 'danger' }
  }
  if (r.insufficient_evidence) return { label: 'Abstained', tone: 'neutral' }
  return { label: r.flag_for_review ? 'Answered, flagged' : 'Answered', tone: r.flag_for_review ? 'warning' : 'success' }
}

export function RunSummary({ run }: { run: EvaluationRunDetail }) {
  const cfg = run.configuration
  const calibrated = cfg.evidence_threshold_calibrated === true
  return (
    <Card role="region" aria-labelledby="run-summary-heading" data-testid="run-summary">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="run-summary-heading" className="text-section font-semibold">
            Run of {formatDateTime(run.created_at)}
          </h2>
          <StatusBadge status={evaluationRunStatus(run.status)} />
        </div>
        <CardDescription>
          {run.dataset.name} version {run.dataset.version}
          {run.duration_ms !== null && `, took ${formatDuration(run.duration_ms)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Cases', run.case_count],
            ['Completed', run.completed_case_count],
            ['Infrastructure failures', run.infrastructure_failure_count],
            ['Pipeline failures', run.pipeline_failure_count],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-muted/40 p-3">
              <dt className="text-caption text-muted-foreground">{label}</dt>
              <dd className="text-section font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-muted-foreground">
          Top-k {String(cfg.top_k)}, {String(cfg.llm_model)}, {String(cfg.embedding_model)}, chunks{' '}
          {String(cfg.chunk_size_tokens)}/{String(cfg.chunk_overlap_tokens)} tokens. Evidence threshold{' '}
          {calibrated ? `cosine distance ${String(cfg.retrieval_max_distance)}` : 'not calibrated'}.
        </p>
        {calibrated && (
          <p className="text-caption text-warning">
            Limitation: the evidence threshold was calibrated on this same dataset, so these results are optimistic.
          </p>
        )}
        {run.error_message && <p className="text-caption text-danger">{run.error_message}</p>}
      </CardContent>
    </Card>
  )
}

export function CaseTable({ run, onOpen }: { run: EvaluationRunDetail; onOpen: (resultId: string) => void }) {
  return (
    <Card role="region" aria-labelledby="cases-heading">
      <CardHeader>
        <h2 id="cases-heading" className="text-section font-semibold">
          Case results
        </h2>
        <CardDescription>Open a case to see the answer, its sources and the review form.</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <div className="-mx-2">
          <Table data-testid="case-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Case</TableHead>
                <TableHead className="hidden lg:table-cell">Category</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Recall@k</TableHead>
                <TableHead className="hidden sm:table-cell">Abstention</TableHead>
                <TableHead className="hidden md:table-cell">Citations</TableHead>
                <TableHead className="hidden text-right md:table-cell">Latency</TableHead>
                <TableHead className="hidden lg:table-cell">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.results.map((r) => (
                <TableRow key={r.result_id} data-testid="case-row">
                  <TableCell className="w-full max-w-0 whitespace-normal">
                    <button
                      type="button"
                      onClick={() => onOpen(r.result_id)}
                      className="block max-w-full text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block font-medium">{r.case_key}</span>
                      <span className="line-clamp-1 block text-caption text-muted-foreground">{r.question}</span>
                    </button>
                  </TableCell>
                  <TableCell className="hidden text-caption lg:table-cell">{categoryLabels[r.category]}</TableCell>
                  <TableCell>
                    <StatusBadge status={outcome(r)} />
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {r.recall_at_k === null ? '—' : r.recall_at_k.toFixed(2)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Check value={r.abstention_correct} label="Abstention correctness" />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Check value={r.citation_source_match} label="Citation source match" />
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {r.latency_ms === null ? '—' : formatDuration(r.latency_ms)}
                  </TableCell>
                  <TableCell className="hidden text-caption lg:table-cell">
                    {r.review ? 'Reviewed' : r.execution_status === 'completed' ? 'Not reviewed' : 'Not reviewable'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
