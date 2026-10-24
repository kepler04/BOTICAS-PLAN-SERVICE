import { describe, expect, it } from 'vitest'
import {
  isOutOfRange,
  parseReading,
  summarizeByDay,
  type EnvironmentLimit,
  type EnvironmentReading,
} from '@/features/sanitary/lib/environment'

const ROOM: EnvironmentLimit = { area: 'room', tempMin: 15, tempMax: 30, humidityMax: 70 }
const FRIDGE: EnvironmentLimit = { area: 'fridge', tempMin: 2, tempMax: 8, humidityMax: null }

const reading = (o: Partial<EnvironmentReading>): EnvironmentReading => ({
  id: 1,
  area: 'room',
  temperature: 22,
  humidity: 50,
  outOfRange: false,
  note: null,
  recordedOn: '2026-10-20',
  recordedAt: '2026-10-20T14:00:00Z',
  recordedBy: 'Ana',
  ...o,
})

describe('isOutOfRange (misma regla que la BD)', () => {
  it('ambiente: 15-30 °C y humedad hasta 70 %, con los bordes dentro', () => {
    expect(isOutOfRange(ROOM, 15, 70)).toBe(false)
    expect(isOutOfRange(ROOM, 30, null)).toBe(false)
    expect(isOutOfRange(ROOM, 30.1, 50)).toBe(true)
    expect(isOutOfRange(ROOM, 14.9, 50)).toBe(true)
    expect(isOutOfRange(ROOM, 22, 70.1)).toBe(true)
  })

  it('refrigeración: 2-8 °C, sin humedad', () => {
    expect(isOutOfRange(FRIDGE, 4, null)).toBe(false)
    expect(isOutOfRange(FRIDGE, 8.5, null)).toBe(true)
    expect(isOutOfRange(FRIDGE, 1.9, null)).toBe(true)
  })
})

describe('parseReading', () => {
  it('acepta un decimal con punto o coma y negativos', () => {
    expect(parseReading('22')).toBe(22)
    expect(parseReading('22,5')).toBe(22.5)
    expect(parseReading('-1.5')).toBe(-1.5)
  })

  it('rechaza dos decimales, texto o vacío', () => {
    expect(parseReading('22.55')).toBeNull()
    expect(parseReading('abc')).toBeNull()
    expect(parseReading('')).toBeNull()
  })
})

describe('summarizeByDay', () => {
  it('incluye los días sin lecturas y marca los que faltan', () => {
    const days = summarizeByDay(
      [
        reading({ recordedOn: '2026-10-20', temperature: 21 }),
        reading({ recordedOn: '2026-10-20', temperature: 31, humidity: 60, outOfRange: true, note: 'ventilador' }),
        reading({ recordedOn: '2026-10-20', area: 'fridge', temperature: 5, humidity: null }),
        reading({ recordedOn: '2026-10-22', temperature: 23, humidity: 45 }),
      ],
      '2026-10-20',
      '2026-10-22',
    )
    expect(days.map((d) => d.day)).toEqual(['2026-10-22', '2026-10-21', '2026-10-20'])
    expect(days[1]).toMatchObject({ missingRoom: true, outOfRange: 0 })
    expect(days[2]).toMatchObject({
      missingRoom: false,
      outOfRange: 1,
      room: { count: 2, min: 21, max: 31, humidityMax: 60 },
      fridge: { count: 1, min: 5, max: 5 },
    })
  })

  it('cruza el cambio de mes sin saltarse días', () => {
    expect(summarizeByDay([], '2026-10-30', '2026-11-02').map((d) => d.day)).toEqual([
      '2026-11-02',
      '2026-11-01',
      '2026-10-31',
      '2026-10-30',
    ])
  })
})
