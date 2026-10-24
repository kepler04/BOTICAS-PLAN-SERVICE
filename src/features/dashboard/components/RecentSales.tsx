import { Receipt } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSalesList } from '@/features/sales/hooks/useSales'
import { formatReceiptNumber } from '@/features/sales/lib/cart'
import { PAYMENT_LABELS } from '@/features/sales/types'
import { formatPEN } from '@/lib/format'
import { PATHS } from '@/routes/paths'

const time = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' })

/** Las 5 últimas ventas (movimientos recientes). */
export function RecentSales() {
  const sales = useSalesList({ page: 0, pageSize: 5, from: null, to: null, status: 'all' })
  const rows = sales.data?.rows ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Últimas ventas</CardTitle>
        <Link to={PATHS.sales} className={buttonVariants({ variant: 'ghost', size: 'xs' })}>
          Ver todas
        </Link>
      </CardHeader>
      <CardContent>
        {sales.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {sales.isSuccess && rows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Receipt className="size-4" aria-hidden="true" />
            Aún no hay ventas.
          </p>
        ) : null}
        {rows.length > 0 ? (
          <ul className="divide-y">
            {rows.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{formatReceiptNumber(s.receipt_series, s.receipt_number)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {time.format(new Date(s.created_at))} · {PAYMENT_LABELS[s.payment_method]}
                    {s.profiles?.full_name ? ` · ${s.profiles.full_name}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold tabular-nums ${s.status === 'voided' ? 'line-through opacity-60' : ''}`}>
                    {formatPEN(s.total)}
                  </p>
                  {s.status === 'voided' ? <Badge variant="destructive">Anulada</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}
