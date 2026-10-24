import { describe, expect, it } from 'vitest'
import type { ProductRef } from '@/features/inventory/types'
import { newLine } from '@/features/purchases/lib/purchase'
import { emptyPurchase, purchaseSchema } from '@/features/purchases/schemas/purchaseSchema'
import { addDaysISO } from '@/lib/format'

const PARA: ProductRef = { id: 'p1', name: 'Paracetamol', unit_label: 'tableta', units_per_blister: 10, units_per_box: 100, tax_affectation: 'gravado' }

const paths = (v: ReturnType<typeof emptyPurchase>) => {
  const r = purchaseSchema.safeParse(v)
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.')).sort()
}

describe('purchaseSchema', () => {
  it('vacío: pide proveedor, documento y al menos un producto', () => {
    expect(paths(emptyPurchase())).toEqual(['docNumber', 'lines', 'supplierId'])
  })

  it('marca los errores de cada línea en su propia ruta', () => {
    const v = { ...emptyPurchase(), supplierId: 's1', docNumber: 'F001-1', lines: [newLine(PARA)] }
    expect(paths(v)).toEqual(['lines.0.cost', 'lines.0.expiryDate', 'lines.0.lotCode', 'lines.0.quantity'])
  })

  it('una compra completa es válida', () => {
    const line = { ...newLine(PARA), quantity: '2', cost: '23.60', lotCode: 'L1', expiryDate: addDaysISO(300) }
    expect(paths({ ...emptyPurchase(), supplierId: 's1', docNumber: 'F001-1', lines: [line] })).toEqual([])
  })
})
