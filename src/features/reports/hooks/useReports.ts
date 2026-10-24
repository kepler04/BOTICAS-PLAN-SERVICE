import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import type { DateRange } from '@/features/reports/lib/dateRange'
import {
  reportService,
  type Granularity,
  type TopProductOrder,
} from '@/features/reports/services/reportService'

function useScope() {
  const pharmacyId = useAuth().membership?.pharmacy_id ?? ''
  const branchId = useMainBranch().data?.id ?? ''
  return { pharmacyId, branchId, ready: pharmacyId !== '' && branchId !== '' }
}

// Los reportes mantienen el dato anterior mientras se recalcula (sin parpadeo de esqueletos).

export function useSalesSeries(range: DateRange, granularity: Granularity, enabled = true) {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['reports', pharmacyId, branchId, 'series', range, granularity],
    queryFn: () => reportService.salesSeries(branchId, range, granularity),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  })
}

export function useSalesSummary(range: DateRange, enabled = true) {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['reports', pharmacyId, branchId, 'summary', range],
    queryFn: () => reportService.salesSummary(branchId, range),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  })
}

export function useTopProducts(range: DateRange, order: TopProductOrder, limit = 10) {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['reports', pharmacyId, branchId, 'top', range, order, limit],
    queryFn: () => reportService.topProducts(branchId, range, order, limit),
    enabled: ready,
    placeholderData: keepPreviousData,
  })
}

export function useSlowMovers(days: number, limit = 20) {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['reports', pharmacyId, branchId, 'slow', days, limit],
    queryFn: () => reportService.slowMovers(branchId, days, limit),
    enabled: ready,
    placeholderData: keepPreviousData,
  })
}

export function useInventoryValue() {
  const { pharmacyId, branchId, ready } = useScope()
  return useQuery({
    queryKey: ['reports', pharmacyId, branchId, 'inventory-value'],
    queryFn: () => reportService.inventoryValue(branchId),
    enabled: ready,
  })
}
