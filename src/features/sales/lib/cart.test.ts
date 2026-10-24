import { describe, expect, it } from 'vitest'
import {
  addToCart,
  cartLineKey,
  cartTotalCents,
  changeCents,
  formatReceiptNumber,
  fromCents,
  quickCashOptions,
  remainingFor,
  removeLine,
  requestedUnits,
  setLineQuantity,
  stockProblems,
  toCents,
  toSaleItems,
  type CartLine,
} from '@/features/sales/lib/cart'

type Item = Omit<CartLine, 'quantity'>

const base = {
  unit_label: 'tableta',
  units_per_blister: 10,
  units_per_box: 100,
  requiresPrescription: false,
  taxAffectation: 'gravado' as const,
}
const paraUnit: Item = { ...base, productId: 'p1', name: 'Paracetamol', presentation: 'unit', unitPriceCents: 50, sellableUnits: 250 }
const paraBox: Item = { ...base, productId: 'p1', name: 'Paracetamol', presentation: 'box', unitPriceCents: 4000, sellableUnits: 250 }

describe('dinero en centavos', () => {
  it('evita errores de punto flotante', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(toCents(0.1) + toCents(0.2)).toBe(toCents(0.3))
    expect(toCents(12.9)).toBe(1290)
    expect(fromCents(1290)).toBe(12.9)
  })
})

describe('carrito', () => {
  it('agrega y suma la misma presentación', () => {
    let cart = addToCart([], paraUnit)
    cart = addToCart(cart, paraUnit)
    expect(cart).toHaveLength(1)
    expect(cart[0]!.quantity).toBe(2)
  })

  it('presentaciones distintas del mismo producto son líneas distintas', () => {
    const cart = addToCart(addToCart([], paraUnit), paraBox)
    expect(cart).toHaveLength(2)
    expect(cartTotalCents(cart)).toBe(50 + 4000)
  })

  it('cambia cantidades y quita la línea con cantidad menor a 1', () => {
    let cart = addToCart([], paraUnit)
    const key = cartLineKey(paraUnit)
    cart = setLineQuantity(cart, key, 5)
    expect(cartTotalCents(cart)).toBe(250)
    expect(setLineQuantity(cart, key, 0)).toEqual([])
    expect(setLineQuantity(cart, key, 1.5)).toEqual([])
    expect(removeLine(cart, key)).toEqual([])
  })

  it('suma unidades pedidas de un producto entre presentaciones', () => {
    let cart = setLineQuantity(addToCart([], paraBox), cartLineKey(paraBox), 2) // 200 unidades
    cart = addToCart(cart, paraUnit) // +1
    expect(requestedUnits(cart, 'p1')).toBe(201)
  })

  it('detecta pedidos que superan el stock vendible', () => {
    let cart = setLineQuantity(addToCart([], paraBox), cartLineKey(paraBox), 3) // 300 > 250
    expect(stockProblems(cart)).toEqual([{ productId: 'p1', name: 'Paracetamol', requested: 300, available: 250 }])
    cart = setLineQuantity(cart, cartLineKey(paraBox), 2)
    expect(stockProblems(cart)).toEqual([])
  })

  it('calcula cuántas presentaciones más caben', () => {
    const cart = setLineQuantity(addToCart([], paraBox), cartLineKey(paraBox), 2) // 200 de 250
    expect(remainingFor(cart, paraBox)).toBe(0)
    expect(remainingFor(cart, paraUnit)).toBe(50)
    expect(remainingFor([], paraBox)).toBe(2)
  })

  it('envía al servidor solo producto, presentación y cantidad', () => {
    const cart = setLineQuantity(addToCart([], paraBox), cartLineKey(paraBox), 2)
    expect(toSaleItems(cart)).toEqual([{ product_id: 'p1', presentation: 'box', quantity: 2 }])
  })
})

describe('cobro', () => {
  it('calcula el vuelto o null si no alcanza', () => {
    expect(changeCents(4250, 10000)).toBe(5750)
    expect(changeCents(4250, 4250)).toBe(0)
    expect(changeCents(4250, 4000)).toBeNull()
  })

  it('ofrece billetes que alcanzan', () => {
    expect(quickCashOptions(4250)).toEqual([5000, 10000, 20000])
    expect(quickCashOptions(1290)).toEqual([2000, 5000, 10000])
    expect(quickCashOptions(5000)).toEqual([10000, 20000])
    expect(quickCashOptions(25000)).toEqual([30000])
  })

  it('formatea el número de comprobante', () => {
    expect(formatReceiptNumber('T001', 7)).toBe('T001-000007')
    expect(formatReceiptNumber('T001', 123456)).toBe('T001-123456')
  })
})
