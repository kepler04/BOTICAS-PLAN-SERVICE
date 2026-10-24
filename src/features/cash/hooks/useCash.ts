import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import { cashService } from '@/features/cash/services/cashService'

function useScope() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  const branch = useMainBranch()
  const branchId = branch.data?.id ?? ''
  return { pharmacyId, branchId, ready: pharmacyId !== '' && branchId !== '' }
}

/** Caja abierta de la sucursal (null = no hay). Se refresca seguido: de ella depende poder vender. */
export function useOpenCashSession() {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['cash', pharmacyId, branchId, 'open'],
    queryFn: () => cashService.getOpenSession(branchId),
    enabled: ready,
    staleTime: 10_000,
  })
}

export function useCashSessions(page: number) {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['cash', pharmacyId, branchId, 'sessions', page],
    queryFn: () => cashService.listSessions(branchId, page),
    enabled: ready,
    placeholderData: keepPreviousData,
  })
}

export function useCashMovements(sessionId: string | null) {
  const { pharmacyId } = useScope()
  return useQuery({
    queryKey: ['cash', pharmacyId, 'movements', sessionId],
    queryFn: () => cashService.listMovements(sessionId!),
    enabled: pharmacyId !== '' && sessionId !== null,
  })
}

function useRefreshCash() {
  const { pharmacyId } = useScope()
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['cash', pharmacyId] })
    void queryClient.invalidateQueries({ queryKey: ['sales', pharmacyId] })
  }
}

export function useOpenCash() {
  const { branchId } = useScope()
  const refresh = useRefreshCash()
  return useMutation({
    mutationFn: (openingAmount: number) => cashService.openSession(branchId, openingAmount),
    onSuccess: refresh,
  })
}

export function useAddCashMovement() {
  const refresh = useRefreshCash()
  return useMutation({
    mutationFn: (v: { sessionId: string; type: 'income' | 'expense'; amount: number; reason: string }) =>
      cashService.addMovement(v.sessionId, v.type, v.amount, v.reason),
    onSuccess: refresh,
  })
}

export function useCloseCash() {
  const refresh = useRefreshCash()
  return useMutation({
    mutationFn: (v: { sessionId: string; counted: number; notes: string | null }) =>
      cashService.closeSession(v.sessionId, v.counted, v.notes),
    onSuccess: refresh,
  })
}
