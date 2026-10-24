import type { Session, User } from '@supabase/supabase-js'
import type { AppRole } from '@/types/app'

export type Membership = {
  pharmacy_id: string
  pharmacy_name: string
  role: AppRole
}

export type AuthContextValue = {
  session: Session | null
  user: User | null
  /** Membresía activa (la primera activa devuelta por get_my_memberships). */
  membership: Membership | null
  role: AppRole | null
  loading: boolean
  /** Error al cargar las membresías (distinto de "no tiene ninguna"). */
  membershipError: string | null
  signOut: () => Promise<void>
  /** Vuelve a consultar la membresía (p. ej. tras registrar la botica). */
  refreshMembership: () => Promise<void>
}
