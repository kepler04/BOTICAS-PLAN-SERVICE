import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { TextField } from '@/components/common/TextField'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from '@/features/auth/schemas/authSchemas'
import { authService } from '@/features/auth/services/authService'
import { PATHS } from '@/routes/paths'

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const { control, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null)
    try {
      await authService.sendPasswordReset(email)
      setSent(true)
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo enviar el correo.')
    }
  })

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Revisa tu correo</AlertTitle>
          <AlertDescription>
            Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.
          </AlertDescription>
        </Alert>
        <Link to={PATHS.login} className="block text-center text-sm text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage message={serverError} /> : null}
      <TextField
        control={control}
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        disabled={submitting}
      />
      <Button type="submit" className="w-full" size="lg" disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {submitting ? 'Enviando…' : 'Enviar enlace'}
      </Button>
      <p className="text-center text-sm">
        <Link to={PATHS.login} className="font-medium text-primary underline underline-offset-4 hover:decoration-2">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  )
}
