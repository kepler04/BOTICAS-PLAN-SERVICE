import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartCard } from '@/features/reports/components/ChartCard'
import { SalesBarChart } from '@/features/reports/components/SalesBarChart'
import { useSalesSeries, useSalesSummary } from '@/features/reports/hooks/useReports'
import type { DateRange } from '@/features/reports/lib/dateRange'
import { seriesToCsv, seriesToTable } from '@/features/reports/lib/tables'
import type { Granularity } from '@/features/reports/services/reportService'
import { downloadCsv } from '@/lib/csv'
import { formatPEN } from '@/lib/format'

type SalesTabProps = { range: DateRange; granularity: Granularity }

export function SalesTab({ range, granularity }: SalesTabProps) {
  const series = useSalesSeries(range, granularity)
  const summary = useSalesSummary(range)
  const points = series.data ?? []

  return (
    <div className="space-y-4">
      {series.error ? <ErrorMessage message={series.error.message} /> : null}
      <ChartCard
        title={granularity === 'day' ? 'Ganancia estimada por día' : 'Ganancia estimada por mes'}
        description="Venta neta (sin IGV) menos el costo de los lotes vendidos. Es ganancia bruta: no descuenta gastos, sueldos ni impuestos a la renta. Cambia a “Tabla” para ver IGV, neto y medios de pago."
        table={seriesToTable(points, granularity)}
        onDownload={() => downloadCsv(`ganancia_${range.from}_${range.to}.csv`, seriesToCsv(points, granularity))}
        fetching={series.isFetching && !series.isPending}
      >
        {series.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <SalesBarChart
            points={points}
            granularity={granularity}
            metric="profit"
            ariaLabel={`Ganancia estimada del ${range.from} al ${range.to}: ${formatPEN(summary.data?.profit ?? 0)} en total.`}
          />
        )}
      </ChartCard>
    </div>
  )
}
