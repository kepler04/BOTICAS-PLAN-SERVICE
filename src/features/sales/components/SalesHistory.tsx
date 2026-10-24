import { useState } from 'react'
import { Ban, Receipt } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { NativeSelect } from '@/components/common/NativeSelect'
import { Pagination } from '@/components/common/Pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useIsAdmin } from '@/features/auth/hooks/useIsAdmin'
import { ReceiptDialog } from '@/features/sales/components/ReceiptDialog'
import { VoidSaleDialog } from '@/features/sales/components/VoidSaleDialog'
import { useSalesList } from '@/features/sales/hooks/useSales'
import { formatReceiptNumber } from '@/features/sales/lib/cart'
import { SALES_PAGE_SIZE, type SalesFilters } from '@/features/sales/services/salesService'
import { PAYMENT_LABELS, saleEinvoice, type SaleRow } from '@/features/sales/types'
import { formatPEN } from '@/lib/format'

const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' })

type Period = 'today' | '7d' | '30d' | 'all'

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  all: 'Todo',
}

/** Rango [desde, hasta) en hora local del navegador, como ISO. */
function periodRange(period: Period): { from: string | null; to: string | null } {
  if (period === 'all') return { from: null, to: null }
  const now = new Date()
  const days = period === 'today' ? 0 : period === '7d' ? 6 : 29
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

export function SalesHistory() {
  const isAdmin = useIsAdmin()
  const [period, setPeriod] = useState<Period>('today')
  const [status, setStatus] = useState<SalesFilters['status']>('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<SaleRow | null>(null)
  const [voiding, setVoiding] = useState(false)

  const filters: SalesFilters = { page, status, ...periodRange(period) }
  const sales = useSalesList(filters)
  const rows = sales.data?.rows ?? []

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[12rem_12rem]">
        <NativeSelect
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value as Period)
            setPage(0)
          }}
          aria-label="Periodo"
        >
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as SalesFilters['status'])
            setPage(0)
          }}
          aria-label="Estado"
        >
          <option value="all">Todas</option>
          <option value="completed">Completadas</option>
          <option value="voided">Anuladas</option>
        </NativeSelect>
      </div>

      {sales.isError ? <ErrorMessage message={sales.error.message} /> : null}
      {sales.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {sales.isSuccess && rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No hay ventas" description="No encontramos ventas con ese filtro." />
      ) : null}

      {rows.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comprobante</TableHead>
                <TableHead className="hidden sm:table-cell">Pago</TableHead>
                <TableHead className="hidden md:table-cell">Vendedor</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                // La fila sigue siendo fila (la tabla conserva su estructura para lectores de pantalla); el clic en
                // cualquier parte es un atajo de mouse y el botón del comprobante es lo que se alcanza con teclado.
                <TableRow key={s.id} className="cursor-pointer" onClick={() => setSelected(s)}>
                  <TableCell className="whitespace-normal">
                    <button
                      type="button"
                      className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      aria-label={`Ver venta ${formatReceiptNumber(s.receipt_series, s.receipt_number)}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelected(s)
                      }}
                    >
                      {formatReceiptNumber(s.receipt_series, s.receipt_number)}
                    </button>
                    <div className="text-xs text-muted-foreground">{dateTime.format(new Date(s.created_at))}</div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{PAYMENT_LABELS[s.payment_method]}</TableCell>
                  <TableCell className="hidden md:table-cell">{s.profiles?.full_name ?? '—'}</TableCell>
                  <TableCell className="whitespace-normal text-right tabular-nums">
                    <div className={s.status === 'voided' ? 'line-through opacity-60' : ''}>{formatPEN(s.total)}</div>
                    {s.status === 'voided' ? <Badge variant="destructive">Anulada</Badge> : null}
                    <EinvoiceBadge row={s} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Pagination page={page} pageSize={SALES_PAGE_SIZE} total={sales.data?.total ?? 0} onPageChange={setPage} />

      <ReceiptDialog
        saleId={selected?.id ?? null}
        title={selected ? `Venta ${formatReceiptNumber(selected.receipt_series, selected.receipt_number)}` : 'Venta'}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        footer={
          isAdmin && selected?.status === 'completed' ? (
            <Button type="button" variant="destructive" onClick={() => setVoiding(true)}>
              <Ban aria-hidden="true" />
              Anular
            </Button>
          ) : null
        }
      />
      {selected ? (
        <VoidSaleDialog
          open={voiding}
          onOpenChange={setVoiding}
          saleId={selected.id}
          receiptLabel={formatReceiptNumber(selected.receipt_series, selected.receipt_number)}
          onVoided={() => {
            setVoiding(false)
            setSelected(null)
          }}
        />
      ) : null}
    </div>
  )
}

const EINVOICE_LABEL = { accepted: 'aceptada', observed: 'observada', pending: 'pendiente', rejected: 'rechazada', error: 'sin enviar' } as const

/** Número y estado del comprobante electrónico de la venta, si lo tiene. */
function EinvoiceBadge({ row }: { row: SaleRow }) {
  const e = saleEinvoice(row)
  if (!e) return null
  const ok = e.status === 'accepted' || e.status === 'observed'
  return (
    <div className={`text-xs ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
      {e.series}-{e.number} · {EINVOICE_LABEL[e.status]}
    </div>
  )
}
