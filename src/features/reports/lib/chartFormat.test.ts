import { describe, expect, it } from 'vitest'
import { compactNumber, formatDelta, periodAxisLabel, periodLabel } from '@/features/reports/lib/chartFormat'

describe('chartFormat', () => {
  it('etiquetas de eje por día y por mes', () => {
    expect(periodAxisLabel('2026-10-22', 'day')).toBe('22/10')
    expect(periodAxisLabel('2026-03-01', 'month')).toBe('mar 26')
  })

  it('etiquetas completas para tooltip y tabla', () => {
    expect(periodLabel('2026-10-05', 'day')).toBe('5 oct 2026')
    expect(periodLabel('2026-12-01', 'month')).toBe('diciembre 2026')
  })

  it('números compactos del eje Y', () => {
    expect(compactNumber(0)).toBe('0')
    expect(compactNumber(850)).toBe('850')
    expect(compactNumber(1000)).toBe('1K')
    expect(compactNumber(2500)).toBe('2.5K')
    expect(compactNumber(1_200_000)).toBe('1.2M')
    expect(compactNumber(12.5)).toBe('12.5')
  })

  it('variación con signo explícito', () => {
    expect(formatDelta(12.54)).toBe('+12.5 %')
    expect(formatDelta(-3)).toBe('−3 %')
    expect(formatDelta(0)).toBe('0 %')
    expect(formatDelta(0.04)).toBe('0 %')
  })
})
