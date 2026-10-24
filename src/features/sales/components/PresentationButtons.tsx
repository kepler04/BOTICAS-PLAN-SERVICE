import { Button } from '@/components/ui/button'
import { availablePresentations, PRESENTATION_LABELS, type Presentation } from '@/features/products/lib/presentations'
import { remainingFor, type CartLine } from '@/features/sales/lib/cart'
import { toCartItem } from '@/features/sales/lib/cartItem'
import { presentationPrice, type SellableProduct } from '@/features/sales/types'
import { formatPEN } from '@/lib/format'

type Props = {
  product: SellableProduct
  lines: CartLine[]
  onAdd: (product: SellableProduct, presentation: Presentation) => void
}

/** Un botón por presentación (unidad / blíster / caja) con su precio; se desactiva si ya no queda stock. */
export function PresentationButtons({ product: p, lines, onAdd }: Props) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {availablePresentations(p).map((pres) => {
        const price = presentationPrice(p, pres)
        if (price === null) return null
        const disabled = remainingFor(lines, toCartItem(p, pres)) < 1
        return (
          <Button
            key={pres}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onAdd(p, pres)}
            aria-label={`Agregar ${PRESENTATION_LABELS[pres].toLowerCase()} de ${p.name} a ${formatPEN(price)}`}
          >
            {PRESENTATION_LABELS[pres]} · {formatPEN(price)}
          </Button>
        )
      })}
    </div>
  )
}
