import { Link } from 'react-router'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { PATHS } from '@/routes/paths'

/** El enlace de recuperación inicia una sesión temporal; sin sesión el enlace no es válido. */
export function ResetPasswordPage() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingScreen />

  if (!session) {
    return (
      <AuthShell
        title="Enlace no válido"
        description="El enlace de recuperación expiró o ya fue utilizado."
      >
        <Link
          to={PATHS.forgotPassword}
          className="block text-center text-sm text-primary hover:underline"
        >
          Solicitar un nuevo enlace
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Nueva contraseña" description="Elige una contraseña de al menos 8 caracteres.">
      <ResetPasswordForm />
    </AuthShell>
  )
}
