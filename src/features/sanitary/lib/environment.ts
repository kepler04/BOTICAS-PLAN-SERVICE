import type { Database } from '@/types/database.types'

export type EnvironmentArea = Database['public']['Enums']['environment_area']

export const AREA_LABELS: Record<EnvironmentArea, string> = {
  room: 'Ambiente',
  fridge: 'Refrigeración',
}

/** Rangos de referencia (vienen de la BD: `environment_limits()`). */
export type EnvironmentLimit = {
  area: EnvironmentArea
  tempMin: number
  tempMax: number
  humidityMax: number | null
}

export type EnvironmentReading = {
  id: number
  area: EnvironmentArea
  temperature: number
  humidity: number | null
  outOfRange: boolean
  note: string | null
  recordedOn: string
  recordedAt: string
  recordedBy: string | null
}

/** Misma regla que `record_environment_reading`. */
export function isOutOfRange(limit: EnvironmentLimit, temperature: number, humidity: number | null): boolean {
  return (
    temperature < limit.tempMin ||
    temperature > limit.tempMax ||
    (limit.humidityMax !== null && humidity !== null && humidity > limit.humidityMax)
  )
}

/** Acepta "22", "22.5" o "22,5" (un decimal, puede ser negativo). null si no es válido. */
export function parseReading(raw: string): number | null {
  const v = raw.trim().replace(',', '.')
  if (!/^-?\d{1,2}(\.\d)?$/.test(v)) return null
  return Number(v)
}

export type DaySummary = {
  day: string
  room: { count: number; min: number | null; max: number | null; humidityMax: number | null }
  fridge: { count: number; min: number | null; max: number | null }
  outOfRange: number
  /** No hay ninguna lectura de ambiente ese día (lo que observa una inspección). */
  missingRoom: boolean
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  const [y, m, d] = from.split('-').map(Number) as [number, number, number]
  const cur = new Date(Date.UTC(y, m - 1, d))
  while (true) {
    const iso = cur.toISOString().slice(0, 10)
    if (iso > to) break
    out.push(iso)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

/** Un renglón por día (del más reciente al más antiguo), incluidos los días SIN lecturas. */
export function summarizeByDay(readings: EnvironmentReading[], from: string, to: string): DaySummary[] {
  const byDay = new Map<string, EnvironmentReading[]>()
  for (const r of readings) byDay.set(r.recordedOn, [...(byDay.get(r.recordedOn) ?? []), r])
  return daysBetween(from, to)
    .reverse()
    .map((day) => {
      const rs = byDay.get(day) ?? []
      const room = rs.filter((r) => r.area === 'room')
      const fridge = rs.filter((r) => r.area === 'fridge')
      const temps = (xs: EnvironmentReading[]) => xs.map((r) => r.temperature)
      const hums = room.map((r) => r.humidity).filter((h): h is number => h !== null)
      return {
        day,
        room: {
          count: room.length,
          min: room.length ? Math.min(...temps(room)) : null,
          max: room.length ? Math.max(...temps(room)) : null,
          humidityMax: hums.length ? Math.max(...hums) : null,
        },
        fridge: {
          count: fridge.length,
          min: fridge.length ? Math.min(...temps(fridge)) : null,
          max: fridge.length ? Math.max(...temps(fridge)) : null,
        },
        outOfRange: rs.filter((r) => r.outOfRange).length,
        missingRoom: room.length === 0,
      }
    })
}
