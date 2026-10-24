import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, MailCheck } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { TextField } from '@/components/common/TextField'
import { Button, buttonVariants } from '@/components/ui/button'
import { registerSchema, type RegisterValues } from '@/features/auth/schemas/authSchemas'
import { authService } from '@/features/auth/services/authService'
import { PATHS } from '@/routes/paths'

/**
 * Crea la cuenta. Si ya hay sesión, la ruta pública redirige sola y ProtectedRoute
 * pide registrar la botica. Si el proyecto exige confirmar el correo, se avisa aquí.
 */
export function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const { control, handleSubmit, formState } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async ({ fullName, email, password }) => {
    setServerError(null)
    try {
      const result = await authService.signUp(fullName, email, password)
      if (result === 'confirm-email') setSentTo(email)
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo crear la cuenta.')
    }
  })

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto size-10 text-primary" aria-hidden="true" />
        <p className="text-sm">
          Te enviamos un enlace de confirmación a <strong>{sentTo}</strong>. Ábrelo y luego inicia
          sesión para registrar tu botica.
        </p>
        <Link to={PATHS.login} className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
          Ir a iniciar sesión
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage title="No se pudo crear la cuenta" message={serverError} /> : null}
      <TextField
        control={control}
        name="fullName"
        label="Tu nombre"
        autoComplete="name"
        placeholder="María Pérez"
        disabled={submitting}
      />
      <TextField
        control={control}
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        placeholder="tucorreo@ejemplo.com"
        disabled={submitting}
      />
      <TextField
        control={control}
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        disabled={submitting}
      />
      <TextField
        control={control}
        name="confirmPassword"
        label="Confirmar contraseña"
        type="password"
        autoComplete="new-password"
        disabled={submitting}
      />
      <Button type="submit" className="w-full" size="lg" disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>
      <p className="text-center text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link to={PATHS.login} className="font-medium text-primary underline underline-offset-4 hover:decoration-2">
          Inicia sesión
        </Link>
      </p>
    </form>
  )
}
