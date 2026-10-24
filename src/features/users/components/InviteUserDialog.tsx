import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Copy, Loader2 } from 'lucide-react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { SelectField } from '@/components/common/SelectField'
import { TextField } from '@/components/common/TextField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useInviteUser } from '@/features/users/hooks/useUsers'
import { inviteUserSchema, ROLE_LABELS, type InviteUserValues } from '@/features/users/schemas/usersSchemas'
import type { Invitation } from '@/features/users/services/usersService'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

export function InviteUserDialog({ open, onOpenChange }: Props) {
  const [invitation, setInvitation] = useState<Invitation | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) setInvitation(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{invitation ? 'Invitación creada' : 'Invitar usuario'}</DialogTitle>
          <DialogDescription>
            {invitation
              ? `Comparte este enlace con ${invitation.email}. Sirve una sola vez y le permite elegir su contraseña.`
              : 'Crearemos su cuenta y te daremos un enlace para que defina su contraseña.'}
          </DialogDescription>
        </DialogHeader>
        {invitation ? (
          <InvitationLink invitation={invitation} onClose={() => handleOpenChange(false)} />
        ) : (
          <InviteForm onCreated={setInvitation} onCancel={() => handleOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InviteForm({ onCreated, onCancel }: { onCreated: (i: Invitation) => void; onCancel: () => void }) {
  const invite = useInviteUser()
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit, formState } = useForm<InviteUserValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { fullName: '', email: '', role: 'cashier' },
  })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null)
    try {
      onCreated(await invite.mutateAsync(v))
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo crear la invitación.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage message={serverError} /> : null}
      <TextField control={control} name="fullName" label="Nombre (opcional)" autoComplete="off" disabled={submitting} />
      <TextField control={control} name="email" label="Correo electrónico" type="email" autoComplete="off" disabled={submitting} />
      <SelectField
        control={control}
        name="role"
        label="Rol"
        disabled={submitting}
        options={[
          { value: 'cashier', label: `${ROLE_LABELS.cashier} (vende y maneja la caja)` },
          { value: 'admin', label: `${ROLE_LABELS.admin} (acceso completo)` },
        ]}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Crear invitación
        </Button>
      </DialogFooter>
    </form>
  )
}

function InvitationLink({ invitation, onClose }: { invitation: Invitation; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(invitation.actionLink)
      setCopied(true)
    } catch {
      setCopied(false) // sin permiso de portapapeles: el campo es seleccionable
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input readOnly value={invitation.actionLink} aria-label="Enlace de invitación" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Quien tenga este enlace puede entrar a la cuenta: envíaselo solo a esa persona. Si venció, invita de nuevo.
      </p>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Listo
        </Button>
      </DialogFooter>
    </div>
  )
}
