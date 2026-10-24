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
