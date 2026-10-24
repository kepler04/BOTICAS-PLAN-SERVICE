import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import { environmentService, type RecordReadingInput } from '@/features/sanitary/services/environmentService'
import { addDaysISO } from '@/lib/format'

/** Días de historial que se muestran (y que se exportan). */
export const HISTORY_DAYS = 30

export function useEnvironmentLimits() {
  return useQuery({
    queryKey: ['environment-limits'],
    queryFn: () => environmentService.getLimits(),
    staleTime: Infinity,
  })
}

export function useEnvironmentReadings() {
  const branchId = useMainBranch().data?.id ?? ''
  const from = addDaysISO(-(HISTORY_DAYS - 1))
  return useQuery({
    queryKey: ['environment-readings', branchId, from],
    queryFn: () => environmentService.listReadings(branchId, from),
    enabled: branchId !== '',
  })
}

export function useRecordReading() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordReadingInput) => environmentService.record(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['environment-readings'] }),
  })
}
