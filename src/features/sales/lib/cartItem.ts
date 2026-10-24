import type { Presentation } from '@/features/products/lib/presentations'
import { toCents, type CartLine } from '@/features/sales/lib/cart'
import { presentationPrice, type SellableProduct } from '@/features/sales/types'

/** Convierte un producto del POS y una presentación en la línea (sin cantidad) que va al carrito. */
export function toCartItem(product: SellableProduct, presentation: Presentation): Omit<CartLine, 'quantity'> {
  return {
    productId: product.productId,
    name: product.name,
    presentation,
    unitPriceCents: toCents(presentationPrice(product, presentation) ?? 0),
    sellableUnits: product.sellableUnits,
    requiresPrescription: product.requiresPrescription,
    taxAffectation: product.taxAffectation,
    unit_label: product.unit_label,
    units_per_blister: product.units_per_blister,
    units_per_box: product.units_per_box,
  }
}
