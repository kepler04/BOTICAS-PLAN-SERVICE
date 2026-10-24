import type { PackSpec } from '@/features/products/lib/presentations'
import type { TaxAffectation } from '@/lib/igv'
import type { Tables } from '@/types/database.types'

export type Lot = Tables<'lots'>

/** Lo mínimo que necesitan los formularios de stock para identificar un producto y convertir unidades. */
export type ProductRef = { id: string; name: string; tax_affectation?: TaxAffectation } & PackSpec

/** Fila de la vista `product_stock` ya sin nulos. */
export type StockRow = ProductRef & {
  generic_name: string | null
  concentration: string | null
  barcode: string | null
  category_id: string | null
  min_stock: number
  total_quantity: number
  expired_quantity: number
  lot_count: number
  next_expiry: string | null
  is_low: boolean
}

export type StockFilter = 'all' | 'low' | 'out' | 'expiring'

export type LotWithProduct = Lot & {
  products: (Pick<ProductRef, 'name' | 'unit_label' | 'units_per_blister' | 'units_per_box'> & {
    min_stock?: number
  }) | null
}

export type MovementRow = Tables<'inventory_movements'> & {
  products: Pick<ProductRef, 'name' | 'unit_label' | 'units_per_blister' | 'units_per_box'> | null
  lots: { lot_code: string } | null
  profiles: { full_name: string | null } | null
}
