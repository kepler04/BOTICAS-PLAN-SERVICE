/**
 * Prueba de integración: ejecuta los SERVICIOS REALES (productos, categorías, inventario)
 * contra un Supabase LOCAL. Verifica que las consultas de PostgREST (filtros, vistas,
 * relaciones embebidas) y las RPC funcionan de punta a punta, incluido el rol de cajero.
 *
 * Se omite sola si no hay variables. Ejecutar con:  npm run test:integration
 * (requiere `npx supabase start`).
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
import { categoryService } from '@/features/products/services/categoryService'
import { productService } from '@/features/products/services/productService'
import {
  EMPTY_PRODUCT_FORM,
  toProductPayload,
  type ProductFormValues,
} from '@/features/products/schemas/productSchemas'
import { addDaysISO } from '@/lib/format'

const URL = import.meta.env.VITE_IT_URL as string | undefined
const ANON = import.meta.env.VITE_IT_ANON_KEY as string | undefined
const SERVICE = import.meta.env.VITE_IT_SERVICE_KEY as string | undefined
const enabled = Boolean(URL && ANON && SERVICE)

const run = Math.random().toString(36).slice(2, 8)
const PASSWORD = 'clave-segura-123'

function client(key: string): SupabaseClient {
  return createClient(URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function newUser(label: string): Promise<{ db: SupabaseClient; id: string }> {
  const db = client(ANON!)
  const { data, error } = await db.auth.signUp({
    email: `it-${label}-${run}@test.local`,
    password: PASSWORD,
    options: { data: { full_name: `Usuario ${label}` } },
  })
  if (error || !data.session || !data.user) throw new Error(`signUp ${label}: ${error?.message ?? 'sin sesión'}`)
  return { db, id: data.user.id }
}

function product(overrides: Partial<ProductFormValues>) {
  return toProductPayload({ ...EMPTY_PRODUCT_FORM, priceUnit: '1.00', ...overrides })
}

describe.skipIf(!enabled)('integración: productos e inventario (Supabase local)', () => {
  let admin: SupabaseClient
  let cashier: SupabaseClient
  let stranger: SupabaseClient
  let pharmacyId = ''
  let branchId = ''
  let strangerPharmacyId = ''
  let strangerBranchId = ''
  let categoryId = ''
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    const a = await newUser('admin')
    admin = a.db
    const c = await newUser('cashier')
    cashier = c.db
    const s = await newUser('stranger')
    stranger = s.db

    holder.current = admin
    const reg = await admin.rpc('register_pharmacy', { p_legal_name: `Botica IT ${run}` })
    if (reg.error) throw new Error(`register_pharmacy: ${reg.error.message}`)
    pharmacyId = reg.data
    branchId = (await branchService.getMainBranch(pharmacyId))!.id

    // El cajero se agrega con service_role (en la app lo hará la Edge Function invite-user).
    const service = client(SERVICE!)
    const link = await service.from('pharmacy_members').insert({ pharmacy_id: pharmacyId, user_id: c.id, role: 'cashier' })
    if (link.error) throw new Error(`member: ${link.error.message}`)

    holder.current = stranger
    const reg2 = await stranger.rpc('register_pharmacy', { p_legal_name: `Otra Botica IT ${run}` })
    if (reg2.error) throw new Error(`register_pharmacy 2: ${reg2.error.message}`)
    strangerPharmacyId = reg2.data
    strangerBranchId = (await branchService.getMainBranch(strangerPharmacyId))!.id
    holder.current = admin
  })

  // ------------------------------------------------------------ Categorías
  it('la botica nueva ya trae categorías base y permite crear otras', async () => {
    holder.current = admin
    const base = await categoryService.list(pharmacyId)
    expect(base.length).toBeGreaterThanOrEqual(10)

    const created = await categoryService.create(pharmacyId, 'Categoría IT')
    categoryId = created.id
    await expect(categoryService.create(pharmacyId, 'categoría it')).rejects.toThrow(/Ya existe una categoría/)
    await categoryService.rename(categoryId, 'Categoría IT 2')
    expect((await categoryService.list(pharmacyId)).some((x) => x.name === 'Categoría IT 2')).toBe(true)
  })

  // ------------------------------------------------------------ Productos
  it('crea productos con distintas presentaciones', async () => {
    const para = await productService.create(
      pharmacyId,
      product({
        name: 'Paracetamol 500 mg',
        genericName: 'Paracetamol',
        barcode: '7750001',
        categoryId,
        unitLabel: 'tableta',
        priceUnit: '0.50',
        sellsBlister: true,
        unitsPerBlister: '10',
        priceBlister: '4.50',
        sellsBox: true,
        unitsPerBox: '100',
        priceBox: '40',
        minStock: '50',
      }),
    )
    ids.para = para.id
    ids.syrup = (await productService.create(pharmacyId, product({ name: 'Jarabe para la tos', unitLabel: 'frasco', priceUnit: '12.90' }))).id
    ids.ibu = (
      await productService.create(pharmacyId, product({ name: 'Ibuprofeno 400 mg', genericName: 'Ibuprofeno', minStock: '10', unitLabel: 'tableta' }))
    ).id
    expect(Object.values(ids)).toHaveLength(3)
  })

  it('rechaza código de barras duplicado con mensaje en español', async () => {
    await expect(
      productService.create(pharmacyId, product({ name: 'Otro', barcode: '7750001' })),
    ).rejects.toThrow(/código de barras/)
  })

  it('busca por nombre, principio activo y código de barras; filtra por categoría', async () => {
    const all = { search: '', categoryId: '', status: 'active' as const, page: 0 }
    expect((await productService.list(pharmacyId, all)).total).toBe(3)
    expect((await productService.list(pharmacyId, { ...all, search: 'parace' })).rows.map((r) => r.name)).toEqual(['Paracetamol 500 mg'])
    expect((await productService.list(pharmacyId, { ...all, search: 'ibuprofeno' })).total).toBe(1)
    expect((await productService.list(pharmacyId, { ...all, search: '7750001' })).total).toBe(1)
    expect((await productService.list(pharmacyId, { ...all, categoryId })).total).toBe(1)
    expect((await productService.list(pharmacyId, { ...all, categoryId: 'none' })).total).toBe(2)
    expect((await productService.search(pharmacyId, 'jarabe')).map((r) => r.name)).toEqual(['Jarabe para la tos'])
  })

  it('un texto de búsqueda malicioso no rompe la consulta ni trae de más', async () => {
    const all = { categoryId: '', status: 'active' as const, page: 0 }
    const result = await productService.list(pharmacyId, { ...all, search: 'x,name.neq.zzz),or(id.not.is.null' })
    expect(result.total).toBe(0)
    expect((await productService.list(pharmacyId, { ...all, search: '%' })).total).toBe(3)
  })

  // ------------------------------------------------------------ Entradas y stock
  it('registra entradas, calcula el stock y ordena los lotes FEFO', async () => {
    await inventoryService.registerEntry({
      branchId,
      productId: ids.para!,
      lotCode: 'L-001',
      expiryDate: addDaysISO(400),
      quantity: 300,
      unitCost: 0.4,
      reason: 'Factura F001-1',
      idempotencyKey: crypto.randomUUID(),
    })
    await inventoryService.registerEntry({
      branchId,
      productId: ids.para!,
      lotCode: 'L-002',
      expiryDate: addDaysISO(10),
      quantity: 20,
      unitCost: 0.4,
      reason: null,
      idempotencyKey: crypto.randomUUID(),
    })

    const stock = await inventoryService.listStock(branchId, { search: 'parace', filter: 'all', categoryId: '', page: 0 })
    const row = stock.rows[0]!
    expect(row.total_quantity).toBe(320)
    expect(row.lot_count).toBe(2)
    expect(row.next_expiry).toBe(addDaysISO(10))
    expect(row.is_low).toBe(false)
    expect(row.units_per_box).toBe(100)

    const lots = await inventoryService.listLots(branchId, ids.para!)
    expect(lots.map((l) => l.lot_code)).toEqual(['L-002', 'L-001'])
  })

  it('una entrada con la misma clave de idempotencia no suma dos veces', async () => {
    const key = crypto.randomUUID()
    const input = {
      branchId,
      productId: ids.syrup!,
      lotCode: 'J-1',
      expiryDate: null,
      quantity: 12,
      unitCost: 8,
      reason: null,
      idempotencyKey: key,
    }
    await inventoryService.registerEntry(input)
    await inventoryService.registerEntry(input)
    const lots = await inventoryService.listLots(branchId, ids.syrup!)
    expect(lots).toHaveLength(1)
    expect(lots[0]!.quantity).toBe(12)
    expect(lots[0]!.expiry_date).toBeNull()
  })

  it('traduce los errores de las RPC al español', async () => {
    const base = { branchId, productId: ids.para!, quantity: 5, unitCost: 1, reason: null, idempotencyKey: crypto.randomUUID() }
    await expect(
      inventoryService.registerEntry({ ...base, lotCode: 'VIEJO', expiryDate: addDaysISO(-1) }),
    ).rejects.toThrow(/ya venció/)
    await expect(
      inventoryService.registerEntry({ ...base, lotCode: 'L-001', expiryDate: addDaysISO(999) }),
    ).rejects.toThrow(/otra fecha de vencimiento/)
  })

  it('detecta stock bajo y agotado, y lista lotes por vencer con el nombre del producto', async () => {
    await inventoryService.registerEntry({
      branchId,
      productId: ids.ibu!,
      lotCode: 'I-1',
      expiryDate: addDaysISO(200),
      quantity: 5,
      unitCost: 0.3,
      reason: null,
      idempotencyKey: crypto.randomUUID(),
    })
    const low = await inventoryService.listStock(branchId, { search: '', filter: 'low', categoryId: '', page: 0 })
    expect(low.rows.map((r) => r.name)).toEqual(['Ibuprofeno 400 mg'])

    const none = await inventoryService.listStock(branchId, { search: '', filter: 'out', categoryId: '', page: 0 })
    expect(none.total).toBe(0) // todos tienen stock

    const expiring = await inventoryService.listStock(branchId, { search: '', filter: 'expiring', categoryId: '', page: 0 })
    expect(expiring.rows.map((r) => r.name)).toEqual(['Paracetamol 500 mg'])

    const lots = await inventoryService.listExpiringLots(branchId, 30)
    expect(lots).toHaveLength(1)
    expect(lots[0]!.products?.name).toBe('Paracetamol 500 mg')
    expect(lots[0]!.lot_code).toBe('L-002')

    expect(await inventoryService.countActiveProducts(pharmacyId)).toBe(3)
    expect(await inventoryService.countLowStock(branchId)).toBe(1)
    expect(await inventoryService.countExpiringLots(branchId, 30)).toBe(1)
    expect(await inventoryService.countExpiringLots(branchId, 0, true)).toBe(0)
  })

  // ------------------------------------------------------------ Ajustes e historial
  it('ajusta stock, impide el negativo y deja historial con usuario, lote y producto', async () => {
    const lot = (await inventoryService.listLots(branchId, ids.para!)).find((l) => l.lot_code === 'L-002')!
    const balance = await inventoryService.adjustStock({
      lotId: lot.id,
      delta: -5,
      type: 'write_off',
      reason: 'Blíster dañado',
      idempotencyKey: crypto.randomUUID(),
    })
    expect(balance).toBe(15)

    await expect(
      inventoryService.adjustStock({ lotId: lot.id, delta: -999, type: 'adjustment', reason: 'Conteo', idempotencyKey: crypto.randomUUID() }),
    ).rejects.toThrow(/No hay stock suficiente/)
    await expect(
      inventoryService.adjustStock({ lotId: lot.id, delta: -1, type: 'adjustment', reason: '', idempotencyKey: crypto.randomUUID() }),
    ).rejects.toThrow(/motivo/)

    const history = await inventoryService.listMovements(branchId, 0)
    expect(history.total).toBe(5) // 4 entradas + 1 merma
    const first = history.rows[0]!
    expect(first.type).toBe('write_off')
    expect(first.quantity_delta).toBe(-5)
    expect(first.quantity_after).toBe(15)
    expect(first.products?.name).toBe('Paracetamol 500 mg')
    expect(first.lots?.lot_code).toBe('L-002')
    expect(first.profiles?.full_name).toBe('Usuario admin')
  })

  it('un producto desactivado sale del stock y de las búsquedas rápidas', async () => {
    await productService.update(ids.syrup!, product({ name: 'Jarabe para la tos', unitLabel: 'frasco', priceUnit: '12.90', active: false }))
    expect((await productService.search(pharmacyId, 'jarabe')).length).toBe(0)
    const stock = await inventoryService.listStock(branchId, { search: 'jarabe', filter: 'all', categoryId: '', page: 0 })
    expect(stock.total).toBe(0)
    expect(await inventoryService.countActiveProducts(pharmacyId)).toBe(2)
  })

  // ------------------------------------------------------------ Cajero
  it('el cajero consulta pero no puede crear productos, mover stock ni ver el historial', async () => {
    holder.current = cashier
    const all = { search: '', categoryId: '', status: 'active' as const, page: 0 }
    expect((await productService.list(pharmacyId, all)).total).toBe(2)
    expect((await inventoryService.listStock(branchId, { search: '', filter: 'all', categoryId: '', page: 0 })).total).toBe(2)
    expect(await inventoryService.listLots(branchId, ids.para!)).toHaveLength(2)
    expect((await inventoryService.listMovements(branchId, 0)).total).toBe(0)

    await expect(productService.create(pharmacyId, product({ name: 'Intento' }))).rejects.toThrow(/permiso/)
    await expect(
      inventoryService.registerEntry({
        branchId,
        productId: ids.para!,
        lotCode: 'C-1',
        expiryDate: addDaysISO(100),
        quantity: 1,
        unitCost: 1,
        reason: null,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/administrador/)
    holder.current = admin
  })

  // ------------------------------------------------------------ Aislamiento
  it('otra botica no ve nada de este inventario', async () => {
    holder.current = stranger
    const all = { search: '', categoryId: '', status: 'all' as const, page: 0 }
    expect((await productService.list(strangerPharmacyId, all)).total).toBe(0)
    expect((await productService.list(pharmacyId, all)).total).toBe(0)
    expect((await inventoryService.listStock(strangerBranchId, { search: '', filter: 'all', categoryId: '', page: 0 })).total).toBe(0)
    expect((await inventoryService.listStock(branchId, { search: '', filter: 'all', categoryId: '', page: 0 })).total).toBe(0)
    expect(await inventoryService.listLots(branchId, ids.para!)).toHaveLength(0)
    holder.current = admin
  })
})
