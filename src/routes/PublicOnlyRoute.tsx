import { Navigate, Outlet, useLocation } from 'react-router'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { PATHS } from '@/routes/paths'

type LocationState = { from?: { pathname?: string; search?: string; hash?: string } } | null

/** Rutas públicas (login, recuperar): si ya hay sesión, redirige a la ruta de origen o a "/". */
export function PublicOnlyRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />

  if (session) {
    const from = (location.state as LocationState)?.from
    const target = from?.pathname
      ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
      : PATHS.home
    return <Navigate to={target} replace />
  }

  return <Outlet />
}
