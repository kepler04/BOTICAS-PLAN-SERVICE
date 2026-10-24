import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '@/features/auth/types'
import type { AppRole } from '@/types/app'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { AuthContext } = await import('@/features/auth/context/AuthContext')
const { AppLayout } = await import('@/components/layout/AppLayout')
const { TooltipProvider } = await import('@/components/ui/tooltip')

function renderLayout(role: AppRole) {
  const auth: AuthContextValue = {
    session: {} as AuthContextValue['session'],
    user: { id: 'u1', email: 'demo@botica.pe' } as AuthContextValue['user'],
    membership: { pharmacy_id: 'p1', pharmacy_name: 'Botica Demo', role },
    role,
    loading: false,
    membershipError: null,
    signOut: async () => {},
    refreshMembership: async () => {},
  }
  const router = createMemoryRouter(
    [{ element: <AppLayout />, children: [{ path: '/', element: <p>Inicio</p> }] }],
    { initialEntries: ['/'] },
  )
  render(
    <AuthContext.Provider value={auth}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </AuthContext.Provider>,
  )
}

describe('AppLayout', () => {
  it('admin ve Reportes y Usuarios; muestra botica y rol', () => {
    renderLayout('admin')
    const sidebar = screen.getAllByRole('navigation', { name: 'Navegación principal' })[0]!
    expect(within(sidebar).getByText('Reportes')).toBeInTheDocument()
    expect(within(sidebar).getByText('Usuarios')).toBeInTheDocument()
    expect(screen.getByText('Botica Demo')).toBeInTheDocument()
    expect(screen.getByText('Administrador')).toBeInTheDocument()
  })

  it('cajero no ve Reportes ni Usuarios', () => {
    renderLayout('cashier')
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument()
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
    expect(screen.getAllByText('Caja').length).toBeGreaterThan(0)
  })
})
