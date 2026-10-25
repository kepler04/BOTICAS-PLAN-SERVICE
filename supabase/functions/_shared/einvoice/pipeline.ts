// Pasos comunes de las Edge Functions de comprobantes (emitir boleta/factura y emitir nota de crédito):
// leer la venta como documento UBL, "tomar" el envío, enviar a SUNAT y guardar el resultado.
// Solo Deno (usa el cliente de Supabase y la firma).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { documentName, type UblLine } from './ubl.ts'
import { ANONYMOUS_CUSTOMER, classifyCdr, PARTY_DOC, parseSoapResponse, soapEnvelope, type SunatResult } from './sunat.ts'
import { signInvoiceXml, unzipCdr, zipXml } from './sign.ts'

export const ENDPOINT = Deno.env.get('SUNAT_ENDPOINT') ?? 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService'
const SOL_USER = Deno.env.get('SUNAT_SOL_USER') ?? 'MODDATOS'
const SOL_PASSWORD = Deno.env.get('SUNAT_SOL_PASSWORD') ?? 'MODDATOS'
export const ENVIRONMENT = ENDPOINT.includes('e-beta') ? 'beta' : 'production'

export const PUBLIC_FIELDS =
  'id, sale_id, doc_type, series, number, status, environment, sunat_code, sunat_description, sunat_notes, hash, attempts, sent_at, reference_id, reason'

export const CORS = {
  'Access-Control-Allow-Origin': '*', // la autorización va en el token (Bearer), no en cookies
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const pem = (b64: string | undefined) => (b64 ? new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))) : '')
export const CERT_PEM = pem(Deno.env.get('SUNAT_CERT_PEM_B64'))
export const KEY_PEM = pem(Deno.env.get('SUNAT_KEY_PEM_B64'))

const PRESENTATION = { unit: 'unidad', blister: 'blíster', box: 'caja' } as const

function limaDateTime(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour').replace('24', '00')}:${get('minute')}:${get('second')}` }
}

export type EinvoiceRow = {
  id: string
  pharmacy_id: string
  sale_id: string
  doc_type: '01' | '03' | '07'
  series: string
  number: number
  status: string
  attempts: number
  reference_id: string | null
  reason: string | null
}

/** Emisor, cliente, líneas y totales de una venta, tal como los guardó (instantánea). */
export async function loadSaleDocument(admin: SupabaseClient, saleId: string, pharmacyId: string, issuedAt?: string) {
  const { data: sale } = await admin.from('sales').select('*, sale_items(*)').eq('id', saleId).single()
  const { data: ph } = await admin
    .from('pharmacies')
    .select('ruc, legal_name, trade_name, fiscal_address, ubigeo')
    .eq('id', pharmacyId)
    .single()
  if (!sale || !ph?.ruc) return null

  type Item = { product_name: string; presentation: keyof typeof PRESENTATION; units_per_presentation: number; quantity: number; line_total: number; taxable_amount: number; igv_amount: number; tax_affectation: UblLine['affectation']; igv_rate: number }
  const items = (sale.sale_items as Item[]).sort((a, b) => a.product_name.localeCompare(b.product_name))
  const when = limaDateTime(issuedAt ?? sale.created_at)
  return {
    sale,
    ruc: ph.ruc as string,
    base: {
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
    },
  }
}

/**
 * "Toma" el envío: solo si sigue pendiente o con error y nadie lo envió en el último minuto. Evita que dos pestañas
 * (o un reintento impaciente) manden el mismo comprobante a SUNAT a la vez.
 */
export async function claimSending(admin: SupabaseClient, row: EinvoiceRow): Promise<boolean> {
  const now = new Date()
  const { data } = await admin
    .from('einvoices')
    .update({ sent_at: now.toISOString(), attempts: row.attempts + 1 })
    .eq('id', row.id)
    .in('status', ['pending', 'error'])
    .or(`sent_at.is.null,sent_at.lt.${new Date(now.getTime() - 60_000).toISOString()}`)
    .select('id')
  return Boolean(data && data.length > 0)
}

/** Esperas entre reintentos cuando el servidor web de SUNAT responde con una página de error (no con SOAP). */
const HTTP_RETRY_DELAYS_MS = [2_000, 4_000]

/**
 * Firma, comprime, envía (sendBill) y lee la constancia. Nunca lanza: un fallo de red es un resultado 'error'.
 *
 * Reintento automático SOLO si la respuesta es una página de error del servidor web (código 'HTTP', p. ej.
 * "401 Authorization Required" de nginx cuando el BETA recibe envíos muy seguidos): ahí SUNAT no llegó a procesar
 * el comprobante, así que reenviar no puede duplicarlo. Un corte de red ('RED') NO se reintenta solo: no se sabe si
 * SUNAT lo procesó; queda como 'error' para reintentar a mano (ADR 080).
 */
export async function signAndSend(ruc: string, row: EinvoiceRow, unsignedXml: string) {
  const signed = signInvoiceXml(unsignedXml, CERT_PEM, KEY_PEM)
  const name = documentName(ruc, row.doc_type, row.series, row.number)
  const body = soapEnvelope(`${ruc}${SOL_USER}`, SOL_PASSWORD, `${name}.zip`, zipXml(name, signed.xml))
  let result: SunatResult = { status: 'error', code: 'RED', description: 'Sin respuesta', notes: [] }
  let cdrXml: string | null = null
  for (let attempt = 0; attempt <= HTTP_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, HTTP_RETRY_DELAYS_MS[attempt - 1]))
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: 'urn:sendBill' },
        body,
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
    if (result.code !== 'HTTP') break
  }
  return { result, signed, cdrXml }
}

/** Guarda el resultado del envío (solo service_role puede escribir en `einvoices`). */
export async function saveResult(admin: SupabaseClient, id: string, sent: Awaited<ReturnType<typeof signAndSend>>) {
  const { data, error } = await admin
    .from('einvoices')
    .update({
      status: sent.result.status,
      environment: ENVIRONMENT,
      sunat_code: sent.result.code,
      sunat_description: sent.result.description.slice(0, 500),
      sunat_notes: sent.result.notes.slice(0, 20),
      hash: sent.signed.hash,
      xml: sent.signed.xml,
      cdr_xml: sent.cdrXml,
    })
    .eq('id', id)
    .select(PUBLIC_FIELDS)
    .single()
  return error ? null : data
}

/** Cliente con el token de quien llama: todo lo que haga pasa por RLS y las validaciones de las RPC. */
export function callerClient(createClient: (url: string, key: string, opts: object) => SupabaseClient, req: Request) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function adminClient(createClient: (url: string, key: string, opts: object) => SupabaseClient) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
