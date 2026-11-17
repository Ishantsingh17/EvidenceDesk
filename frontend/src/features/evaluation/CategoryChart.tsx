import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useCssVar } from '@/hooks/useCssVar'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { categoryLabels, categoryOrder } from '@/lib/evaluation'
import type { EvaluationCategory } from '@/types/api'

interface Row {
  category: string
  cases: number
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-caption shadow-raised">
      <p className="font-medium text-foreground">{row.category}</p>
      <p className="text-muted-foreground">
        {row.cases} case{row.cases === 1 ? '' : 's'}
      </p>
    </div>
  )
}

/**
 * Cases per category in the selected dataset: a count read from the seed file,
 * not a result. One series, so one colour and no legend; a table sits beside it.
 */
export function CategoryChart({ categories }: { categories: Partial<Record<EvaluationCategory, number>> }) {
  const bar = useCssVar('--chart-1')
  const grid = useCssVar('--border')
  const muted = useCssVar('--muted-foreground')
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const rows: Row[] = categoryOrder.map((c) => ({ category: categoryLabels[c], cases: categories[c] ?? 0 }))
  const total = rows.reduce((sum, r) => sum + r.cases, 0)

  return (
    <figure className="space-y-3">
      <div
        className="h-64 w-full"
        role="img"
        aria-label={`Cases per category: ${rows.map((r) => `${r.category} ${r.cases}`).join(', ')}. ${total} in total.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke={grid} strokeDasharray="0" />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fill: muted, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="category"
              width={148}
              tick={{ fill: muted, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip cursor={{ fill: grid, opacity: 0.4 }} content={<ChartTooltip />} />
            <Bar
              dataKey="cases"
              fill={bar}
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
              isAnimationActive={!reduceMotion}
              animationDuration={400}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Number of labelled test cases in each category.</figcaption>
    </figure>
  )
}
