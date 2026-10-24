import { Pill } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { navItemsForRole } from '@/components/layout/navItems'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { PATHS } from '@/routes/paths'

/** Barra lateral fija, solo en escritorio (≥ lg). */
export function Sidebar() {
  const { role } = useAuth()
  const items = navItemsForRole(role)

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Pill className="size-4" aria-hidden="true" />
        </span>
        Boticas ERP
      </div>
      <nav aria-label="Navegación principal" className="flex-1 space-y-1 p-3">
        {items.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === PATHS.home}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
