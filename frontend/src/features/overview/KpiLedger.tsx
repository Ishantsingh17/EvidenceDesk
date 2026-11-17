import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { DemoDataTag } from '@/components/DemoDataTag'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import type { AsyncState } from '@/hooks/useAsync'
import { useCountUp } from '@/hooks/useCountUp'
import { formatDuration, formatNumber } from '@/lib/format'
import { ledgerCellVariants, ledgerVariants } from '@/lib/motion'
import type { DashboardSummary } from '@/types/api'

interface Metric {
  id: string
  label: string
  value: number | null
  format: (n: number) => string
  context: string
  extra?: ReactNode
}

function metricsFrom(s: DashboardSummary): Metric[] {
  const indexedShare = s.documents_total > 0 ? (s.documents_indexed / s.documents_total) * 100 : 0
  return [
    {
      id: 'documents',
      label: 'Total documents',
      value: s.documents_total,
      format: (n) => formatNumber(Math.round(n)),
      context: 'In this workspace',
    },
    {
      id: 'indexed',
      label: 'Successfully processed',
      value: s.documents_indexed,
      format: (n) => formatNumber(Math.round(n)),
      context:
        s.documents_with_warnings > 0
          ? `Indexed, ${s.documents_with_warnings} with warnings`
          : 'Indexed and searchable',
      extra: (
        <Progress
          value={indexedShare}
          aria-label={`${s.documents_indexed} of ${s.documents_total} documents indexed`}
          className="mt-3 h-1"
        />
      ),
    },
    {
      id: 'queries',
      label: 'Total queries',
      value: s.queries_total,
      format: (n) => formatNumber(Math.round(n)),
      context: `${s.queries_insufficient_evidence} with insufficient evidence`,
    },
    {
      id: 'latency',
      label: 'Median response time',
      value: s.median_query_latency_ms,
      format: formatDuration,
      context:
        s.median_query_latency_ms === null
          ? 'No completed queries yet'
          : `Median of ${s.query_latency_sample_count} completed queries`,
    },
  ]
}

const labels = ['Total documents', 'Successfully processed', 'Total queries', 'Median response time']

/** The four workspace KPIs as one ruled panel. Values come from GET /dashboard/summary. */
export function KpiLedger({
  state,
  onRetry,
}: {
  state: AsyncState<DashboardSummary>
  onRetry: () => void
}) {
  return (
    <Card role="region" className="gap-0 py-0" aria-labelledby="kpi-heading">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <h2 id="kpi-heading" className="text-section font-semibold">
          Workspace at a glance
        </h2>
        {state.status === 'success' && <DemoDataTag />}
      </div>

      {state.status === 'success' ? (
        <motion.dl
          variants={ledgerVariants}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 [&>*:nth-child(-n+2)]:sm:border-b lg:[&>*:nth-child(-n+2)]:border-b-0"
        >
          {metricsFrom(state.data).map((m) => (
            <MetricCell key={m.id} metric={m} />
          ))}
        </motion.dl>
      ) : (
        <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {labels.map((label) => (
            <div key={label} className="space-y-2 px-5 py-4" aria-hidden={state.status === 'loading'}>
              <p className="text-caption font-medium text-muted-foreground">{label}</p>
              {state.status === 'loading' ? (
                <>
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3.5 w-32" />
                </>
              ) : (
                <p className="text-metric font-medium text-muted-foreground" aria-label="No value">
                  —
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="border-t p-4">
          <ErrorState error={state.error} subject="workspace statistics" onRetry={onRetry} />
        </div>
      )}
    </Card>
  )
}

function MetricCell({ metric }: { metric: Metric }) {
  const animated = useCountUp(metric.value)
  return (
    <motion.div variants={ledgerCellVariants} className="min-w-0 px-5 py-4" data-testid={`kpi-${metric.id}`}>
      <dt className="text-caption font-medium text-muted-foreground">{metric.label}</dt>
      <dd className="mt-1.5">
        <span className="block text-metric font-medium tracking-tight tabular-nums">
          {animated === null ? '—' : metric.format(animated)}
        </span>
        <span className="mt-1 block truncate text-caption text-muted-foreground" title={metric.context}>
          {metric.context}
        </span>
        {metric.extra}
      </dd>
    </motion.div>
  )
}
