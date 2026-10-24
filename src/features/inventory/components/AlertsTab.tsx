import { useState } from 'react'
import { BellOff } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { NativeSelect } from '@/components/common/NativeSelect'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ExpiryLabel, StockStatusBadges } from '@/features/inventory/components/StockBadges'
import { useExpiringLots, useStockList } from '@/features/inventory/hooks/useInventory'
import { formatStock } from '@/features/products/lib/presentations'

/** -1 = lotes que ya vencieron (la ventana se mide hasta "hace 1 día"). */
const WINDOWS = [
  { days: -1, label: 'Ya vencidos' },
  { days: 30, label: 'Vencen en 30 días' },
  { days: 60, label: 'Vencen en 60 días' },
  { days: 90, label: 'Vencen en 90 días' },
]

export function AlertsTab() {
  const [days, setDays] = useState(30)
  const expiring = useExpiringLots(days)
  const low = useStockList({ search: '', filter: 'low', categoryId: '', page: 0 })
  const out = useStockList({ search: '', filter: 'out', categoryId: '', page: 0 })

  const lowRows = low.data?.rows ?? []
  const outRows = out.data?.rows ?? []
  // Un producto agotado con mínimo definido aparece en ambas listas: se muestra una sola vez.
  const attention = [...lowRows, ...outRows.filter((o) => !lowRows.some((l) => l.id === o.id))]

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-label="Lotes por vencer">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Vencimientos</h2>
          <div className="w-52">
            <NativeSelect
              value={String(days)}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Ventana de vencimiento"
            >
              {WINDOWS.map((w) => (
                <option key={w.days} value={w.days}>
                  {w.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {expiring.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {expiring.isError ? <ErrorMessage message={expiring.error.message} /> : null}
        {expiring.isSuccess && expiring.data.length === 0 ? (
          <EmptyState icon={BellOff} title="Sin alertas de vencimiento" description="No hay lotes con stock en esta ventana." />
        ) : null}
        {expiring.isSuccess && expiring.data.length > 0 ? (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiring.data.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="whitespace-normal font-medium">{lot.products?.name ?? '—'}</TableCell>
                    <TableCell>{lot.lot_code}</TableCell>
                    <TableCell className="whitespace-normal">
                      <ExpiryLabel date={lot.expiry_date} />
                    </TableCell>
                    <TableCell className="whitespace-normal text-right tabular-nums">
                      {lot.products
                        ? formatStock(lot.products, lot.quantity)
                        : String(lot.quantity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </section>

      <section className="space-y-3" aria-label="Stock bajo y agotados">
        <h2 className="text-lg font-semibold">Stock bajo y agotados</h2>
        {low.isPending || out.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {low.isError ? <ErrorMessage message={low.error.message} /> : null}
        {low.isSuccess && out.isSuccess && lowRows.length === 0 && outRows.length === 0 ? (
          <EmptyState icon={BellOff} title="Todo en orden" description="Ningún producto está agotado ni por debajo de su mínimo." />
        ) : null}
        {attention.length > 0 ? (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="hidden sm:table-cell">Mínimo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attention.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-normal font-medium">{row.name}</TableCell>
                    <TableCell className="whitespace-normal tabular-nums">{formatStock(row, row.total_quantity)}</TableCell>
                    <TableCell className="hidden whitespace-normal tabular-nums sm:table-cell">
                      {row.min_stock > 0 ? formatStock(row, row.min_stock) : '—'}
                    </TableCell>
                    <TableCell>
                      <StockStatusBadges row={row} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        {low.isSuccess && out.isSuccess && (low.data.total > lowRows.length || out.data.total > outRows.length) ? (
          <p className="text-xs text-muted-foreground">
            Se muestran los primeros 25 de cada lista. Usa los filtros de la pestaña “Stock” para ver todos.
          </p>
        ) : null}
      </section>
    </div>
  )
}
