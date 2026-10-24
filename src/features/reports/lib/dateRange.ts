import { addDaysISO, todayISO } from '@/lib/format'

/** Rango de fechas inclusivo, "YYYY-MM-DD" (hora local; el servidor lo interpreta en hora de Lima). */
export type DateRange = { from: string; to: string }

export type RangePreset = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | 'custom'

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  month: 'Este mes',
  lastMonth: 'Mes pasado',
  custom: 'Personalizado',
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

function parse(dateIso: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number]
  return { y, m, d }
}

function toDate(dateIso: string): Date {
  const { y, m, d } = parse(dateIso)
  return new Date(y, m - 1, d)
}

/** Número de días del rango, contando ambos extremos. */
export function rangeDays(r: DateRange): number {
  return Math.round((Date.UTC(...ymd(r.to)) - Date.UTC(...ymd(r.from))) / 86_400_000) + 1
}

function ymd(dateIso: string): [number, number, number] {
  const { y, m, d } = parse(dateIso)
  return [y, m - 1, d]
}

export function rangeForPreset(preset: Exclude<RangePreset, 'custom'>, now: Date = new Date()): DateRange {
  const today = todayISO(now)
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: addDaysISO(-6, now), to: today }
    case '30d':
      return { from: addDaysISO(-29, now), to: today }
    case 'month':
      return { from: iso(now.getFullYear(), now.getMonth() + 1, 1), to: today }
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return {
        from: iso(first.getFullYear(), first.getMonth() + 1, 1),
        to: iso(last.getFullYear(), last.getMonth() + 1, last.getDate()),
      }
    }
  }
}

/** Periodo inmediatamente anterior, de la misma duración (para comparar). */
export function previousRange(r: DateRange): DateRange {
  const days = rangeDays(r)
  const from = toDate(r.from)
  const prevTo = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1)
  const prevFrom = new Date(prevTo.getFullYear(), prevTo.getMonth(), prevTo.getDate() - (days - 1))
  const fmt = (d: Date) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return { from: fmt(prevFrom), to: fmt(prevTo) }
}

/** Hasta 62 días se ve por día; más allá, por mes (si no, el gráfico sería ilegible). */
export function granularityFor(r: DateRange): 'day' | 'month' {
  return rangeDays(r) <= 62 ? 'day' : 'month'
}

/** Un rango es válido si ambas fechas existen, from <= to y no supera ~3 años (límite del servidor). */
export function isValidRange(r: DateRange): boolean {
  const ok = /^\d{4}-\d{2}-\d{2}$/
  if (!ok.test(r.from) || !ok.test(r.to) || r.from > r.to) return false
  return rangeDays(r) <= 1100
}

/**
 * Variación porcentual contra el periodo anterior. Devuelve null si no hay base de comparación
 * (anterior = 0): no se inventa un "+∞ %".
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}
