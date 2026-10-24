import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDelta } from '@/features/reports/lib/chartFormat'

type KpiTileProps = {
  label: string
  value: string
  hint?: string
  loading?: boolean
  /** Variación contra el periodo anterior. `percent` null = no hay base de comparación. */
  delta?: { percent: number | null; upIsGood: boolean }
}

function DeltaText({ percent, upIsGood, label }: { percent: number | null; upIsGood: boolean; label: string }) {
  if (percent === null) {
    return <p className="text-xs text-muted-foreground">Sin datos del periodo anterior</p>
  }
  const rounded = Math.round(percent * 10) / 10
  const favorable = rounded === 0 ? null : (rounded > 0) === upIsGood
  const color = favorable === null ? 'var(--viz-ink-2)' : favorable ? 'var(--viz-good)' : 'var(--viz-bad)'
  const Icon = rounded === 0 ? Minus : rounded > 0 ? ArrowUp : ArrowDown
  // Signo + flecha + texto: la dirección nunca depende solo del color.
  return (
    <p
      className="flex items-center gap-1 text-xs"
      style={{ color }}
      aria-label={`${label}: ${formatDelta(percent)} frente al periodo anterior`}
    >
      <Icon className="size-3" aria-hidden="true" />
      <span className="font-medium">{formatDelta(percent)}</span>
      <span className="text-muted-foreground">vs periodo anterior</span>
    </p>
  )
}

/** Cifra clave: el número ES el gráfico (no se dibuja una barra para un solo valor). */
export function KpiTile({ label, value, hint, loading, delta }: KpiTileProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-semibold">{value}</p>}
        {delta && !loading ? <DeltaText percent={delta.percent} upIsGood={delta.upIsGood} label={label} /> : null}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
