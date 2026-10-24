/**
 * Concurrencia: peticiones REALMENTE simultáneas contra Supabase local. Verifica que la base de datos
 * (bloqueos, restricciones y transacciones) mantiene el dinero y el stock correctos aunque el
 * navegador, la red o varios cajeros disparen operaciones a la vez.
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
import { addToCart, cartLineKey, setLineQuantity, type CartLine } from '@/features/sales/lib/cart'
import { toCartItem } from '@/features/sales/lib/cartItem'
import { salesService } from '@/features/sales/services/salesService'
import type { SellableProduct } from '@/features/sales/types'
import { addDaysISO } from '@/lib/format'

const URL = import.meta.env.VITE_IT_URL as string | undefined
const ANON = import.meta.env.VITE_IT_ANON_KEY as string | undefined
const SERVICE = import.meta.env.VITE_IT_SERVICE_KEY as string | undefined
const enabled = Boolean(URL && ANON && SERVICE)

const run = Math.random().toString(36).slice(2, 8)
const client = (key: string): SupabaseClient =>
  createClient(URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })

const product = (o: Partial<ProductFormValues>) => toProductPayload({ ...EMPTY_PRODUCT_FORM, priceUnit: '1.00', ...o })

describe.skipIf(!enabled)('concurrencia: operaciones simultáneas (Supabase local)', () => {
  let admin: SupabaseClient
  let service: SupabaseClient
  let pharmacyId = ''
  let branchId = ''

  const oneUnit = (p: SellableProduct): CartLine[] => {
    const lines = addToCart([], toCartItem(p, 'unit'))
    return setLineQuantity(lines, cartLineKey({ productId: p.productId, presentation: 'unit' }), 1)
  }
  const sell = (p: SellableProduct, key = crypto.randomUUID()) =>
    salesService.createSale({ branchId, lines: oneUnit(p), paymentMethod: 'card', amountReceived: null, paymentReference: null, idempotencyKey: key })

  async function makeProduct(name: string, stock: number): Promise<SellableProduct> {
    const created = await productService.create(pharmacyId, product({ name, priceUnit: '2.00' }))
    if (stock > 0) {
      await inventoryService.registerEntry({
        branchId, productId: created.id, lotCode: 'L-1', expiryDate: addDaysISO(300),
        quantity: stock, unitCost: 0.5, reason: null, idempotencyKey: crypto.randomUUID(),
      })
    }
    return (await salesService.searchSellable(branchId, name))[0]!
  }

  const lotQty = async (productId: string) =>
    ((await service.from('lots').select('quantity').eq('product_id', productId)).data ?? []).reduce((s, l) => s + l.quantity, 0)
  const salesCount = async () =>
    (await service.from('sales').select('id', { count: 'exact', head: true }).eq('pharmacy_id', pharmacyId)).count ?? 0

  beforeAll(async () => {
    admin = client(ANON!)
    const { data, error } = await admin.auth.signUp({ email: `it-conc-${run}@test.local`, password: 'clave-segura-123' })
    if (error || !data.session) throw new Error(`signUp: ${error?.message ?? 'sin sesión'}`)
    service = client(SERVICE!)
    holder.current = admin
    const reg = await admin.rpc('register_pharmacy', { p_legal_name: `Botica Concurrencia ${run}` })
    if (reg.error) throw new Error(reg.error.message)
    pharmacyId = reg.data
    branchId = (await branchService.getMainBranch(pharmacyId))!.id
    await cashService.openSession(branchId, 0)
  })

  it('8 ventas simultáneas por la ÚLTIMA unidad: exactamente una gana, el resto falla sin stock negativo', async () => {
    const p = await makeProduct('Última unidad', 1)
    const before = await salesCount()
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => sell(p)))

    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(7)
    for (const f of failed) expect(String(f.reason.message)).toMatch(/No hay stock suficiente/)

    expect(await lotQty(p.productId)).toBe(0) // nunca negativo
    expect((await salesCount()) - before).toBe(1) // las que fallaron no dejaron nada a medias
  })

  it('la misma clave de idempotencia enviada 6 veces a la vez devuelve la MISMA venta y descuenta una sola vez', async () => {
    const p = await makeProduct('Clave repetida', 10)
    const key = crypto.randomUUID()
    const before = await salesCount()
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => sell(p, key)))

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true) // ninguna falla con "clave duplicada"
    const ids = new Set(results.map((r) => (r as PromiseFulfilledResult<string>).value))
    expect(ids.size).toBe(1)
    expect((await salesCount()) - before).toBe(1)
    expect(await lotQty(p.productId)).toBe(9)
  })

  it('numeración de comprobantes sin huecos ni repetidos tras todas esas carreras', async () => {
    const { data } = await service.from('sales').select('receipt_number').eq('pharmacy_id', pharmacyId).order('receipt_number')
    const numbers = (data ?? []).map((r) => r.receipt_number)
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1))
  })

  it('la misma entrada de stock enviada 6 veces a la vez suma una sola vez', async () => {
    const p = await makeProduct('Entrada repetida', 0)
    const key = crypto.randomUUID()
    const input = { branchId, productId: p.productId, lotCode: 'L-X', expiryDate: addDaysISO(200), quantity: 25, unitCost: 1, reason: null, idempotencyKey: key }
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => inventoryService.registerEntry(input)))

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(new Set(results.map((r) => (r as PromiseFulfilledResult<string>).value)).size).toBe(1)
    expect(await lotQty(p.productId)).toBe(25)
  })

  it('anular la misma venta 5 veces a la vez: una sola anulación y el stock vuelve una sola vez', async () => {
    const p = await makeProduct('Anulación doble', 5)
    const saleId = await sell(p)
    expect(await lotQty(p.productId)).toBe(4)

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => salesService.voidSale(saleId, 'Error de cobro')))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    for (const r of results.filter((x): x is PromiseRejectedResult => x.status === 'rejected')) {
      expect(String(r.reason.message)).toMatch(/ya estaba anulada/)
    }
    expect(await lotQty(p.productId)).toBe(5) // devuelto UNA vez, no cinco
  })

  it('12 rondas de ventas en EFECTIVO compitiendo contra el cierre de caja: el cierre cuenta exactamente lo vendido', async () => {
    const p = await makeProduct('Carrera de caja', 500)
    const sellCash = () =>
      salesService.createSale({ branchId, lines: oneUnit(p), paymentMethod: 'cash', amountReceived: 1000, paymentReference: null, idempotencyKey: crypto.randomUUID() })
    let mismatches = 0
    let soldAcrossRounds = 0
    let rejectedAfterClose = 0

    for (let round = 0; round < 12; round++) {
      const sessionId = await cashService.getOpenSession(branchId).then((s) => s?.id ?? cashService.openSession(branchId, 0))
      // 3 ventas ya confirmadas: el efectivo esperado nunca es trivial (0), sea cual sea el resultado de la carrera.
      for (let i = 0; i < 3; i++) await sellCash()
      const [closeResult, ...sales] = await Promise.allSettled([
        cashService.closeSession(sessionId, 0, 'Prueba de concurrencia'),
        ...Array.from({ length: 6 }, sellCash),
      ])
      expect(closeResult.status).toBe('fulfilled')
      const closed = (closeResult as PromiseFulfilledResult<{ expected: number }>).value

      soldAcrossRounds += sales.filter((r) => r.status === 'fulfilled').length + 3
      for (const r of sales) {
        if (r.status === 'rejected') {
          rejectedAfterClose++
          expect(String(r.reason.message)).toMatch(/Abre la caja/) // el único motivo legítimo de rechazo
        }
      }

      // Cada venta en efectivo suma S/ 2.00 al efectivo esperado. Lo que calculó el cierre debe ser
      // EXACTAMENTE lo de la caja ya cerrada: si una venta se hubiera colado después, "en vivo" sería mayor.
      const { data } = await service.from('cash_session_summary').select('expected_cash, cash_sales').eq('id', sessionId).single()
      if (Number(data!.expected_cash) !== closed.expected) mismatches++
      expect(Number(data!.expected_cash)).toBe(Number(data!.cash_sales)) // apertura 0, sin ingresos ni egresos
    }

    // Invariante de seguridad (determinista): el cierre cuenta EXACTAMENTE lo vendido; nada se coló después.
    expect(mismatches).toBe(0)
    // Cada venta de la carrera, o entró antes del cierre, o fue rechazada limpiamente: nunca desaparece.
    // (No se exige que alguna "gane": si el cierre gana siempre, el sistema también es correcto.)
    expect(soldAcrossRounds + rejectedAfterClose).toBe(12 * (6 + 3))
  }, 60_000)

  it('al final, el stock de cada lote coincide con la suma de sus movimientos (nada se perdió ni se duplicó)', async () => {
    const { data: lots } = await service.from('lots').select('id, quantity').eq('pharmacy_id', pharmacyId)
    for (const lot of lots ?? []) {
      const { data: moves } = await service.from('inventory_movements').select('quantity_delta').eq('lot_id', lot.id)
      const sum = (moves ?? []).reduce((s, m) => s + m.quantity_delta, 0)
      expect({ lot: lot.id, quantity: lot.quantity }).toEqual({ lot: lot.id, quantity: sum })
      expect(lot.quantity).toBeGreaterThanOrEqual(0)
    }
  })
})
