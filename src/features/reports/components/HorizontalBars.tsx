export type BarItem = {
  key: string
  label: string
  value: number
  /** Texto del valor, ya formateado (se muestra en la punta de la barra). */
  display: string
  /** Texto secundario (tooltip). */
  detail?: string
}

type HorizontalBarsProps = {
  items: BarItem[]
  ariaLabel: string
}

/**
 * Barras horizontales de UNA sola serie: un único color (no se pinta por valor), 16 px de grosor,
 * extremo de datos redondeado y base recta, valor en la punta. Para nombres largos es más
 * legible que un eje de gráfico.
 */
export function HorizontalBars({ items, ariaLabel }: HorizontalBarsProps) {
  const max = Math.max(...items.map((i) => i.value), 0)
  if (items.length === 0 || max <= 0) {
    return <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>
  }
  return (
    <ul aria-label={ariaLabel} className="space-y-1">
      {items.map((item) => (
        <li
          key={item.key}
          tabIndex={0}
          title={item.detail ? `${item.label}: ${item.display} · ${item.detail}` : `${item.label}: ${item.display}`}
          className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 rounded-md px-1 py-1 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 sm:grid-cols-[minmax(0,12rem)_1fr]"
        >
          <span className="truncate text-sm">{item.label}</span>
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-4 min-w-[2px] rounded-r-[4px]"
              style={{ width: `calc((100% - 5rem) * ${item.value / max})`, background: 'var(--viz-s1)' }}
            />
            <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{item.display}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
