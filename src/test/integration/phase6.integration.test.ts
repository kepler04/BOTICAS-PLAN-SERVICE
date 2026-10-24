/**
 * Fase 6 contra Supabase local, usando los servicios REALES del frontend: cliente en la venta (regla de S/ 700),
 * registro de temperatura, código DIGEMID, proveedores, compras y kardex.
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
import { productService } from '@/features/products/services/productService'
import { EMPTY_PRODUCT_FORM, toProductPayload, type ProductFormValues } from '@/features/products/schemas/productSchemas'
import { computeLine, newLine, toPurchaseItems } from '@/features/purchases/lib/purchase'
import { purchasesService } from '@/features/purchases/services/purchasesService'
import { addToCart, cartLineKey, setLineQuantity, type CartLine } from '@/features/sales/lib/cart'
import { toCartItem } from '@/features/sales/lib/cartItem'
import { salesService } from '@/features/sales/services/salesService'
import type { SellableProduct } from '@/features/sales/types'
import { environmentService } from '@/features/sanitary/services/environmentService'
import { addDaysISO, todayISO } from '@/lib/format'

const URL = import.meta.env.VITE_IT_URL as string | undefined
const ANON = import.meta.env.VITE_IT_ANON_KEY as string | undefined
const SERVICE = import.meta.env.VITE_IT_SERVICE_KEY as string | undefined
const enabled = Boolean(URL && ANON && SERVICE)

const run = Math.random().toString(36).slice(2, 8)
const client = (key: string): SupabaseClient =>
  createClient(URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
const product = (o: Partial<ProductFormValues>) => toProductPayload({ ...EMPTY_PRODUCT_FORM, priceUnit: '1.00', ...o })

async function newUser(label: string): Promise<{ db: SupabaseClient; id: string }> {
  const db = client(ANON!)
  const { data, error } = await db.auth.signUp({
    email: `it-f6-${label}-${run}@test.local`,
    password: 'clave-segura-123',
    options: { data: { full_name: `F6 ${label}` } },
  })
  if (error || !data.session || !data.user) throw new Error(`signUp ${label}: ${error?.message ?? 'sin sesión'}`)
  return { db, id: data.user.id }
}

describe.skipIf(!enabled)('Fase 6: cliente, temperatura, DIGEMID, compras y kardex (Supabase local)', () => {
  let admin: SupabaseClient
  let cashier: SupabaseClient
  let stranger: SupabaseClient
  let pharmacyId = ''
  let branchId = ''
  let caro!: SellableProduct
  let barato!: SellableProduct
  let supplierId = ''

  const lines = (p: SellableProduct, qty: number): CartLine[] =>
    setLineQuantity(addToCart([], toCartItem(p, 'unit')), cartLineKey({ productId: p.productId, presentation: 'unit' }), qty)
  const sell = (p: SellableProduct, qty: number, customer?: Parameters<typeof salesService.createSale>[0]['customer']) =>
    salesService.createSale({
      branchId, lines: lines(p, qty), paymentMethod: 'card', amountReceived: null,
      paymentReference: null, idempotencyKey: crypto.randomUUID(), customer,
    })

  beforeAll(async () => {
    const a = await newUser('admin')
    admin = a.db
    const c = await newUser('cajero')
    cashier = c.db
    stranger = (await newUser('ajeno')).db
    holder.current = admin
    const reg = await admin.rpc('register_pharmacy', { p_legal_name: `Botica F6 ${run}` })
    if (reg.error) throw new Error(reg.error.message)
    pharmacyId = reg.data
    branchId = (await branchService.getMainBranch(pharmacyId))!.id
    const link = await client(SERVICE!).from('pharmacy_members').insert({ pharmacy_id: pharmacyId, user_id: c.id, role: 'cashier' })
    if (link.error) throw new Error(link.error.message)

    const p1 = await productService.create(pharmacyId, product({ name: 'Insulina F6', priceUnit: '400.00', digemidCode: '45210' }))
    const p2 = await productService.create(pharmacyId, product({ name: 'Paracetamol F6', priceUnit: '0.50', unitLabel: 'tableta', sellsBox: true, unitsPerBox: '100', priceBox: '40' }))
    for (const id of [p1.id, p2.id]) {
      await inventoryService.registerEntry({
        branchId, productId: id, lotCode: 'INI', expiryDate: addDaysISO(300),
        quantity: 500, unitCost: 0.2, reason: null, idempotencyKey: crypto.randomUUID(),
      })
    }
    caro = (await salesService.searchSellable(branchId, 'Insulina F6'))[0]!
    barato = (await salesService.searchSellable(branchId, 'Paracetamol F6'))[0]!

    holder.current = cashier
    await cashService.openSession(branchId, 0)
  })

  // ------------------------------------------------------------------ Cliente
  it('una venta de S/ 800 sin cliente se rechaza con el mensaje de SUNAT', async () => {
    holder.current = cashier
    await expect(sell(caro, 2)).rejects.toThrow(/supera S\/ 700/)
  })

  it('con DNI y nombre se registra, queda en el comprobante y el cliente se recuerda', async () => {
    holder.current = cashier
    const id = await sell(caro, 2, { docType: 'dni', docNumber: '45678912', name: 'Rosa Quispe' })
    const sale = await salesService.getSale(id)
    expect(sale).toMatchObject({ customer_name: 'Rosa Quispe', customer_doc_type: 'dni', customer_doc_number: '45678912', total: 800 })
    expect(await salesService.findCustomer(pharmacyId, 'dni', '45678912')).toBe('Rosa Quispe')
    expect(await salesService.findCustomer(pharmacyId, 'dni', '11111111')).toBeNull()
  })

  it('una venta pequeña no exige cliente; un RUC con dígito verificador incorrecto se rechaza', async () => {
    holder.current = cashier
    await expect(sell(barato, 2)).resolves.toBeTruthy()
    await expect(sell(barato, 1, { docType: 'ruc', docNumber: '20131312954', name: 'Empresa SAC' })).rejects.toThrow(/documento del cliente no es válido/)
  })

  it('otra botica no encuentra a los clientes de esta', async () => {
    holder.current = stranger
    expect(await salesService.findCustomer(pharmacyId, 'dni', '45678912')).toBeNull()
  })

  // ------------------------------------------------------------------ Temperatura
  it('el cajero registra la temperatura; fuera de rango exige nota; la lista la devuelve con quién registró', async () => {
    holder.current = cashier
    const limits = await environmentService.getLimits()
    expect(limits.find((l) => l.area === 'room')).toEqual({ area: 'room', tempMin: 15, tempMax: 30, humidityMax: 70 })
    await environmentService.record({ branchId, area: 'room', temperature: 23.5, humidity: 55, note: null, idempotencyKey: crypto.randomUUID() })
    await expect(
      environmentService.record({ branchId, area: 'fridge', temperature: 9, humidity: null, note: null, idempotencyKey: crypto.randomUUID() }),
    ).rejects.toThrow(/fuera de rango/)
    await environmentService.record({ branchId, area: 'fridge', temperature: 9, humidity: null, note: 'Se cerró bien la puerta', idempotencyKey: crypto.randomUUID() })

    const rows = await environmentService.listReadings(branchId, todayISO())
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.area === 'fridge')).toMatchObject({ outOfRange: true, note: 'Se cerró bien la puerta', recordedBy: 'F6 cajero' })
    expect(rows.find((r) => r.area === 'room')).toMatchObject({ temperature: 23.5, humidity: 55, outOfRange: false })
  })

  it('otra botica no ve las lecturas ni puede registrar en esta sucursal', async () => {
    holder.current = stranger
    expect(await environmentService.listReadings(branchId, todayISO())).toEqual([])
    await expect(
      environmentService.record({ branchId, area: 'room', temperature: 20, humidity: null, note: null, idempotencyKey: crypto.randomUUID() }),
    ).rejects.toThrow(/permiso/)
  })

  // ------------------------------------------------------------------ DIGEMID
  it('la lista de precios para DIGEMID trae el código del producto', async () => {
    holder.current = admin
    const list = await productService.listForPriceReport(pharmacyId)
    expect(list.map((p) => [p.name, p.digemid_code])).toEqual([
      ['Insulina F6', '45210'],
      ['Paracetamol F6', null],
    ])
  })

  // ------------------------------------------------------------------ Proveedores y compras
  it('proveedores: RUC inválido o duplicado se rechazan con mensaje claro; el cajero no los ve', async () => {
    holder.current = admin
    await expect(purchasesService.createSupplier(pharmacyId, { name: 'Mala', ruc: '20131312954', phone: null, email: null })).rejects.toThrow(/RUC no es válido/)
    supplierId = (await purchasesService.createSupplier(pharmacyId, { name: 'Droguería Andina', ruc: '20131312955', phone: '999', email: null })).id
    await expect(purchasesService.createSupplier(pharmacyId, { name: 'Otra', ruc: '20131312955', phone: null, email: null })).rejects.toThrow(/ese RUC/)
    holder.current = cashier
    expect(await purchasesService.listSuppliers(pharmacyId)).toEqual([])
  })

  it('una compra armada como en el formulario (2 cajas a S/ 47.20 con IGV) entra al stock sin IGV', async () => {
    holder.current = admin
    const ref = { id: barato.productId, name: barato.name, unit_label: 'tableta', units_per_blister: null, units_per_box: 100, tax_affectation: 'gravado' as const }
    const draft = [{ ...newLine(ref), presentation: 'box' as const, quantity: '2', cost: '47.20', lotCode: 'COMPRA-1', expiryDate: addDaysISO(400) }]
    const computed = draft.map((l) => computeLine(l, true))
    expect(computed[0]).toMatchObject({ quantity: 200, unitCost: 0.4, subtotal: 80, igv: 14.4 })

    const id = await purchasesService.registerPurchase({
      branchId, supplierId, docType: 'invoice', docNumber: 'f001-000777', issueDate: todayISO(),
      items: toPurchaseItems(draft, computed), note: 'Pedido semanal', idempotencyKey: crypto.randomUUID(),
    })
    const p = await purchasesService.getPurchase(id)
    expect(p).toMatchObject({ doc_number: 'F001-000777', subtotal: 80, igv: 14.4, total: 94.4, suppliers: { name: 'Droguería Andina' } })
    expect(p.purchase_items).toHaveLength(1)
    const lots = await inventoryService.listLots(branchId, barato.productId)
    expect(lots.find((l) => l.lot_code === 'COMPRA-1')).toMatchObject({ quantity: 200, unit_cost: 0.4 })

    const list = await purchasesService.listPurchases(pharmacyId, 0)
    expect(list.total).toBe(1)
  })

  it('la misma factura del mismo proveedor no se registra dos veces', async () => {
    holder.current = admin
    await expect(
      purchasesService.registerPurchase({
        branchId, supplierId, docType: 'invoice', docNumber: 'F001-000777', issueDate: todayISO(),
        items: [{ product_id: barato.productId, lot_code: 'X', expiry_date: null, quantity: 1, unit_cost: 1 }],
        note: null, idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/ya fue registrado/)
  })

  it('el cajero no registra compras', async () => {
    holder.current = cashier
    await expect(
      purchasesService.registerPurchase({
        branchId, supplierId, docType: 'invoice', docNumber: 'F9-1', issueDate: todayISO(),
        items: [{ product_id: barato.productId, lot_code: 'X', expiry_date: null, quantity: 1, unit_cost: 1 }],
        note: null, idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/administrador/)
  })

  // ------------------------------------------------------------------ Kardex
  it('kardex de hoy: saldo inicial 0, entrada inicial, ventas y compra, y cuadra con los lotes', async () => {
    holder.current = admin
    const rows = await inventoryService.getKardex(branchId, barato.productId, todayISO(), todayISO())
    expect(rows[0]).toMatchObject({ kind: 'opening', balanceQuantity: 0, balanceValue: 0 })
    expect(rows.map((r) => r.kind).slice(1)).toEqual(['entry', 'sale', 'entry'])
    expect(rows.find((r) => r.document?.startsWith('Factura F001-000777'))).toMatchObject({ quantityIn: 200, unitCost: 0.4, valueDelta: 80 })

    const last = rows.at(-1)!
    const lots = await inventoryService.listLots(branchId, barato.productId)
    expect(last.balanceQuantity).toBe(lots.reduce((s, l) => s + l.quantity, 0))
    expect(last.balanceValue).toBeCloseTo(lots.reduce((s, l) => s + l.quantity * l.unit_cost, 0), 2)
  })

  it('el cajero no ve el kardex (tiene costos)', async () => {
    holder.current = cashier
    await expect(inventoryService.getKardex(branchId, barato.productId, todayISO(), todayISO())).rejects.toThrow()
  })
})
