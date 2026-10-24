import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import {
  EXPIRING_SOON_DAYS,
  inventoryService,
  type AdjustStockInput,
  type RegisterEntryInput,
  type StockQuery,
} from '@/features/inventory/services/inventoryService'

/** Contexto común: botica y sucursal con la que se trabaja. */
function useInventoryScope() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  const branch = useMainBranch()
  const branchId = branch.data?.id ?? ''
  return { pharmacyId, branchId, ready: pharmacyId !== '' && branchId !== '', branch }
}

export function useStockList(query: StockQuery) {
  const { pharmacyId, branchId, ready } = useInventoryScope()
  return useQuery({
    queryKey: ['inventory', pharmacyId, branchId, 'stock', query],
    queryFn: () => inventoryService.listStock(branchId, query),
    enabled: ready,
    placeholderData: keepPreviousData,
  })
}

export function useLots(productId: string | null) {
  const { pharmacyId, branchId, ready } = useInventoryScope()
  return useQuery({
    queryKey: ['inventory', pharmacyId, branchId, 'lots', productId],
    queryFn: () => inventoryService.listLots(branchId, productId!),
    enabled: ready && productId !== null,
  })
}

export function useExpiringLots(days: number) {
  const { pharmacyId, branchId, ready } = useInventoryScope()
  return useQuery({
    queryKey: ['inventory', pharmacyId, branchId, 'expiring', days],
    queryFn: () => inventoryService.listExpiringLots(branchId, days),
    enabled: ready,
  })
}

export function useMovements(page: number) {
  const { pharmacyId, branchId, ready } = useInventoryScope()
  return useQuery({
    queryKey: ['inventory', pharmacyId, branchId, 'movements', page],
    queryFn: () => inventoryService.listMovements(branchId, page),
    enabled: ready,
    placeholderData: keepPreviousData,
  })
}

export function useKardex(productId: string | null, from: string, to: string) {
  const { pharmacyId, branchId, ready } = useInventoryScope()
  return useQuery({
    queryKey: ['inventory', pharmacyId, branchId, 'kardex', productId, from, to],
    queryFn: () => inventoryService.getKardex(branchId, productId!, from, to),
    enabled: ready && productId !== null && from !== '' && to !== '' && from <= to,
    placeholderData: keepPreviousData,
  })
}

/** Id de la sucursal con la que se registran las entradas (undefined mientras carga). */
export function useActiveBranchId(): string | undefined {
  const { branchId } = useInventoryScope()
  return branchId || undefined
}

function useRefreshInventory() {
  const { pharmacyId } = useInventoryScope()
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['reports', pharmacyId] })
    return queryClient.invalidateQueries({ queryKey: ['inventory', pharmacyId] })
  }
}

export function useRegisterEntry() {
  const refresh = useRefreshInventory()
  return useMutation({
    mutationFn: (input: RegisterEntryInput) => inventoryService.registerEntry(input),
    onSuccess: refresh,
  })
}

export function useAdjustStock() {
  const refresh = useRefreshInventory()
  return useMutation({
    mutationFn: (input: AdjustStockInput) => inventoryService.adjustStock(input),
    onSuccess: refresh,
  })
}

/** Indicadores reales del dashboard (botica y sucursal principal). */
export function useInventoryCounts() {
  const { pharmacyId, branchId, ready, branch } = useInventoryScope()
  const query = useQuery({
    queryKey: ['inventory', pharmacyId, branchId, 'dashboard-counts'],
    queryFn: async () => {
      const [products, lowStock, expiringSoon, expired] = await Promise.all([
        inventoryService.countActiveProducts(pharmacyId),
        inventoryService.countLowStock(branchId),
        inventoryService.countExpiringLots(branchId, EXPIRING_SOON_DAYS),
        inventoryService.countExpiringLots(branchId, 0, true),
      ])
      return { products, lowStock, expiringSoon, expired }
    },
    enabled: ready,
  })
  // Sin sucursal principal no hay stock que contar: no queda cargando para siempre.
  const noBranch = branch.isSuccess && branch.data === null
  return { ...query, noBranch }
}
