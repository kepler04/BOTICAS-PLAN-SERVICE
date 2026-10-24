/**
 * Alternativas por principio activo en el POS, contra Supabase local.
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
import { inventoryService } from '@/features/inventory/services/inventoryService'
import {
  EMPTY_PRODUCT_FORM,
  toProductPayload,
  type ProductFormValues,
} from '@/features/products/schemas/productSchemas'
import { productService } from '@/features/products/services/productService'
import { salesService } from '@/features/sales/services/salesService'
import { addDaysISO } from '@/lib/format'

const URL = import.meta.env.VITE_IT_URL as string | undefined
const ANON = import.meta.env.VITE_IT_ANON_KEY as string | undefined
const SERVICE = import.meta.env.VITE_IT_SERVICE_KEY as string | undefined
const enabled = Boolean(URL && ANON && SERVICE)

const run = Math.random().toString(36).slice(2, 8)
const client = (key: string): SupabaseClient =>
  createClient(URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
const product = (o: Partial<ProductFormValues>) => toProductPayload({ ...EMPTY_PRODUCT_FORM, priceUnit: '1.00', ...o })

describe.skipIf(!enabled)('alternativas por principio activo (Supabase local)', () => {
  let service: SupabaseClient
  let pharmacyId = ''
  let branchId = ''
  const ids: Record<string, string> = {}

  async function make(key: string, name: string, genericName: string, stock: number) {
    const created = await productService.create(pharmacyId, product({ name, genericName }))
    ids[key] = created.id
    if (stock > 0) {
      await inventoryService.registerEntry({
        branchId, productId: created.id, lotCode: 'L-1', expiryDate: addDaysISO(300),
        quantity: stock, unitCost: 0.5, reason: null, idempotencyKey: crypto.randomUUID(),
      })
    }
  }

  beforeAll(async () => {
    service = client(SERVICE!)
    const admin = client(ANON!)
    const { data, error } = await admin.auth.signUp({ email: `it-alt-${run}@test.local`, password: 'clave-segura-123' })
    if (error || !data.session) throw new Error(`signUp: ${error?.message ?? 'sin sesión'}`)
    holder.current = admin
    const reg = await admin.rpc('register_pharmacy', { p_legal_name: `Botica Alternativas ${run}` })
    if (reg.error) throw new Error(reg.error.message)
    pharmacyId = reg.data
    branchId = (await branchService.getMainBranch(pharmacyId))!.id

    await make('agotado', 'Ibuprofeno 400 mg Marca', 'Ibuprofeno', 0)
    await make('conStock', 'Ibuprofeno 600 mg Genérico', 'ibuprofeno', 5) // distinta capitalización
    await make('sinStock', 'Ibuprofeno 200 mg', 'Ibuprofeno', 0)
    await make('inactivo', 'Ibuprofeno 800 mg', 'Ibuprofeno', 4)
    await make('otro', 'Naproxeno 550 mg', 'Naproxeno', 5)
    await service.from('products').update({ active: false }).eq('id', ids.inactivo!)

    // Otra botica con el mismo principio activo y stock: nunca debe aparecer.
    const stranger = client(ANON!)
    await stranger.auth.signUp({ email: `it-alt-otra-${run}@test.local`, password: 'clave-segura-123' })
    holder.current = stranger
    const reg2 = await stranger.rpc('register_pharmacy', { p_legal_name: `Botica Ajena ${run}` })
    const otherPharmacy = reg2.data as string
    const otherBranch = (await branchService.getMainBranch(otherPharmacy))!.id
    const p = await productService.create(otherPharmacy, product({ name: 'Ibuprofeno Ajeno', genericName: 'Ibuprofeno' }))
    await inventoryService.registerEntry({
      branchId: otherBranch, productId: p.id, lotCode: 'X-1', expiryDate: addDaysISO(300),
      quantity: 9, unitCost: 0.5, reason: null, idempotencyKey: crypto.randomUUID(),
    })
    holder.current = admin
  })

  it('ofrece solo productos activos con el mismo principio activo, con stock y sin importar mayúsculas', async () => {
    const alts = await salesService.findAlternatives(branchId, ids.agotado!, 'Ibuprofeno')
    expect(alts.map((a) => a.name)).toEqual(['Ibuprofeno 600 mg Genérico'])
    expect(alts[0]!.sellableUnits).toBe(5)
  })

  it('no se ofrece a sí mismo, ni productos de otro principio activo, ni de otra botica', async () => {
    const alts = await salesService.findAlternatives(branchId, ids.conStock!, 'ibuprofeno')
    expect(alts).toEqual([]) // el único otro con stock sería él mismo; "Ibuprofeno Ajeno" es de otra botica
    expect((await salesService.findAlternatives(branchId, ids.otro!, 'Naproxeno')).length).toBe(0)
  })

  it('los comodines no amplían la búsqueda: "Ibu%" no coincide con "Ibuprofeno"', async () => {
    expect(await salesService.findAlternatives(branchId, ids.agotado!, 'Ibu%')).toEqual([])
    expect(await salesService.findAlternatives(branchId, ids.agotado!, '%')).toEqual([])
    expect(await salesService.findAlternatives(branchId, ids.agotado!, 'I_uprofeno')).toEqual([])
  })

  it('sin principio activo no hay alternativas (no consulta)', async () => {
    expect(await salesService.findAlternatives(branchId, ids.agotado!, '   ')).toEqual([])
  })
})
