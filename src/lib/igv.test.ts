import { describe, expect, it } from 'vitest'
import { costWithoutIgv, igvBreakdown, igvOfCents } from '@/lib/igv'

describe('igvOfCents (mismos vectores que supabase/tests/igv.test.sql)', () => {
  it('extrae el IGV de un monto con IGV incluido', () => {
    expect(igvOfCents(11800, 'gravado', true)).toBe(1800) // 118.00 -> base 100.00, IGV 18.00
    expect(igvOfCents(150, 'gravado', true)).toBe(23) // 1.50 -> base 1.27, IGV 0.23
    expect(igvOfCents(300, 'gravado', true)).toBe(46) // 3.00 -> base 2.54, IGV 0.46
  })

  it('exonerado e inafecto no llevan IGV', () => {
    expect(igvOfCents(10000, 'exonerado', true)).toBe(0)
    expect(igvOfCents(10000, 'inafecto', true)).toBe(0)
  })

  it('si la botica no cobra IGV, no hay IGV', () => {
    expect(igvOfCents(11800, 'gravado', false)).toBe(0)
  })

  it('base + IGV siempre suma exactamente el total (para cualquier monto de 1 a 20 000 centavos)', () => {
    for (let c = 1; c <= 20_000; c++) {
      const igv = igvOfCents(c, 'gravado', true)
      const base = c - igv
      expect(base).toBeGreaterThanOrEqual(0)
      // la base es el entero más cercano a total/1.18: diferencia menor a medio centavo
      expect(Math.abs(base - c / 1.18)).toBeLessThanOrEqual(0.5 + 1e-9)
    }
  })

  it('redondea "half up" igual que Postgres en los casos límite', () => {
    // 5.31 / 1.18 = 4.5 exacto -> base 4.50 (half up), IGV 0.81
    expect(igvOfCents(531, 'gravado', true)).toBe(81)
    // 5.30 / 1.18 = 4.4915... -> base 4.49, IGV 0.81
    expect(igvOfCents(530, 'gravado', true)).toBe(81)
  })
})

describe('igvBreakdown (misma venta que el pgTAP: G 11.80 + E 5.00 + I 2 x 3.00)', () => {
  const lines = [
    { taxAffectation: 'gravado' as const, totalCents: 1180 },
    { taxAffectation: 'exonerado' as const, totalCents: 500 },
    { taxAffectation: 'inafecto' as const, totalCents: 600 },
  ]

  it('separa gravado, exonerado, inafecto e IGV', () => {
    expect(igvBreakdown(lines, true)).toEqual({ gravado: 1000, exonerado: 500, inafecto: 600, igv: 180, total: 2280 })
  })

  it('total = gravado + exonerado + inafecto + IGV', () => {
    const b = igvBreakdown(lines, true)
    expect(b.gravado + b.exonerado + b.inafecto + b.igv).toBe(b.total)
  })

  it('sin IGV en la botica, no hay desglose', () => {
    expect(igvBreakdown(lines, false)).toEqual({ gravado: 0, exonerado: 0, inafecto: 0, igv: 0, total: 2280 })
  })
})

describe('costWithoutIgv', () => {
  it('quita el IGV de un costo', () => {
    expect(costWithoutIgv(118)).toBeCloseTo(100, 10)
    expect(costWithoutIgv(11.8)).toBeCloseTo(10, 10)
  })
})
