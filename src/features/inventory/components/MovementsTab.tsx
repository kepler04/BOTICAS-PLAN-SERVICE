import { useState } from 'react'
import { History } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Pagination } from '@/components/common/Pagination'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useMovements } from '@/features/inventory/hooks/useInventory'
import { INVENTORY_PAGE_SIZE } from '@/features/inventory/services/inventoryService'
import { formatStock } from '@/features/products/lib/presentations'

const TYPE_LABELS = {
  entry: 'Entrada',
  adjustment: 'Ajuste',
  write_off: 'Merma',
  sale: 'Venta',
  sale_void: 'Anulación',
} as const

const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' })

/** Historial de movimientos (solo administradores: RLS lo impone en la BD). */
export function MovementsTab() {
  const [page, setPage] = useState(0)
  const movements = useMovements(page)
  const rows = movements.data?.rows ?? []

  return (
    <div className="space-y-4">
      {movements.isError ? <ErrorMessage message={movements.error.message} /> : null}
      {movements.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {movements.isSuccess && rows.length === 0 ? (
        <EmptyState icon={History} title="Sin movimientos" description="Aquí verás cada entrada, ajuste y merma, con su responsable." />
      ) : null}

      {rows.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="hidden md:table-cell">Saldo del lote</TableHead>
                <TableHead className="hidden lg:table-cell">Motivo</TableHead>
                <TableHead className="hidden lg:table-cell">Usuario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => {
                const pack = m.products
                const fmt = (n: number) => (pack ? formatStock(pack, Math.abs(n)) : String(Math.abs(n)))
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-normal text-xs">{dateTime.format(new Date(m.created_at))}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{m.products?.name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">Lote {m.lots?.lot_code ?? '—'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.type === 'entry' ? 'secondary' : m.type === 'write_off' ? 'destructive' : 'outline'}>
                        {TYPE_LABELS[m.type]}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`whitespace-normal text-right tabular-nums ${m.quantity_delta < 0 ? 'text-destructive' : ''}`}
                    >
                      {m.quantity_delta < 0 ? '−' : '+'}
                      {fmt(m.quantity_delta)}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal tabular-nums md:table-cell">{fmt(m.quantity_after)}</TableCell>
                    <TableCell className="hidden max-w-48 whitespace-normal text-xs text-muted-foreground lg:table-cell">
                      {m.reason ?? '—'}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal text-xs lg:table-cell">
                      {m.profiles?.full_name ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Pagination page={page} pageSize={INVENTORY_PAGE_SIZE} total={movements.data?.total ?? 0} onPageChange={setPage} />
    </div>
  )
}
