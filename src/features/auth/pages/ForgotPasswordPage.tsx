import { AuthShell } from '@/features/auth/components/AuthShell'
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm'

export function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Recuperar contraseña"
      description="Te enviaremos un enlace a tu correo para crear una nueva contraseña."
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
