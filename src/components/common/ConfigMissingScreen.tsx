import { Settings2 } from 'lucide-react'

/** Se muestra cuando faltan variables de entorno, en lugar de una pantalla en blanco. */
export function ConfigMissingScreen({ issues }: { issues: string[] }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-center gap-2">
          <Settings2 className="size-5 text-amber-600" aria-hidden="true" />
          <h1 className="text-xl font-semibold">Configuración incompleta</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          La aplicación no puede conectarse a Supabase porque faltan variables de entorno.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>
            Copia el archivo <code className="rounded bg-muted px-1">.env.example</code> como{' '}
            <code className="rounded bg-muted px-1">.env.local</code>.
          </li>
          <li>
            Completa <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> y{' '}
            <code className="rounded bg-muted px-1">VITE_SUPABASE_ANON_KEY</code> con los valores de
            Supabase Dashboard → Project Settings → API.
          </li>
          <li>Reinicia el servidor de desarrollo (<code className="rounded bg-muted px-1">npm run dev</code>).</li>
        </ol>
        {issues.length > 0 ? (
          <ul className="list-disc space-y-1 rounded-md bg-muted p-3 pl-7 text-xs text-muted-foreground">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  )
}
