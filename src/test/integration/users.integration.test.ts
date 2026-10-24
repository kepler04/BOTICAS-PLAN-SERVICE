/**
 * Gestión de usuarios contra Supabase local: la Edge Function `invite-user`, las reglas RLS sobre los miembros
 * y la regla "nunca sin administrador" (incluida la carrera de dos administradores que se quitan el rol a la vez).
 * Ejecutar con:  npm run test:integration   (requiere `npx supabase start`, con edge-runtime).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const holder = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const client = holder.current as Record<string | symbol, unknown>
        const value = client[prop]
        return typeof value === 'function' ? value.bind(client) : value
      },
    },
  ),
}))

import { usersService } from '@/features/users/services/usersService'

const URL = import.meta.env.VITE_IT_URL as string | undefined
const ANON = import.meta.env.VITE_IT_ANON_KEY as string | undefined
const SERVICE = import.meta.env.VITE_IT_SERVICE_KEY as string | undefined
const enabled = Boolean(URL && ANON && SERVICE)

const run = Math.random().toString(36).slice(2, 8)
const PASSWORD = 'clave-segura-123'
const client = (key: string): SupabaseClient =>
  createClient(URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })

describe.skipIf(!enabled)('gestión de usuarios (Supabase local + Edge Function)', () => {
  let admin: SupabaseClient
  let service: SupabaseClient
  let pharmacyId = ''
  let otherPharmacyId = ''
  let other: SupabaseClient
  const cashierEmail = `it-cajero-${run}@test.local`

  beforeAll(async () => {
    service = client(SERVICE!)
    admin = client(ANON!)
    const a = await admin.auth.signUp({ email: `it-users-${run}@test.local`, password: PASSWORD, options: { data: { full_name: 'Admin Uno' } } })
    if (a.error || !a.data.session) throw new Error(`signUp: ${a.error?.message ?? 'sin sesión'}`)
    holder.current = admin
    const reg = await admin.rpc('register_pharmacy', { p_legal_name: `Botica Usuarios ${run}` })
    if (reg.error) throw new Error(reg.error.message)
    pharmacyId = reg.data

    other = client(ANON!)
    const b = await other.auth.signUp({ email: `it-users-otra-${run}@test.local`, password: PASSWORD })
    if (b.error || !b.data.session) throw new Error(`signUp: ${b.error?.message ?? 'sin sesión'}`)
    const reg2 = await other.rpc('register_pharmacy', { p_legal_name: `Botica Ajena ${run}` })
    if (reg2.error) throw new Error(reg2.error.message)
    otherPharmacyId = reg2.data
  })

  it('el administrador ve su equipo con correo y nombre', async () => {
    const members = await usersService.listMembers(pharmacyId)
    expect(members).toHaveLength(1)
    expect(members[0]).toMatchObject({ role: 'admin', active: true, fullName: 'Admin Uno', email: `it-users-${run}@test.local` })
  })

  let invitationLink = ''
  it('invitar a un cajero: crea la cuenta, lo agrega a la botica y devuelve un enlace', async () => {
    const inv = await usersService.invite(pharmacyId, { fullName: 'Cajero Uno', email: cashierEmail, role: 'cashier' })
    expect(inv.email).toBe(cashierEmail)
    expect(inv.actionLink).toMatch(/\/auth\/v1\/verify\?token=/)
    invitationLink = inv.actionLink

    const members = await usersService.listMembers(pharmacyId)
    expect(members).toHaveLength(2)
    expect(members.find((m) => m.email === cashierEmail)).toMatchObject({ role: 'cashier', active: true, fullName: 'Cajero Uno' })

    // La membresía la creó el administrador (no el servicio): la auditoría lo registra como actor.
    const me = (await admin.auth.getUser()).data.user!.id
    const audit = await service.from('audit_log').select('actor_id, action').eq('pharmacy_id', pharmacyId).eq('action', 'member.added')
    expect(audit.data?.some((r) => r.actor_id === me)).toBe(true)
  })

  it('el invitado abre el enlace, define su contraseña e inicia sesión como cajero', async () => {
    // El enlace redirige a la app con los tokens en el fragmento (#access_token=...).
    const res = await fetch(invitationLink, { redirect: 'manual' })
    expect(res.status).toBe(303)
    const location = res.headers.get('location')!
    expect(location).toContain('/restablecer-contrasena')
    const params = new URLSearchParams(new globalThis.URL(location).hash.slice(1))
    const accessToken = params.get('access_token')!
    expect(accessToken).toBeTruthy()

    const invited = client(ANON!)
    await invited.auth.setSession({ access_token: accessToken, refresh_token: params.get('refresh_token')! })
    const set = await invited.auth.updateUser({ password: PASSWORD })
    expect(set.error).toBeNull()

    const login = client(ANON!)
    const signed = await login.auth.signInWithPassword({ email: cashierEmail, password: PASSWORD })
    expect(signed.error).toBeNull()
    const memberships = await login.rpc('get_my_memberships')
    expect(memberships.data).toEqual([expect.objectContaining({ pharmacy_id: pharmacyId, role: 'cashier' })])

    // El enlace es de un solo uso.
    const again = await fetch(invitationLink, { redirect: 'manual' })
    expect(again.headers.get('location') ?? '').not.toContain('access_token')
  })

  it('un correo que ya existe se rechaza y no se crea nada', async () => {
    const before = (await usersService.listMembers(pharmacyId)).length
    await expect(usersService.invite(pharmacyId, { fullName: '', email: cashierEmail, role: 'cashier' })).rejects.toThrow(/Ya existe una cuenta/)
    expect(await usersService.listMembers(pharmacyId)).toHaveLength(before)
  })

  it('un administrador de OTRA botica no puede invitar a la mía', async () => {
    holder.current = other
    await expect(usersService.invite(pharmacyId, { fullName: '', email: `it-intruso-${run}@test.local`, role: 'admin' })).rejects.toThrow(
      /Solo un administrador/,
    )
    holder.current = admin
    const { data } = await service.auth.admin.listUsers({ perPage: 1000 })
    expect(data.users.some((u) => u.email === `it-intruso-${run}@test.local`)).toBe(false) // ni siquiera se creó la cuenta
  })

  it('un cajero no puede invitar ni cambiar roles', async () => {
    const cashier = client(ANON!)
    await cashier.auth.signInWithPassword({ email: cashierEmail, password: PASSWORD })
    holder.current = cashier
    await expect(usersService.invite(pharmacyId, { fullName: '', email: `it-x-${run}@test.local`, role: 'cashier' })).rejects.toThrow(/Solo un administrador/)

    const target = (await usersService.listMembers(pharmacyId)).find((m) => m.role === 'admin')!
    await expect(usersService.updateMember(target.id, { role: 'cashier' })).rejects.toThrow(/No puedes modificar/)
    holder.current = admin
    expect((await usersService.listMembers(pharmacyId)).find((m) => m.id === target.id)?.role).toBe('admin')
  })

  it('desactivar al cajero lo deja sin acceso a la botica; reactivarlo se lo devuelve', async () => {
    const cashierMember = (await usersService.listMembers(pharmacyId)).find((m) => m.email === cashierEmail)!
    await usersService.updateMember(cashierMember.id, { active: false })

    const cashier = client(ANON!)
    await cashier.auth.signInWithPassword({ email: cashierEmail, password: PASSWORD })
    expect((await cashier.rpc('get_my_memberships')).data).toEqual([])

    await usersService.updateMember(cashierMember.id, { active: true })
    expect(((await cashier.rpc('get_my_memberships')).data ?? []).length).toBe(1)
  })

  it('no se puede modificar la propia fila (ni quedarse sin administrador por esa vía)', async () => {
    const me = (await usersService.listMembers(pharmacyId)).find((m) => m.role === 'admin' && m.email === `it-users-${run}@test.local`)!
    await expect(usersService.updateMember(me.id, { role: 'cashier' })).rejects.toThrow(/No puedes modificar/)
  })

  it('dos administradores que se quitan el rol A LA VEZ (15 rondas): la botica nunca se queda sin administrador', async () => {
    const second = await usersService.invite(pharmacyId, { fullName: '', email: `it-admin2-${run}@test.local`, role: 'admin' })
    const res = await fetch(second.actionLink, { redirect: 'manual' })
    const params = new URLSearchParams(new globalThis.URL(res.headers.get('location')!).hash.slice(1))
    const admin2 = client(ANON!)
    await admin2.auth.setSession({ access_token: params.get('access_token')!, refresh_token: params.get('refresh_token')! })
    await admin2.auth.updateUser({ password: PASSWORD })

    // Desactivamos al cajero para aislar la carrera entre los dos administradores.
    const members = await usersService.listMembers(pharmacyId)
    const cashierMember = members.find((m) => m.email === cashierEmail)!
    await usersService.updateMember(cashierMember.id, { active: false })
    const a1 = members.find((m) => m.email === `it-users-${run}@test.local`)!
    const a2 = members.find((m) => m.email === `it-admin2-${run}@test.local`)!

    // Cada uno degrada al otro, simultáneamente, en varias rondas: en NINGUNA la botica puede quedar sin administrador.
    let bothWon = 0
    for (let round = 0; round < 15; round++) {
      await service.from('pharmacy_members').update({ role: 'admin' }).in('id', [a1.id, a2.id])
      const [r1, r2] = await Promise.all([
        admin.from('pharmacy_members').update({ role: 'cashier' }).eq('id', a2.id).select('id'),
        admin2.from('pharmacy_members').update({ role: 'cashier' }).eq('id', a1.id).select('id'),
      ])
      if ([r1, r2].every((r) => !r.error && (r.data?.length ?? 0) === 1)) bothWon++
      const { data } = await service.from('pharmacy_members').select('role, active').eq('pharmacy_id', pharmacyId)
      expect((data ?? []).filter((m) => m.role === 'admin' && m.active).length).toBeGreaterThanOrEqual(1)
    }
    expect(bothWon).toBe(0)
    expect(otherPharmacyId).not.toBe(pharmacyId)
  })
})
