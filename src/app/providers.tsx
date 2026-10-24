import { useEffect, useState, type ReactNode } from 'react'
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient } from '@/app/queryClient'
import { AuthProvider } from '@/features/auth/context/AuthProvider'
import { useAuth } from '@/features/auth/hooks/useAuth'

/** Al cerrar sesión se vacía la caché: otra persona en el mismo navegador no ve datos de la anterior. */
function ClearCacheOnSignOut() {
  const { session, loading } = useAuth()
  const queryClient = useQueryClient()
  const signedIn = Boolean(session)
  useEffect(() => {
    if (!loading && !signedIn) queryClient.clear()
  }, [loading, signedIn, queryClient])
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClearCacheOnSignOut />
        <TooltipProvider>
          {children}
          <Toaster richColors position="top-center" />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
