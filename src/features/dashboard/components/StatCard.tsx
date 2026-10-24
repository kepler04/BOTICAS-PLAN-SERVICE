import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type StatCardProps = {
  title: string
  icon: LucideIcon
  /** Si el módulo aún no existe: muestra "Disponible en Fase N" y nunca una cifra inventada. */
  phase?: number
  value?: number
  /** Texto ya formateado (p. ej. dinero). Tiene prioridad sobre `value`. */
  valueText?: string
  loading?: boolean
  /** Texto pequeño bajo la cifra. */
  hint?: string
  /** Si se indica, la tarjeta lleva a esa ruta. */
  to?: string
  /** Resalta la cifra (p. ej. hay productos por vencer). */
  alert?: boolean
}

export function StatCard({ title, icon: Icon, phase, value, valueText, loading, hint, to, alert }: StatCardProps) {
  const card = (
    <Card size="sm" className={to ? 'transition-colors hover:bg-muted/50' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          {title}
          <Icon className="size-4" aria-hidden="true" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-12" />
        ) : value === undefined && valueText === undefined ? (
          <p className="text-2xl font-semibold" aria-label="Sin datos">
            —
          </p>
        ) : (
          <p className={`text-2xl font-semibold tabular-nums ${alert && (value ?? 0) > 0 ? 'text-destructive' : ''}`}>
            {valueText ?? value}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {phase !== undefined ? `Disponible en Fase ${phase}` : (hint ?? ' ')}
        </p>
      </CardContent>
    </Card>
  )
  return to ? (
    <Link to={to} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {card}
    </Link>
  ) : (
    card
  )
}
