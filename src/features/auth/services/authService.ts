import { supabase } from '@/lib/supabase'
import { PATHS } from '@/routes/paths'
import type { Membership } from '@/features/auth/types'
import { EMAIL_TAKEN_MESSAGE, translateAuthError } from './authErrors'

/** Error de servicio con mensaje ya traducido al español. */
export class AuthServiceError extends Error {}

function fail(error: unknown): never {
  throw new AuthServiceError(translateAuthError(error))
}

/** Único lugar del frontend que llama a supabase.auth. */
export const authService = {
  async signIn(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) fail(error)
  },

  /**
   * Crea la cuenta. Devuelve 'signed-in' si el proyecto no exige confirmar el correo
   * (ya hay sesión) o 'confirm-email' si hay que abrir el enlace enviado al correo.
   */
  async signUp(
    fullName: string,
    email: string,
    password: string,
  ): Promise<'signed-in' | 'confirm-email'> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}${PATHS.login}`,
      },
    })
    if (error) fail(error)
    // Con confirmación de correo activa, Supabase no devuelve error si el correo ya existe:
    // responde un usuario sin identidades.
    if (data.user && data.user.identities?.length === 0) {
      throw new AuthServiceError(EMAIL_TAKEN_MESSAGE)
    }
    return data.session ? 'signed-in' : 'confirm-email'
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) fail(error)
  },

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${PATHS.resetPassword}`,
    })
    if (error) fail(error)
  },

  async updatePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) fail(error)
  },

  async getMemberships(): Promise<Membership[]> {
    const { data, error } = await supabase.rpc('get_my_memberships')
    if (error) fail(error)
    return data ?? []
  },
}
