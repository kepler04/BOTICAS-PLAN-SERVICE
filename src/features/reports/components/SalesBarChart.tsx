import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { compactNumber, periodAxisLabel, periodLabel } from '@/features/reports/lib/chartFormat'
import type { Granularity, SeriesPoint } from '@/features/reports/services/reportService'
import { formatPEN } from '@/lib/format'

type Metric = 'total' | 'profit'

type SalesBarChartProps = {
  points: SeriesPoint[]
  granularity: Granularity
  /** Qué se grafica. Una sola serie: sin leyenda (el título ya dice qué es). */
  metric: Metric
  ariaLabel: string
  /** Alto del gráfico, incluido el eje X. */
  height?: number
}

type Row = SeriesPoint & { value: number; axis: string }

const METRIC_LABEL: Record<Metric, string> = { total: 'Ventas', profit: 'Ganancia estimada' }

export function SalesBarChart({ points, granularity, metric, ariaLabel, height = 260 }: SalesBarChartProps) {
  const data: Row[] = points.map((p) => ({
    ...p,
    value: metric === 'total' ? p.total : p.profit,
    axis: periodAxisLabel(p.period, granularity),
  }))
  const best = data.reduce<Row | null>((acc, r) => (r.value > (acc?.value ?? 0) ? r : acc), null)

  return (
    <div className="space-y-2">
      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis
              dataKey="axis"
              tickLine={false}
              axisLine={{ stroke: 'var(--viz-axis)' }}
              tick={{ fill: 'var(--viz-ink-2)', fontSize: 11 }}
              minTickGap={14}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--viz-ink-2)', fontSize: 11 }}
              tickFormatter={compactNumber}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.5 }}
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined
                if (!row) return null
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="text-muted-foreground">{periodLabel(row.period, granularity)}</p>
                    <p className="flex items-center gap-2">
                      <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded" style={{ background: 'var(--viz-s1)' }} />
                      <span className="text-sm font-semibold tabular-nums text-popover-foreground">{formatPEN(row.value)}</span>
                      <span className="text-muted-foreground">{METRIC_LABEL[metric]}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {row.salesCount} venta{row.salesCount === 1 ? '' : 's'}
                    </p>
                  </div>
                )
              }}
            />
            <Bar
              dataKey="value"
              fill="var(--viz-s1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              activeBar={{ fill: 'var(--viz-s1)', fillOpacity: 0.7 }}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {best && best.value > 0 ? (
        <p className="text-xs text-muted-foreground">
          Mejor {granularity === 'day' ? 'día' : 'mes'}: {periodLabel(best.period, granularity)} ·{' '}
          <strong className="font-semibold text-foreground">{formatPEN(best.value)}</strong>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No hay ventas en este periodo.</p>
      )}
    </div>
  )
}
