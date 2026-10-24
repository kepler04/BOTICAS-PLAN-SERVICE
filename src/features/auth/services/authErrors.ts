type AuthErrorLike = {
  message?: string
  code?: string
  status?: number
  name?: string
}

export const EMAIL_TAKEN_MESSAGE = 'Ya existe una cuenta con este correo. Inicia sesión.'

const GENERIC_MESSAGE = 'Ocurrió un error inesperado. Inténtalo nuevamente.'

/** Traduce errores de Supabase Auth a mensajes en español para el usuario. */
export function translateAuthError(error: unknown): string {
  if (!error || typeof error !== 'object') return GENERIC_MESSAGE
  const { message = '', code = '', status, name = '' } = error as AuthErrorLike
  const text = message.toLowerCase()

  if (code === 'invalid_credentials' || text.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    text.includes('already registered') ||
    text.includes('already been registered')
  ) {
    return EMAIL_TAKEN_MESSAGE
  }
  if (code === 'signup_disabled' || text.includes('signups not allowed')) {
    return 'El registro de cuentas está deshabilitado por el momento.'
  }
  if (code === 'validation_failed' || code === 'email_address_invalid') {
    return 'Ingresa un correo electrónico válido.'
  }
  if (code === 'email_not_confirmed' || text.includes('email not confirmed')) {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.'
  }
  if (
    status === 429 ||
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    text.includes('rate limit') ||
    text.includes('too many requests')
  ) {
    return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
  }
  if (
    name === 'AuthRetryableFetchError' ||
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('load failed')
  ) {
    return 'No pudimos conectar con el servidor. Revisa tu conexión a internet.'
  }
  if (code === 'same_password' || text.includes('different from the old password')) {
    return 'La nueva contraseña debe ser distinta de la anterior.'
  }
  if (code === 'weak_password' || text.includes('password should be')) {
    return 'La contraseña es demasiado débil. Usa al menos 8 caracteres.'
  }
  if (code === 'session_not_found' || text.includes('auth session missing')) {
    return 'Tu sesión expiró. Solicita un nuevo enlace de recuperación.'
  }
  return GENERIC_MESSAGE
}
