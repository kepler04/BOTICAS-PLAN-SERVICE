import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { HorizontalBars } from '@/features/reports/components/HorizontalBars'
import { ChartCard } from '@/features/reports/components/ChartCard'
import { KpiTile } from '@/features/reports/components/KpiTile'
import { PaymentSplit } from '@/features/reports/components/PaymentSplit'
import { SalesBarChart } from '@/features/reports/components/SalesBarChart'
import { useSalesSeries, useSalesSummary, useTopProducts } from '@/features/reports/hooks/useReports'
import { deltaPercent, previousRange, type DateRange } from '@/features/reports/lib/dateRange'
import { seriesToCsv, seriesToTable } from '@/features/reports/lib/tables'
import type { Granularity } from '@/features/reports/services/reportService'
import { downloadCsv } from '@/lib/csv'
import { formatPEN } from '@/lib/format'

type SummaryTabProps = { range: DateRange; granularity: Granularity }

export function SummaryTab({ range, granularity }: SummaryTabProps) {
  const summary = useSalesSummary(range)
  const previous = useSalesSummary(previousRange(range))
  const series = useSalesSeries(range, granularity)
  const top = useTopProducts(range, 'revenue', 5)

  const s = summary.data
  const p = previous.data
  const loading = summary.isPending
  const points = series.data ?? []
  const margin = s && s.net > 0 ? (s.profit / s.net) * 100 : 0
  const hasIgv = (s?.igv ?? 0) > 0 || (p?.igv ?? 0) > 0
  const split = points.reduce((acc, pt) => ({ cash: acc.cash + pt.cash, yape: acc.yape + pt.yape, plin: acc.plin + pt.plin, card: acc.card + pt.card }), { cash: 0, yape: 0, plin: 0, card: 0 })
  const error = [summary.error, series.error, top.error].find((e) => e instanceof Error)

  return (
    <div className="space-y-4">
      {error ? <ErrorMessage message={(error as Error).message} /> : null}

      <section aria-label="Cifras clave" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Ventas"
          value={formatPEN(s?.total ?? 0)}
          loading={loading}
          delta={s && p ? { percent: deltaPercent(s.total, p.total), upIsGood: true } : undefined}
        />
        {hasIgv ? (
          <KpiTile
            label="Venta neta (sin IGV)"
            value={formatPEN(s?.net ?? 0)}
            hint="Lo que realmente es ingreso de la botica"
            loading={loading}
            delta={s && p ? { percent: deltaPercent(s.net, p.net), upIsGood: true } : undefined}
          />
        ) : null}
        {hasIgv ? (
          <KpiTile
            label="IGV cobrado"
            value={formatPEN(s?.igv ?? 0)}
            hint="Impuesto: se declara a SUNAT, no es ingreso"
            loading={loading}
          />
        ) : null}
        <KpiTile
          label="N.º de ventas"
          value={String(s?.salesCount ?? 0)}
          loading={loading}
          delta={s && p ? { percent: deltaPercent(s.salesCount, p.salesCount), upIsGood: true } : undefined}
        />
        <KpiTile
          label="Ticket promedio"
          value={formatPEN(s?.avgTicket ?? 0)}
          loading={loading}
          delta={s && p ? { percent: deltaPercent(s.avgTicket, p.avgTicket), upIsGood: true } : undefined}
        />
        <KpiTile
          label="Ganancia estimada"
          value={formatPEN(s?.profit ?? 0)}
          hint={hasIgv ? 'Venta neta − costo de los lotes vendidos' : 'Ventas − costo de los lotes vendidos'}
          loading={loading}
          delta={s && p ? { percent: deltaPercent(s.profit, p.profit), upIsGood: true } : undefined}
        />
        <KpiTile label="Margen" value={`${margin.toFixed(1)} %`} hint={hasIgv ? 'Ganancia ÷ venta neta' : 'Ganancia ÷ ventas'} loading={loading} />
        <KpiTile
          label="Ventas anuladas"
          value={String(s?.voidedCount ?? 0)}
          hint={s && s.voidedCount > 0 ? `Por ${formatPEN(s.voidedTotal)}` : undefined}
          loading={loading}
          delta={s && p ? { percent: deltaPercent(s.voidedCount, p.voidedCount), upIsGood: false } : undefined}
        />
      </section>

      <ChartCard
        title={granularity === 'day' ? 'Ventas por día' : 'Ventas por mes'}
        description="Total cobrado en ventas completadas (sin anuladas)."
        table={seriesToTable(points, granularity)}
        onDownload={() => downloadCsv(`ventas_${range.from}_${range.to}.csv`, seriesToCsv(points, granularity))}
        fetching={series.isFetching && !series.isPending}
      >
        {series.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <SalesBarChart
            points={points}
            granularity={granularity}
            metric="total"
            ariaLabel={`Ventas ${granularity === 'day' ? 'por día' : 'por mes'} del ${range.from} al ${range.to}: ${formatPEN(s?.total ?? 0)} en total.`}
          />
        )}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cómo cobraste</CardTitle>
          </CardHeader>
          <CardContent>
            {series.isPending ? <Skeleton className="h-20 w-full" /> : <PaymentSplit {...split} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Más vendidos (por ingreso)</CardTitle>
          </CardHeader>
          <CardContent>
            {top.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <HorizontalBars
                ariaLabel="Los 5 productos que más ingreso generaron"
                items={(top.data ?? []).map((t) => ({
                  key: t.productId,
                  label: t.name,
                  value: t.revenue,
                  display: formatPEN(t.revenue),
                  detail: `${t.units} unidades`,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
