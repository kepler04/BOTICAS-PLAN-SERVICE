import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { ROLE_LABELS } from '@/components/layout/navItems'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/hooks/useAuth'

function initials(email: string | undefined): string {
  return (email ?? '?').slice(0, 2).toUpperCase()
}

export function Topbar() {
  const { membership, role, user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar sesión.')
      setSigningOut(false)
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{membership?.pharmacy_name}</span>
        {role ? <Badge variant="secondary">{ROLE_LABELS[role]}</Badge> : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Menú de usuario"
          className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Avatar>
            <AvatarFallback className="text-foreground">{initials(user?.email)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} disabled={signingOut}>
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
