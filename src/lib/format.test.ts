import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  daysUntil,
  formatCost,
  formatDate,
  formatPEN,
  parseInteger,
  parseMoney,
  todayISO,
} from '@/lib/format'

describe('format', () => {
  it('formatea soles', () => {
    expect(formatPEN(12.5).replace(/\s/g, ' ')).toMatch(/S\/ ?12\.50/)
  })

  it('formatea costos con 2 o 4 decimales según haga falta', () => {
    expect(formatCost(0.5)).toBe('S/ 0.50')
    expect(formatCost(0.2525)).toBe('S/ 0.2525')
    // 0.28 * 100 = 28.000000000000004 en coma flotante: igual debe verse con 2 decimales.
    expect(formatCost(0.28)).toBe('S/ 0.28')
    expect(formatCost(0.57)).toBe('S/ 0.57')
  })

  it('formatea fechas sin desfase de zona horaria', () => {
    expect(formatDate('2026-12-31')).toBe('31/12/2026')
    expect(formatDate(null)).toBe('—')
  })

  it('calcula fechas relativas con la fecha local', () => {
    const now = new Date(2026, 9, 22, 23, 30) // 22-oct-2026, 23:30 hora local
    expect(todayISO(now)).toBe('2026-10-22')
    expect(addDaysISO(30, now)).toBe('2026-11-21')
    expect(daysUntil('2026-10-25', now)).toBe(3)
    expect(daysUntil('2026-10-20', now)).toBe(-2)
  })

  it('parsea dinero', () => {
    expect(parseMoney('12')).toBe(12)
    expect(parseMoney('12,50')).toBe(12.5)
    expect(parseMoney('12.505')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('-3')).toBeNull()
    expect(parseMoney('')).toBeNull()
  })

  it('parsea enteros', () => {
    expect(parseInteger('10')).toBe(10)
    expect(parseInteger('0')).toBe(0)
    expect(parseInteger('1.5')).toBeNull()
    expect(parseInteger('-1')).toBeNull()
    expect(parseInteger('')).toBeNull()
  })
})
