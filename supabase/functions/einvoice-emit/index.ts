// Edge Function: einvoice-emit
// Emite el comprobante electrónico (boleta o factura) de una venta y lo envía a SUNAT. Hoy apunta al servicio
// BETA de SUNAT: comprobantes de PRUEBA, sin validez legal (ADR 073).
//
// Flujo:
//  1. Con el token de QUIEN LLAMA: `reserve_einvoice` valida que sea miembro de la botica de la venta, decide
//     boleta/factura y toma el correlativo (idempotente). Así los permisos los decide la base de datos.
//  2. Si ya fue aceptado (o rechazado), lo devuelve sin reenviar.
//  3. "Toma" el envío (dos pestañas no envían el mismo comprobante a la vez).
//  4. Arma el XML UBL 2.1, lo firma, lo comprime y lo envía por SOAP (sendBill). Lee la constancia (CDR).
//  5. Guarda el resultado con service_role (la API general no puede escribir en `einvoices`).
//
// Secretos: SUNAT_CERT_PEM_B64 y SUNAT_KEY_PEM_B64 (certificado y clave en PEM, en base64). En el BETA basta un
// certificado autofirmado: `npm run einvoice:cert` lo genera. Nunca se versionan.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildInvoiceXml } from '../_shared/einvoice/ubl.ts'
import {
  adminClient,
  callerClient,
  CERT_PEM,
  claimSending,
  CORS,
  json,
  KEY_PEM,
  loadSaleDocument,
  PUBLIC_FIELDS,
  saveResult,
  signAndSend,
  UUID,
  type EinvoiceRow,
} from '../_shared/einvoice/pipeline.ts'

/** Errores de `reserve_einvoice` que se devuelven tal cual al front (los traduce el servicio). */
const RESERVE_ERRORS = ['einvoice_disabled', 'issuer_incomplete', 'igv_required', 'sale_voided', 'forbidden'] as const

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
  if (!CERT_PEM || !KEY_PEM) return json({ error: 'certificate_missing' }, 503)

  // 1) Reservar con el token de quien llama (RLS + validaciones en la base de datos).
  const { data: reserved, error: reserveError } = await callerClient(createClient, req).rpc('reserve_einvoice', { p_sale: saleId })
  if (reserveError || !reserved) {
    const key = RESERVE_ERRORS.find((k) => reserveError?.message?.includes(k))
    if (key) return json({ error: key }, key === 'forbidden' ? 403 : 409)
    return json({ error: 'reserve_failed' }, 500)
  }
  const row = reserved as EinvoiceRow
  const admin = adminClient(createClient)
  const current = async () => (await admin.from('einvoices').select(PUBLIC_FIELDS).eq('id', row.id).single()).data

  // 2) Ya resuelto: no se reenvía (aceptado/observado es definitivo; rechazado exige corregir y emitir otro).
  if (['accepted', 'observed', 'rejected'].includes(row.status)) return json(await current())
  // 3) Tomar el envío.
  if (!(await claimSending(admin, row))) return json(await current())

  // 4) Armar, firmar y enviar.
  const doc = await loadSaleDocument(admin, saleId, row.pharmacy_id)
  if (!doc) return json({ error: 'reserve_failed' }, 500)
  const xml = buildInvoiceXml({ ...doc.base, docType: row.doc_type as '01' | '03', series: row.series, number: row.number })
  const sent = await signAndSend(doc.ruc, row, xml)

  // 5) Guardar.
  const saved = await saveResult(admin, row.id, sent)
  return saved ? json(saved) : json({ error: 'save_failed' }, 500)
})
