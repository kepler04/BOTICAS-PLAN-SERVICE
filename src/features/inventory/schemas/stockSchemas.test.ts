import { describe, expect, it } from 'vitest'
import {
  computeAdjustment,
  computeEntry,
  stockAdjustSchema,
  stockEntrySchema,
  type StockAdjustValues,
  type StockEntryValues,
} from '@/features/inventory/schemas/stockSchemas'
import type { PackSpec } from '@/features/products/lib/presentations'
import { addDaysISO } from '@/lib/format'

const tablet: PackSpec = { unit_label: 'tableta', units_per_blister: 10, units_per_box: 100 }

const entry: StockEntryValues = {
  presentation: 'box',
  quantity: '3',
  lotCode: 'L-2026-001',
  noExpiry: false,
  expiryDate: addDaysISO(400),
  cost: '40',
  costIncludesIgv: false,
  reason: '',
}

function issues(values: StockEntryValues): string[] {
  const r = stockEntrySchema.safeParse(values)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('stockEntrySchema', () => {
  it('acepta una entrada válida', () => {
    expect(issues(entry)).toEqual([])
  })

  it('exige lote, cantidad entera positiva y costo', () => {
    expect(issues({ ...entry, lotCode: ' ' })[0]).toMatch(/lotCode/)
    expect(issues({ ...entry, quantity: '0' })[0]).toMatch(/quantity/)
    expect(issues({ ...entry, quantity: '1.5' })[0]).toMatch(/quantity/)
    expect(issues({ ...entry, cost: '' })[0]).toMatch(/cost/)
  })

  it('no permite lotes vencidos', () => {
    expect(issues({ ...entry, expiryDate: addDaysISO(-1) })[0]).toMatch(/expiryDate.*venció/)
  })

  it('acepta vencimiento de hoy', () => {
    expect(issues({ ...entry, expiryDate: addDaysISO(0) })).toEqual([])
  })

  it('rechaza fechas absurdamente lejanas', () => {
    expect(issues({ ...entry, expiryDate: addDaysISO(365 * 20) })[0]).toMatch(/expiryDate.*lejana/)
  })

  it('con "sin vencimiento" ignora la fecha', () => {
    expect(issues({ ...entry, noExpiry: true, expiryDate: '' })).toEqual([])
  })
})

describe('computeEntry', () => {
  it('convierte cajas a unidades y reparte el costo', () => {
    const r = computeEntry(tablet, entry)!
    expect(r.quantity).toBe(300)
    expect(r.unitCost).toBeCloseTo(0.4)
  })

  it('si el costo incluye IGV, se guarda sin IGV', () => {
    const r = computeEntry(tablet, { ...entry, presentation: 'box', quantity: '1', cost: '118', costIncludesIgv: true })!
    expect(r.quantity).toBe(100)
    expect(r.unitCost).toBeCloseTo(1.0, 10) // 118 con IGV = 100 sin IGV; 100 / 100 u. = 1.00
  })

  it('blíster y unidad', () => {
    expect(computeEntry(tablet, { ...entry, presentation: 'blister', quantity: '5', cost: '4.5' })).toEqual({
      quantity: 50,
      unitCost: 0.45,
    })
    expect(computeEntry(tablet, { ...entry, presentation: 'unit', quantity: '7', cost: '0.3' })).toEqual({
      quantity: 7,
      unitCost: 0.3,
    })
  })

  it('devuelve null si supera el tope por movimiento', () => {
    expect(computeEntry(tablet, { ...entry, quantity: '20000' })).toBeNull()
  })
})

const adjust: StockAdjustValues = { kind: 'writeoff', presentation: 'unit', quantity: '5', reason: 'Frasco roto' }

describe('stockAdjustSchema + computeAdjustment', () => {
  it('exige motivo de al menos 3 letras y cantidad válida', () => {
    expect(stockAdjustSchema.safeParse(adjust).success).toBe(true)
    expect(stockAdjustSchema.safeParse({ ...adjust, reason: 'ab' }).success).toBe(false)
    expect(stockAdjustSchema.safeParse({ ...adjust, quantity: '0' }).success).toBe(false)
  })

  it('merma resta y se registra como write_off', () => {
    expect(computeAdjustment(tablet, adjust)).toEqual({ delta: -5, type: 'write_off' })
  })

  it('corrección de conteo suma o resta como adjustment', () => {
    expect(computeAdjustment(tablet, { ...adjust, kind: 'add', presentation: 'blister', quantity: '2' })).toEqual({
      delta: 20,
      type: 'adjustment',
    })
    expect(computeAdjustment(tablet, { ...adjust, kind: 'remove' })).toEqual({ delta: -5, type: 'adjustment' })
  })
})
