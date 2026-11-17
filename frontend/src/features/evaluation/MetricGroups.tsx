import { metricGroups, methodLabels } from '@/lib/evaluation'

/**
 * Metrics grouped by scoring method (UI brief §5 Screen 4). With no run, every value
 * is "Not run yet": nothing is estimated, defaulted or invented.
 */
export function MetricGroups() {
  return (
    <section aria-labelledby="metrics-heading" className="space-y-3">
      <div className="space-y-0.5">
        <h2 id="metrics-heading" className="text-section font-semibold">
          Metrics
        </h2>
        <p className="text-muted-foreground">
          Values appear only after a run, with their sample counts. There is no single overall accuracy score.
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
              {group.metrics.map((m) => (
                <div key={m.name} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <dt className="font-medium">{m.name}</dt>
                    <p className="text-caption text-muted-foreground">{m.definition}</p>
                  </div>
                  <dd className="shrink-0 text-caption whitespace-nowrap text-muted-foreground">Not run yet</dd>
                </div>
              ))}
            </dl>
            {group.method === 'human_reviewed' && (
              <p className="mt-2 text-caption text-muted-foreground">Reviewed 0 of 0 cases.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
