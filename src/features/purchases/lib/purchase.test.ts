import { describe, expect, it } from 'vitest'
import {
  computeLine,
  newLine,
  purchaseTotals,
  toPurchaseItems,
  validateHeader,
  type PurchaseLineDraft,
} from '@/features/purchases/lib/purchase'
import type { ProductRef } from '@/features/inventory/types'
import { addDaysISO, todayISO } from '@/lib/format'

const PARA: ProductRef = { id: 'p1', name: 'Paracetamol', unit_label: 'tableta', units_per_blister: 10, units_per_box: 100, tax_affectation: 'gravado' }
const EXO: ProductRef = { id: 'p2', name: 'Exonerado', unit_label: 'frasco', units_per_blister: null, units_per_box: null, tax_affectation: 'exonerado' }

const line = (o: Partial<PurchaseLineDraft>): PurchaseLineDraft => ({
  ...newLine(PARA),
  quantity: '2',
  cost: '23.60',
  lotCode: 'L-1',
  expiryDate: addDaysISO(300),
  ...o,
})

describe('computeLine', () => {
  it('2 cajas de 100 a S/ 23.60 con IGV: 200 u. a 0.2000 sin IGV, subtotal 40.00 e IGV 7.20', () => {
    expect(computeLine(line({}), true)).toEqual({ errors: {}, quantity: 200, unitCost: 0.2, subtotal: 40, igv: 7.2 })
  })

  it('si el costo ya es sin IGV no se divide', () => {
    expect(computeLine(line({ cost: '20' }), false)).toMatchObject({ unitCost: 0.2, subtotal: 40, igv: 7.2 })
  })

  it('un producto exonerado no suma IGV', () => {
    expect(computeLine(line({ product: EXO, presentation: 'unit', quantity: '10', cost: '2.00' }), false)).toMatchObject({
      quantity: 10,
      subtotal: 20,
      igv: 0,
    })
  })

  it('por blíster convierte a unidades', () => {
    expect(computeLine(line({ presentation: 'blister', quantity: '3', cost: '1.50' }), false)).toMatchObject({
      quantity: 30,
      unitCost: 0.15,
      subtotal: 4.5,
    })
  })

  it('marca cantidad, costo, lote y vencimiento inválidos', () => {
    const r = computeLine(line({ quantity: '0', cost: 'x', lotCode: ' ', expiryDate: addDaysISO(-1) }), true)
    expect(Object.keys(r.errors).sort()).toEqual(['cost', 'expiryDate', 'lotCode', 'quantity'])
  })

  it('sin vencimiento no exige fecha', () => {
    expect(computeLine(line({ noExpiry: true, expiryDate: '' }), true).errors).toEqual({})
  })
})

describe('purchaseTotals y toPurchaseItems', () => {
  it('suma subtotales e IGV y arma el payload en unidad mínima', () => {
    const lines = [line({}), line({ product: EXO, presentation: 'unit', quantity: '10', cost: '2', noExpiry: true })]
    const computed = lines.map((l) => computeLine(l, false))
    expect(purchaseTotals(computed)).toEqual({ subtotal: 67.2, igv: 8.5, total: 75.7 })
    expect(toPurchaseItems(lines, computed)[1]).toEqual({ product_id: 'p2', lot_code: 'L-1', expiry_date: null, quantity: 10, unit_cost: 2 })
  })
})

describe('validateHeader', () => {
  it('exige proveedor, número y una fecha no futura de hasta 2 años', () => {
    expect(validateHeader({ supplierId: 's', docType: 'invoice', docNumber: 'F001-1', issueDate: todayISO() })).toEqual({})
    const e = validateHeader({ supplierId: '', docType: 'invoice', docNumber: ' ', issueDate: addDaysISO(1) })
    expect(Object.keys(e).sort()).toEqual(['docNumber', 'issueDate', 'supplierId'])
    expect(validateHeader({ supplierId: 's', docType: 'invoice', docNumber: 'F1', issueDate: addDaysISO(-800) }).issueDate).toBeTruthy()
  })
})
