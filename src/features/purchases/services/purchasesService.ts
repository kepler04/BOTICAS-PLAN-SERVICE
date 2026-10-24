import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import type { PurchaseDocType, PurchaseItemPayload } from '@/features/purchases/lib/purchase'
import type { Tables } from '@/types/database.types'

export class PurchasesServiceError extends Error {}

const KNOWN: Record<string, string> = {
  suppliers_pharmacy_ruc_idx: 'Ya tienes un proveedor con ese RUC.',
  suppliers_pharmacy_name_idx: 'Ya tienes un proveedor con ese nombre.',
  suppliers_ruc_check: 'El RUC no es válido (revisa el dígito verificador).',
  duplicate_document: 'Ese documento de ese proveedor ya fue registrado. Revisa el historial de compras.',
  purchases_document_key: 'Ese documento de ese proveedor ya fue registrado. Revisa el historial de compras.',
  invalid_supplier: 'El proveedor no existe o está inactivo.',
  invalid_issue_date: 'La fecha del documento no puede ser futura ni de hace más de 2 años.',
  invalid_document: 'Revisa el número del documento.',
  invalid_items: 'Revisa las líneas de la compra (cantidad, costo y lote).',
  lot_expiry_mismatch: 'Ese lote ya existe con otra fecha de vencimiento. Revisa el lote o la fecha.',
  expired_lot: 'Una línea tiene un lote ya vencido.',
  product_inactive: 'Una línea tiene un producto inactivo.',
  forbidden: 'Solo el administrador registra compras.',
}

/** Errores que la BD acompaña con el nombre del producto. */
const PER_PRODUCT: Record<string, (name: string) => string> = {
  lot_expiry_mismatch: (n) => `“${n}”: ese lote ya existe con otra fecha de vencimiento.`,
  expired_lot: (n) => `“${n}”: el lote ya venció.`,
  product_inactive: (n) => `“${n}” está inactivo.`,
}

function fail(error: unknown, fallback: string): never {
  const e = (error ?? {}) as { message?: string; details?: string | null }
  for (const key of Object.keys(PER_PRODUCT)) {
    if ((e.message ?? '').includes(key) && e.details?.trim()) throw new PurchasesServiceError(PER_PRODUCT[key]!(e.details.trim()))
  }
  throw new PurchasesServiceError(translateDbError(error, KNOWN, fallback))
}

export type Supplier = Tables<'suppliers'>
export type SupplierPayload = { name: string; ruc: string | null; phone: string | null; email: string | null }

export type PurchaseRow = Tables<'purchases'> & {
  suppliers: { name: string } | null
  profiles: { full_name: string | null } | null
}
export type PurchaseDetail = PurchaseRow & { purchase_items: Tables<'purchase_items'>[] }

export type RegisterPurchaseInput = {
  branchId: string
  supplierId: string
  docType: PurchaseDocType
  docNumber: string
  issueDate: string
  items: PurchaseItemPayload[]
  note: string | null
  idempotencyKey: string
}

export const PURCHASES_PAGE_SIZE = 20

export const purchasesService = {
  async listSuppliers(pharmacyId: string): Promise<Supplier[]> {
    const { data, error } = await supabase.from('suppliers').select('*').eq('pharmacy_id', pharmacyId).order('name')
    if (error) fail(error, 'No se pudieron cargar los proveedores.')
    return data ?? []
  },

  async createSupplier(pharmacyId: string, v: SupplierPayload): Promise<Supplier> {
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ ...v, pharmacy_id: pharmacyId })
      .select('*')
      .single()
    if (error) fail(error, 'No se pudo crear el proveedor.')
    return data
  },

  async updateSupplier(id: string, v: Partial<SupplierPayload> & { active?: boolean }): Promise<void> {
    const { data, error } = await supabase.from('suppliers').update(v).eq('id', id).select('id')
    if (error) fail(error, 'No se pudo guardar el proveedor.')
    if (!data || data.length === 0) throw new PurchasesServiceError('No tienes permiso para modificar proveedores.')
  },

  async listPurchases(pharmacyId: string, page: number): Promise<{ rows: PurchaseRow[]; total: number }> {
    const from = page * PURCHASES_PAGE_SIZE
    const { data, error, count } = await supabase
      .from('purchases')
      .select('*, suppliers(name), profiles(full_name)', { count: 'exact' })
      .eq('pharmacy_id', pharmacyId)
      .order('created_at', { ascending: false })
      .range(from, from + PURCHASES_PAGE_SIZE - 1)
    if (error) fail(error, 'No se pudo cargar el historial de compras.')
    return { rows: (data ?? []) as PurchaseRow[], total: count ?? 0 }
  },

  async getPurchase(id: string): Promise<PurchaseDetail> {
    const { data, error } = await supabase
      .from('purchases')
      .select('*, suppliers(name), profiles(full_name), purchase_items(*)')
      .eq('id', id)
      .single()
    if (error) fail(error, 'No se pudo cargar la compra.')
    return data as PurchaseDetail
  },

  async registerPurchase(input: RegisterPurchaseInput): Promise<string> {
    const { data, error } = await supabase.rpc('register_purchase', {
      p_branch: input.branchId,
      p_supplier: input.supplierId,
      p_doc_type: input.docType,
      p_doc_number: input.docNumber,
      p_issue_date: input.issueDate,
      p_items: input.items,
      p_note: input.note ?? undefined,
      p_idempotency_key: input.idempotencyKey,
    })
    if (error) fail(error, 'No se pudo registrar la compra.')
    return data
  },
}
