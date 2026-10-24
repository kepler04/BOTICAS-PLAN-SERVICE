import { AuthShell } from '@/features/auth/components/AuthShell'
import { LoginForm } from '@/features/auth/components/LoginForm'

export function LoginPage() {
  return (
    <AuthShell title="Iniciar sesión" description="Ingresa con tu cuenta para administrar tu botica.">
      <LoginForm />
    </AuthShell>
  )
}
