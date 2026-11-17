import { formatDuration } from '@/lib/format'
import { metricGroups, methodLabels } from '@/lib/evaluation'
import type { EvaluationSummary } from '@/types/api'

type Shown = { value: string; detail: string | null }

const NOT_RUN: Shown = { value: 'Not run yet', detail: null }

function ratio(m: { value: number | null; sample_count: number; numerator?: number; excluded_count?: number }): Shown {
  if (m.value === null || m.sample_count === 0) return { value: 'N/A', detail: 'No applicable cases' }
  const parts = [m.numerator !== undefined ? `${m.numerator} of ${m.sample_count} cases` : `${m.sample_count} cases`]
  if (m.excluded_count) parts.push(`${m.excluded_count} not applicable`)
  return { value: m.value.toFixed(2), detail: parts.join(', ') }
}

/** Value per metric name; every value carries its sample count (schema §9.7). */
function valuesFrom(s: EvaluationSummary): Record<string, Shown> {
  const human = s.human_review
  const humanValue = (m: { value: number | null; sample_count: number } | undefined): Shown =>
    !human || !m || m.value === null
      ? { value: 'N/A', detail: `Reviewed ${human?.reviewed_count ?? 0} of ${human?.eligible_count ?? 0}` }
      : { value: m.value.toFixed(2), detail: `Reviewed ${m.sample_count} of ${human.eligible_count}` }
  const latency = s.latency
  return {
    'Precision@k': ratio(s.retrieval.precision_at_k),
    'Recall@k': ratio(s.retrieval.recall_at_k),
    MRR: ratio(s.retrieval.mrr),
    'Abstention correctness': ratio(s.abstention.abstention_correctness),
    'Citation source match': ratio(s.citations.citation_source_match),
    'Prompt-injection check': ratio(s.prompt_injection.must_not_contain_passed),
    'Answer correctness': humanValue(human?.correctness),
    Faithfulness: humanValue(human?.faithfulness),
    'Citation validity': humanValue(human?.citation_validity),
    'Median latency': latency.median_ms === null ? { value: 'N/A', detail: null } : {
      value: formatDuration(latency.median_ms),
      detail: `${latency.sample_count} cases, mean ${latency.mean_ms !== null ? formatDuration(latency.mean_ms) : 'N/A'}`,
    },
    'p95 latency': latency.p95_ms === null ? { value: 'N/A', detail: null } : {
      value: formatDuration(latency.p95_ms), detail: `${latency.sample_count} cases`,
    },
  }
}

/**
 * Metrics grouped by scoring method (UI brief §5 Screen 4). Without a run every value is
 * "Not run yet": nothing is estimated, defaulted or invented.
 */
export function MetricGroups({ summary }: { summary: EvaluationSummary | null }) {
  const values = summary ? valuesFrom(summary) : null
  return (
    <section aria-labelledby="metrics-heading" className="space-y-3">
      <div className="space-y-0.5">
        <h2 id="metrics-heading" className="text-section font-semibold">
          Metrics
        </h2>
        <p className="text-muted-foreground">
          {summary
            ? 'From the selected run. Infrastructure and pipeline failures are excluded from every metric and counted separately.'
            : 'Values appear only after a run, with their sample counts. There is no single overall accuracy score.'}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {metricGroups.map((group) => (
          <div key={group.method} className="rounded-xl border bg-card p-5 shadow-card" data-testid={`metric-group-${group.method}`}>
            <div className="mb-3 space-y-1">
              <span className="inline-flex h-5 items-center rounded-sm bg-accent px-1.5 text-caption font-semibold text-accent-foreground">
                {methodLabels[group.method]}
              </span>
              <p className="text-caption text-muted-foreground">{group.description}</p>
            </div>
            <dl className="divide-y">
              {group.metrics.map((m) => {
                const shown = values?.[m.name] ?? NOT_RUN
                return (
                  <div key={m.name} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <dt className="font-medium">{m.name}</dt>
                      <p className="text-caption text-muted-foreground">{m.definition}</p>
                    </div>
                    <dd className="shrink-0 text-right" data-testid={`metric-${m.name}`}>
                      <span
                        className={
                          values ? 'block font-semibold tabular-nums' : 'block text-caption whitespace-nowrap text-muted-foreground'
                        }
                      >
                        {shown.value}
                      </span>
                      {shown.detail && <span className="block text-caption text-muted-foreground">{shown.detail}</span>}
                    </dd>
                  </div>
                )
              })}
            </dl>
            {group.method === 'human_reviewed' && !summary && (
              <p className="mt-2 text-caption text-muted-foreground">Reviewed 0 of 0 cases.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
