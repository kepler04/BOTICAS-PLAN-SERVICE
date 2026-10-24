import { SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { PATHS } from '@/routes/paths'

export function NotFoundPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">404 · Página no encontrada</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        La dirección que buscas no existe o fue movida.
      </p>
      <Link to={PATHS.home} className={buttonVariants()}>
        Ir al inicio
      </Link>
    </main>
  )
}
