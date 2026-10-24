import { createBrowserRouter, type RouteObject } from 'react-router'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { PATHS } from '@/routes/paths'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { PublicOnlyRoute } from '@/routes/PublicOnlyRoute'
import { RoleGuard } from '@/routes/RoleGuard'

const lazyPage = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) => ({
  lazy: async () => ({ Component: (await load())[name] }),
})

const routes: RouteObject[] = [
  {
    hydrateFallbackElement: <LoadingScreen />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [
          {
            path: PATHS.login,
            ...lazyPage(() => import('@/features/auth/pages/LoginPage'), 'LoginPage'),
          },
          {
            path: PATHS.register,
            ...lazyPage(() => import('@/features/auth/pages/RegisterPage'), 'RegisterPage'),
          },
          {
            path: PATHS.forgotPassword,
            ...lazyPage(() => import('@/features/auth/pages/ForgotPasswordPage'), 'ForgotPasswordPage'),
          },
        ],
      },
      {
        // El enlace de recuperación crea una sesión: no debe redirigirse a "/".
        path: PATHS.resetPassword,
        ...lazyPage(() => import('@/features/auth/pages/ResetPasswordPage'), 'ResetPasswordPage'),
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                path: PATHS.home,
                ...lazyPage(() => import('@/features/dashboard/pages/DashboardPage'), 'DashboardPage'),
              },
              {
                path: PATHS.sales,
                ...lazyPage(() => import('@/features/sales/pages/SalesPage'), 'SalesPage'),
              },
              {
                path: PATHS.products,
                ...lazyPage(() => import('@/features/products/pages/ProductsPage'), 'ProductsPage'),
              },
              {
                path: PATHS.inventory,
                ...lazyPage(() => import('@/features/inventory/pages/InventoryPage'), 'InventoryPage'),
              },
              {
                path: PATHS.cash,
                ...lazyPage(() => import('@/features/cash/pages/CashPage'), 'CashPage'),
              },
              {
                path: PATHS.temperature,
                ...lazyPage(() => import('@/features/sanitary/pages/TemperaturePage'), 'TemperaturePage'),
              },
              {
                element: <RoleGuard roles={['admin']} />,
                children: [
                  {
                    path: PATHS.reports,
                    ...lazyPage(() => import('@/features/reports/pages/ReportsPage'), 'ReportsPage'),
                  },
                  {
                    path: PATHS.users,
                    ...lazyPage(() => import('@/features/users/pages/UsersPage'), 'UsersPage'),
                  },
                  {
                    path: PATHS.purchases,
                    ...lazyPage(() => import('@/features/purchases/pages/PurchasesPage'), 'PurchasesPage'),
                  },
                  {
                    path: PATHS.settings,
                    ...lazyPage(() => import('@/features/settings/pages/SettingsPage'), 'SettingsPage'),
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const createAppRouter = () => createBrowserRouter(routes)
export { routes }
