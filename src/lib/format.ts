const PEN = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })

/** 12.5 -> "S/ 12.50" */
export function formatPEN(value: number): string {
  return PEN.format(value)
}

/** Costos por unidad pueden tener 4 decimales (p. ej. S/ 0.2500). */
export function formatCost(value: number): string {
  const cents = value * 100
  // Tolerancia: en coma flotante 0.28 * 100 no es exactamente 28.
  return `S/ ${value.toFixed(Math.abs(cents - Math.round(cents)) < 1e-6 ? 2 : 4)}`
}

/** "2026-12-31" (fecha de BD, sin zona horaria) -> "31/12/2026" */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Fecha local de hoy como "YYYY-MM-DD" (no usar toISOString: es UTC y desfasa de noche en Perú). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Suma días a hoy y devuelve "YYYY-MM-DD". */
export function addDaysISO(days: number, now: Date = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return todayISO(next)
}

/** Días que faltan para una fecha "YYYY-MM-DD" (negativo = ya venció). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const target = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86_400_000)
}

/** Acepta "12", "12.5", "12,50". Devuelve null si no es un número decimal válido (máx. 2 decimales). */
export function parseMoney(raw: string): number | null {
  const v = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null
  return Number(v)
}

/** Entero positivo o cero en texto plano. */
export function parseInteger(raw: string): number | null {
  const v = raw.trim()
  if (!/^\d+$/.test(v)) return null
  const n = Number(v)
  return Number.isSafeInteger(n) ? n : null
}
