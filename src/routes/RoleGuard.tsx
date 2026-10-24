import { Outlet } from 'react-router'
import { ForbiddenPage } from '@/routes/ForbiddenPage'
import { useAuth } from '@/features/auth/hooks/useAuth'
import type { AppRole } from '@/types/app'

/** Exige que el rol del usuario esté en `roles`; si no, muestra 403. Usar dentro de ProtectedRoute. */
export function RoleGuard({ roles }: { roles: AppRole[] }) {
  const { role } = useAuth()
  if (!role || !roles.includes(role)) return <ForbiddenPage />
  return <Outlet />
}
