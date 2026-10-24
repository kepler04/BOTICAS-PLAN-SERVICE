import { describe, expect, it } from 'vitest'
import { missingDigemidCode, PRICE_REPORT_COLUMNS, sortForPriceReport } from '@/features/products/lib/priceReport'
import type { Product } from '@/features/products/types'
import { toCsv } from '@/lib/csv'

const product = (o: Partial<Product>): Product =>
  ({
    name: 'X',
    digemid_code: null,
    generic_name: null,
    concentration: null,
    laboratory: null,
    sanitary_registry: null,
    unit_label: 'tableta',
    price_unit: 0.5,
    units_per_blister: null,
    price_blister: null,
    units_per_box: null,
    price_box: null,
    ...o,
  }) as Product

describe('reporte de precios DIGEMID', () => {
  it('pone primero los productos con código y cuenta los que faltan', () => {
    const rows = [product({ name: 'Zinc' }), product({ name: 'Paracetamol', digemid_code: '123' }), product({ name: 'Amoxicilina' })]
    expect(sortForPriceReport(rows).map((p) => p.name)).toEqual(['Paracetamol', 'Amoxicilina', 'Zinc'])
    expect(missingDigemidCode(rows)).toBe(2)
  })

  it('exporta precios con 2 decimales y deja vacías las presentaciones que no se venden', () => {
    const csv = toCsv(PRICE_REPORT_COLUMNS, [
      product({ name: 'Paracetamol 500 mg', digemid_code: '123', price_unit: 0.3, units_per_blister: 10, price_blister: 2.8 }),
    ])
    const [header, line] = csv.replace('﻿', '').split('\r\n')
    expect(header).toContain('Código DIGEMID,Producto')
    expect(line).toBe('123,Paracetamol 500 mg,,,,,tableta,0.30,10,2.80,,')
  })
})
