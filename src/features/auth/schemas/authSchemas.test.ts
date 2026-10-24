import { describe, expect, it } from 'vitest'
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '@/features/auth/schemas/authSchemas'

describe('loginSchema', () => {
  it('acepta credenciales válidas', () => {
    expect(loginSchema.safeParse({ email: 'a@b.pe', password: 'x' }).success).toBe(true)
  })

  it('rechaza correo vacío o inválido', () => {
    const empty = loginSchema.safeParse({ email: '', password: 'x' })
    expect(empty.success).toBe(false)
    expect(loginSchema.safeParse({ email: 'no-correo', password: 'x' }).success).toBe(false)
  })

  it('rechaza contraseña vacía con mensaje en español', () => {
    const result = loginSchema.safeParse({ email: 'a@b.pe', password: '' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Ingresa tu contraseña')
  })
})

describe('forgotPasswordSchema', () => {
  it('valida el correo', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.pe' }).success).toBe(true)
    expect(forgotPasswordSchema.safeParse({ email: 'x' }).success).toBe(false)
  })
})

describe('resetPasswordSchema', () => {
  it('exige 8 caracteres y coincidencia', () => {
    expect(resetPasswordSchema.safeParse({ password: '1234567', confirmPassword: '1234567' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ password: '12345678', confirmPassword: '12345679' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ password: '12345678', confirmPassword: '12345678' }).success).toBe(true)
  })
})
