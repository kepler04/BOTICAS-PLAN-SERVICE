import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { authService } from '@/features/auth/services/authService'
import type { AuthContextValue, Membership } from '@/features/auth/types'

type MembershipState = {
  userId: string | null
  membership: Membership | null
  error: string | null
}

const EMPTY_MEMBERSHIP: MembershipState = { userId: null, membership: null, error: null }

/** Nunca lanza: un fallo se devuelve como `error` para que la UI lo muestre. */
async function fetchMembershipState(userId: string): Promise<MembershipState> {
  try {
    const list = await authService.getMemberships()
    return { userId, membership: list[0] ?? null, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'No se pudo cargar tu botica.'
    return { userId, membership: null, error: message }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [membershipState, setMembershipState] = useState<MembershipState>(EMPTY_MEMBERSHIP)

  // Escucha cambios de sesión. INITIAL_SESSION se emite al suscribirse.
  // No se hacen llamadas a Supabase dentro del callback (riesgo de bloqueo).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setSessionLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  // Carga la membresía activa cuando cambia el usuario.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchMembershipState(userId).then((next) => {
      if (!cancelled) setMembershipState(next)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const refreshMembership = useCallback(async () => {
    if (!userId) return
    setMembershipState(await fetchMembershipState(userId))
  }, [userId])

  const signOut = useCallback(async () => {
    await authService.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const resolved = membershipState.userId === userId
    const membership = userId && resolved ? membershipState.membership : null
    return {
      session,
      user: session?.user ?? null,
      membership,
      role: membership?.role ?? null,
      loading: sessionLoading || (userId !== null && !resolved),
      membershipError: userId && resolved ? membershipState.error : null,
      signOut,
      refreshMembership,
    }
  }, [session, sessionLoading, userId, membershipState, signOut, refreshMembership])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
