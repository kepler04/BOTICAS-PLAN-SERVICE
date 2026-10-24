import { AuthShell } from '@/features/auth/components/AuthShell'
import { RegisterForm } from '@/features/auth/components/RegisterForm'

export function RegisterPage() {
  return (
    <AuthShell
      title="Crea tu cuenta"
      description="Prueba gratis el sistema para tu botica. Primero tu cuenta, luego tu botica."
    >
      <RegisterForm />
    </AuthShell>
  )
}
