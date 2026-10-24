import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  Thermometer,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { PATHS } from '@/routes/paths'
import type { AppRole } from '@/types/app'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
  /** Si se omite, visible para todos los roles. */
  roles?: AppRole[]
  /** Aparece en la barra inferior móvil (los 4 principales). */
  primary?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: PATHS.home, icon: LayoutDashboard, primary: true },
  { label: 'Ventas', to: PATHS.sales, icon: ReceiptText, primary: true },
  { label: 'Productos', to: PATHS.products, icon: Package, primary: true },
  { label: 'Inventario', to: PATHS.inventory, icon: Boxes, primary: true },
  { label: 'Caja', to: PATHS.cash, icon: Wallet },
  { label: 'Temperatura', to: PATHS.temperature, icon: Thermometer },
  { label: 'Compras', to: PATHS.purchases, icon: Truck, roles: ['admin'] },
  { label: 'Reportes', to: PATHS.reports, icon: BarChart3, roles: ['admin'] },
  { label: 'Usuarios', to: PATHS.users, icon: Users, roles: ['admin'] },
  { label: 'Configuración', to: PATHS.settings, icon: Settings, roles: ['admin'] },
]

export function navItemsForRole(role: AppRole | null): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || (role !== null && item.roles.includes(role)))
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  cashier: 'Cajero',
}
