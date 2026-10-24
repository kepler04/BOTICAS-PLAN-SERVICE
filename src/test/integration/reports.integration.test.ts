/**
 * Integración Fase 4: reportes con los SERVICIOS REALES contra Supabase local.
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
import {
  EMPTY_PRODUCT_FORM,
  toProductPayload,
  type ProductFormValues,
} from '@/features/products/schemas/productSchemas'
import { reportService } from '@/features/reports/services/reportService'
import { addToCart, setLineQuantity, cartLineKey } from '@/features/sales/lib/cart'
import { toCartItem } from '@/features/sales/lib/cartItem'
import { salesService } from '@/features/sales/services/salesService'
import type { DateRange } from '@/features/reports/lib/dateRange'

const URL = import.meta.env.VITE_IT_URL as string | undefined
const ANON = import.meta.env.VITE_IT_ANON_KEY as string | undefined
const SERVICE = import.meta.env.VITE_IT_SERVICE_KEY as string | undefined
const enabled = Boolean(URL && ANON && SERVICE)

const run = Math.random().toString(36).slice(2, 8)

/** Fecha "YYYY-MM-DD" en hora de Lima, `daysAgo` días atrás (independiente de la zona de esta máquina). */
function limaDate(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

const client = (key: string): SupabaseClient =>
  createClient(URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function newUser(label: string): Promise<{ db: SupabaseClient; id: string }> {
  const db = client(ANON!)
  const { data, error } = await db.auth.signUp({
    email: `it4-${label}-${run}@test.local`,
    password: 'clave-segura-123',
    options: { data: { full_name: `Usuario ${label}` } },
  })
  if (error || !data.session || !data.user) throw new Error(`signUp ${label}: ${error?.message ?? 'sin sesión'}`)
  return { db, id: data.user.id }
}

const product = (o: Partial<ProductFormValues>) => toProductPayload({ ...EMPTY_PRODUCT_FORM, priceUnit: '1.00', ...o })

describe.skipIf(!enabled)('integración: reportes (Supabase local)', () => {
  let admin: SupabaseClient
  let cashier: SupabaseClient
  let stranger: SupabaseClient
  let pharmacyId = ''
  let branchId = ''
  let productId = ''
  const last30: () => DateRange = () => ({ from: limaDate(29), to: limaDate(0) })

  beforeAll(async () => {
    admin = (await newUser('admin')).db
    const c = await newUser('cashier')
    cashier = c.db
    stranger = (await newUser('stranger')).db

    holder.current = admin
    const reg = await admin.rpc('register_pharmacy', { p_legal_name: `Botica Reportes IT ${run}` })
    if (reg.error) throw new Error(reg.error.message)
    pharmacyId = reg.data
    branchId = (await branchService.getMainBranch(pharmacyId))!.id
    const service = client(SERVICE!)
    const link = await service.from('pharmacy_members').insert({ pharmacy_id: pharmacyId, user_id: c.id, role: 'cashier' })
    if (link.error) throw new Error(link.error.message)

    // Productos y stock: P (1 000 u. a costo 0.40) y Z (5 u. a costo 2.00, sin ventas).
    const p = await productService.create(pharmacyId, product({ name: 'Producto P', unitLabel: 'tableta', priceUnit: '1.00' }))
    const z = await productService.create(pharmacyId, product({ name: 'Producto Z', unitLabel: 'frasco', priceUnit: '9.00' }))
    productId = p.id
    const entry = (id: string, qty: number, cost: number) =>
      inventoryService.registerEntry({ branchId, productId: id, lotCode: 'L-1', expiryDate: limaDate(-400), quantity: qty, unitCost: cost, reason: null, idempotencyKey: crypto.randomUUID() })
    await entry(p.id, 1000, 0.4)
    await entry(z.id, 5, 2)

    // Venta de HOY por el flujo real: 10 u. de P a S/ 1.00 = 10.00 (costo 10 × 0.40 = 4.00).
    await cashService.openSession(branchId, 100)
    const found = (await salesService.searchSellable(branchId, 'Producto P'))[0]!
    let lines = addToCart([], toCartItem(found, 'unit'))
    lines = setLineQuantity(lines, cartLineKey({ productId: found.productId, presentation: 'unit' }), 10)
    await salesService.createSale({ branchId, lines, paymentMethod: 'cash', amountReceived: 10, paymentReference: null, idempotencyKey: crypto.randomUUID() })

    // Historia con service_role: hace 3 días (5 u., costo 0.50) y hace 40 días (20 u., fuera de 30 días).
    const [cash] = (await service.from('cash_sessions').select('id').eq('branch_id', branchId).limit(1)).data ?? []
    const seed = async (daysAgo: number, number: number, qty: number, cost: number) => {
      // 10:00 en Lima (15:00 UTC) del día de Lima indicado: no se deriva del día UTC, que de noche ya es "mañana".
      const when = new Date(`${limaDate(daysAgo)}T15:00:00Z`)
      const saleId = crypto.randomUUID()
      const itemId = crypto.randomUUID()
      const r1 = await service.from('sales').insert({ id: saleId, pharmacy_id: pharmacyId, branch_id: branchId, cash_session_id: cash!.id, receipt_number: number, status: 'completed', payment_method: 'yape', total: qty, amount_received: qty, change_given: 0, created_at: when.toISOString() })
      const r2 = await service.from('sale_items').insert({ id: itemId, pharmacy_id: pharmacyId, sale_id: saleId, product_id: productId, product_name: 'Producto P', presentation: 'unit', quantity: qty, units_per_presentation: 1, base_quantity: qty, unit_price: 1, line_total: qty })
      const lot = (await service.from('lots').select('id').eq('product_id', productId).limit(1)).data![0]!
      const r3 = await service.from('sale_item_lots').insert({ pharmacy_id: pharmacyId, sale_item_id: itemId, lot_id: lot.id, quantity: qty, unit_cost: cost })
      for (const r of [r1, r2, r3]) if (r.error) throw new Error(r.error.message)
    }
    await seed(3, 200, 5, 0.5)
    await seed(40, 201, 20, 0.5)
  })

  it('resumen de 30 días: ventas, costo y ganancia (excluye lo de hace 40 días)', async () => {
    holder.current = admin
    const s = await reportService.salesSummary(branchId, last30())
    // Hoy: 10.00 con IGV (base 8.47, IGV 1.53). Hace 3 días: 5.00 sin desglose (insertada directo, sin IGV).
    expect(s).toMatchObject({ salesCount: 2, total: 15, igv: 1.53, net: 13.47, cost: 6.5, profit: 6.97, avgTicket: 7.5, voidedCount: 0 })
  })

  it('la serie diaria cubre los 30 días y ubica cada venta en su día de Lima', async () => {
    const series = await reportService.salesSeries(branchId, last30(), 'day')
    expect(series).toHaveLength(30)
    const today = series.find((p) => p.period === limaDate(0))!
    expect(today).toMatchObject({ salesCount: 1, total: 10, igv: 1.53, net: 8.47, cash: 10, cost: 4, profit: 4.47 })
    const threeAgo = series.find((p) => p.period === limaDate(3))!
    expect(threeAgo).toMatchObject({ salesCount: 1, total: 5, yape: 5, cost: 2.5, profit: 2.5 })
    expect(series.filter((p) => p.salesCount > 0)).toHaveLength(2)
  })

  it('la serie mensual agrupa por mes', async () => {
    const series = await reportService.salesSeries(branchId, { from: limaDate(60), to: limaDate(0) }, 'month')
    expect(series.length).toBeGreaterThanOrEqual(2)
    expect(series.reduce((sum, p) => sum + p.total, 0)).toBe(35) // 10 + 5 + 20
    expect(series.every((p) => p.period.endsWith('-01'))).toBe(true)
  })

  it('más vendidos por ingreso, unidades y ganancia, con margen', async () => {
    const byRevenue = await reportService.topProducts(branchId, last30(), 'revenue', 10)
    expect(byRevenue).toHaveLength(1)
    expect(byRevenue[0]).toMatchObject({ name: 'Producto P', units: 15, revenue: 15, net: 13.47, cost: 6.5, profit: 6.97 })
    expect(byRevenue[0]!.margin).toBeCloseTo(51.7, 1) // 6.97 / 13.47: el margen es sobre la venta NETA
    expect((await reportService.topProducts(branchId, last30(), 'units', 10))[0]!.units).toBe(15)
    expect((await reportService.topProducts(branchId, last30(), 'profit', 1)).length).toBe(1)
  })

  it('baja rotación: lo que no se vende va primero, con su capital parado', async () => {
    const slow = await reportService.slowMovers(branchId, 30, 10)
    expect(slow.map((r) => r.name)).toEqual(['Producto Z', 'Producto P'])
    expect(slow[0]).toMatchObject({ unitsSold: 0, stockUnits: 5, stockCost: 10, lastSaleAt: null })
    expect(slow[1]).toMatchObject({ unitsSold: 15, stockUnits: 990 })
    expect(slow[1]!.stockCost).toBeCloseTo(396, 2)
    expect(slow[1]!.lastSaleAt).not.toBeNull()
  })

  it('valor del inventario a costo', async () => {
    const v = await reportService.inventoryValue(branchId)
    expect(v.stockCost).toBeCloseTo(406, 2) // 990 × 0.40 + 5 × 2.00
    expect(v.stockUnits).toBe(995)
    expect(v.productsWithStock).toBe(2)
    expect(v.expiredCost).toBe(0)
  })

  it('rechaza rangos inválidos con mensaje en español', async () => {
    await expect(reportService.salesSummary(branchId, { from: limaDate(0), to: limaDate(5) })).rejects.toThrow(/rango de fechas/)
    await expect(reportService.salesSeries(branchId, last30(), 'week' as 'day')).rejects.toThrow(/agrupación/)
  })

  it('el cajero no puede ver ningún reporte (evita márgenes falsos por costos ocultos)', async () => {
    holder.current = cashier
    await expect(reportService.salesSummary(branchId, last30())).rejects.toThrow(/Solo el administrador/)
    await expect(reportService.salesSeries(branchId, last30(), 'day')).rejects.toThrow(/Solo el administrador/)
    await expect(reportService.topProducts(branchId, last30(), 'revenue', 5)).rejects.toThrow(/Solo el administrador/)
    await expect(reportService.slowMovers(branchId, 30, 5)).rejects.toThrow(/Solo el administrador/)
    await expect(reportService.inventoryValue(branchId)).rejects.toThrow(/Solo el administrador/)
  })

  it('otra botica no puede ver los reportes de esta sucursal', async () => {
    holder.current = stranger
    await expect(reportService.salesSummary(branchId, last30())).rejects.toThrow(/Solo el administrador/)
    await expect(reportService.inventoryValue(branchId)).rejects.toThrow(/Solo el administrador/)
    holder.current = admin
  })
})
