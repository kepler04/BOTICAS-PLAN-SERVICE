import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { TextField } from '@/components/common/TextField'
import { Button } from '@/components/ui/button'
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from '@/features/auth/schemas/authSchemas'
import { authService } from '@/features/auth/services/authService'
import { PATHS } from '@/routes/paths'

export function ResetPasswordForm() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit, formState } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async ({ password }) => {
    setServerError(null)
    try {
      await authService.updatePassword(password)
      toast.success('Contraseña actualizada correctamente.')
      void navigate(PATHS.home, { replace: true })
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo actualizar la contraseña.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage message={serverError} /> : null}
      <TextField
        control={control}
        name="password"
        label="Nueva contraseña"
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
        {submitting ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
    </form>
  )
}
