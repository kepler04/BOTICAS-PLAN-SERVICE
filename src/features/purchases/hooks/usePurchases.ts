import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import {
  purchasesService,
  type RegisterPurchaseInput,
  type SupplierPayload,
} from '@/features/purchases/services/purchasesService'

function usePharmacyId(): string {
  return useAuth().membership?.pharmacy_id ?? ''
}

export function useSuppliers() {
  const pharmacyId = usePharmacyId()
  return useQuery({
    queryKey: ['suppliers', pharmacyId],
    queryFn: () => purchasesService.listSuppliers(pharmacyId),
    enabled: pharmacyId !== '',
  })
}

export function useSaveSupplier() {
  const pharmacyId = usePharmacyId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string | null; values: SupplierPayload & { active?: boolean } }): Promise<void> => {
      if (v.id) await purchasesService.updateSupplier(v.id, v.values)
      else await purchasesService.createSupplier(pharmacyId, v.values)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers', pharmacyId] }),
  })
}

export function usePurchaseList(page: number) {
  const pharmacyId = usePharmacyId()
  return useQuery({
    queryKey: ['purchases', pharmacyId, 'list', page],
    queryFn: () => purchasesService.listPurchases(pharmacyId, page),
    enabled: pharmacyId !== '',
    placeholderData: keepPreviousData,
  })
}

export function usePurchase(id: string | null) {
  const pharmacyId = usePharmacyId()
  return useQuery({
    queryKey: ['purchases', pharmacyId, 'detail', id],
    queryFn: () => purchasesService.getPurchase(id!),
    enabled: pharmacyId !== '' && id !== null,
  })
}

export function useRegisterPurchase() {
  const pharmacyId = usePharmacyId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterPurchaseInput) => purchasesService.registerPurchase(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchases', pharmacyId] })
      // Una compra cambia stock, lotes, movimientos y alertas.
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['sales'] })
    },
  })
}
