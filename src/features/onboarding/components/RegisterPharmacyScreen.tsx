import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { TextField } from '@/components/common/TextField'
import { Button } from '@/components/ui/button'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { useAuth } from '@/features/auth/hooks/useAuth'
import {
  registerPharmacySchema,
  type RegisterPharmacyValues,
} from '@/features/onboarding/schemas/pharmacySchemas'
import { pharmacyService } from '@/features/onboarding/services/pharmacyService'

/** Se muestra a quien inició sesión pero aún no pertenece a ninguna botica. */
export function RegisterPharmacyScreen() {
  const { refreshMembership, signOut } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit, formState } = useForm<RegisterPharmacyValues>({
    resolver: zodResolver(registerPharmacySchema),
    defaultValues: { legalName: '', tradeName: '', ruc: '' },
  })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await pharmacyService.register(values)
      toast.success('¡Botica registrada! Tienes 3 meses de prueba.')
      // La membresía nueva hace que ProtectedRoute deje pasar al panel.
      await refreshMembership()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo registrar la botica.')
    }
  })

  async function handleSignOut() {
    try {
      await signOut()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar sesión.')
    }
  }

  return (
    <AuthShell
      title="Registra tu botica"
      description="Un último paso: crea tu botica para empezar a usar el sistema."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError ? <ErrorMessage title="No se pudo registrar" message={serverError} /> : null}
        <TextField
          control={control}
          name="legalName"
          label="Nombre o razón social"
          placeholder="Botica San Martín S.A.C."
          autoComplete="organization"
          disabled={submitting}
        />
        <TextField
          control={control}
          name="tradeName"
          label="Nombre comercial (opcional)"
          placeholder="Botica San Martín"
          disabled={submitting}
        />
        <TextField
          control={control}
          name="ruc"
          label="RUC (opcional)"
          placeholder="20123456789"
          disabled={submitting}
        />
        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {submitting ? 'Registrando…' : 'Registrar mi botica'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          ¿Te invitaron a una botica? Pide al administrador que te agregue y vuelve a ingresar.
        </p>
        <Button type="button" variant="ghost" className="w-full" onClick={handleSignOut}>
          <LogOut aria-hidden="true" />
          Cerrar sesión
        </Button>
      </form>
    </AuthShell>
  )
}
