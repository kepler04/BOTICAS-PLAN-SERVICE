import { useState } from 'react'
import { Boxes, Layers, PackagePlus } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { NativeSelect } from '@/components/common/NativeSelect'
import { Pagination } from '@/components/common/Pagination'
import { SearchInput } from '@/components/common/SearchInput'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useIsAdmin } from '@/features/auth/hooks/useIsAdmin'
import { LotsDialog } from '@/features/inventory/components/LotsDialog'
import { StockEntryDialog } from '@/features/inventory/components/StockEntryDialog'
import { ExpiryLabel, StockStatusBadges } from '@/features/inventory/components/StockBadges'
import { useStockList } from '@/features/inventory/hooks/useInventory'
import { INVENTORY_PAGE_SIZE } from '@/features/inventory/services/inventoryService'
import type { StockFilter, StockRow } from '@/features/inventory/types'
import { useCategories } from '@/features/products/hooks/useProducts'
import { formatStock } from '@/features/products/lib/presentations'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

const FILTER_LABELS: Record<StockFilter, string> = {
  all: 'Todo el stock',
  low: 'Stock bajo',
  out: 'Agotados',
  expiring: 'Por vencer (30 días)',
}

export function StockTab() {
  const isAdmin = useIsAdmin()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(0)
  const [entryFor, setEntryFor] = useState<StockRow | null>(null)
  const [lotsFor, setLotsFor] = useState<StockRow | null>(null)

  const debounced = useDebouncedValue(search)
  const stock = useStockList({ search: debounced, filter, categoryId, page })
  const categories = useCategories()

  const rows = stock.data?.rows ?? []
  const total = stock.data?.total ?? 0
  const hasFilters = search.trim() !== '' || filter !== 'all' || categoryId !== ''

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_12rem]">
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          placeholder="Buscar por nombre, principio activo o código de barras"
          aria-label="Buscar en el stock"
        />
        <NativeSelect
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as StockFilter)
            setPage(0)
          }}
          aria-label="Filtrar el stock"
        >
          {(Object.keys(FILTER_LABELS) as StockFilter[]).map((key) => (
            <option key={key} value={key}>
              {FILTER_LABELS[key]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setPage(0)
          }}
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          <option value="none">Sin categoría</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {stock.isError ? <ErrorMessage message={stock.error.message} /> : null}
      {stock.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : null}

      {stock.isSuccess && rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={hasFilters ? 'No hay productos con ese filtro' : 'Aún no hay productos'}
          description={
            hasFilters
              ? 'Prueba con otra búsqueda o quita los filtros.'
              : 'Crea tus productos en “Productos” y luego registra aquí sus entradas de stock.'
          }
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="hidden md:table-cell">Estado</TableHead>
                <TableHead className="hidden lg:table-cell">Próximo vencimiento</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[row.generic_name, row.concentration].filter(Boolean).join(' · ')}
                    </div>
                    <div className="mt-1 md:hidden">
                      <StockStatusBadges row={row} />
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal tabular-nums">
                    <div>{formatStock(row, row.total_quantity)}</div>
                    {row.min_stock > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        Mínimo: {formatStock(row, row.min_stock)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StockStatusBadges row={row} />
                  </TableCell>
                  <TableCell className="hidden whitespace-normal lg:table-cell">
                    <ExpiryLabel date={row.next_expiry} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => setLotsFor(row)} aria-label={`Ver lotes de ${row.name}`}>
                        <Layers aria-hidden="true" />
                      </Button>
                      {isAdmin ? (
                        <Button size="icon-sm" variant="ghost" onClick={() => setEntryFor(row)} aria-label={`Registrar entrada de ${row.name}`}>
                          <PackagePlus aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Pagination page={page} pageSize={INVENTORY_PAGE_SIZE} total={total} onPageChange={setPage} />

      <LotsDialog
        open={lotsFor !== null}
        onOpenChange={(next) => {
          if (!next) setLotsFor(null)
        }}
        product={lotsFor}
      />
      {isAdmin ? (
        <StockEntryDialog
          open={entryFor !== null}
          onOpenChange={(next) => {
            if (!next) setEntryFor(null)
          }}
          product={entryFor}
        />
      ) : null}
    </div>
  )
}
