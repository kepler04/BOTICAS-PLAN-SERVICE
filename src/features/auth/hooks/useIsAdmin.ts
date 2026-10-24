import { useAuth } from '@/features/auth/hooks/useAuth'

/** La UI oculta acciones de administración al cajero; la seguridad real la imponen RLS y las RPC. */
export function useIsAdmin(): boolean {
  return useAuth().role === 'admin'
}
