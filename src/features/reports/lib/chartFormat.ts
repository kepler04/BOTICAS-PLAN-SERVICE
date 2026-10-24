import type { Granularity } from '@/features/reports/services/reportService'

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function parts(period: string): { y: number; m: number; d: number } {
  const [y, m, d] = period.split('-').map(Number) as [number, number, number]
  return { y, m, d }
}

/** Etiqueta corta de eje: "22/10" por día, "oct 26" por mes. */
export function periodAxisLabel(period: string, granularity: Granularity): string {
  const { y, m, d } = parts(period)
  if (granularity === 'month') return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

/** Etiqueta completa para tooltip y tablas: "22 oct 2026" o "octubre 2026". */
export function periodLabel(period: string, granularity: Granularity): string {
  const { y, m, d } = parts(period)
  if (granularity === 'month') return `${MONTHS_LONG[m - 1]} ${y}`
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`
}

/** Eje Y compacto: 0 / 500 / 1K / 2.5K / 1.2M. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value)
  const trim = (n: number) => String(Math.round(n * 10) / 10)
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`
  if (abs >= 1_000) return `${trim(value / 1_000)}K`
  return String(Math.round(value * 100) / 100)
}

/** "+12.5 %" / "−3 %" / "0 %" con signo explícito (el color nunca es el único canal). */
export function formatDelta(percent: number): string {
  const rounded = Math.round(percent * 10) / 10
  const abs = Math.abs(rounded)
  if (rounded === 0) return '0 %'
  return `${rounded > 0 ? '+' : '−'}${abs} %`
}
