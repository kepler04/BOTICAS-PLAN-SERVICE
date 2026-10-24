import { describe, expect, it } from 'vitest'
import {
  EMPTY_PRODUCT_FORM,
  productFormSchema,
  productToFormValues,
  toProductPayload,
  type ProductFormValues,
} from '@/features/products/schemas/productSchemas'
import type { Product } from '@/features/products/types'

const valid: ProductFormValues = {
  ...EMPTY_PRODUCT_FORM,
  name: 'Paracetamol 500 mg',
  unitLabel: 'tableta',
  priceUnit: '0.50',
  sellsBlister: true,
  unitsPerBlister: '10',
  priceBlister: '4.50',
  sellsBox: true,
  unitsPerBox: '100',
  priceBox: '40',
  minStock: '50',
}

function messages(values: ProductFormValues): string[] {
  const r = productFormSchema.safeParse(values)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('productFormSchema', () => {
  it('acepta un producto con blíster y caja', () => {
    expect(messages(valid)).toEqual([])
  })

  it('acepta un producto solo por unidad', () => {
    expect(
      messages({ ...EMPTY_PRODUCT_FORM, name: 'Jarabe', priceUnit: '12.9', unitLabel: 'frasco' }),
    ).toEqual([])
  })

  it('exige nombre y precio por unidad', () => {
    const out = messages({ ...EMPTY_PRODUCT_FORM })
    expect(out.some((m) => m.startsWith('name'))).toBe(true)
    expect(out.some((m) => m.startsWith('priceUnit'))).toBe(true)
  })

  it('rechaza precios mal escritos', () => {
    expect(messages({ ...valid, priceUnit: 'abc' })[0]).toMatch(/priceUnit/)
    expect(messages({ ...valid, priceUnit: '1.999' })[0]).toMatch(/priceUnit/)
  })

  it('si se vende por blíster pide unidades y precio del blíster', () => {
    const out = messages({ ...valid, unitsPerBlister: '1', priceBlister: '' })
    expect(out.some((m) => m.startsWith('unitsPerBlister'))).toBe(true)
    expect(out.some((m) => m.startsWith('priceBlister'))).toBe(true)
  })

  it('la caja debe ser múltiplo del blíster', () => {
    const out = messages({ ...valid, unitsPerBox: '25' })
    expect(out.some((m) => m.startsWith('unitsPerBox') && m.includes('múltiplo'))).toBe(true)
  })

  it('ignora blíster/caja si están desactivados aunque tengan texto', () => {
    expect(messages({ ...valid, sellsBlister: false, unitsPerBlister: 'x', priceBlister: 'y' })).toEqual([])
  })

  it('valida largo del código de barras', () => {
    expect(messages({ ...valid, barcode: '12' })[0]).toMatch(/barcode/)
    expect(messages({ ...valid, barcode: '7750001234567' })).toEqual([])
  })

  it('el código DIGEMID es opcional y numérico, como en la base de datos', () => {
    expect(messages({ ...valid, digemidCode: '' })).toEqual([])
    expect(messages({ ...valid, digemidCode: '12345' })).toEqual([])
    expect(messages({ ...valid, digemidCode: 'AB-12' })[0]).toMatch(/digemidCode/)
    expect(messages({ ...valid, digemidCode: '12345678901' })[0]).toMatch(/digemidCode/)
  })
})

describe('toProductPayload', () => {
  it('convierte textos a tipos de la BD', () => {
    const payload = toProductPayload({ ...valid, barcode: ' 7750001 ', genericName: '', priceUnit: '0,5' })
    expect(payload).toMatchObject({
      name: 'Paracetamol 500 mg',
      barcode: '7750001',
      generic_name: null,
      price_unit: 0.5,
      units_per_blister: 10,
      price_blister: 4.5,
      units_per_box: 100,
      price_box: 40,
      min_stock: 50,
      category_id: null,
    })
  })

  it('manda null en blíster y caja cuando no se venden así', () => {
    const payload = toProductPayload({ ...valid, sellsBlister: false, sellsBox: false })
    expect(payload.units_per_blister).toBeNull()
    expect(payload.price_blister).toBeNull()
    expect(payload.units_per_box).toBeNull()
    expect(payload.price_box).toBeNull()
  })
})

describe('productToFormValues', () => {
  it('es la inversa de toProductPayload para un producto existente', () => {
    const product = {
      id: 'p1',
      pharmacy_id: 'ph1',
      category_id: 'c1',
      name: 'Ibuprofeno 400 mg',
      generic_name: 'Ibuprofeno',
      concentration: '400 mg',
      laboratory: null,
      barcode: '123456',
      sanitary_registry: null,
      digemid_code: null,
      requires_prescription: false,
      tax_affectation: 'gravado',
      unit_label: 'tableta',
      units_per_blister: 10,
      units_per_box: null,
      price_unit: 0.8,
      price_blister: 7.5,
      price_box: null,
      min_stock: 20,
      active: true,
      created_at: '',
      updated_at: '',
    } as Product
    const form = productToFormValues(product)
    expect(form.sellsBlister).toBe(true)
    expect(form.sellsBox).toBe(false)
    expect(form.priceUnit).toBe('0.80')
    expect(productFormSchema.safeParse(form).success).toBe(true)
    expect(toProductPayload(form)).toMatchObject({
      name: 'Ibuprofeno 400 mg',
      category_id: 'c1',
      units_per_blister: 10,
      price_blister: 7.5,
      units_per_box: null,
    })
  })
})
