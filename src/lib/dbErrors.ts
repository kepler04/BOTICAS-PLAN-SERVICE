type DbErrorLike = { message?: string; code?: string; details?: string | null }

/**
 * Traduce errores de PostgREST/Postgres a mensajes en español.
 * `known` mapea el mensaje de nuestras RPC (p. ej. "insufficient_stock") a texto para el usuario.
 */
export function translateDbError(
  error: unknown,
  known: Record<string, string> = {},
  fallback = 'No se pudo completar la operación. Inténtalo nuevamente.',
): string {
  if (!error || typeof error !== 'object') return fallback
  const { message = '', code = '', details = '' } = error as DbErrorLike
  const text = `${message} ${details ?? ''}`

  for (const key of Object.keys(known)) {
    if (text.includes(key)) return known[key]!
  }
  if (code === '42501' || /permission denied|row-level security/i.test(text)) {
    return 'No tienes permiso para hacer esto.'
  }
  if (code === '23505') return 'Ya existe un registro con esos datos.'
  if (code === '23503') return 'El dato relacionado ya no existe. Actualiza la página e inténtalo otra vez.'
  if (code === '23514') return 'Algún valor no es válido. Revisa el formulario.'
  if (/failed to fetch|network|load failed/i.test(text)) {
    return 'No pudimos conectar con el servidor. Revisa tu conexión a internet.'
  }
  return fallback
}
