import { useState } from 'react'
import { Loader2, Replace } from 'lucide-react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatStock, type Presentation } from '@/features/products/lib/presentations'
import { PresentationButtons } from '@/features/sales/components/PresentationButtons'
import { useAlternatives } from '@/features/sales/hooks/useSales'
import type { CartLine } from '@/features/sales/lib/cart'
import type { SellableProduct } from '@/features/sales/types'

type Props = {
  product: SellableProduct
  lines: CartLine[]
  onAdd: (product: SellableProduct, presentation: Presentation) => void
}

/** Para un producto agotado: otros productos con el mismo principio activo que sí tienen stock. */
export function AlternativesPanel({ product, lines, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const alternatives = useAlternatives(product.productId, product.genericName, open)

  if (!product.genericName?.trim()) return null

  return (
    <div className="mt-2">
      <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Replace aria-hidden="true" />
        {open ? 'Ocultar alternativas' : 'Ver alternativas'}
      </Button>

      {open ? (
        <div className="mt-2 space-y-2 rounded-lg bg-muted/50 p-3" role="region" aria-label={`Alternativas a ${product.name}`}>
          <p className="text-xs text-muted-foreground">
            Mismo principio activo (<strong>{product.genericName}</strong>). Confirma la concentración y la forma
            farmacéutica antes de ofrecerlo: mismo principio activo no implica el mismo producto.
          </p>
          {alternatives.isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Buscando alternativas" /> : null}
          {alternatives.isError ? <ErrorMessage message={alternatives.error.message} /> : null}
          {alternatives.isSuccess && alternatives.data.length === 0 ? (
            <p className="text-sm">No hay otros productos con ese principio activo y stock disponible.</p>
          ) : null}
          <ul className="space-y-2">
            {(alternatives.data ?? []).map((alt) => (
              <li key={alt.productId} className="rounded-lg border bg-card p-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{alt.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[alt.genericName, alt.concentration].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {alt.requiresPrescription ? <Badge variant="outline">Receta</Badge> : null}
                    <span className="text-xs text-muted-foreground">Stock: {formatStock(alt, alt.sellableUnits)}</span>
                  </div>
                </div>
                <PresentationButtons product={alt} lines={lines} onAdd={onAdd} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
