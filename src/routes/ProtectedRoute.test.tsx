import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '@/features/auth/types'

// Evita crear el cliente real de Supabase (requiere variables de entorno).
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { AuthContext } = await import('@/features/auth/context/AuthContext')
const { ProtectedRoute } = await import('@/routes/ProtectedRoute')

const baseAuth: AuthContextValue = {
  session: null,
  user: null,
  membership: null,
  role: null,
  loading: false,
  membershipError: null,
  signOut: async () => {},
  refreshMembership: async () => {},
}

function renderAt(auth: AuthContextValue) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>Pantalla de login</p> },
      { element: <ProtectedRoute />, children: [{ path: '/', element: <p>Contenido privado</p> }] },
    ],
    { initialEntries: ['/'] },
  )
  render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return router
}

describe('ProtectedRoute', () => {
  it('redirige a /login sin sesión', () => {
    const router = renderAt(baseAuth)
    expect(screen.getByText('Pantalla de login')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByText('Contenido privado')).not.toBeInTheDocument()
  })

  it('muestra el contenido con sesión y membresía', () => {
    renderAt({
      ...baseAuth,
      session: {} as AuthContextValue['session'],
      membership: { pharmacy_id: 'p1', pharmacy_name: 'Botica', role: 'admin' },
      role: 'admin',
    })
    expect(screen.getByText('Contenido privado')).toBeInTheDocument()
  })

  it('con sesión pero sin membresía pide registrar la botica', () => {
    renderAt({ ...baseAuth, session: {} as AuthContextValue['session'] })
    expect(screen.getByText('Registra tu botica')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Registrar mi botica/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cerrar sesión/ })).toBeInTheDocument()
    expect(screen.queryByText('Contenido privado')).not.toBeInTheDocument()
  })
})
