import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import { addDaysISO, todayISO } from '@/lib/format'
import { sanitizeSearchTerm } from '@/lib/search'
import type { Lot, LotWithProduct, MovementRow, StockFilter, StockRow } from '@/features/inventory/types'

export const INVENTORY_PAGE_SIZE = 25
/** Ventana del indicador "por vencer" del dashboard y del filtro de stock. */
export const EXPIRING_SOON_DAYS = 30

export class InventoryServiceError extends Error {}

/** Mensajes de nuestras RPC (`raise exception '<clave>'`) y de restricciones. */
const KNOWN: Record<string, string> = {
  forbidden: 'Solo el administrador puede mover el stock.',
  not_authenticated: 'Tu sesión expiró. Inicia sesión nuevamente.',
  product_inactive: 'El producto está inactivo. Actívalo para ingresar stock.',
  invalid_branch: 'La sucursal no es válida.',
  invalid_quantity: 'La cantidad no es válida.',
  invalid_cost: 'El costo no es válido.',
  invalid_lot_code: 'Ingresa el número de lote (máximo 60 caracteres).',
  expired_lot: 'No se puede ingresar un lote que ya venció.',
  invalid_expiry: 'La fecha de vencimiento no es válida.',
  lot_expiry_mismatch: 'Ese lote ya existe con otra fecha de vencimiento. Revisa el número de lote o la fecha.',
  insufficient_stock: 'No hay stock suficiente en ese lote para esa cantidad.',
  reason_required: 'Escribe el motivo (mínimo 3 letras).',
  invalid_type: 'El tipo de movimiento no es válido.',
  invalid_range: 'Revisa las fechas: "desde" debe ser anterior a "hasta" (máximo 3 años).',
}

function fail(error: unknown, fallback: string): never {
  throw new InventoryServiceError(translateDbError(error, KNOWN, fallback))
}

function searchFilter(term: string): string | null {
  const clean = sanitizeSearchTerm(term)
  if (!clean) return null
  return `name.ilike.%${clean}%,generic_name.ilike.%${clean}%,barcode.eq.${clean}`
}

export type StockQuery = {
  search: string
  filter: StockFilter
  categoryId: string
  page: number
}

export type RegisterEntryInput = {
  branchId: string
  productId: string
  lotCode: string
  /** "YYYY-MM-DD" o null si el producto no vence. */
  expiryDate: string | null
  /** En unidades mínimas. */
  quantity: number
  /** Costo por unidad mínima. */
  unitCost: number
  reason: string | null
  idempotencyKey: string
}

export type AdjustStockInput = {
  lotId: string
  /** Con signo, en unidades mínimas. */
  delta: number
  type: 'adjustment' | 'write_off'
  reason: string
  idempotencyKey: string
}

export type KardexRow = {
  movedAt: string
  /** 'opening' = saldo inicial; si no, el tipo de movimiento (entry, sale, sale_void, adjustment, write_off). */
  kind: string
  document: string | null
  lotCode: string | null
  quantityIn: number | null
  quantityOut: number | null
  unitCost: number | null
  valueDelta: number | null
  balanceQuantity: number
  balanceValue: number
  createdBy: string | null
}

export const inventoryService = {
  async listStock(branchId: string, q: StockQuery): Promise<{ rows: StockRow[]; total: number }> {
    const from = q.page * INVENTORY_PAGE_SIZE
    let query = supabase
      .from('product_stock')
      .select('*', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('name')
      .range(from, from + INVENTORY_PAGE_SIZE - 1)

    if (q.filter === 'low') query = query.eq('is_low', true)
    if (q.filter === 'out') query = query.eq('total_quantity', 0)
    if (q.filter === 'expiring') {
      query = query.not('next_expiry', 'is', null).lte('next_expiry', addDaysISO(EXPIRING_SOON_DAYS))
    }
    if (q.categoryId === 'none') query = query.is('category_id', null)
    else if (q.categoryId) query = query.eq('category_id', q.categoryId)
    const or = searchFilter(q.search)
    if (or) query = query.or(or)

    const { data, error, count } = await query
    if (error) fail(error, 'No se pudo cargar el stock.')

    // La vista expone todas las columnas como nullable; en la práctica nunca lo son.
    const rows: StockRow[] = (data ?? []).map((r) => ({
      id: r.product_id ?? '',
      name: r.name ?? '',
      generic_name: r.generic_name,
      concentration: r.concentration,
      barcode: r.barcode,
      category_id: r.category_id,
      unit_label: r.unit_label ?? 'unidad',
      units_per_blister: r.units_per_blister,
      units_per_box: r.units_per_box,
      min_stock: r.min_stock ?? 0,
      total_quantity: r.total_quantity ?? 0,
      expired_quantity: r.expired_quantity ?? 0,
      lot_count: r.lot_count ?? 0,
      next_expiry: r.next_expiry,
      is_low: r.is_low ?? false,
      tax_affectation: r.tax_affectation ?? 'gravado',
    }))
    return { rows, total: count ?? 0 }
  },

  /** Lotes con existencias de un producto, el que vence primero arriba. */
  async listLots(branchId: string, productId: string): Promise<Lot[]> {
    const { data, error } = await supabase
      .from('lots')
      .select('*')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .gt('quantity', 0)
      .order('expiry_date', { ascending: true, nullsFirst: false })
    if (error) fail(error, 'No se pudieron cargar los lotes.')
    return data ?? []
  },

  /** Lotes con stock que vencen dentro de `days` días (incluye los ya vencidos). */
  async listExpiringLots(branchId: string, days: number): Promise<LotWithProduct[]> {
    const { data, error } = await supabase
      .from('lots')
      .select('*, products(name, unit_label, units_per_blister, units_per_box)')
      .eq('branch_id', branchId)
      .gt('quantity', 0)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', addDaysISO(days))
      .order('expiry_date', { ascending: true })
      .limit(200)
    if (error) fail(error, 'No se pudieron cargar los lotes por vencer.')
    return (data ?? []) as LotWithProduct[]
  },

  async listMovements(
    branchId: string,
    page: number,
  ): Promise<{ rows: MovementRow[]; total: number }> {
    const from = page * INVENTORY_PAGE_SIZE
    const { data, error, count } = await supabase
      .from('inventory_movements')
      .select(
        '*, products(name, unit_label, units_per_blister, units_per_box), lots(lot_code), profiles(full_name)',
        { count: 'exact' },
      )
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + INVENTORY_PAGE_SIZE - 1)
    if (error) fail(error, 'No se pudo cargar el historial.')
    return { rows: (data ?? []) as MovementRow[], total: count ?? 0 }
  },

  async registerEntry(input: RegisterEntryInput): Promise<string> {
    const { data, error } = await supabase.rpc('register_stock_entry', {
      p_branch: input.branchId,
      p_product: input.productId,
      p_lot_code: input.lotCode,
      // La función acepta NULL (producto sin vencimiento); los tipos generados no lo reflejan.
      p_expiry: input.expiryDate as string,
      p_quantity: input.quantity,
      p_unit_cost: input.unitCost,
      p_reason: input.reason ?? undefined,
      p_idempotency_key: input.idempotencyKey,
    })
    if (error) fail(error, 'No se pudo registrar la entrada.')
    return data
  },

  /** Devuelve el nuevo saldo del lote. */
  async adjustStock(input: AdjustStockInput): Promise<number> {
    const { data, error } = await supabase.rpc('adjust_stock', {
      p_lot: input.lotId,
      p_delta: input.delta,
      p_type: input.type,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    })
    if (error) fail(error, 'No se pudo ajustar el stock.')
    return data
  },

  // ---- Indicadores del dashboard ----
  /** Kardex valorizado de un producto entre dos fechas (YYYY-MM-DD, hora de Lima). Solo admin. */
  async getKardex(branchId: string, productId: string, from: string, to: string): Promise<KardexRow[]> {
    const { data, error } = await supabase.rpc('report_kardex', {
      p_branch: branchId,
      p_product: productId,
      p_from: from,
      p_to: to,
    })
    if (error) fail(error, 'No se pudo cargar el kardex.')
    return (data ?? []).map((r) => ({
      movedAt: r.moved_at,
      kind: r.kind,
      document: r.document,
      lotCode: r.lot_code,
      quantityIn: r.quantity_in,
      quantityOut: r.quantity_out,
      unitCost: r.unit_cost === null ? null : Number(r.unit_cost),
      valueDelta: r.value_delta === null ? null : Number(r.value_delta),
      balanceQuantity: r.balance_quantity,
      balanceValue: Number(r.balance_value),
      createdBy: r.created_by_name,
    }))
  },

  async countActiveProducts(pharmacyId: string): Promise<number> {
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('pharmacy_id', pharmacyId)
      .eq('active', true)
    if (error) fail(error, 'No se pudo contar los productos.')
    return count ?? 0
  },

  async countLowStock(branchId: string): Promise<number> {
    const { count, error } = await supabase
      .from('product_stock')
      .select('product_id', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('is_low', true)
    if (error) fail(error, 'No se pudo contar el stock bajo.')
    return count ?? 0
  },

  /** Lotes con stock que vencen en `days` días o menos (`expired` = solo los ya vencidos). */
  async countExpiringLots(branchId: string, days: number, expired = false): Promise<number> {
    let query = supabase
      .from('lots')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .gt('quantity', 0)
      .not('expiry_date', 'is', null)
    query = expired ? query.lt('expiry_date', todayISO()) : query.lte('expiry_date', addDaysISO(days))
    const { count, error } = await query
    if (error) fail(error, 'No se pudo contar los lotes por vencer.')
    return count ?? 0
  },
}
