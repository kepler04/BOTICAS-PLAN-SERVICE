import { describe, expect, it } from 'vitest'
import { parseEnv } from '@/lib/env'

describe('parseEnv', () => {
  it('acepta URL y clave válidas', () => {
    const result = parseEnv({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    })
    expect(result.ok).toBe(true)
  })

  it('falla si faltan las variables', () => {
    const result = parseEnv({})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.length).toBeGreaterThanOrEqual(2)
  })

  it('falla si la URL no es válida o la clave está vacía', () => {
    const result = parseEnv({ VITE_SUPABASE_URL: 'no-es-url', VITE_SUPABASE_ANON_KEY: '   ' })
    expect(result.ok).toBe(false)
  })
})
