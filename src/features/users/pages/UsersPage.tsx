import { useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { NativeSelect } from '@/components/common/NativeSelect'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { InviteUserDialog } from '@/features/users/components/InviteUserDialog'
import { useMembers, useUpdateMember } from '@/features/users/hooks/useUsers'
import { ROLE_LABELS } from '@/features/users/schemas/usersSchemas'
import type { Member } from '@/features/users/services/usersService'
import type { AppRole } from '@/types/app'

export function UsersPage() {
  const { user } = useAuth()
  const members = useMembers()
  const update = useUpdateMember()
  const [inviteOpen, setInviteOpen] = useState(false)

  async function change(member: Member, patch: { role?: AppRole; active?: boolean }, done: string) {
    try {
      await update.mutateAsync({ memberId: member.id, ...patch })
      toast.success(done)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo actualizar al usuario.')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuarios"
        description="Quién puede entrar a tu botica y con qué rol."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden="true" />
            Invitar usuario
          </Button>
        }
      />

      {members.isError ? <ErrorMessage message={members.error.message} /> : null}
      {members.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : null}
      {members.isSuccess && members.data.length === 0 ? (
        <EmptyState icon={Users} title="Aún no hay usuarios" description="Invita a tu primer cajero con el botón “Invitar usuario”." />
      ) : null}

      {members.isSuccess && members.data.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((m) => {
                const isMe = m.userId === user?.id
                const label = m.fullName || m.email || 'Usuario'
                return (
                  <TableRow key={m.id} className={m.active ? undefined : 'opacity-60'}>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">
                        {label} {isMe ? <Badge variant="outline">Tú</Badge> : null}
                      </div>
                      {m.fullName && m.email ? <div className="text-xs text-muted-foreground">{m.email}</div> : null}
                    </TableCell>
                    <TableCell>
                      {isMe ? (
                        ROLE_LABELS[m.role]
                      ) : (
                        <NativeSelect
                          className="w-36"
                          value={m.role}
                          aria-label={`Rol de ${label}`}
                          disabled={update.isPending}
                          onChange={(e) => {
                            const role = e.target.value as AppRole
                            void change(m, { role }, `${label} ahora es ${ROLE_LABELS[role].toLowerCase()}.`)
                          }}
                        >
                          <option value="cashier">{ROLE_LABELS.cashier}</option>
                          <option value="admin">{ROLE_LABELS.admin}</option>
                        </NativeSelect>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isMe ? (
                        <Badge variant="secondary">Activo</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant={m.active ? 'outline' : 'default'}
                          disabled={update.isPending}
                          onClick={() => change(m, { active: !m.active }, m.active ? `${label} fue desactivado.` : `${label} fue activado.`)}
                          aria-label={`${m.active ? 'Desactivar' : 'Activar'} a ${label}`}
                        >
                          {m.active ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Un usuario desactivado ya no puede entrar ni vender, pero su historial se conserva. La botica siempre debe tener al menos un administrador activo.
      </p>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
