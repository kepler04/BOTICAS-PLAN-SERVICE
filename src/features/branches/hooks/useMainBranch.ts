import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { branchService } from '@/features/branches/services/branchService'

/**
 * Sucursal con la que trabaja la UI. Hoy es la principal; cuando exista `member_branches`
 * (asignación de usuarios a sucursales) este es el único lugar que cambia.
 */
export function useMainBranch() {
  const { membership } = useAuth()
  const pharmacyId = membership?.pharmacy_id ?? ''
  return useQuery({
    queryKey: ['main-branch', pharmacyId],
    queryFn: () => branchService.getMainBranch(pharmacyId),
    enabled: pharmacyId !== '',
  })
}
