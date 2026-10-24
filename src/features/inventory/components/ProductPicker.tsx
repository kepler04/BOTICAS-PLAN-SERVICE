import { useState } from 'react'
import { SearchInput } from '@/components/common/SearchInput'
import { Skeleton } from '@/components/ui/skeleton'
import { useProductSearch } from '@/features/products/hooks/useProducts'
import type { ProductRef } from '@/features/inventory/types'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

type ProductPickerProps = {
  onSelect: (product: ProductRef) => void
}

/**
 * Busca productos activos por nombre, principio activo o código de barras.
 * Un lector USB escribe el código y envía Enter: si hay un único resultado, se elige solo.
 */
export function ProductPicker({ onSelect }: ProductPickerProps) {
  const [term, setTerm] = useState('')
  const debounced = useDebouncedValue(term, 250)
  const results = useProductSearch(debounced)
  const rows = results.data ?? []
  const searching = term.trim() !== ''

  return (
    <div className="space-y-2">
      <SearchInput
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            // Con el texto ya consultado y un único resultado, lo selecciona (lector de código de barras).
            if (debounced === term && rows.length === 1) onSelect(rows[0]!)
          }
        }}
        placeholder="Escribe el nombre o escanea el código de barras"
        aria-label="Buscar producto"
        autoFocus
      />
      {searching && results.isPending ? <Skeleton className="h-16 w-full" /> : null}
      {searching && results.isSuccess && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No encontramos productos activos con esa búsqueda.</p>
      ) : null}
      {rows.length > 0 && searching ? (
        <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
          {rows.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                className="block w-full px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="block text-sm font-medium">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {[p.generic_name, p.concentration, p.barcode].filter(Boolean).join(' · ') || p.unit_label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
