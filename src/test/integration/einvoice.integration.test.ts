/**
 * Facturación electrónica de punta a punta: servicio del front -> Edge Function `einvoice-emit` -> SUNAT BETA.
 * Necesita `npx supabase start` con el certificado de pruebas (`npm run einvoice:cert`) y salida a internet.
 * Si SUNAT BETA no responde, las pruebas se saltan (no es un fallo de este sistema).
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
import { einvoiceService } from '@/features/einvoice/services/einvoiceService'
import { inventoryService } from '@/features/inventory/services/inventoryService'
import { EMPTY_PRODUCT_FORM, toProductPayload } from '@/features/products/schemas/productSchemas'
import { productService } from '@/features/products/services/productService'
import { addToCart, cartLineKey, setLineQuantity } from '@/features/sales/lib/cart'
import { toCartItem } from '@/features/sales/lib/cartItem'
import { salesService } from '@/features/sales/services/salesService'
import type { SellableProduct } from '@/features/sales/types'
import { settingsService } from '@/features/settings/services/settingsService'
import { addDaysISO } from '@/lib/format'

const URL = import.meta.env.VITE_IT_URL as string | undefined
const ANON = import.meta.env.VITE_IT_ANON_KEY as string | undefined
const SERVICE = import.meta.env.VITE_IT_SERVICE_KEY as string | undefined
const enabled = Boolean(URL && ANON && SERVICE)

/** ¿Responde SUNAT BETA desde aquí? (en algunos entornos de CI puede no haber salida o estar bloqueado). */
const sunatReachable = await (async () => {
  if (!enabled) return false
  try {
    const r = await fetch('https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl', { signal: AbortSignal.timeout(10_000) })
    return r.ok
  } catch {
    return false
  }
})()
if (enabled && !sunatReachable) console.warn('SUNAT BETA no responde: se saltan las pruebas de facturación electrónica.')

const run = Math.random().toString(36).slice(2, 8)

/** RUC con dígito verificador válido y distinto en cada corrida (el RUC es único entre boticas). */
function randomRuc(): string {
  const base = '206' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const d = 11 - ([...base].reduce((s, c, i) => s + Number(c) * w[i]!, 0) % 11)
  return base + (d === 10 ? 0 : d === 11 ? 1 : d)
}
const RUC = randomRuc()
const client = (key: string): SupabaseClient => createClient(URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })

describe.skipIf(!sunatReachable)('facturación electrónica contra SUNAT BETA (Edge Function real)', () => {
  let admin: SupabaseClient
  let pharmacyId = ''
  let branchId = ''
  let product!: SellableProduct

  const sell = (qty: number, customer?: Parameters<typeof salesService.createSale>[0]['customer']) =>
    salesService.createSale({
      branchId,
      lines: setLineQuantity(addToCart([], toCartItem(product, 'unit')), cartLineKey({ productId: product.productId, presentation: 'unit' }), qty),
      paymentMethod: 'card',
      amountReceived: null,
      paymentReference: null,
      idempotencyKey: crypto.randomUUID(),
      customer,
    })

  beforeAll(async () => {
    admin = client(ANON!)
    const { data, error } = await admin.auth.signUp({ email: `it-ei-${run}@test.local`, password: 'clave-segura-123' })
    if (error || !data.session) throw new Error(`signUp: ${error?.message ?? 'sin sesión'}`)
    holder.current = admin
    const reg = await admin.rpc('register_pharmacy', { p_legal_name: `Botica Facturacion ${run}` })
    if (reg.error) throw new Error(reg.error.message)
    pharmacyId = reg.data
    branchId = (await branchService.getMainBranch(pharmacyId))!.id
    const p = await productService.create(pharmacyId, toProductPayload({ ...EMPTY_PRODUCT_FORM, name: 'Producto IT', priceUnit: '11.80' }))
    await inventoryService.registerEntry({
      branchId, productId: p.id, lotCode: 'L1', expiryDate: addDaysISO(300), quantity: 100, unitCost: 2, reason: null, idempotencyKey: crypto.randomUUID(),
    })
    product = (await salesService.searchSellable(branchId, 'Producto IT'))[0]!
    await cashService.openSession(branchId, 0)
  })

  it('sin activar la facturación, emitir se rechaza con un mensaje claro', async () => {
    const id = await sell(1)
    await expect(einvoiceService.emit(id)).rejects.toThrow(/desactivada/)
  })

  it('con la facturación activa, una venta sin cliente sale como BOLETA B001-1 aceptada por SUNAT', async () => {
    await settingsService.updatePharmacy(pharmacyId, {
      legalName: `Botica Facturacion ${run} SAC`, tradeName: '', ruc: RUC, chargesIgv: true,
      fiscalAddress: 'Av. Larco 1234, Miraflores, Lima', ubigeo: '150122', einvoiceEnabled: true,
    })
    const id = await sell(2)
    const doc = await einvoiceService.emit(id)
    expect(doc).toMatchObject({ docType: '03', series: 'B001', number: 1, status: 'accepted', sunatCode: '0', environment: 'beta' })
    expect(doc.sunatDescription).toMatch(/La Boleta numero B001-1, ha sido aceptada/)
    expect(doc.hash).toMatch(/^[A-Za-z0-9+/]{43}=$/) // SHA-256 en base64
    expect(await einvoiceService.getBySale(id)).toEqual(doc)
  })

  it('con RUC del cliente sale como FACTURA F001-1, también aceptada', async () => {
    const id = await sell(1, { docType: 'ruc', docNumber: '20600000048', name: 'Clinica San Gabriel SAC' })
    const doc = await einvoiceService.emit(id)
    expect(doc).toMatchObject({ docType: '01', series: 'F001', number: 1, status: 'accepted' })
    expect(doc.sunatDescription).toMatch(/La Factura numero F001-1, ha sido aceptada/)
  })

  it('reintentar no reenvía: devuelve el mismo comprobante con un solo intento', async () => {
    const id = await sell(1)
    const first = await einvoiceService.emit(id)
    const again = await einvoiceService.emit(id)
    expect(again).toEqual(first)
    expect(again.attempts).toBe(1)
  })

  it('una venta con comprobante aceptado ya no se puede anular (requiere nota de crédito)', async () => {
    const id = await sell(1)
    await einvoiceService.emit(id)
    await expect(salesService.voidSale(id, 'Cliente se arrepintió')).rejects.toThrow(/nota de crédito/)
  })
})
