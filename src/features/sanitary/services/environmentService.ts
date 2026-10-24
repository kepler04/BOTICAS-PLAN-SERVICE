import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import type { EnvironmentArea, EnvironmentLimit, EnvironmentReading } from '@/features/sanitary/lib/environment'

export class EnvironmentServiceError extends Error {}

const KNOWN: Record<string, string> = {
  note_required: 'La lectura está fuera de rango: anota qué se hizo (p. ej. “se encendió el aire”).',
  invalid_temperature: 'La temperatura no es válida (usa un decimal como máximo).',
  invalid_humidity: 'La humedad no es válida (0 a 100 %, un decimal).',
  forbidden: 'No tienes permiso para registrar en esta sucursal.',
}

function fail(error: unknown, fallback: string): never {
  throw new EnvironmentServiceError(translateDbError(error, KNOWN, fallback))
}

export type RecordReadingInput = {
  branchId: string
  area: EnvironmentArea
  temperature: number
  humidity: number | null
  note: string | null
  idempotencyKey: string
}

export const environmentService = {
  async getLimits(): Promise<EnvironmentLimit[]> {
    const { data, error } = await supabase.rpc('environment_limits')
    if (error) fail(error, 'No se pudieron cargar los rangos de referencia.')
    return (data ?? []).map((l) => ({
      area: l.area,
      tempMin: Number(l.temp_min),
      tempMax: Number(l.temp_max),
      humidityMax: l.humidity_max === null ? null : Number(l.humidity_max),
    }))
  },

  /** Lecturas de la sucursal desde `fromDay` (YYYY-MM-DD, hora de Lima), más recientes primero. */
  async listReadings(branchId: string, fromDay: string): Promise<EnvironmentReading[]> {
    const { data, error } = await supabase
      .from('environment_readings')
      .select('id, area, temperature, humidity, out_of_range, note, recorded_on, recorded_at, profiles(full_name)')
      .eq('branch_id', branchId)
      .gte('recorded_on', fromDay)
      .order('recorded_at', { ascending: false })
      .limit(2000)
    if (error) fail(error, 'No se pudo cargar el registro de temperatura.')
    return (data ?? []).map((r) => ({
      id: r.id,
      area: r.area,
      temperature: Number(r.temperature),
      humidity: r.humidity === null ? null : Number(r.humidity),
      outOfRange: r.out_of_range,
      note: r.note,
      recordedOn: r.recorded_on,
      recordedAt: r.recorded_at,
      recordedBy: r.profiles?.full_name ?? null,
    }))
  },

  async record(input: RecordReadingInput): Promise<void> {
    const { error } = await supabase.rpc('record_environment_reading', {
      p_branch: input.branchId,
      p_area: input.area,
      p_temperature: input.temperature,
      p_humidity: input.humidity ?? undefined,
      p_note: input.note ?? undefined,
      p_idempotency_key: input.idempotencyKey,
    })
    if (error) fail(error, 'No se pudo guardar la lectura.')
  },
}
