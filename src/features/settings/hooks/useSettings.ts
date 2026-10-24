import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import type { PharmacySettingsValues } from '@/features/settings/schemas/settingsSchemas'
import { settingsService } from '@/features/settings/services/settingsService'

/** Configuración de la botica (si cobra IGV, RUC, nombres). Se cachea: la leen el POS y las entradas de stock. */
export function usePharmacySettings() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  return useQuery({
    queryKey: ['pharmacy-settings', pharmacyId],
    queryFn: () => settingsService.getPharmacy(pharmacyId),
    enabled: pharmacyId !== '',
    staleTime: 5 * 60_000,
  })
}

export function useUpdatePharmacySettings() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: PharmacySettingsValues) => settingsService.updatePharmacy(pharmacyId, v),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pharmacy-settings', pharmacyId] })
      void queryClient.invalidateQueries({ queryKey: ['receipt-header', pharmacyId] })
    },
  })
}
