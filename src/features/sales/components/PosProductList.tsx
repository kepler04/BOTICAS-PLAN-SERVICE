import { useState } from 'react'
import { PackageSearch } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { SearchInput } from '@/components/common/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatStock, type Presentation } from '@/features/products/lib/presentations'
import { AlternativesPanel } from '@/features/sales/components/AlternativesPanel'
import { PresentationButtons } from '@/features/sales/components/PresentationButtons'
import { remainingFor, type CartLine } from '@/features/sales/lib/cart'
import { toCartItem } from '@/features/sales/lib/cartItem'
import { useFindByBarcode, useSellableSearch } from '@/features/sales/hooks/useSales'
import type { SellableProduct } from '@/features/sales/types'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

type PosProductListProps = {
  lines: CartLine[]
  onAdd: (product: SellableProduct, presentation: Presentation) => void
}

export function PosProductList({ lines, onAdd }: PosProductListProps) {
  const [term, setTerm] = useState('')
  const debounced = useDebouncedValue(term, 250)
  const results = useSellableSearch(debounced)
  const findByBarcode = useFindByBarcode()
  const rows = results.data ?? []

  /** Lector de código de barras: escribe el código y envía Enter. Agrega 1 unidad. */
  async function handleEnter() {
    const code = term.trim()
    if (!/^\d{3,}$/.test(code)) return
    try {
      const product = await findByBarcode(code)
      if (!product) {
        toast.error(`No encontramos ningún producto con el código ${code}.`)
        return
      }
      if (remainingFor(lines, toCartItem(product, 'unit')) < 1) {
        toast.error(`“${product.name}” no tiene más stock disponible.`)
      } else {
        onAdd(product, 'unit')
        toast.success(`Agregado: ${product.name}`)
      }
      setTerm('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo buscar el código.')
    }
  }

  return (
    <section className="space-y-3" aria-label="Productos">
      <SearchInput
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void handleEnter()
          }
        }}
        placeholder="Busca por nombre o escanea el código de barras"
        aria-label="Buscar producto para vender"
        autoFocus
      />

      {results.isError ? <ErrorMessage message={results.error.message} /> : null}
      {results.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : null}
      {results.isSuccess && rows.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No encontramos productos"
          description={term.trim() ? 'Prueba con otro nombre o código.' : 'Aún no hay productos activos. Créalos en “Productos”.'}
        />
      ) : null}

      <ul className="space-y-2">
        {rows.map((p) => {
          const out = p.sellableUnits === 0
          return (
            <li key={p.productId} className="rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[p.genericName, p.concentration].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {p.requiresPrescription ? <Badge variant="outline">Receta</Badge> : null}
                  {out ? (
                    <Badge variant="destructive">Agotado</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Stock: {formatStock(p, p.sellableUnits)}</span>
                  )}
                </div>
              </div>
              <PresentationButtons product={p} lines={lines} onAdd={onAdd} />
              {out ? <AlternativesPanel product={p} lines={lines} onAdd={onAdd} /> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
