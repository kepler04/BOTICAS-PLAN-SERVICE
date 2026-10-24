import { RouterProvider } from 'react-router/dom'
import { createAppRouter } from '@/app/router'
import { Providers } from '@/app/providers'

const router = createAppRouter()

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
