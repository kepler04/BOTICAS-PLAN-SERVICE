import { useQuery } from '@tanstack/react-query'
import { dashboardService } from '@/features/dashboard/services/dashboardService'

export function useProfileName(userId: string) {
  return useQuery({
    queryKey: ['profile-name', userId],
    queryFn: () => dashboardService.getProfileName(userId),
    enabled: userId !== '',
    staleTime: 5 * 60_000,
  })
}
