import { useState } from 'react'
import { FileDown, PackageSearch, Pencil, Plus, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { NativeSelect } from '@/components/common/NativeSelect'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { SearchInput } from '@/components/common/SearchInput'
import { Badge } from '@/components/ui/badge'
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
import { CategoriesDialog } from '@/features/products/components/CategoriesDialog'
import { ProductFormDialog } from '@/features/products/components/ProductFormDialog'
import { useCategories, useExportPriceReport, useProductList } from '@/features/products/hooks/useProducts'
import {
  PRODUCTS_PAGE_SIZE,
  type ProductFilters,
  type ProductStatusFilter,
} from '@/features/products/services/productService'
import type { Product } from '@/features/products/types'
import { formatPEN } from '@/lib/format'
import { AFFECTATION_SHORT } from '@/lib/igv'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

export function ProductsPage() {
  const isAdmin = useIsAdmin()
  const exportPrices = useExportPriceReport()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<ProductStatusFilter>('active')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<Product | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)

  const debouncedSearch = useDebouncedValue(search)
  const filters: ProductFilters = { search: debouncedSearch, categoryId, status, page }
  const products = useProductList(filters)
  const categories = useCategories()
  const categoryName = new Map((categories.data ?? []).map((c) => [c.id, c.name]))

  const rows = products.data?.rows ?? []
  const total = products.data?.total ?? 0
  const hasFilters = search.trim() !== '' || categoryId !== '' || status !== 'active'

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(product: Product) {
    setEditing(product)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Productos"
        description="Catálogo de medicamentos y productos de tu botica."
        actions={
          isAdmin ? (
            <>
              <Button
                variant="outline"
                disabled={exportPrices.isPending}
                onClick={() =>
                  exportPrices.mutate(undefined, {
                    onSuccess: ({ total, missing }) =>
                      missing > 0
                        ? toast.warning(`Se exportaron ${total} productos. ${missing} no tienen código DIGEMID: complétalo antes de reportar.`)
                        : toast.success(`Se exportaron ${total} productos con su código DIGEMID.`),
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                <FileDown aria-hidden="true" />
                Precios DIGEMID
              </Button>
              <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
                <Tags aria-hidden="true" />
                Categorías
              </Button>
              <Button onClick={openCreate}>
                <Plus aria-hidden="true" />
                Nuevo producto
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_10rem]">
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          placeholder="Buscar por nombre, principio activo o código de barras"
          aria-label="Buscar productos"
        />
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
        <NativeSelect
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ProductStatusFilter)
            setPage(0)
          }}
          aria-label="Filtrar por estado"
        >
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </NativeSelect>
      </div>

      {products.isError ? <ErrorMessage message={products.error.message} /> : null}

      {products.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : null}

      {products.isSuccess && rows.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={hasFilters ? 'No encontramos productos' : 'Aún no tienes productos'}
          description={
            hasFilters
              ? 'Prueba con otra búsqueda o quita los filtros.'
              : isAdmin
                ? 'Crea tu primer producto con el botón “Nuevo producto”.'
                : 'El administrador aún no ha cargado productos.'
          }
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="hidden md:table-cell">Categoría</TableHead>
                <TableHead className="hidden lg:table-cell">Presentaciones</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                {isAdmin ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} className={p.active ? undefined : 'opacity-60'}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{p.name}</div>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {[p.generic_name, p.concentration, p.laboratory].filter(Boolean).join(' · ')}
                      {p.requires_prescription ? <Badge variant="outline">Receta</Badge> : null}
                      {p.tax_affectation !== 'gravado' ? <Badge variant="outline">{AFFECTATION_SHORT[p.tax_affectation]}</Badge> : null}
                      {!p.active ? <Badge variant="secondary">Inactivo</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {p.category_id ? (categoryName.get(p.category_id) ?? '—') : '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{p.unit_label}</Badge>
                      {p.units_per_blister ? <Badge variant="secondary">Blíster ×{p.units_per_blister}</Badge> : null}
                      {p.units_per_box ? <Badge variant="secondary">Caja ×{p.units_per_box}</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div>{formatPEN(p.price_unit)}</div>
                    {p.price_blister !== null || p.price_box !== null ? (
                      <div className="text-xs text-muted-foreground">
                        {p.price_blister !== null ? `Blíster ${formatPEN(p.price_blister)}` : null}
                        {p.price_blister !== null && p.price_box !== null ? ' · ' : null}
                        {p.price_box !== null ? `Caja ${formatPEN(p.price_box)}` : null}
                      </div>
                    ) : null}
                  </TableCell>
                  {isAdmin ? (
                    <TableCell>
                      <Button size="icon-sm" variant="ghost" onClick={() => openEdit(p)} aria-label={`Editar ${p.name}`}>
                        <Pencil aria-hidden="true" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Pagination page={page} pageSize={PRODUCTS_PAGE_SIZE} total={total} onPageChange={setPage} />

      {isAdmin ? (
        <>
          <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />
          <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />
        </>
      ) : null}
    </div>
  )
}
