import { CheckCircle2, Thermometer } from 'lucide-react'
import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ExpiryLabel } from '@/features/inventory/components/StockBadges'
import { useExpiringLots, useStockList } from '@/features/inventory/hooks/useInventory'
import { formatStock } from '@/features/products/lib/presentations'
import { useEnvironmentReadings } from '@/features/sanitary/hooks/useEnvironment'
import { todayISO } from '@/lib/format'
import { PATHS } from '@/routes/paths'

const LIMIT = 5

/** Lo que requiere atención hoy: registro de temperatura, stock bajo y lotes que vencen pronto o ya vencieron. */
export function AttentionList() {
  const low = useStockList({ search: '', filter: 'low', categoryId: '', page: 0 })
  const expiring = useExpiringLots(30)
  const lowRows = (low.data?.rows ?? []).slice(0, LIMIT)
  const expRows = (expiring.data ?? []).slice(0, LIMIT)
  const readings = useEnvironmentReadings()
  const today = todayISO()
  const missingTemperature = readings.isSuccess && !readings.data.some((r) => r.recordedOn === today && r.area === 'room')
  const loading = low.isPending || expiring.isPending
  const allClear =
    low.isSuccess && expiring.isSuccess && lowRows.length === 0 && expRows.length === 0 && !missingTemperature

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Requiere atención</CardTitle>
        <Link to={PATHS.inventory} className={buttonVariants({ variant: 'ghost', size: 'xs' })}>
          Ir a Inventario
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Skeleton className="h-24 w-full" /> : null}
        {allClear ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Todo en orden: sin stock bajo ni lotes por vencer en 30 días.
          </p>
        ) : null}

        {missingTemperature ? (
          <Link
            to={PATHS.temperature}
            className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 hover:bg-amber-100"
          >
            <span className="flex items-center gap-2">
              <Thermometer className="size-4" aria-hidden="true" />
              Falta registrar la temperatura de hoy
            </span>
            <span className="text-xs font-medium underline">Registrar</span>
          </Link>
        ) : null}

        {expRows.length > 0 ? (
          <section aria-label="Lotes por vencer">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por vencer</h3>
            <ul className="divide-y">
              {expRows.map((lot) => (
                <li key={lot.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">
                    {lot.products?.name ?? '—'} <span className="text-xs text-muted-foreground">· lote {lot.lot_code}</span>
                  </span>
                  <ExpiryLabel date={lot.expiry_date} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {lowRows.length > 0 ? (
          <section aria-label="Stock bajo">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stock bajo</h3>
            <ul className="divide-y">
              {lowRows.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatStock(row, row.total_quantity)} · mín. {formatStock(row, row.min_stock)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}
