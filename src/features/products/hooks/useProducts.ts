import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { missingDigemidCode, PRICE_REPORT_COLUMNS, sortForPriceReport } from '@/features/products/lib/priceReport'
import type { ProductPayload } from '@/features/products/schemas/productSchemas'
import { categoryService } from '@/features/products/services/categoryService'
import { productService, type ProductFilters } from '@/features/products/services/productService'
import { downloadCsv, toCsv } from '@/lib/csv'
import { todayISO } from '@/lib/format'

function usePharmacyId(): string {
  return useAuth().membership?.pharmacy_id ?? ''
}

export function useProductList(filters: ProductFilters) {
  const pharmacyId = usePharmacyId()
  return useQuery({
    queryKey: ['products', pharmacyId, 'list', filters],
    queryFn: () => productService.list(pharmacyId, filters),
    enabled: pharmacyId !== '',
    placeholderData: keepPreviousData,
  })
}

/** Búsqueda rápida (selector de producto). No se ejecuta con el texto vacío. */
export function useProductSearch(term: string) {
  const pharmacyId = usePharmacyId()
  return useQuery({
    queryKey: ['products', pharmacyId, 'search', term],
    queryFn: () => productService.search(pharmacyId, term),
    enabled: pharmacyId !== '' && term.trim() !== '',
    placeholderData: keepPreviousData,
  })
}

export function useCategories() {
  const pharmacyId = usePharmacyId()
  return useQuery({
    queryKey: ['categories', pharmacyId],
    queryFn: () => categoryService.list(pharmacyId),
    enabled: pharmacyId !== '',
    staleTime: 5 * 60_000,
  })
}

/** Crea (sin `id`) o actualiza (con `id`) un producto y refresca listas y stock. */
export function useSaveProduct() {
  const pharmacyId = usePharmacyId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: ProductPayload }) =>
      id ? productService.update(id, payload) : productService.create(pharmacyId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', pharmacyId] })
      void queryClient.invalidateQueries({ queryKey: ['inventory', pharmacyId] })
    },
  })
}

export function useCategoryMutations() {
  const pharmacyId = usePharmacyId()
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['categories', pharmacyId] })
    void queryClient.invalidateQueries({ queryKey: ['products', pharmacyId] })
  }
  return {
    create: useMutation({
      mutationFn: (name: string) => categoryService.create(pharmacyId, name),
      onSuccess: refresh,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => categoryService.rename(id, name),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => categoryService.remove(id),
      onSuccess: refresh,
    }),
  }
}

/** Exporta la lista de precios para el reporte a DIGEMID. Devuelve cuántos productos salieron y cuántos sin código. */
export function useExportPriceReport() {
  const pharmacyId = usePharmacyId()
  return useMutation({
    mutationFn: async () => {
      const products = sortForPriceReport(await productService.listForPriceReport(pharmacyId))
      downloadCsv(`precios-digemid-${todayISO()}.csv`, toCsv(PRICE_REPORT_COLUMNS, products))
      return { total: products.length, missing: missingDigemidCode(products) }
    },
  })
}
