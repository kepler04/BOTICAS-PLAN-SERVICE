import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { einvoiceService } from '@/features/einvoice/services/einvoiceService'

export function useEinvoice(saleId: string | null) {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  return useQuery({
    queryKey: ['einvoice', pharmacyId, saleId],
    queryFn: () => einvoiceService.getBySale(saleId!),
    enabled: pharmacyId !== '' && saleId !== null,
  })
}

export function useCreditNote(saleId: string | null) {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  return useQuery({
    queryKey: ['einvoice', pharmacyId, saleId, 'credit-note'],
    queryFn: () => einvoiceService.getCreditNoteBySale(saleId!),
    enabled: pharmacyId !== '' && saleId !== null,
  })
}

/** Anular con nota de crédito: cambia la venta, el stock, la caja y los reportes. */
export function useIssueCreditNote() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { saleId: string; reason: string }) => einvoiceService.issueCreditNote(v.saleId, v.reason),
    onSettled: () => {
      for (const key of ['einvoice', 'sales', 'cash', 'inventory', 'reports']) {
        void queryClient.invalidateQueries({ queryKey: [key, pharmacyId] })
      }
    },
  })
}

export function useEmitEinvoice() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (saleId: string) => einvoiceService.emit(saleId),
    onSuccess: (einvoice) => {
      queryClient.setQueryData(['einvoice', pharmacyId, einvoice.saleId], einvoice)
      void queryClient.invalidateQueries({ queryKey: ['sales', pharmacyId] })
    },
  })
}
