import { lazy, Suspense } from 'react'
import { AlertTriangle, Banknote, MapPin, Package, Receipt, Timer } from 'lucide-react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useIsAdmin } from '@/features/auth/hooks/useIsAdmin'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import { NewSaleButton } from '@/features/dashboard/components/NewSaleButton'
import { AttentionList } from '@/features/dashboard/components/AttentionList'
import { RecentSales } from '@/features/dashboard/components/RecentSales'
import { StatCard } from '@/features/dashboard/components/StatCard'
import { useProfileName } from '@/features/dashboard/hooks/useDashboardData'
import { useInventoryCounts } from '@/features/inventory/hooks/useInventory'
import { useTodaySalesSummary } from '@/features/sales/hooks/useSales'
import { formatPEN } from '@/lib/format'
import { PATHS } from '@/routes/paths'

// La librería de gráficos pesa ~100 KB: solo se descarga cuando el administrador ve el gráfico.
const WeekSalesCard = lazy(() =>
  import('@/features/dashboard/components/WeekSalesCard').then((m) => ({ default: m.WeekSalesCard })),
)

function displayName(fullName: string | null | undefined, email: string | undefined): string {
  if (fullName?.trim()) return fullName.trim().split(/\s+/)[0] ?? ''
  return email?.split('@')[0] ?? ''
}

export function DashboardPage() {
  const { membership, user } = useAuth()
  // ProtectedRoute garantiza que ambos existen.
  const profile = useProfileName(user?.id ?? '')
  const branch = useMainBranch()
  const counts = useInventoryCounts()
  const today = useTodaySalesSummary()
  const isAdmin = useIsAdmin()

  const name = profile.isSuccess ? displayName(profile.data, user?.email) : ''
  const stats = counts.data
  const countsLoading = counts.isPending && !counts.noBranch
  const loadError = [profile.error, branch.error, counts.error, today.error].find((e) => e instanceof Error)
  const todayLoading = today.isPending && !counts.noBranch

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{name ? `Hola, ${name}` : 'Hola'}</h1>
          <p className="text-sm text-muted-foreground">{membership?.pharmacy_name}</p>
          {branch.isPending ? <Skeleton className="h-4 w-56" /> : null}
          {branch.isSuccess ? (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
              {branch.data
                ? `Sucursal principal: ${branch.data.name}`
                : 'Aún no hay una sucursal principal configurada.'}
            </p>
          ) : null}
        </div>
        <NewSaleButton />
      </div>

      {loadError ? <ErrorMessage message={(loadError as Error).message} /> : null}

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          title="Ventas del día"
          icon={Receipt}
          to={PATHS.sales}
          loading={todayLoading}
          value={today.data?.salesCount}
          hint={
            today.data && today.data.voidedCount > 0
              ? `${today.data.voidedCount} anulada${today.data.voidedCount === 1 ? '' : 's'}`
              : 'Completadas hoy'
          }
        />
        <StatCard
          title="Ingresos"
          icon={Banknote}
          to={PATHS.cash}
          loading={todayLoading}
          valueText={today.data ? formatPEN(today.data.total) : undefined}
          hint="Cobrado hoy"
        />
        <StatCard
          title="Productos"
          icon={Package}
          to={PATHS.products}
          loading={countsLoading}
          value={stats?.products}
          hint="Activos en el catálogo"
        />
        <StatCard
          title="Stock bajo"
          icon={AlertTriangle}
          to={PATHS.inventory}
          loading={countsLoading}
          value={stats?.lowStock}
          alert
          hint="Bajo su stock mínimo"
        />
        <StatCard
          title="Por vencer"
          icon={Timer}
          to={PATHS.inventory}
          loading={countsLoading}
          value={stats?.expiringSoon}
          alert
          hint={
            stats && stats.expired > 0
              ? `${stats.expired} lote${stats.expired === 1 ? '' : 's'} ya vencido${stats.expired === 1 ? '' : 's'}`
              : 'Lotes en los próximos 30 días'
          }
        />
      </section>

      {isAdmin ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <WeekSalesCard />
        </Suspense>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentSales />
        <AttentionList />
      </div>
    </div>
  )
}
