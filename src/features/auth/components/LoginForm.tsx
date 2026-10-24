import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { TextField } from '@/components/common/TextField'
import { Button } from '@/components/ui/button'
import { loginSchema, type LoginValues } from '@/features/auth/schemas/authSchemas'
import { authService } from '@/features/auth/services/authService'
import { PATHS } from '@/routes/paths'

/** Tras iniciar sesión, el cambio de sesión redirige desde la ruta pública. */
export function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null)
    try {
      await authService.signIn(email, password)
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage title="No se pudo iniciar sesión" message={serverError} /> : null}
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
        autoComplete="current-password"
        disabled={submitting}
      />
      <Button type="submit" className="w-full" size="lg" disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {submitting ? 'Ingresando…' : 'Ingresar'}
      </Button>
      <p className="text-center text-sm">
        <Link to={PATHS.forgotPassword} className="font-medium text-primary underline underline-offset-4 hover:decoration-2">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
      <p className="text-center text-sm text-muted-foreground">
        ¿Aún no tienes cuenta?{' '}
        <Link to={PATHS.register} className="font-medium text-primary underline underline-offset-4 hover:decoration-2">
          Registra tu botica
        </Link>
      </p>
    </form>
  )
}
