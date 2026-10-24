// Edge Function: einvoice-emit
// Emite el comprobante electrónico (boleta o factura) de una venta y lo envía a SUNAT. Hoy apunta al servicio
// BETA de SUNAT: comprobantes de PRUEBA, sin validez legal (ADR 073).
//
// Flujo:
//  1. Con el token de QUIEN LLAMA: `reserve_einvoice` valida que sea miembro de la botica de la venta, decide
//     boleta/factura y toma el correlativo (idempotente). Así los permisos los decide la base de datos.
//  2. Si ya fue aceptado (o rechazado), lo devuelve sin reenviar.
//  3. "Toma" el envío con una actualización condicional: dos pestañas no envían el mismo comprobante a la vez.
//  4. Arma el XML UBL 2.1, lo firma, lo comprime y lo envía por SOAP (sendBill). Lee la constancia (CDR).
//  5. Guarda el resultado con service_role (la API general no puede escribir en `einvoices`).
//
// Secretos: SUNAT_CERT_PEM_B64 y SUNAT_KEY_PEM_B64 (certificado y clave en PEM, en base64). En el BETA basta un
// certificado autofirmado: `npm run einvoice:cert` lo genera. Nunca se versionan.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildInvoiceXml, documentName, type UblInput } from '../_shared/einvoice/ubl.ts'
import { ANONYMOUS_CUSTOMER, classifyCdr, PARTY_DOC, parseSoapResponse, soapEnvelope, type SunatResult } from '../_shared/einvoice/sunat.ts'
import { signInvoiceXml, unzipCdr, zipXml } from '../_shared/einvoice/sign.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ENDPOINT = Deno.env.get('SUNAT_ENDPOINT') ?? 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService'
const SOL_USER = Deno.env.get('SUNAT_SOL_USER') ?? 'MODDATOS'
const SOL_PASSWORD = Deno.env.get('SUNAT_SOL_PASSWORD') ?? 'MODDATOS'
const ENVIRONMENT = ENDPOINT.includes('e-beta') ? 'beta' : 'production'

const CORS = {
  'Access-Control-Allow-Origin': '*', // la autorización va en el token (Bearer), no en cookies
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
/** Errores de `reserve_einvoice` que se devuelven tal cual al front (los traduce el servicio). */
const RESERVE_ERRORS = ['einvoice_disabled', 'issuer_incomplete', 'igv_required', 'sale_voided', 'forbidden'] as const
const PUBLIC_FIELDS = 'id, sale_id, doc_type, series, number, status, environment, sunat_code, sunat_description, sunat_notes, hash, attempts, sent_at'

const PRESENTATION = { unit: 'unidad', blister: 'blíster', box: 'caja' } as const

function limaDateTime(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour').replace('24', '00')}:${get('minute')}:${get('second')}` }
}

const pem = (b64: string | undefined) => (b64 ? new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))) : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let saleId = ''
  try {
    const body = await req.json()
    saleId = typeof body?.sale_id === 'string' ? body.sale_id : ''
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  if (!UUID.test(saleId)) return json({ error: 'invalid_sale' }, 400)

  const certPem = pem(Deno.env.get('SUNAT_CERT_PEM_B64'))
  const keyPem = pem(Deno.env.get('SUNAT_KEY_PEM_B64'))
  if (!certPem || !keyPem) return json({ error: 'certificate_missing' }, 503)

  // 1) Reservar con el token de quien llama (RLS + validaciones en la base de datos).
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: reserved, error: reserveError } = await caller.rpc('reserve_einvoice', { p_sale: saleId })
  if (reserveError || !reserved) {
    const key = RESERVE_ERRORS.find((k) => reserveError?.message?.includes(k))
    if (key) return json({ error: key }, key === 'forbidden' ? 403 : 409)
    return json({ error: 'reserve_failed' }, 500)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const current = async () => (await admin.from('einvoices').select(PUBLIC_FIELDS).eq('id', reserved.id).single()).data

  // 2) Ya resuelto: no se reenvía (aceptado/observado es definitivo; rechazado exige corregir y emitir otro).
  if (['accepted', 'observed', 'rejected'].includes(reserved.status)) return json(await current())

  // 3) Tomar el envío: solo si sigue pendiente/con error y nadie lo envió en el último minuto.
  const now = new Date()
  const { data: claimed } = await admin
    .from('einvoices')
    .update({ sent_at: now.toISOString(), attempts: reserved.attempts + 1 })
    .eq('id', reserved.id)
    .in('status', ['pending', 'error'])
    .or(`sent_at.is.null,sent_at.lt.${new Date(now.getTime() - 60_000).toISOString()}`)
    .select('id')
  if (!claimed || claimed.length === 0) return json(await current())

  // 4) Datos de la venta y del emisor.
  const { data: sale } = await admin.from('sales').select('*, sale_items(*)').eq('id', saleId).single()
  const { data: ph } = await admin
    .from('pharmacies')
    .select('ruc, legal_name, trade_name, fiscal_address, ubigeo')
    .eq('id', reserved.pharmacy_id)
    .single()
  if (!sale || !ph?.ruc) return json({ error: 'reserve_failed' }, 500)

  const when = limaDateTime(sale.created_at)
  type Item = { product_name: string; presentation: keyof typeof PRESENTATION; units_per_presentation: number; quantity: number; line_total: number; taxable_amount: number; igv_amount: number; tax_affectation: 'gravado' | 'exonerado' | 'inafecto'; igv_rate: number }
  const items = (sale.sale_items as Item[]).sort((a, b) => a.product_name.localeCompare(b.product_name))
  const input: UblInput = {
    docType: reserved.doc_type,
    series: reserved.series,
    number: reserved.number,
    issueDate: when.date,
    issueTime: when.time,
    supplier: { ruc: ph.ruc, legalName: ph.legal_name, tradeName: ph.trade_name, address: ph.fiscal_address, ubigeo: ph.ubigeo },
    customer: sale.customer_doc_type
      ? { docType: PARTY_DOC[sale.customer_doc_type as keyof typeof PARTY_DOC], docNumber: sale.customer_doc_number, name: sale.customer_name }
      : ANONYMOUS_CUSTOMER,
    lines: items.map((i) => ({
      description: i.presentation === 'unit' ? i.product_name : `${i.product_name} (${PRESENTATION[i.presentation]} x${i.units_per_presentation})`,
      quantity: i.quantity,
      lineTotal: Number(i.line_total),
      taxable: Number(i.taxable_amount),
      igv: Number(i.igv_amount),
      affectation: i.tax_affectation,
    })),
    totals: {
      gravado: Number(sale.total_gravado),
      exonerado: Number(sale.total_exonerado),
      inafecto: Number(sale.total_inafecto),
      igv: Number(sale.total_igv),
      total: Number(sale.total),
    },
    igvRate: Number(items.find((i) => i.tax_affectation === 'gravado')?.igv_rate ?? 18),
  }

  // 5) Firmar, comprimir y enviar.
  const name = documentName(ph.ruc, input.docType, input.series, input.number)
  const signed = signInvoiceXml(buildInvoiceXml(input), certPem, keyPem)
  let result: SunatResult
  let cdrXml: string | null = null
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: 'urn:sendBill' },
      body: soapEnvelope(`${ph.ruc}${SOL_USER}`, SOL_PASSWORD, `${name}.zip`, zipXml(name, signed.xml)),
      signal: AbortSignal.timeout(30_000),
    })
    const parsed = parseSoapResponse(await res.text())
    if ('cdrZipBase64' in parsed) {
      cdrXml = unzipCdr(parsed.cdrZipBase64)
      result = classifyCdr(cdrXml)
    } else {
      result = parsed.fault
    }
  } catch (e) {
    result = { status: 'error', code: 'RED', description: `No se pudo conectar con SUNAT: ${e instanceof Error ? e.message : e}`, notes: [] }
  }

  // 6) Guardar el resultado.
  const { data: saved, error: saveError } = await admin
    .from('einvoices')
    .update({
      status: result.status,
      environment: ENVIRONMENT,
      sunat_code: result.code,
      sunat_description: result.description.slice(0, 500),
      sunat_notes: result.notes.slice(0, 20),
      hash: signed.hash,
      xml: signed.xml,
      cdr_xml: cdrXml,
    })
    .eq('id', reserved.id)
    .select(PUBLIC_FIELDS)
    .single()
  if (saveError) return json({ error: 'save_failed' }, 500)
  return json(saved)
})
