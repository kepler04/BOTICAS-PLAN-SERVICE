import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import { sanitizeSearchTerm } from '@/lib/search'
import type { CartLine } from '@/features/sales/lib/cart'
import type { CustomerInput } from '@/features/sales/lib/customer'
import type { CustomerDocType } from '@/lib/peruDocs'
import { toSaleItems } from '@/features/sales/lib/cart'
import type { PaymentMethod, SaleDetail, SaleRow, SellableProduct } from '@/features/sales/types'

export const SALES_PAGE_SIZE = 25
export const POS_RESULTS_LIMIT = 20
export const ALTERNATIVES_LIMIT = 6

const STOCK_COLUMNS =
  'product_id, name, generic_name, concentration, barcode, unit_label, units_per_blister, units_per_box, requires_prescription, price_unit, price_blister, price_box, sellable_quantity, tax_affectation'

export class SalesServiceError extends Error {}

const KNOWN: Record<string, string> = {
  no_open_cash_session: 'Abre la caja para poder vender.',
  insufficient_payment: 'El monto recibido no alcanza para pagar.',
  invalid_items: 'La venta no es válida. Revisa el carrito.',
  invalid_amount: 'El monto no es válido.',
  product_not_found: 'Un producto del carrito ya no existe. Quítalo e inténtalo de nuevo.',
  forbidden: 'No tienes permiso para hacer esto.',
  cash_session_closed: 'La caja de esa venta ya está cerrada: no se puede anular.',
  already_voided: 'Esta venta ya estaba anulada.',
  reason_required: 'Escribe el motivo (mínimo 3 letras).',
  not_authenticated: 'Tu sesión expiró. Inicia sesión nuevamente.',
  einvoice_issued: 'Esta venta ya tiene un comprobante aceptado por SUNAT: anularla requiere una nota de crédito (aún no disponible).',
  customer_required: 'La venta supera S/ 700: SUNAT exige el nombre y el documento del cliente.',
  invalid_customer_doc: 'El documento del cliente no es válido.',
  invalid_customer_name: 'Escribe el nombre o la razón social del cliente.',
}

/** Errores que mencionan un producto: la BD manda su nombre en `details`. */
const PER_PRODUCT: Record<string, (name: string) => string> = {
  insufficient_stock: (n) => `No hay stock suficiente de “${n}”. Actualiza la pantalla y ajusta la cantidad.`,
  product_inactive: (n) => `El producto “${n}” está inactivo y no se puede vender.`,
  presentation_unavailable: (n) => `“${n}” no se vende en esa presentación.`,
}

function fail(error: unknown, fallback: string): never {
  const e = (error ?? {}) as { message?: string; details?: string | null }
  const text = e.message ?? ''
  for (const key of Object.keys(PER_PRODUCT)) {
    if (text.includes(key)) {
      const name = e.details?.trim()
      throw new SalesServiceError(name ? PER_PRODUCT[key]!(name) : translateDbError(error, {}, fallback))
    }
  }
  if (text.includes('insufficient_stock')) throw new SalesServiceError('No hay stock suficiente para esa cantidad.')
  throw new SalesServiceError(translateDbError(error, KNOWN, fallback))
}

function searchFilter(term: string): string | null {
  const clean = sanitizeSearchTerm(term)
  if (!clean) return null
  return `name.ilike.%${clean}%,generic_name.ilike.%${clean}%,barcode.eq.${clean}`
}

type StockViewRow = {
  product_id: string | null
  name: string | null
  generic_name: string | null
  concentration: string | null
  barcode: string | null
  unit_label: string | null
  units_per_blister: number | null
  units_per_box: number | null
  requires_prescription: boolean | null
  price_unit: number | null
  price_blister: number | null
  price_box: number | null
  sellable_quantity: number | null
  tax_affectation: 'gravado' | 'exonerado' | 'inafecto' | null
}

function toSellable(r: StockViewRow): SellableProduct {
  return {
    productId: r.product_id ?? '',
    name: r.name ?? '',
    genericName: r.generic_name,
    concentration: r.concentration,
    barcode: r.barcode,
    unit_label: r.unit_label ?? 'unidad',
    units_per_blister: r.units_per_blister,
    units_per_box: r.units_per_box,
    requiresPrescription: r.requires_prescription ?? false,
    taxAffectation: r.tax_affectation ?? 'gravado',
    priceUnit: r.price_unit ?? 0,
    priceBlister: r.price_blister,
    priceBox: r.price_box,
    sellableUnits: r.sellable_quantity ?? 0,
  }
}

export type CreateSaleInput = {
  branchId: string
  lines: CartLine[]
  paymentMethod: PaymentMethod
  /** Solo efectivo. En soles. */
  amountReceived: number | null
  paymentReference: string | null
  idempotencyKey: string
  /** Opcional; obligatorio si la venta supera S/ 700. */
  customer?: CustomerInput | null
}

export type SalesFilters = {
  page: number
  /** Filas por página (por defecto SALES_PAGE_SIZE). */
  pageSize?: number
  /** ISO timestamp (inclusive). */
  from: string | null
  /** ISO timestamp (exclusivo). */
  to: string | null
  status: 'all' | 'completed' | 'voided'
}

export type SalesSummary = {
  salesCount: number
  total: number
  cash: number
  yape: number
  plin: number
  card: number
  voidedCount: number
}

export type ReceiptHeader = {
  name: string
  ruc: string | null
  branchName: string
  branchAddress: string | null
}

export const salesService = {
  /** Nombre comercial y RUC de la botica para el encabezado del comprobante. */
  async getPharmacyInfo(pharmacyId: string): Promise<{ name: string; ruc: string | null }> {
    const { data, error } = await supabase
      .from('pharmacies')
      .select('legal_name, trade_name, ruc')
      .eq('id', pharmacyId)
      .single()
    if (error) fail(error, 'No se pudieron cargar los datos de la botica.')
    return { name: data.trade_name ?? data.legal_name, ruc: data.ruc }
  },

  /** Productos activos de la sucursal con precio y stock vendible, para el POS. */
  async searchSellable(branchId: string, term: string): Promise<SellableProduct[]> {
    let query = supabase
      .from('product_stock')
      .select(STOCK_COLUMNS)
      .eq('branch_id', branchId)
      .order('name')
      .limit(POS_RESULTS_LIMIT)
    const or = searchFilter(term)
    if (or) query = query.or(or)
    const { data, error } = await query
    if (error) fail(error, 'No se pudo buscar productos.')
    return (data ?? []).map(toSellable)
  },

  /**
   * Productos con el MISMO principio activo y stock disponible (para ofrecer cuando algo está agotado).
   * Mismo principio activo NO implica misma concentración ni misma forma: el cajero debe confirmarlo.
   */
  async findAlternatives(branchId: string, productId: string, genericName: string): Promise<SellableProduct[]> {
    const name = genericName.trim()
    if (name === '') return []
    const { data, error } = await supabase
      .from('product_stock')
      .select(STOCK_COLUMNS)
      .eq('branch_id', branchId)
      .ilike('generic_name', name.replace(/[\\%_]/g, '\\$&')) // coincidencia exacta sin distinguir mayúsculas
      .neq('product_id', productId)
      .gt('sellable_quantity', 0)
      .order('name')
      .limit(ALTERNATIVES_LIMIT)
    if (error) fail(error, 'No se pudieron buscar alternativas.')
    return (data ?? []).map(toSellable)
  },

  /** Cliente ya registrado en la botica (para autocompletar su nombre en el POS). */
  async findCustomer(pharmacyId: string, docType: CustomerDocType, docNumber: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('customers')
      .select('name')
      .eq('pharmacy_id', pharmacyId)
      .eq('doc_type', docType)
      .eq('doc_number', docNumber)
      .maybeSingle()
    if (error) fail(error, 'No se pudo buscar al cliente.')
    return data?.name ?? null
  },

  /** Coincidencia exacta por código de barras (lector). */
  async findByBarcode(branchId: string, code: string): Promise<SellableProduct | null> {
    const clean = code.trim()
    if (clean.length < 3 || clean.length > 64) return null
    const { data, error } = await supabase
      .from('product_stock')
      .select(STOCK_COLUMNS)
      .eq('branch_id', branchId)
      .eq('barcode', clean)
      .maybeSingle()
    if (error) fail(error, 'No se pudo buscar el código.')
    return data ? toSellable(data) : null
  },

  async createSale(input: CreateSaleInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_sale', {
      p_branch: input.branchId,
      p_items: toSaleItems(input.lines),
      p_payment_method: input.paymentMethod,
      p_amount_received: input.amountReceived ?? undefined,
      p_payment_reference: input.paymentReference ?? undefined,
      p_idempotency_key: input.idempotencyKey,
      p_customer: input.customer
        ? { doc_type: input.customer.docType, doc_number: input.customer.docNumber, name: input.customer.name }
        : undefined,
    })
    if (error) fail(error, 'No se pudo registrar la venta.')
    return data
  },

  async listSales(branchId: string, f: SalesFilters): Promise<{ rows: SaleRow[]; total: number }> {
    const size = f.pageSize ?? SALES_PAGE_SIZE
    const from = f.page * size
    let query = supabase
      .from('sales')
      .select('*, profiles!sales_created_by_fkey(full_name), einvoices(doc_type, series, number, status)', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('receipt_number', { ascending: false })
      .range(from, from + size - 1)
    if (f.status !== 'all') query = query.eq('status', f.status)
    if (f.from) query = query.gte('created_at', f.from)
    if (f.to) query = query.lt('created_at', f.to)
    const { data, error, count } = await query
    if (error) fail(error, 'No se pudo cargar el historial de ventas.')
    return { rows: (data ?? []) as SaleRow[], total: count ?? 0 }
  },

  async getSale(id: string): Promise<SaleDetail> {
    const { data, error } = await supabase
      .from('sales')
      .select('*, profiles!sales_created_by_fkey(full_name), sale_items(*)')
      .eq('id', id)
      .single()
    if (error) fail(error, 'No se pudo cargar la venta.')
    return data as SaleDetail
  },

  async voidSale(id: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('void_sale', { p_sale: id, p_reason: reason })
    if (error) fail(error, 'No se pudo anular la venta.')
  },

  async getSummary(branchId: string, fromIso: string, toIso: string): Promise<SalesSummary> {
    const { data, error } = await supabase.rpc('get_sales_summary', {
      p_branch: branchId,
      p_from: fromIso,
      p_to: toIso,
    })
    if (error) fail(error, 'No se pudo calcular las ventas.')
    const r = data?.[0]
    return {
      salesCount: r?.sales_count ?? 0,
      total: Number(r?.total ?? 0),
      cash: Number(r?.cash ?? 0),
      yape: Number(r?.yape ?? 0),
      plin: Number(r?.plin ?? 0),
      card: Number(r?.card ?? 0),
      voidedCount: r?.voided_count ?? 0,
    }
  },
}
