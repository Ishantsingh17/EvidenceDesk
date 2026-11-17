import { Database } from 'lucide-react'

import { ErrorState } from '@/components/feedback/ErrorState'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { AsyncState } from '@/hooks/useAsync'
import { env } from '@/lib/env'
import { categoryLabels, categoryOrder } from '@/lib/evaluation'
import type { EvaluationDatasetSummary } from '@/types/api'

import { CategoryChart } from './CategoryChart'

export function DatasetPanel({
  state,
  onRetry,
  className,
}: {
  state: AsyncState<{ items: EvaluationDatasetSummary[] }>
  onRetry: () => void
  className?: string
}) {
  const dataset = state.status === 'success' ? state.data.items[0] : undefined
  return (
    <Card role="region" aria-labelledby="dataset-heading" className={className}>
      <CardHeader>
        <h2 id="dataset-heading" className="text-section font-semibold">
          Test dataset
        </h2>
        <CardDescription>Labelled questions with expected answers and expected source pages.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {state.status === 'loading' && <Skeleton className="h-72 w-full" />}
        {state.status === 'error' && <ErrorState error={state.error} subject="evaluation datasets" onRetry={onRetry} />}
        {state.status === 'success' && !dataset && (
          <p className="text-muted-foreground">No evaluation dataset is loaded.</p>
        )}
        {dataset && (
          <>
            <div className="flex flex-wrap items-start gap-3" data-testid="dataset-summary">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Database aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">
                  {dataset.name} <span className="font-normal text-muted-foreground">version {dataset.version}</span>
                </p>
                <p className="max-w-prose text-caption text-muted-foreground">{dataset.description}</p>
                {env.apiMode === 'mock' && (
                  <p className="text-caption text-muted-foreground">
                    Read by the mock adapter from the committed seed file{' '}
                    <code className="rounded-sm bg-muted px-1">evaluation/datasets/ap-policies-v1.1.0.json</code>.
                  </p>
                )}
              </div>
              <p className="text-right">
                <span className="block text-metric font-medium tabular-nums">{dataset.case_count}</span>
                <span className="block text-caption text-muted-foreground">test cases</span>
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
              <CategoryChart categories={dataset.categories} />
              <table className="h-fit w-full text-body" data-testid="category-table">
                <caption className="pb-2 text-left text-caption font-medium text-muted-foreground">
                  Cases per category
                </caption>
                <tbody className="divide-y">
                  {categoryOrder.map((c) => (
                    <tr key={c}>
                      <th scope="row" className="py-1.5 text-left font-normal">{categoryLabels[c]}</th>
                      <td className="py-1.5 text-right tabular-nums">{dataset.categories[c] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
