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
import { useCashSessions } from '@/features/cash/hooks/useCash'
import { CASH_HISTORY_PAGE_SIZE } from '@/features/cash/services/cashService'
import { formatPEN } from '@/lib/format'

const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' })

export function CashHistory() {
  const [page, setPage] = useState(0)
  const sessions = useCashSessions(page)
  const rows = sessions.data?.rows ?? []

  return (
    <div className="space-y-4">
      {sessions.isError ? <ErrorMessage message={sessions.error.message} /> : null}
      {sessions.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {sessions.isSuccess && rows.length === 0 ? (
        <EmptyState icon={History} title="Aún no hay cajas" description="Aquí verás cada turno con lo vendido, lo esperado y la diferencia al cerrar." />
      ) : null}

      {rows.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Turno</TableHead>
                <TableHead className="text-right">Ventas</TableHead>
                <TableHead className="hidden text-right md:table-cell">Esperado</TableHead>
                <TableHead className="hidden text-right md:table-cell">Contado</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const sold = s.cashSales + s.yapeSales + s.plinSales + s.cardSales
                return (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-normal">
                      <div className="text-sm font-medium">{dateTime.format(new Date(s.openedAt))}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.openedByName ?? '—'}
                        {s.closedAt ? ` · cerró ${dateTime.format(new Date(s.closedAt))}` : ''}
                      </div>
                      {s.notes ? <div className="text-xs text-muted-foreground">Nota: {s.notes}</div> : null}
                    </TableCell>
                    <TableCell className="whitespace-normal text-right tabular-nums">
                      <div>{formatPEN(sold)}</div>
                      <div className="text-xs text-muted-foreground">{s.salesCount} venta{s.salesCount === 1 ? '' : 's'}</div>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{formatPEN(s.expectedCash)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {s.countedCash === null ? '—' : formatPEN(s.countedCash)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.status === 'open' ? (
                        <Badge className="bg-emerald-100 text-emerald-900">Abierta</Badge>
                      ) : s.difference === 0 ? (
                        <span>Cuadra</span>
                      ) : (
                        <span className={(s.difference ?? 0) < 0 ? 'font-medium text-destructive' : 'font-medium text-amber-700'}>
                          {(s.difference ?? 0) > 0 ? '+' : ''}
                          {formatPEN(s.difference ?? 0)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Pagination page={page} pageSize={CASH_HISTORY_PAGE_SIZE} total={sessions.data?.total ?? 0} onPageChange={setPage} />
    </div>
  )
}
