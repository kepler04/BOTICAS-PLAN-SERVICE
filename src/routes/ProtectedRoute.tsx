import { Navigate, Outlet, useLocation } from 'react-router'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { AccountStatusScreen } from '@/features/auth/components/AccountStatusScreen'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { RegisterPharmacyScreen } from '@/features/onboarding/components/RegisterPharmacyScreen'
import { PATHS } from '@/routes/paths'

/** Exige sesión y membresía activa. Guarda la ruta de origen para volver tras el login. */
export function ProtectedRoute() {
  const { session, membership, membershipError, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />

  if (!session) {
    return <Navigate to={PATHS.login} replace state={{ from: location }} />
  }

  if (membershipError) {
    return <AccountStatusScreen title="No pudimos cargar tu cuenta" message={membershipError} />
  }

  if (!membership) {
    return <RegisterPharmacyScreen />
  }

  return <Outlet />
}
