import { Badge } from '@/components/ui/badge'
import { daysUntil, formatDate } from '@/lib/format'
import type { StockRow } from '@/features/inventory/types'

const WARNING = 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'

/** Estado de un producto en el stock: agotado, bajo, o con lotes vencidos aún en inventario. */
export function StockStatusBadges({ row }: { row: StockRow }) {
  const badges: React.ReactNode[] = []
  if (row.total_quantity === 0) {
    badges.push(
      <Badge key="out" variant="destructive">
        Agotado
      </Badge>,
    )
  } else if (row.is_low) {
    badges.push(
      <Badge key="low" className={WARNING}>
        Stock bajo
      </Badge>,
    )
  }
  if (row.expired_quantity > 0) {
    badges.push(
      <Badge key="exp" variant="destructive">
        Tiene lotes vencidos
      </Badge>,
    )
  }
  if (badges.length === 0) {
    badges.push(
      <Badge key="ok" variant="secondary">
        Disponible
      </Badge>,
    )
  }
  return <div className="flex flex-wrap gap-1">{badges}</div>
}

/** Fecha de vencimiento con aviso: vencido en rojo, próximos 30 días en ámbar. */
export function ExpiryLabel({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground">Sin vencimiento</span>
  const days = daysUntil(date)
  if (days < 0) {
    return (
      <span className="flex flex-wrap items-center gap-1">
        {formatDate(date)}
        <Badge variant="destructive">Vencido</Badge>
      </span>
    )
  }
  if (days <= 30) {
    return (
      <span className="flex flex-wrap items-center gap-1">
        {formatDate(date)}
        <Badge className={WARNING}>{days === 0 ? 'Vence hoy' : `En ${days} ${days === 1 ? 'día' : 'días'}`}</Badge>
      </span>
    )
  }
  return <span>{formatDate(date)}</span>
}
