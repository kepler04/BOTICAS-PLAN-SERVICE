import { useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Lock } from 'lucide-react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CashMovementDialog, CloseCashDialog } from '@/features/cash/components/CashDialogs'
import { useCashMovements } from '@/features/cash/hooks/useCash'
import type { CashSummary } from '@/features/cash/services/cashService'
import { formatPEN } from '@/lib/format'

const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' })

function Figure({ label, value, strong, hint }: { label: string; value: number; strong?: boolean; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`tabular-nums ${strong ? 'text-2xl font-semibold' : 'text-xl font-semibold'}`}>{formatPEN(value)}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

/** Caja abierta: totales por medio de pago, efectivo esperado y movimientos. */
export function CashSessionPanel({ session }: { session: CashSummary }) {
  const movements = useCashMovements(session.id)
  const [movementOpen, setMovementOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Badge className="bg-emerald-100 text-emerald-900">Caja abierta</Badge>
          <p className="text-sm text-muted-foreground">
            Desde {dateTime.format(new Date(session.openedAt))}
            {session.openedByName ? ` · ${session.openedByName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMovementOpen(true)}>
            Ingreso / egreso
          </Button>
          <Button onClick={() => setCloseOpen(true)}>
            <Lock aria-hidden="true" />
            Cerrar caja
          </Button>
        </div>
      </div>

      <section aria-label="Resumen de la caja" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Figure label="Efectivo esperado" value={session.expectedCash} strong hint="Apertura + efectivo + ingresos − egresos" />
        <Figure label="Apertura" value={session.openingAmount} />
        <Figure label="Ventas en efectivo" value={session.cashSales} />
        <Figure label="Yape" value={session.yapeSales} />
        <Figure label="Plin" value={session.plinSales} />
        <Figure label="Tarjeta" value={session.cardSales} hint="No entra al cajón" />
        <Figure label="Ingresos" value={session.incomeTotal} />
        <Figure label="Egresos" value={session.expenseTotal} />
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">{session.salesCount}</p>
            <p className="text-xs text-muted-foreground">
              {session.voidedCount > 0 ? `${session.voidedCount} anulada${session.voidedCount === 1 ? '' : 's'}` : 'Ninguna anulada'}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2" aria-label="Movimientos de caja">
        <h2 className="text-lg font-semibold">Ingresos y egresos</h2>
        {movements.isPending ? <Skeleton className="h-16 w-full" /> : null}
        {movements.isError ? <ErrorMessage message={movements.error.message} /> : null}
        {movements.isSuccess && movements.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay ingresos ni egresos en esta caja.</p>
        ) : null}
        {movements.isSuccess && movements.data.length > 0 ? (
          <ul className="divide-y rounded-xl border bg-card">
            {movements.data.map((m) => (
              <li key={m.id} className="flex items-center gap-3 p-3">
                {m.type === 'income' ? (
                  <ArrowUpCircle className="size-5 text-emerald-600" aria-label="Ingreso" />
                ) : (
                  <ArrowDownCircle className="size-5 text-destructive" aria-label="Egreso" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateTime.format(new Date(m.created_at))}
                    {m.profiles?.full_name ? ` · ${m.profiles.full_name}` : ''}
                  </p>
                </div>
                <p className={`tabular-nums ${m.type === 'income' ? 'text-emerald-700' : 'text-destructive'}`}>
                  {m.type === 'income' ? '+' : '−'}
                  {formatPEN(m.amount)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <CashMovementDialog open={movementOpen} onOpenChange={setMovementOpen} session={session} />
      <CloseCashDialog open={closeOpen} onOpenChange={setCloseOpen} session={session} />
    </div>
  )
}
