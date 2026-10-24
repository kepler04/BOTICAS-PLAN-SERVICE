import { describe, expect, it } from 'vitest'
import type { EnvironmentLimit } from '@/features/sanitary/lib/environment'
import { readingOutOfRange, readingSchema } from '@/features/sanitary/schemas/readingSchema'

const ROOM: EnvironmentLimit = { area: 'room', tempMin: 15, tempMax: 30, humidityMax: 70 }
const FRIDGE: EnvironmentLimit = { area: 'fridge', tempMin: 2, tempMax: 8, humidityMax: null }

const errors = (limit: EnvironmentLimit, v: { temperature: string; humidity?: string; note?: string }) => {
  const r = readingSchema(limit).safeParse({ humidity: '', note: '', ...v })
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('readingSchema', () => {
  it('lectura normal: sin errores ni nota', () => {
    expect(errors(ROOM, { temperature: '22.5', humidity: '55' })).toEqual([])
    expect(errors(FRIDGE, { temperature: '4' })).toEqual([])
  })

  it('temperatura obligatoria con un decimal; humedad 0-100', () => {
    expect(errors(ROOM, { temperature: '' })).toEqual(['temperature'])
    expect(errors(ROOM, { temperature: '22.55' })).toEqual(['temperature'])
    expect(errors(ROOM, { temperature: '22', humidity: '120' })).toEqual(['humidity'])
  })

  it('fuera de rango exige nota (temperatura o humedad); con nota pasa', () => {
    expect(errors(ROOM, { temperature: '31' })).toEqual(['note'])
    expect(errors(ROOM, { temperature: '24', humidity: '75' })).toEqual(['note'])
    expect(errors(FRIDGE, { temperature: '9' })).toEqual(['note'])
    expect(errors(FRIDGE, { temperature: '9', note: 'Se cerró la puerta' })).toEqual([])
  })

  it('la refrigeración ignora la humedad', () => {
    expect(readingOutOfRange(FRIDGE, { temperature: '5', humidity: '99', note: '' })).toBe(false)
  })
})
