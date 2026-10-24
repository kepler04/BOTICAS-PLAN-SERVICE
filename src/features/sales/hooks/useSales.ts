import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import { isValidCustomerDoc, type CustomerDocType } from '@/lib/peruDocs'
import {
  salesService,
  type CreateSaleInput,
  type ReceiptHeader,
  type SalesFilters,
} from '@/features/sales/services/salesService'

function useScope() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  const branch = useMainBranch()
  const branchId = branch.data?.id ?? ''
  return { pharmacyId, branchId, branch, ready: pharmacyId !== '' && branchId !== '' }
}

/** Productos vendibles de la sucursal. Con texto vacío lista los primeros por nombre. */
export function useSellableSearch(term: string) {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['sales', pharmacyId, branchId, 'sellable', term],
    queryFn: () => salesService.searchSellable(branchId, term),
    enabled: ready,
    placeholderData: keepPreviousData,
    // El stock cambia con cada venta: no conviene mostrar cifras viejas en el POS.
    staleTime: 5_000,
  })
}

/** Alternativas con el mismo principio activo. Solo consulta cuando se pide (`enabled`). */
export function useAlternatives(productId: string, genericName: string | null, enabled: boolean) {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['sales', pharmacyId, branchId, 'alternatives', productId],
    queryFn: () => salesService.findAlternatives(branchId, productId, genericName ?? ''),
    enabled: ready && enabled && Boolean(genericName?.trim()),
    staleTime: 5_000,
  })
}

export function useSalesList(filters: SalesFilters) {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['sales', pharmacyId, branchId, 'list', filters],
    queryFn: () => salesService.listSales(branchId, filters),
    enabled: ready,
    placeholderData: keepPreviousData,
  })
}

export function useSale(id: string | null) {
  const { pharmacyId } = useScope()
  return useQuery({
    queryKey: ['sales', pharmacyId, 'detail', id],
    queryFn: () => salesService.getSale(id!),
    enabled: pharmacyId !== '' && id !== null,
  })
}

/** Devuelve una función que busca un producto por código de barras exacto (lector). */
export function useFindByBarcode() {
  const { branchId } = useScope()
  return (code: string) => salesService.findByBarcode(branchId, code)
}

/** Nombre de un cliente ya registrado con ese documento (null si no existe). Solo consulta documentos válidos. */
export function useKnownCustomer(docType: CustomerDocType, docNumber: string) {
  const { pharmacyId } = useScope()
  const valid = isValidCustomerDoc(docType, docNumber)
  return useQuery({
    queryKey: ['customers', pharmacyId, docType, docNumber],
    queryFn: () => salesService.findCustomer(pharmacyId, docType, docNumber),
    enabled: pharmacyId !== '' && valid,
    staleTime: 60_000,
  })
}

function useRefreshAfterSale() {
  const { pharmacyId } = useScope()
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['sales', pharmacyId] })
    void queryClient.invalidateQueries({ queryKey: ['cash', pharmacyId] })
    void queryClient.invalidateQueries({ queryKey: ['inventory', pharmacyId] })
    void queryClient.invalidateQueries({ queryKey: ['reports', pharmacyId] })
    // La venta pudo registrar o renombrar a un cliente: lo que se buscó antes por su DNI ya no vale.
    void queryClient.invalidateQueries({ queryKey: ['customers', pharmacyId] })
  }
}

export function useCreateSale() {
  const refresh = useRefreshAfterSale()
  return useMutation({
    mutationFn: (input: CreateSaleInput) => salesService.createSale(input),
    // También al fallar: un "sin stock" significa que lo que mostraba el POS estaba desactualizado.
    onSettled: refresh,
  })
}

export function useVoidSale() {
  const refresh = useRefreshAfterSale()
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => salesService.voidSale(v.id, v.reason),
    onSuccess: refresh,
  })
}

/** Ventas de hoy (desde las 00:00 hora local del navegador) para el dashboard. */
export function useTodaySalesSummary() {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['sales', pharmacyId, branchId, 'today'],
    queryFn: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      return salesService.getSummary(branchId, start.toISOString(), end.toISOString())
    },
    enabled: ready,
    staleTime: 15_000,
  })
}

/** Datos del negocio que se imprimen en el comprobante. */
export function useReceiptHeader() {
  const { pharmacyId, branch } = useScope()
  return useQuery({
    queryKey: ['receipt-header', pharmacyId, branch.data?.id ?? ''],
    queryFn: async (): Promise<ReceiptHeader> => {
      const info = await salesService.getPharmacyInfo(pharmacyId)
      return {
        name: info.name,
        ruc: info.ruc,
        branchName: branch.data?.name ?? '',
        branchAddress: branch.data?.address ?? null,
      }
    },
    enabled: pharmacyId !== '' && branch.isSuccess,
    staleTime: 10 * 60_000,
  })
}
