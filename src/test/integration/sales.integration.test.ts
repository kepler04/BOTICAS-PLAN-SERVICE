/**
 * Integración Fase 3: ventas y caja con los SERVICIOS REALES contra Supabase local.
 * Ejecutar con:  npm run test:integration   (requiere `npx supabase start`).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const holder = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const client = holder.current as Record<string | symbol, unknown>
        const value = client[prop]
        return typeof value === 'function' ? value.bind(client) : value
      },
    },
  ),
}))

import { branchService } from '@/features/branches/services/branchService'
import { cashService } from '@/features/cash/services/cashService'
import { inventoryService } from '@/features/inventory/services/inventoryService'
import {
  EMPTY_PRODUCT_FORM,
  toProductPayload,
  type ProductFormValues,
} from '@/features/products/schemas/productSchemas'
import { productService } from '@/features/products/services/productService'
import { addToCart, setLineQuantity, cartLineKey, type CartLine } from '@/features/sales/lib/cart'
import { toCartItem } from '@/features/sales/lib/cartItem'
import { salesService } from '@/features/sales/services/salesService'
import type { SellableProduct } from '@/features/sales/types'
import { addDaysISO } from '@/lib/format'

const URL = import.meta.env.VITE_IT_URL as string | undefined
const ANON = import.meta.env.VITE_IT_ANON_KEY as string | undefined
const SERVICE = import.meta.env.VITE_IT_SERVICE_KEY as string | undefined
const enabled = Boolean(URL && ANON && SERVICE)

const run = Math.random().toString(36).slice(2, 8)

function client(key: string): SupabaseClient {
  return createClient(URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function newUser(label: string): Promise<{ db: SupabaseClient; id: string }> {
  const db = client(ANON!)
  const { data, error } = await db.auth.signUp({
    email: `it3-${label}-${run}@test.local`,
    password: 'clave-segura-123',
    options: { data: { full_name: `Usuario ${label}` } },
  })
  if (error || !data.session || !data.user) throw new Error(`signUp ${label}: ${error?.message ?? 'sin sesión'}`)
  return { db, id: data.user.id }
}

const product = (o: Partial<ProductFormValues>) => toProductPayload({ ...EMPTY_PRODUCT_FORM, priceUnit: '1.00', ...o })

/** Arma un carrito como lo haría el POS. */
function cart(...entries: [SellableProduct, 'unit' | 'blister' | 'box', number][]): CartLine[] {
  let lines: CartLine[] = []
  for (const [p, pres, qty] of entries) {
    lines = addToCart(lines, toCartItem(p, pres))
    lines = setLineQuantity(lines, cartLineKey({ productId: p.productId, presentation: pres }), qty)
  }
  return lines
}

describe.skipIf(!enabled)('integración: ventas y caja (Supabase local)', () => {
  let admin: SupabaseClient
  let cashier: SupabaseClient
  let stranger: SupabaseClient
  let pharmacyId = ''
  let branchId = ''
  let para!: SellableProduct
  let syrup!: SellableProduct
  let sale1 = ''
  let sale2 = ''
  let sessionId = ''

  beforeAll(async () => {
    const a = await newUser('admin')
    admin = a.db
    const c = await newUser('cashier')
    cashier = c.db
    stranger = (await newUser('stranger')).db

    holder.current = admin
    const reg = await admin.rpc('register_pharmacy', { p_legal_name: `Botica Ventas IT ${run}`, p_trade_name: 'Botica Ventas' })
    if (reg.error) throw new Error(reg.error.message)
    pharmacyId = reg.data
    branchId = (await branchService.getMainBranch(pharmacyId))!.id
    const link = await client(SERVICE!).from('pharmacy_members').insert({ pharmacy_id: pharmacyId, user_id: c.id, role: 'cashier' })
    if (link.error) throw new Error(link.error.message)

    const p1 = await productService.create(
      pharmacyId,
      product({ name: 'Paracetamol 500 mg', barcode: '7750099', unitLabel: 'tableta', priceUnit: '0.50', sellsBlister: true, unitsPerBlister: '10', priceBlister: '4.50', sellsBox: true, unitsPerBox: '100', priceBox: '40' }),
    )
    const p2 = await productService.create(pharmacyId, product({ name: 'Jarabe para la tos', unitLabel: 'frasco', priceUnit: '12.90' }))
    const entry = (productId: string, lot: string, qty: number, days: number) =>
      inventoryService.registerEntry({ branchId, productId, lotCode: lot, expiryDate: addDaysISO(days), quantity: qty, unitCost: 0.2, reason: null, idempotencyKey: crypto.randomUUID() })
    await entry(p1.id, 'L-NEAR', 30, 15)
    await entry(p1.id, 'L-FAR', 500, 400)
    await entry(p2.id, 'J-1', 5, 200)

    const found = await salesService.searchSellable(branchId, '')
    para = found.find((p) => p.name.startsWith('Paracetamol'))!
    syrup = found.find((p) => p.name.startsWith('Jarabe'))!
  })

  it('el POS lista productos con precios por presentación y stock vendible', async () => {
    holder.current = cashier
    expect(para.sellableUnits).toBe(530)
    expect(para.priceBox).toBe(40)
    expect(syrup.priceBlister).toBeNull()
    expect((await salesService.searchSellable(branchId, 'jarabe')).map((p) => p.name)).toEqual(['Jarabe para la tos'])
    expect((await salesService.findByBarcode(branchId, '7750099'))?.name).toBe('Paracetamol 500 mg')
    expect(await salesService.findByBarcode(branchId, '0000000')).toBeNull()
  })

  it('no se puede vender con la caja cerrada', async () => {
    expect(await cashService.getOpenSession(branchId)).toBeNull()
    await expect(
      salesService.createSale({ branchId, lines: cart([syrup, 'unit', 1]), paymentMethod: 'cash', amountReceived: 20, paymentReference: null, idempotencyKey: crypto.randomUUID() }),
    ).rejects.toThrow(/Abre la caja/)
  })

  it('el cajero abre la caja y no puede abrir una segunda', async () => {
    sessionId = await cashService.openSession(branchId, 100)
    const open = await cashService.getOpenSession(branchId)
    expect(open?.id).toBe(sessionId)
    expect(open?.expectedCash).toBe(100)
    expect(open?.openedByName).toBe('Usuario cashier')
    await expect(cashService.openSession(branchId, 50)).rejects.toThrow(/Ya hay una caja abierta/)
  })

  it('registra una venta en efectivo con vuelto y descuenta por FEFO', async () => {
    const key = crypto.randomUUID()
    const input = { branchId, lines: cart([para, 'box', 1], [para, 'unit', 5]), paymentMethod: 'cash' as const, amountReceived: 100, paymentReference: null, idempotencyKey: key }
    sale1 = await salesService.createSale(input)
    // Reintento con la misma clave (doble clic): misma venta, sin descontar dos veces.
    expect(await salesService.createSale(input)).toBe(sale1)

    const detail = await salesService.getSale(sale1)
    expect(detail.total).toBe(42.5)
    expect(detail.change_given).toBe(57.5)
    // IGV 18 % incluido: caja 40.00 -> IGV 6.10 (base 33.90); 5 u. = 2.50 -> IGV 0.38 (base 2.12)
    expect(detail).toMatchObject({ charges_igv: true, total_igv: 6.48, total_gravado: 36.02, total_exonerado: 0, total_inafecto: 0 })
    expect(`${detail.receipt_series}-${detail.receipt_number}`).toBe('T001-1')
    expect(detail.profiles?.full_name).toBe('Usuario cashier')
    expect(detail.sale_items.map((i) => [i.presentation, i.quantity, i.base_quantity]).sort()).toEqual([
      ['box', 1, 100],
      ['unit', 5, 5],
    ])

    const stock = await salesService.searchSellable(branchId, 'parace')
    expect(stock[0]!.sellableUnits).toBe(425) // 530 - 105
  })

  it('el servidor decide los precios: un cambio de precio posterior no altera el comprobante', async () => {
    holder.current = admin
    await productService.update(para.productId, product({ name: 'Paracetamol 500 mg', barcode: '7750099', unitLabel: 'tableta', priceUnit: '9.99', sellsBlister: true, unitsPerBlister: '10', priceBlister: '4.50', sellsBox: true, unitsPerBox: '100', priceBox: '40' }))
    holder.current = cashier
    const detail = await salesService.getSale(sale1)
    expect(detail.total).toBe(42.5)
    expect(detail.sale_items.find((i) => i.presentation === 'unit')?.unit_price).toBe(0.5)
  })

  it('rechaza ventas sin stock con el nombre del producto, y pagos insuficientes', async () => {
    await expect(
      salesService.createSale({ branchId, lines: cart([syrup, 'unit', 6]), paymentMethod: 'cash', amountReceived: 100, paymentReference: null, idempotencyKey: crypto.randomUUID() }),
    ).rejects.toThrow(/No hay stock suficiente de “Jarabe para la tos”/)
    await expect(
      salesService.createSale({ branchId, lines: cart([syrup, 'unit', 1]), paymentMethod: 'cash', amountReceived: 1, paymentReference: null, idempotencyKey: crypto.randomUUID() }),
    ).rejects.toThrow(/no alcanza/)
  })

  it('vende por Yape con referencia y numera sin huecos', async () => {
    sale2 = await salesService.createSale({ branchId, lines: cart([syrup, 'unit', 2]), paymentMethod: 'yape', amountReceived: null, paymentReference: 'OP-98765', idempotencyKey: crypto.randomUUID() })
    const d = await salesService.getSale(sale2)
    expect(d.receipt_number).toBe(2)
    expect(d.payment_reference).toBe('OP-98765')
    expect(d.change_given).toBe(0)
  })

  it('historial, resumen del día y resumen de caja cuadran', async () => {
    const list = await salesService.listSales(branchId, { page: 0, from: null, to: null, status: 'all' })
    expect(list.rows.map((r) => r.receipt_number)).toEqual([2, 1])
    expect(list.rows[0]!.profiles?.full_name).toBe('Usuario cashier')

    const start = new Date(Date.now() - 86_400_000).toISOString()
    const end = new Date(Date.now() + 86_400_000).toISOString()
    const sum = await salesService.getSummary(branchId, start, end)
    expect(sum).toMatchObject({ salesCount: 2, total: 68.3, cash: 42.5, yape: 25.8, plin: 0, voidedCount: 0 })

    const open = await cashService.getOpenSession(branchId)
    expect(open).toMatchObject({ cashSales: 42.5, yapeSales: 25.8, salesCount: 2, expectedCash: 142.5 })
  })

  it('movimientos de caja: ingreso y egreso cambian el efectivo esperado', async () => {
    await cashService.addMovement(sessionId, 'income', 20, 'Sencillo')
    await cashService.addMovement(sessionId, 'expense', 5, 'Bolsas')
    await expect(cashService.addMovement(sessionId, 'expense', 5, '')).rejects.toThrow(/motivo/)
    const movements = await cashService.listMovements(sessionId)
    expect(movements.map((m) => m.type)).toEqual(['expense', 'income'])
    expect(movements[0]!.profiles?.full_name).toBe('Usuario cashier')
    expect((await cashService.getOpenSession(branchId))?.expectedCash).toBe(157.5)
  })

  it('el cajero no puede anular; el admin sí y el stock vuelve', async () => {
    await expect(salesService.voidSale(sale2, 'Intento de cajero')).rejects.toThrow(/No tienes permiso/)

    holder.current = admin
    await expect(salesService.voidSale(sale2, '')).rejects.toThrow(/motivo/)
    await salesService.voidSale(sale2, 'Error de cobro')
    await expect(salesService.voidSale(sale2, 'Otra vez')).rejects.toThrow(/ya estaba anulada/)

    expect((await salesService.getSale(sale2)).status).toBe('voided')
    expect((await salesService.searchSellable(branchId, 'jarabe'))[0]!.sellableUnits).toBe(5)
    const open = await cashService.getOpenSession(branchId)
    expect(open).toMatchObject({ yapeSales: 0, salesCount: 1, voidedCount: 1 })

    // Historial de inventario: el admin ve venta y anulación.
    const history = await inventoryService.listMovements(branchId, 0)
    const types = history.rows.map((m) => m.type)
    expect(types).toContain('sale')
    expect(types).toContain('sale_void')
    holder.current = cashier
  })

  it('el cierre exige nota si hay diferencia y deja el historial de cajas', async () => {
    await expect(cashService.closeSession(sessionId, 150, null)).rejects.toThrow(/nota/)
    const result = await cashService.closeSession(sessionId, 150, 'Faltaron S/ 7.50')
    expect(result).toEqual({ expected: 157.5, counted: 150, difference: -7.5 })

    expect(await cashService.getOpenSession(branchId)).toBeNull()
    const history = await cashService.listSessions(branchId, 0)
    expect(history.rows[0]).toMatchObject({ status: 'closed', difference: -7.5, countedCash: 150, closedByName: 'Usuario cashier' })

    await expect(
      salesService.createSale({ branchId, lines: cart([syrup, 'unit', 1]), paymentMethod: 'cash', amountReceived: 20, paymentReference: null, idempotencyKey: crypto.randomUUID() }),
    ).rejects.toThrow(/Abre la caja/)
  })

  it('otra botica no ve ventas ni cajas', async () => {
    holder.current = stranger
    expect((await salesService.listSales(branchId, { page: 0, from: null, to: null, status: 'all' })).total).toBe(0)
    expect((await cashService.listSessions(branchId, 0)).total).toBe(0)
    expect(await cashService.getOpenSession(branchId)).toBeNull()
    await expect(salesService.getSale(sale1)).rejects.toThrow()
    holder.current = admin
  })
})
