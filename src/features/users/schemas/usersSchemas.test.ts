import { describe, expect, it } from 'vitest'
import { inviteUserSchema } from '@/features/users/schemas/usersSchemas'

describe('inviteUserSchema', () => {
  it('acepta un correo válido, recorta espacios y permite nombre vacío', () => {
    const r = inviteUserSchema.parse({ fullName: '  ', email: '  cajero@botica.pe ', role: 'cashier' })
    expect(r).toEqual({ fullName: '', email: 'cajero@botica.pe', role: 'cashier' })
  })

  it('rechaza correo vacío o mal formado', () => {
    expect(inviteUserSchema.safeParse({ fullName: '', email: '', role: 'cashier' }).success).toBe(false)
    expect(inviteUserSchema.safeParse({ fullName: '', email: 'no-es-correo', role: 'cashier' }).success).toBe(false)
  })

  it('solo admite los roles cajero y administrador', () => {
    expect(inviteUserSchema.safeParse({ fullName: '', email: 'a@b.pe', role: 'owner' }).success).toBe(false)
    expect(inviteUserSchema.safeParse({ fullName: '', email: 'a@b.pe', role: 'admin' }).success).toBe(true)
  })

  it('limita el nombre a 120 caracteres', () => {
    expect(inviteUserSchema.safeParse({ fullName: 'x'.repeat(121), email: 'a@b.pe', role: 'cashier' }).success).toBe(false)
  })
})
