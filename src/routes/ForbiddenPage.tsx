import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { PATHS } from '@/routes/paths'

export function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">403 · Sin permiso</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        No tienes permiso para ver esta sección. Si crees que es un error, contacta al administrador.
      </p>
      <Link to={PATHS.home} className={buttonVariants({ variant: 'outline' })}>
        Volver al inicio
      </Link>
    </div>
  )
}
