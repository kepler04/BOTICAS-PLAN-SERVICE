/**
 * Integración del IGV (18 %) y del pago con tarjeta con los SERVICIOS REALES contra Supabase local.
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
import { settingsService } from '@/features/settings/services/settingsService'
import { addToCart, cartLineKey, setLineQuantity, type CartLine } from '@/features/sales/lib/cart'
import { toCartItem } from '@/features/sales/lib/cartItem'
import { salesService } from '@/features/sales/services/salesService'
import type { PaymentMethod, SellableProduct } from '@/features/sales/types'
import { addDaysISO } from '@/lib/format'

const URL = import.meta.env.VITE_IT_URL as string | undefined
const ANON = import.meta.env.VITE_IT_ANON_KEY as string | undefined
const SERVICE = import.meta.env.VITE_IT_SERVICE_KEY as string | undefined
const enabled = Boolean(URL && ANON && SERVICE)

const run = Math.random().toString(36).slice(2, 8)
const client = (key: string): SupabaseClient =>
  createClient(URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function newUser(label: string): Promise<{ db: SupabaseClient; id: string }> {
  const db = client(ANON!)
  const { data, error } = await db.auth.signUp({ email: `it5-${label}-${run}@test.local`, password: 'clave-segura-123' })
  if (error || !data.session || !data.user) throw new Error(`signUp ${label}: ${error?.message ?? 'sin sesión'}`)
  return { db, id: data.user.id }
}

const product = (o: Partial<ProductFormValues>) => toProductPayload({ ...EMPTY_PRODUCT_FORM, priceUnit: '1.00', ...o })

function cart(...entries: [SellableProduct, number][]): CartLine[] {
  let lines: CartLine[] = []
  for (const [p, qty] of entries) {
    lines = addToCart(lines, toCartItem(p, 'unit'))
    lines = setLineQuantity(lines, cartLineKey({ productId: p.productId, presentation: 'unit' }), qty)
  }
  return lines
}

describe.skipIf(!enabled)('integración: IGV y tarjeta (Supabase local)', () => {
  let admin: SupabaseClient
  let cashier: SupabaseClient
  let pharmacyId = ''
  let branchId = ''
  let g!: SellableProduct // gravado   11.80
  let e!: SellableProduct // exonerado  5.00
  let i!: SellableProduct // inafecto   3.00

  const sell = (lines: CartLine[], method: PaymentMethod = 'cash', received: number | null = 100) =>
    salesService.createSale({
      branchId,
      lines,
      paymentMethod: method,
      amountReceived: method === 'cash' ? received : null,
      paymentReference: null,
      idempotencyKey: crypto.randomUUID(),
    })

  beforeAll(async () => {
    admin = (await newUser('admin')).db
    const c = await newUser('cashier')
    cashier = c.db
    holder.current = admin
    const reg = await admin.rpc('register_pharmacy', { p_legal_name: `Botica IGV IT ${run}` })
    if (reg.error) throw new Error(reg.error.message)
    pharmacyId = reg.data
    branchId = (await branchService.getMainBranch(pharmacyId))!.id
    const link = await client(SERVICE!).from('pharmacy_members').insert({ pharmacy_id: pharmacyId, user_id: c.id, role: 'cashier' })
    if (link.error) throw new Error(link.error.message)

    const pg = await productService.create(pharmacyId, product({ name: 'Gravado G', priceUnit: '11.80', taxAffectation: 'gravado' }))
    const pe = await productService.create(pharmacyId, product({ name: 'Exonerado E', priceUnit: '5.00', taxAffectation: 'exonerado' }))
    const pi = await productService.create(pharmacyId, product({ name: 'Inafecto I', priceUnit: '3.00', taxAffectation: 'inafecto' }))
    for (const p of [pg, pe, pi]) {
      await inventoryService.registerEntry({ branchId, productId: p.id, lotCode: 'L-1', expiryDate: addDaysISO(300), quantity: 500, unitCost: 0.5, reason: null, idempotencyKey: crypto.randomUUID() })
    }
    await cashService.openSession(branchId, 100)
    const found = await salesService.searchSellable(branchId, '')
    g = found.find((p) => p.name === 'Gravado G')!
    e = found.find((p) => p.name === 'Exonerado E')!
    i = found.find((p) => p.name === 'Inafecto I')!
  })

  it('el POS conoce la afectación de cada producto', () => {
    expect([g.taxAffectation, e.taxAffectation, i.taxAffectation]).toEqual(['gravado', 'exonerado', 'inafecto'])
  })

  it('desglosa gravado, exonerado, inafecto e IGV (los precios ya incluyen IGV)', async () => {
    const id = await sell(cart([g, 1], [e, 1], [i, 2])) // 11.80 + 5.00 + 6.00
    const d = await salesService.getSale(id)
    expect(d).toMatchObject({ total: 22.8, charges_igv: true, total_gravado: 10, total_exonerado: 5, total_inafecto: 6, total_igv: 1.8 })
    expect(d.total).toBeCloseTo(d.total_gravado + d.total_exonerado + d.total_inafecto + d.total_igv, 2)

    const byName = Object.fromEntries(d.sale_items.map((x) => [x.product_name, x]))
    expect(byName['Gravado G']).toMatchObject({ tax_affectation: 'gravado', igv_rate: 18, igv_amount: 1.8, taxable_amount: 10 })
    expect(byName['Exonerado E']).toMatchObject({ tax_affectation: 'exonerado', igv_rate: 0, igv_amount: 0, taxable_amount: 5 })
    expect(byName['Inafecto I']).toMatchObject({ tax_affectation: 'inafecto', igv_amount: 0 })
  })

  it('el pago con tarjeta no tiene vuelto y no entra al efectivo esperado de la caja', async () => {
    const id = await sell(cart([g, 1]), 'card') // 11.80
    const d = await salesService.getSale(id)
    expect(d).toMatchObject({ payment_method: 'card', amount_received: 11.8, change_given: 0 })

    const open = await cashService.getOpenSession(branchId)
    expect(open?.cardSales).toBe(11.8)
    expect(open?.expectedCash).toBe(100 + 22.8) // apertura + efectivo; la tarjeta NO entra al cajón
  })

  it('cambiar la afectación de un producto no altera los comprobantes ya emitidos', async () => {
    const id = await sell(cart([g, 1]))
    await productService.update(g.productId, product({ name: 'Gravado G', priceUnit: '11.80', taxAffectation: 'exonerado' }))
    const d = await salesService.getSale(id)
    expect(d.sale_items[0]).toMatchObject({ tax_affectation: 'gravado', igv_amount: 1.8 })
    await productService.update(g.productId, product({ name: 'Gravado G', priceUnit: '11.80', taxAffectation: 'gravado' }))
  })

  it('el reporte separa IGV y venta neta, y la ganancia se calcula sobre la neta', async () => {
    const { reportService } = await import('@/features/reports/services/reportService')
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const s = await reportService.salesSummary(branchId, { from: today, to: today })
    // Cobrado: 22.80 + 11.80 + 11.80 = 46.40 | IGV: 1.80 + 1.80 + 1.80 = 5.40 | neta: 41.00
    // Costo: (G1 + E1 + I2) + G1 + G1 = 6 u. x 0.50 = 3.00 | ganancia sobre la NETA: 41.00 - 3.00 = 38.00 (no 43.40)
    expect(s).toMatchObject({ salesCount: 3, total: 46.4, igv: 5.4, net: 41, cost: 3, profit: 38 })
  })

  it('el cajero no puede cambiar la configuración tributaria; el admin sí', async () => {
    holder.current = cashier
    await expect(
      settingsService.updatePharmacy(pharmacyId, { legalName: 'Intento', tradeName: '', ruc: '', chargesIgv: false }),
    ).rejects.toThrow(/No tienes permiso/)
    expect((await settingsService.getPharmacy(pharmacyId)).chargesIgv).toBe(true)

    holder.current = admin
    await settingsService.updatePharmacy(pharmacyId, { legalName: `Botica IGV IT ${run}`, tradeName: '', ruc: '', chargesIgv: false })
    expect((await settingsService.getPharmacy(pharmacyId)).chargesIgv).toBe(false)
  })

  it('con la botica sin IGV, las ventas nuevas no desglosan y las anteriores conservan su desglose', async () => {
    const id = await sell(cart([g, 1]))
    expect(await salesService.getSale(id)).toMatchObject({ charges_igv: false, total: 11.8, total_igv: 0, total_gravado: 0 })

    const history = await salesService.listSales(branchId, { page: 0, from: null, to: null, status: 'completed' })
    const first = history.rows.find((r) => r.total === 22.8)!
    expect(first.total_igv).toBe(1.8) // la primera venta sigue con su IGV
  })

  it('rechaza un RUC duplicado con mensaje en español', async () => {
    const other = await newUser('other')
    // RUC aleatorio por corrida: la prueba debe poder repetirse sobre la misma base.
    const ruc = `20${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
    holder.current = other.db
    const r = await other.db.rpc('register_pharmacy', { p_legal_name: `Otra ${run}`, p_ruc: ruc })
    expect(r.error).toBeNull()
    holder.current = admin
    await expect(
      settingsService.updatePharmacy(pharmacyId, { legalName: `Botica IGV IT ${run}`, tradeName: '', ruc, chargesIgv: false }),
    ).rejects.toThrow(/RUC/)
  })
})
