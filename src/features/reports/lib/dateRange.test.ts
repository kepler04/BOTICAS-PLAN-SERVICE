import { describe, expect, it } from 'vitest'
import {
  deltaPercent,
  granularityFor,
  isValidRange,
  previousRange,
  rangeDays,
  rangeForPreset,
} from '@/features/reports/lib/dateRange'

// 22-oct-2026 (jueves), 23:30 hora local: la fecha de hoy NO debe saltar al día siguiente.
const now = new Date(2026, 9, 22, 23, 30)

describe('rangeForPreset', () => {
  it('hoy', () => {
    expect(rangeForPreset('today', now)).toEqual({ from: '2026-10-22', to: '2026-10-22' })
  })

  it('últimos 7 y 30 días incluyen hoy', () => {
    expect(rangeForPreset('7d', now)).toEqual({ from: '2026-10-16', to: '2026-10-22' })
    expect(rangeDays(rangeForPreset('7d', now))).toBe(7)
    expect(rangeDays(rangeForPreset('30d', now))).toBe(30)
  })

  it('este mes y mes pasado', () => {
    expect(rangeForPreset('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-22' })
    expect(rangeForPreset('lastMonth', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('mes pasado desde enero cruza el año', () => {
    expect(rangeForPreset('lastMonth', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
})

describe('previousRange', () => {
  it('es el periodo inmediatamente anterior, de la misma duración', () => {
    expect(previousRange({ from: '2026-10-16', to: '2026-10-22' })).toEqual({ from: '2026-10-09', to: '2026-10-15' })
    expect(previousRange({ from: '2026-10-22', to: '2026-10-22' })).toEqual({ from: '2026-10-21', to: '2026-10-21' })
  })

  it('cruza el cambio de mes y de año', () => {
    expect(previousRange({ from: '2026-10-01', to: '2026-10-22' })).toEqual({ from: '2026-09-09', to: '2026-09-30' })
    expect(previousRange({ from: '2026-01-01', to: '2026-01-31' })).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
})

describe('granularidad y validez', () => {
  it('por día hasta 62 días; luego por mes', () => {
    expect(granularityFor({ from: '2026-10-01', to: '2026-10-22' })).toBe('day')
    expect(granularityFor({ from: '2026-01-01', to: '2026-03-03' })).toBe('day') // 62 días
    expect(granularityFor({ from: '2026-01-01', to: '2026-03-04' })).toBe('month') // 63 días
  })

  it('valida rangos', () => {
    expect(isValidRange({ from: '2026-10-01', to: '2026-10-22' })).toBe(true)
    expect(isValidRange({ from: '2026-10-22', to: '2026-10-01' })).toBe(false)
    expect(isValidRange({ from: '', to: '2026-10-01' })).toBe(false)
    expect(isValidRange({ from: '2020-01-01', to: '2026-01-01' })).toBe(false) // más de ~3 años
  })
})

describe('deltaPercent', () => {
  it('calcula la variación', () => {
    expect(deltaPercent(150, 100)).toBe(50)
    expect(deltaPercent(50, 100)).toBe(-50)
    expect(deltaPercent(100, 100)).toBe(0)
  })

  it('no inventa un porcentaje sin base de comparación', () => {
    expect(deltaPercent(100, 0)).toBeNull()
  })

  it('con base negativa mantiene el sentido de la variación', () => {
    expect(deltaPercent(-50, -100)).toBe(50)
  })
})
