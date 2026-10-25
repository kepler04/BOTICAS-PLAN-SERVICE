// Edge Function: einvoice-credit-note
// Anula una venta cuyo comprobante ya fue ACEPTADO por SUNAT: emite la nota de crédito (07, motivo 01 "anulación
// de la operación"), la envía a SUNAT y, SOLO si SUNAT la acepta, anula la venta (devuelve stock y ajusta la caja).
// Hoy apunta al servicio BETA de SUNAT (pruebas, sin validez legal; ADR 073).
//
// Flujo (idempotente: reintentar converge al mismo estado):
//  1. `reserve_credit_note` con el token de QUIEN LLAMA: exige administrador, venta vigente, comprobante aceptado y
//     caja abierta (lo mismo que `void_sale`), y toma el correlativo BC01/FC01.
//  2. Si la nota ya fue aceptada pero la venta sigue vigente (p. ej. falló la anulación), solo anula.
//  3. Envía la nota a SUNAT y guarda la constancia.
//  4. Si SUNAT la aceptó: `void_sale` con el token del administrador (stock, caja y auditoría a su nombre).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildCreditNoteXml } from '../_shared/einvoice/ubl.ts'
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

const RESERVE_ERRORS = ['forbidden', 'reason_required', 'sale_voided', 'no_accepted_einvoice', 'cash_session_closed'] as const
const ACCEPTED = ['accepted', 'observed']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let saleId = ''
  let reason = ''
  try {
    const body = await req.json()
    saleId = typeof body?.sale_id === 'string' ? body.sale_id : ''
    reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  if (!UUID.test(saleId)) return json({ error: 'invalid_sale' }, 400)
  if (!CERT_PEM || !KEY_PEM) return json({ error: 'certificate_missing' }, 503)

  const caller = callerClient(createClient, req)
  const admin = adminClient(createClient)

  // 1) Reservar la nota (permisos y reglas en la base de datos).
  const { data: reserved, error: reserveError } = await caller.rpc('reserve_credit_note', { p_sale: saleId, p_reason: reason })
  if (reserveError || !reserved) {
    const key = RESERVE_ERRORS.find((k) => reserveError?.message?.includes(k))
    if (key) return json({ error: key }, key === 'forbidden' ? 403 : 409)
    return json({ error: 'reserve_failed' }, 500)
  }
  const row = reserved as EinvoiceRow

  /** Anula la venta si la nota está aceptada y la venta sigue vigente. Devuelve el estado final. */
  const finish = async () => {
    const note = (await admin.from('einvoices').select(PUBLIC_FIELDS).eq('id', row.id).single()).data
    const { data: sale } = await admin.from('sales').select('status').eq('id', saleId).single()
    let voidError: string | null = null
    if (note && ACCEPTED.includes(note.status) && sale?.status === 'completed') {
      const { error } = await caller.rpc('void_sale', { p_sale: saleId, p_reason: `Nota de crédito ${note.series}-${note.number}: ${row.reason}` })
      if (error) voidError = error.message
    }
    const { data: after } = await admin.from('sales').select('status').eq('id', saleId).single()
    return json({ credit_note: note, sale_voided: after?.status === 'voided', void_error: voidError })
  }

  // 2) Ya resuelta en SUNAT: solo asegurar la anulación de la venta (o informar el rechazo).
  if ([...ACCEPTED, 'rejected'].includes(row.status)) return finish()
  if (!(await claimSending(admin, row))) return finish()

  // 3) Armar la nota con las mismas líneas y totales de la venta, firmar y enviar.
  const doc = await loadSaleDocument(admin, saleId, row.pharmacy_id, new Date().toISOString())
  const { data: original } = await admin.from('einvoices').select('doc_type, series, number').eq('id', row.reference_id!).single()
  if (!doc || !original) return json({ error: 'reserve_failed' }, 500)
  const xml = buildCreditNoteXml({
    ...doc.base,
    series: row.series,
    number: row.number,
    reference: { docType: original.doc_type, id: `${original.series}-${original.number}` },
    reasonCode: '01',
    reasonDescription: row.reason ?? 'Anulación de la operación',
  })
  const sent = await signAndSend(doc.ruc, row, xml)
  if (!(await saveResult(admin, row.id, sent))) return json({ error: 'save_failed' }, 500)

  // 4) Si SUNAT la aceptó, anular la venta.
  return finish()
})
