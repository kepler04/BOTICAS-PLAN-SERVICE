import { formatPEN } from '@/lib/format'

type PaymentSplitProps = {
  cash: number
  yape: number
  plin: number
  card: number
}

// Orden fijo de los colores categóricos (validado): el color sigue a la entidad, no a su tamaño.
const SEGMENTS = [
  { key: 'cash', label: 'Efectivo', color: 'var(--viz-s1)' },
  { key: 'yape', label: 'Yape', color: 'var(--viz-s2)' },
  { key: 'plin', label: 'Plin', color: 'var(--viz-s3)' },
  { key: 'card', label: 'Tarjeta', color: 'var(--viz-s4)' },
] as const

/** Reparto del ingreso por medio de pago: una barra apilada con 2 px de separación y leyenda con cifras. */
export function PaymentSplit({ cash, yape, plin, card }: PaymentSplitProps) {
  const values = { cash, yape, plin, card }
  const total = cash + yape + plin + card
  if (total <= 0) {
    return <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>
  }
  const pct = (v: number) => (v / total) * 100

  return (
    <div className="space-y-3">
      <div
        role="img"
        aria-label={SEGMENTS.map((s) => `${s.label} ${pct(values[s.key]).toFixed(0)} %`).join(', ')}
        className="flex h-4 gap-0.5 overflow-hidden rounded-[4px]"
      >
        {SEGMENTS.filter((s) => values[s.key] > 0).map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${formatPEN(values[s.key])} (${pct(values[s.key]).toFixed(1)} %)`}
            className="h-full min-w-[3px]"
            style={{ width: `${pct(values[s.key])}%`, background: s.color }}
          />
        ))}
      </div>
      <ul className="space-y-1.5">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular-nums">
              <strong className="font-semibold">{formatPEN(values[s.key])}</strong>
              <span className="ml-2 text-muted-foreground">{pct(values[s.key]).toFixed(0)} %</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
