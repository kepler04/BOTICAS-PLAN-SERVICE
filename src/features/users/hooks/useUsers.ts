import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import type { InviteUserValues } from '@/features/users/schemas/usersSchemas'
import { usersService } from '@/features/users/services/usersService'
import type { AppRole } from '@/types/app'

export function useMembers() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  return useQuery({
    queryKey: ['members', pharmacyId],
    queryFn: () => usersService.listMembers(pharmacyId),
    enabled: pharmacyId !== '',
  })
}

export function useUpdateMember() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { memberId: string; role?: AppRole; active?: boolean }) =>
      usersService.updateMember(v.memberId, { role: v.role, active: v.active }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['members', pharmacyId] }),
  })
}

export function useInviteUser() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: InviteUserValues) => usersService.invite(pharmacyId, v),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', pharmacyId] }),
  })
}
