import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SalesBarChart } from '@/features/reports/components/SalesBarChart'
import { useSalesSeries } from '@/features/reports/hooks/useReports'
import { rangeForPreset } from '@/features/reports/lib/dateRange'
import { formatPEN } from '@/lib/format'
import { PATHS } from '@/routes/paths'

/** Ventas de los últimos 7 días. Solo administradores (usa los reportes, que incluyen costos). */
export function WeekSalesCard() {
  const range = rangeForPreset('7d')
  const series = useSalesSeries(range, 'day')
  const points = series.data ?? []
  const total = points.reduce((sum, p) => sum + p.total, 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Últimos 7 días</CardTitle>
        <Link to={PATHS.reports} className={buttonVariants({ variant: 'ghost', size: 'xs' })}>
          Ver reportes
        </Link>
      </CardHeader>
      <CardContent className={series.isFetching && !series.isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {series.isPending ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <SalesBarChart
            points={points}
            granularity="day"
            metric="total"
            height={190}
            ariaLabel={`Ventas de los últimos 7 días: ${formatPEN(total)} en total.`}
          />
        )}
      </CardContent>
    </Card>
  )
}
