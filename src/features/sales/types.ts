import type { PackSpec, Presentation } from '@/features/products/lib/presentations'
import type { TaxAffectation } from '@/lib/igv'
import type { Tables } from '@/types/database.types'

export type PaymentMethod = 'cash' | 'yape' | 'plin' | 'card'

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  card: 'Tarjeta',
}

/** Producto tal como lo muestra el POS: precios por presentación y stock vendible. */
export type SellableProduct = PackSpec & {
  productId: string
  name: string
  genericName: string | null
  concentration: string | null
  barcode: string | null
  requiresPrescription: boolean
  taxAffectation: TaxAffectation
  priceUnit: number
  priceBlister: number | null
  priceBox: number | null
  /** Unidades mínimas vendibles (sin lotes vencidos). */
  sellableUnits: number
}

export function presentationPrice(p: SellableProduct, presentation: Presentation): number | null {
  if (presentation === 'unit') return p.priceUnit
  if (presentation === 'blister') return p.priceBlister
  return p.priceBox
}

export type SaleItem = Tables<'sale_items'>

export type SaleRow = Tables<'sales'> & {
  profiles: { full_name: string | null } | null
}

export type SaleDetail = SaleRow & { sale_items: SaleItem[] }
