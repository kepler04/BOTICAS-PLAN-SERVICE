import { describe, expect, it } from 'vitest'
import { translateAuthError } from '@/features/auth/services/authErrors'

describe('translateAuthError', () => {
  it('credenciales inválidas', () => {
    expect(translateAuthError({ message: 'Invalid login credentials', code: 'invalid_credentials' })).toBe(
      'Correo o contraseña incorrectos.',
    )
  })

  it('correo no confirmado', () => {
    expect(translateAuthError({ message: 'Email not confirmed' })).toMatch(/no está confirmado/)
  })

  it('demasiados intentos', () => {
    expect(translateAuthError({ status: 429, message: 'x' })).toMatch(/Demasiados intentos/)
    expect(translateAuthError({ code: 'over_request_rate_limit' })).toMatch(/Demasiados intentos/)
  })

  it('error de red', () => {
    expect(translateAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toMatch(
      /conexión/,
    )
  })

  it('error desconocido usa mensaje genérico', () => {
    expect(translateAuthError({ message: 'algo raro' })).toMatch(/inesperado/)
    expect(translateAuthError(null)).toMatch(/inesperado/)
  })
})
