import { useState } from 'react'
import { Download, Snail } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { NativeSelect } from '@/components/common/NativeSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChartCard } from '@/features/reports/components/ChartCard'
import { HorizontalBars } from '@/features/reports/components/HorizontalBars'
import { useSlowMovers, useTopProducts } from '@/features/reports/hooks/useReports'
import type { DateRange } from '@/features/reports/lib/dateRange'
import {
  lastSaleText,
  slowMoversToCsv,
  topProductsToCsv,
  topProductsToTable,
} from '@/features/reports/lib/tables'
import type { TopProductOrder } from '@/features/reports/services/reportService'
import { downloadCsv } from '@/lib/csv'
import { formatPEN } from '@/lib/format'

const ORDER_LABELS: Record<TopProductOrder, string> = {
  revenue: 'Por ingreso',
  units: 'Por unidades',
  profit: 'Por ganancia',
}

const WINDOWS = [30, 60, 90]

export function ProductsTab({ range }: { range: DateRange }) {
  const [order, setOrder] = useState<TopProductOrder>('revenue')
  const [days, setDays] = useState(60)
  const top = useTopProducts(range, order, 10)
  const slow = useSlowMovers(days, 20)
  const items = top.data ?? []
  const slowRows = slow.data ?? []

  const display = (t: (typeof items)[number]) =>
    order === 'units' ? `${t.units} u.` : formatPEN(order === 'profit' ? t.profit : t.revenue)
  const value = (t: (typeof items)[number]) => (order === 'units' ? t.units : order === 'profit' ? t.profit : t.revenue)

  return (
    <div className="space-y-4">
      {top.error ? <ErrorMessage message={top.error.message} /> : null}
      <ChartCard
        title="Productos más vendidos"
        description="Los 10 primeros del periodo, sin ventas anuladas."
        table={topProductsToTable(items)}
        onDownload={() => downloadCsv(`mas-vendidos_${range.from}_${range.to}.csv`, topProductsToCsv(items))}
        fetching={top.isFetching && !top.isPending}
      >
        <div className="mb-3 w-44">
          <NativeSelect value={order} onChange={(e) => setOrder(e.target.value as TopProductOrder)} aria-label="Ordenar productos">
            {(Object.keys(ORDER_LABELS) as TopProductOrder[]).map((k) => (
              <option key={k} value={k}>
                {ORDER_LABELS[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
        {top.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <HorizontalBars
            ariaLabel={`Productos más vendidos ${ORDER_LABELS[order].toLowerCase()}`}
            items={items.map((t) => ({
              key: t.productId,
              label: t.name,
              value: value(t),
              display: display(t),
              detail: `${t.units} unidades · ganancia ${formatPEN(t.profit)} (${t.margin} %)`,
            }))}
          />
        )}
      </ChartCard>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>Baja rotación</CardTitle>
            <CardDescription>
              Productos con stock que casi no se venden: es dinero parado. Los de menos ventas y más capital van primero.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <NativeSelect value={String(days)} onChange={(e) => setDays(Number(e.target.value))} aria-label="Ventana de baja rotación" className="w-40">
              {WINDOWS.map((d) => (
                <option key={d} value={d}>
                  Últimos {d} días
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => downloadCsv(`baja-rotacion_${days}dias.csv`, slowMoversToCsv(slowRows, days))}
            >
              <Download aria-hidden="true" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className={slow.isFetching && !slow.isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {slow.error ? <ErrorMessage message={slow.error.message} /> : null}
          {slow.isPending ? <Skeleton className="h-32 w-full" /> : null}
          {slow.isSuccess && slowRows.length === 0 ? (
            <EmptyState icon={Snail} title="Nada parado" description="Todos tus productos con stock se vendieron en este periodo." />
          ) : null}
          {slowRows.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Capital parado</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Vendido ({days} d)</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Última venta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slowRows.map((r) => (
                    <TableRow key={r.productId}>
                      <TableCell className="whitespace-normal font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.stockUnits}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPEN(r.stockCost)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.unitsSold}</TableCell>
                      <TableCell className="hidden whitespace-normal text-right md:table-cell">{lastSaleText(r.lastSaleAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
