import { z } from 'zod'
import { isOutOfRange, parseReading, type EnvironmentLimit } from '@/features/sanitary/lib/environment'

export type ReadingValues = { temperature: string; humidity: string; note: string }

export const EMPTY_READING: ReadingValues = { temperature: '', humidity: '', note: '' }

/** Humedad opcional: vacía = null; si se escribe, 0 a 100 con un decimal. `undefined` = inválida. */
export function parseHumidity(raw: string): number | null | undefined {
  if (raw.trim() === '') return null
  const h = parseReading(raw)
  return h === null || h < 0 || h > 100 ? undefined : h
}

/** ¿La lectura escrita está fuera del rango de referencia? (solo si ya es válida) */
export function readingOutOfRange(limit: EnvironmentLimit, v: ReadingValues): boolean {
  const t = parseReading(v.temperature)
  const h = limit.humidityMax === null ? null : parseHumidity(v.humidity)
  return t !== null && h !== undefined && isOutOfRange(limit, t, h)
}

/**
 * Esquema de una lectura para un área. Misma regla que `record_environment_reading`: temperatura con un decimal,
 * humedad 0-100 (solo ambiente) y, fuera de rango, una nota de al menos 3 letras.
 */
export function readingSchema(limit: EnvironmentLimit) {
  return z
    .object({
      temperature: z.string().trim(),
      humidity: z.string().trim(),
      note: z.string().trim().max(300, 'Máximo 300 caracteres'),
    })
    .superRefine((v, ctx) => {
      if (parseReading(v.temperature) === null) {
        ctx.addIssue({ code: 'custom', path: ['temperature'], message: 'Escribe la temperatura (ej.: 22.5)' })
      }
      if (limit.humidityMax !== null && parseHumidity(v.humidity) === undefined) {
        ctx.addIssue({ code: 'custom', path: ['humidity'], message: 'Humedad de 0 a 100 %' })
      }
      if (readingOutOfRange(limit, v) && v.note.length < 3) {
        ctx.addIssue({ code: 'custom', path: ['note'], message: 'Fuera de rango: anota qué se hizo' })
      }
    })
}
