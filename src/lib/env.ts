import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url({ error: 'VITE_SUPABASE_URL debe ser una URL válida' }),
  VITE_SUPABASE_ANON_KEY: z
    .string({ error: 'Falta VITE_SUPABASE_ANON_KEY' })
    .trim()
    .min(1, 'Falta VITE_SUPABASE_ANON_KEY'),
})

export type Env = z.infer<typeof envSchema>

export type EnvResult = { ok: true; env: Env } | { ok: false; issues: string[] }

/** Valida las variables de entorno públicas. Pura: facilita las pruebas. */
export function parseEnv(raw: Record<string, unknown>): EnvResult {
  const result = envSchema.safeParse(raw)
  if (result.success) return { ok: true, env: result.data }
  return { ok: false, issues: result.error.issues.map((i) => i.message) }
}

export const envResult: EnvResult = parseEnv(import.meta.env)

/** Devuelve el entorno validado o lanza si falta configuración. */
export function getEnv(): Env {
  if (!envResult.ok) {
    throw new Error(`Configuración incompleta: ${envResult.issues.join('; ')}`)
  }
  return envResult.env
}
