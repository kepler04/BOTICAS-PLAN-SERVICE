import { describe, expect, it } from 'vitest'
import { sanitizeSearchTerm } from '@/lib/search'

describe('sanitizeSearchTerm', () => {
  it('deja intacto un texto normal', () => {
    expect(sanitizeSearchTerm('  paracetamol 500 ')).toBe('paracetamol 500')
  })

  it('elimina caracteres que rompen filtros de PostgREST', () => {
    expect(sanitizeSearchTerm('a,name.eq.x),or(b')).toBe('a name eq x or b')
    expect(sanitizeSearchTerm('100%_*')).toBe('100')
  })

  it('limita el largo', () => {
    expect(sanitizeSearchTerm('x'.repeat(200))).toHaveLength(80)
  })
})
