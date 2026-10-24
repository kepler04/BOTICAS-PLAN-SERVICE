import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import type { InviteUserValues } from '@/features/users/schemas/usersSchemas'
import type { AppRole } from '@/types/app'

export class UsersServiceError extends Error {}

const KNOWN: Record<string, string> = {
  last_admin: 'La botica debe conservar al menos un administrador activo.',
}

const INVITE_ERRORS: Record<string, string> = {
  email_exists: 'Ya existe una cuenta con ese correo. Pide a esa persona que use otro correo.',
  forbidden: 'Solo un administrador de esta botica puede invitar usuarios.',
  unauthorized: 'Tu sesión venció. Vuelve a iniciar sesión.',
  invalid_email: 'El correo electrónico no es válido.',
  invalid_role: 'El rol no es válido.',
}

function fail(error: unknown, fallback: string): never {
  throw new UsersServiceError(translateDbError(error, KNOWN, fallback))
}

export type Member = {
  id: string
  userId: string
  role: AppRole
  active: boolean
  fullName: string | null
  email: string | null
}

export type Invitation = { email: string; actionLink: string }

export const usersService = {
  async listMembers(pharmacyId: string): Promise<Member[]> {
    const { data, error } = await supabase
      .from('pharmacy_members')
      .select('id, user_id, role, active, created_at, profiles(full_name, email)')
      .eq('pharmacy_id', pharmacyId)
      .order('created_at')
    if (error) fail(error, 'No se pudo cargar el equipo.')
    return data.map((m) => ({
      id: m.id,
      userId: m.user_id,
      role: m.role,
      active: m.active,
      fullName: m.profiles?.full_name ?? null,
      email: m.profiles?.email ?? null,
    }))
  },

  async updateMember(memberId: string, patch: { role?: AppRole; active?: boolean }): Promise<void> {
    const { data, error } = await supabase.from('pharmacy_members').update(patch).eq('id', memberId).select('id')
    if (error) fail(error, 'No se pudo actualizar al usuario.')
    // RLS no lanza error: si no eres admin, o es tu propia fila, simplemente no cambia nada.
    if (!data || data.length === 0) throw new UsersServiceError('No puedes modificar a este usuario.')
  },

  async invite(pharmacyId: string, v: InviteUserValues): Promise<Invitation> {
    const { data, error } = await supabase.functions.invoke<{ action_link: string; email: string }>('invite-user', {
      body: { pharmacy_id: pharmacyId, email: v.email, full_name: v.fullName, role: v.role, redirect_to: window.location.origin },
    })
    if (error) {
      let code = ''
      if (error instanceof FunctionsHttpError) {
        code = ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error ?? ''
      }
      throw new UsersServiceError(
        INVITE_ERRORS[code] ??
          (code
            ? 'No se pudo crear la invitación. Inténtalo nuevamente.'
            : 'No pudimos conectar con el servidor. Revisa tu conexión a internet.'),
      )
    }
    if (!data?.action_link) throw new UsersServiceError('No se pudo crear la invitación. Inténtalo nuevamente.')
    return { email: data.email, actionLink: data.action_link }
  },
}
