import { useState } from 'react'
import { Menu } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { navItemsForRole } from '@/components/layout/navItems'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { PATHS } from '@/routes/paths'

const itemClass = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium'

/** Barra inferior para celular/tablet (< lg): 4 principales + menú "Más". */
export function MobileNav() {
  const { role } = useAuth()
  const [open, setOpen] = useState(false)
  const items = navItemsForRole(role)
  const primary = items.filter((i) => i.primary)
  const secondary = items.filter((i) => !i.primary)

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {primary.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === PATHS.home}
            className={({ isActive }) =>
              cn(itemClass, isActive ? 'text-primary' : 'text-muted-foreground')
            }
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
        {secondary.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(itemClass, 'text-muted-foreground')}
          >
            <Menu className="size-5" aria-hidden="true" />
            Más
          </button>
        ) : null}
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Más opciones</SheetTitle>
            <SheetDescription>Otras secciones del sistema</SheetDescription>
          </SheetHeader>
          <div className="grid gap-1 px-4 pb-6">
            {secondary.map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-muted"
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
