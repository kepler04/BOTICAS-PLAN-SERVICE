import { useState } from 'react'
import { LogOut, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/hooks/useAuth'

type AccountStatusScreenProps = {
  title: string
  message: string
}

/** Pantalla para sesiones válidas sin acceso utilizable (sin membresía o error al cargarla). */
export function AccountStatusScreen({ title, message }: AccountStatusScreenProps) {
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOut()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar sesión.')
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
        <UserX className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button onClick={handleSignOut} disabled={busy} variant="outline" className="w-full">
          <LogOut aria-hidden="true" />
          Cerrar sesión
        </Button>
      </div>
    </main>
  )
}
