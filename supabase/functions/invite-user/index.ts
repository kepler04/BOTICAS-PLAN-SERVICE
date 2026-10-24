// Edge Function: invite-user
// Crea la cuenta de un nuevo miembro y lo agrega a la botica. Necesita `service_role` (crear usuarios en Auth),
// por eso NO puede vivir en el navegador. La clave de servicio solo existe aquí, en el servidor.
//
// Seguridad:
//  1. El gateway ya exige un JWT válido (verify_jwt = true en config.toml).
//  2. La función vuelve a identificar al llamante y comprueba que sea ADMIN ACTIVO de esa botica
//     leyendo con SU token (RLS): nadie puede invitar a otra botica.
//  3. La membresía se crea con el cliente DEL ADMIN (no con service_role): pasa por las políticas RLS y
//     la auditoría registra al admin como actor.
//  4. Si ya existe una cuenta con ese correo, se rechaza (no se agregan cuentas ajenas sin su consentimiento).
//
// Devuelve un enlace de invitación de un solo uso. Con SMTP configurado se enviaría por correo; en esta demo el
// admin lo comparte a mano (el invitado define su contraseña al abrirlo).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const CORS = {
  'Access-Control-Allow-Origin': '*', // la autorización va en el token (Bearer), no en cookies
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { pharmacy_id?: unknown; email?: unknown; full_name?: unknown; role?: unknown; redirect_to?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  const pharmacyId = typeof body.pharmacy_id === 'string' ? body.pharmacy_id : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const role = body.role
  // Adónde vuelve el invitado. GoTrue solo respeta URLs de la lista `additional_redirect_urls` (si no, usa site_url),
  // así que aceptar la del cliente no permite redirigir a un sitio ajeno.
  let siteUrl = SITE_URL
  if (typeof body.redirect_to === 'string') {
    try {
      const u = new URL(body.redirect_to)
      if (u.protocol === 'https:' || u.protocol === 'http:') siteUrl = u.origin
    } catch {
      return json({ error: 'invalid_redirect' }, 400)
    }
  }

  if (!UUID.test(pharmacyId)) return json({ error: 'invalid_pharmacy' }, 400)
  if (!EMAIL.test(email) || email.length > 254) return json({ error: 'invalid_email' }, 400)
  if (fullName.length > 120) return json({ error: 'invalid_name' }, 400)
  if (role !== 'cashier' && role !== 'admin') return json({ error: 'invalid_role' }, 400)

  // 1) ¿Quién llama? Con SU token: todo lo que lea pasa por RLS.
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: who, error: whoError } = await caller.auth.getUser()
  if (whoError || !who.user) return json({ error: 'unauthorized' }, 401)

  // 2) ¿Es administrador activo de ESA botica?
  const { data: mine } = await caller
    .from('pharmacy_members')
    .select('role')
    .eq('pharmacy_id', pharmacyId)
    .eq('user_id', who.user.id)
    .eq('active', true)
    .maybeSingle()
  if (mine?.role !== 'admin') return json({ error: 'forbidden' }, 403)

  // 3) Crear la cuenta (service_role: solo aquí) y obtener el enlace de invitación.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: fullName ? { full_name: fullName } : {}, redirectTo: `${siteUrl}/restablecer-contrasena` },
  })
  if (linkError || !link?.user || !link.properties?.action_link) {
    const message = `${linkError?.message ?? ''}`.toLowerCase()
    if (linkError?.status === 422 || message.includes('already') || message.includes('registered') || message.includes('exists')) {
      return json({ error: 'email_exists' }, 409)
    }
    return json({ error: 'invite_failed' }, 500)
  }

  // 4) Agregarlo a la botica con el cliente DEL ADMIN (RLS + auditoría a nombre del admin).
  const { error: memberError } = await caller
    .from('pharmacy_members')
    .insert({ pharmacy_id: pharmacyId, user_id: link.user.id, role })
  if (memberError) {
    // No dejar una cuenta huérfana sin botica.
    await admin.auth.admin.deleteUser(link.user.id)
    return json({ error: 'membership_failed' }, 500)
  }

  return json({ action_link: link.properties.action_link, email, user_id: link.user.id })
})
