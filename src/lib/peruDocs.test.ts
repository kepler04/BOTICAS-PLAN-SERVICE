import { describe, expect, it } from 'vitest'
import { isValidCustomerDoc, isValidRuc, normalizeDocNumber } from '@/lib/peruDocs'

// Mismos vectores que supabase/tests/phase6.test.sql.
describe('isValidRuc', () => {
  it('acepta RUC con dígito verificador correcto (empresa y persona natural)', () => {
    expect(isValidRuc('20131312955')).toBe(true)
    expect(isValidRuc('10467793549')).toBe(true)
  })

  it('rechaza dígito verificador incorrecto, prefijo inválido o largo distinto de 11', () => {
    expect(isValidRuc('20131312954')).toBe(false)
    expect(isValidRuc('30131312955')).toBe(false)
    expect(isValidRuc('2013131295')).toBe(false)
    expect(isValidRuc('201313129550')).toBe(false)
  })

  it('para cualquier base de 10 dígitos, exactamente UN dígito final es válido', () => {
    for (const base of ['2060000000', '1012345678', '2010000000', '1099999999']) {
      const valid = Array.from({ length: 10 }, (_, d) => base + d).filter(isValidRuc)
      expect(valid).toHaveLength(1)
    }
  })
})

describe('isValidCustomerDoc', () => {
  it('DNI: exactamente 8 dígitos', () => {
    expect(isValidCustomerDoc('dni', '12345678')).toBe(true)
    expect(isValidCustomerDoc('dni', ' 12345678 ')).toBe(true)
    expect(isValidCustomerDoc('dni', '1234567')).toBe(false)
    expect(isValidCustomerDoc('dni', '1234567a')).toBe(false)
  })

  it('carné de extranjería y pasaporte: letras y números (se normalizan a mayúsculas)', () => {
    expect(isValidCustomerDoc('ce', 'abc12345')).toBe(true)
    expect(isValidCustomerDoc('ce', 'ab-1')).toBe(false)
    expect(isValidCustomerDoc('passport', 'X12345')).toBe(true)
    expect(isValidCustomerDoc('passport', 'X1234')).toBe(false)
  })

  it('normaliza como la base de datos', () => {
    expect(normalizeDocNumber('  abc123 ')).toBe('ABC123')
  })
})
