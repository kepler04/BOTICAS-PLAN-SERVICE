import type { ProductRef } from '@/features/inventory/types'
import { toBaseUnits, unitsPer, type Presentation } from '@/features/products/lib/presentations'
import { addDaysISO, parseInteger, parseMoney, todayISO } from '@/lib/format'
import { costWithoutIgv, IGV_RATE_PERCENT } from '@/lib/igv'
import type { Database } from '@/types/database.types'

export type PurchaseDocType = Database['public']['Enums']['purchase_doc_type']

export const DOC_TYPE_LABELS: Record<PurchaseDocType, string> = {
  invoice: 'Factura',
  receipt: 'Boleta',
  guide: 'Guía de remisión',
  other: 'Otro',
}

/** Coinciden con `register_purchase`. */
export const MAX_ITEMS = 100
export const MAX_DOC_AGE_DAYS = 730
const MAX_UNITS = 1_000_000
const isoDate = /^\d{4}-\d{2}-\d{2}$/

export type PurchaseLineDraft = {
  key: string
  product: ProductRef
  presentation: Presentation
  quantity: string
  /** Costo por presentación (lo que dice la factura por caja, blíster o unidad). */
  cost: string
  lotCode: string
  noExpiry: boolean
  expiryDate: string
}

export type LineErrors = Partial<Record<'quantity' | 'cost' | 'lotCode' | 'expiryDate', string>>

export type ComputedLine = {
  errors: LineErrors
  /** En unidades mínimas. */
  quantity: number
  /** Por unidad mínima, SIN IGV, 4 decimales (como lo guarda la BD). */
  unitCost: number
  subtotal: number
  igv: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000

export function newLine(product: ProductRef): PurchaseLineDraft {
  return {
    key: crypto.randomUUID(),
    product,
    presentation: product.units_per_box ? 'box' : 'unit',
    quantity: '',
    cost: '',
    lotCode: '',
    noExpiry: false,
    expiryDate: '',
  }
}

/**
 * Valida una línea y la convierte a unidad mínima y costo SIN IGV (el IGV de las compras es crédito fiscal).
 * El IGV es una estimación por la afectación del producto; el monto exacto es el del documento del proveedor.
 */
export function computeLine(line: PurchaseLineDraft, costIncludesIgv: boolean): ComputedLine {
  const errors: LineErrors = {}
  const qty = parseInteger(line.quantity)
  const cost = parseMoney(line.cost)
  const base = qty === null || qty < 1 ? null : toBaseUnits(line.product, line.presentation, qty)
  if (base === null) errors.quantity = 'Cantidad entera mayor a 0'
  else if (base > MAX_UNITS) errors.quantity = 'Cantidad demasiado grande'
  if (cost === null) errors.cost = 'Costo válido (0 si fue bonificación)'
  if (line.lotCode.trim() === '') errors.lotCode = 'Ingresa el lote'
  else if (line.lotCode.trim().length > 60) errors.lotCode = 'Máximo 60 caracteres'
  if (!line.noExpiry) {
    if (!isoDate.test(line.expiryDate)) errors.expiryDate = 'Ingresa el vencimiento'
    else if (line.expiryDate < todayISO()) errors.expiryDate = 'Ese lote ya venció'
    else if (line.expiryDate > addDaysISO(365 * 15)) errors.expiryDate = 'Fecha demasiado lejana'
  }

  if (base === null || cost === null) return { errors, quantity: 0, unitCost: 0, subtotal: 0, igv: 0 }
  const net = costIncludesIgv ? costWithoutIgv(cost) : cost
  const unitCost = round4(net / unitsPer(line.product, line.presentation))
  const subtotal = round2(base * unitCost)
  const gravado = (line.product.tax_affectation ?? 'gravado') === 'gravado'
  const igv = gravado ? round2((subtotal * IGV_RATE_PERCENT) / 100) : 0
  return { errors, quantity: base, unitCost, subtotal, igv }
}

export type PurchaseHeader = {
  supplierId: string
  docType: PurchaseDocType
  docNumber: string
  issueDate: string
}

export type HeaderErrors = Partial<Record<keyof PurchaseHeader, string>>

export function validateHeader(h: PurchaseHeader): HeaderErrors {
  const errors: HeaderErrors = {}
  if (!h.supplierId) errors.supplierId = 'Elige el proveedor'
  const doc = h.docNumber.trim()
  if (doc === '') errors.docNumber = 'Ingresa el número del documento'
  else if (doc.length > 30) errors.docNumber = 'Máximo 30 caracteres'
  if (!isoDate.test(h.issueDate)) errors.issueDate = 'Ingresa la fecha de emisión'
  else if (h.issueDate > todayISO()) errors.issueDate = 'La fecha no puede ser futura'
  else if (h.issueDate < addDaysISO(-MAX_DOC_AGE_DAYS)) errors.issueDate = 'El documento tiene más de 2 años'
  return errors
}

export type PurchaseTotals = { subtotal: number; igv: number; total: number }

export function purchaseTotals(computed: ComputedLine[]): PurchaseTotals {
  const subtotal = round2(computed.reduce((s, c) => s + c.subtotal, 0))
  const igv = round2(computed.reduce((s, c) => s + c.igv, 0))
  return { subtotal, igv, total: round2(subtotal + igv) }
}

export type PurchaseItemPayload = {
  product_id: string
  lot_code: string
  expiry_date: string | null
  quantity: number
  unit_cost: number
}

export function toPurchaseItems(lines: PurchaseLineDraft[], computed: ComputedLine[]): PurchaseItemPayload[] {
  return lines.map((l, i) => ({
    product_id: l.product.id,
    lot_code: l.lotCode.trim(),
    expiry_date: l.noExpiry ? null : l.expiryDate,
    quantity: computed[i]!.quantity,
    unit_cost: computed[i]!.unitCost,
  }))
}
