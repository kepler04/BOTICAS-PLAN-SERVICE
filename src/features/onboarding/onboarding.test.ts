import { describe, expect, it, vi } from 'vitest'
import { registerSchema } from '@/features/auth/schemas/authSchemas'
import { translateAuthError } from '@/features/auth/services/authErrors'
import { registerPharmacySchema } from '@/features/onboarding/schemas/pharmacySchemas'

// Evita crear el cliente real de Supabase (requiere variables de entorno).
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
const { translatePharmacyError } = await import('@/features/onboarding/services/pharmacyService')

describe('registerSchema', () => {
  const valid = { fullName: 'María Pérez', email: 'maria@botica.pe', password: '12345678', confirmPassword: '12345678' }

  it('acepta datos válidos', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true)
  })

  it('rechaza contraseñas cortas y que no coinciden', () => {
    expect(registerSchema.safeParse({ ...valid, password: '123', confirmPassword: '123' }).success).toBe(false)
    const mismatch = registerSchema.safeParse({ ...valid, confirmPassword: 'otra-cosa' })
    expect(mismatch.success).toBe(false)
    if (!mismatch.success) expect(mismatch.error.issues[0]?.message).toBe('Las contraseñas no coinciden')
  })

  it('rechaza nombre vacío y correo inválido', () => {
    expect(registerSchema.safeParse({ ...valid, fullName: ' ' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, email: 'no-es-correo' }).success).toBe(false)
  })
})

describe('registerPharmacySchema', () => {
  it('el RUC y el nombre comercial son opcionales', () => {
    expect(registerPharmacySchema.safeParse({ legalName: 'Botica Uno', tradeName: '', ruc: '' }).success).toBe(true)
  })

  it('acepta un RUC de 11 dígitos que empieza con 10 o 20', () => {
    expect(registerPharmacySchema.safeParse({ legalName: 'Botica', tradeName: '', ruc: '20123456789' }).success).toBe(true)
    expect(registerPharmacySchema.safeParse({ legalName: 'Botica', tradeName: '', ruc: '10123456789' }).success).toBe(true)
  })

  it('rechaza RUC mal formado', () => {
    for (const ruc of ['123', '30123456789', '2012345678a']) {
      expect(registerPharmacySchema.safeParse({ legalName: 'Botica', tradeName: '', ruc }).success).toBe(false)
    }
  })

  it('exige un nombre de al menos 2 caracteres', () => {
    expect(registerPharmacySchema.safeParse({ legalName: 'X', tradeName: '', ruc: '' }).success).toBe(false)
  })
})

describe('traducción de errores de registro', () => {
  it('cuenta ya existente y registro deshabilitado', () => {
    expect(translateAuthError({ code: 'user_already_exists', message: 'User already registered' })).toMatch(/Ya existe una cuenta/)
    expect(translateAuthError({ code: 'signup_disabled' })).toMatch(/deshabilitado/)
  })

  it('errores de la función register_pharmacy', () => {
    expect(translatePharmacyError({ message: 'ruc_taken' })).toMatch(/ya está registrado/)
    expect(translatePharmacyError({ message: 'already_has_pharmacy' })).toMatch(/ya tiene una botica/)
    expect(translatePharmacyError({ message: 'algo raro' })).toMatch(/No se pudo registrar/)
  })
})
