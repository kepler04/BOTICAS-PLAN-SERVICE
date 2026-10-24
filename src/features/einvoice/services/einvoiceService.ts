import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import type { Database } from '@/types/database.types'

export class EinvoiceServiceError extends Error {}

export type EinvoiceStatus = Database['public']['Enums']['einvoice_status']

export type Einvoice = {
  id: string
  saleId: string
  docType: '01' | '03'
  series: string
  number: number
  status: EinvoiceStatus
  environment: 'beta' | 'production'
  sunatCode: string | null
  sunatDescription: string | null
  sunatNotes: string[]
  hash: string | null
  attempts: number
}

const COLUMNS =
  'id, sale_id, doc_type, series, number, status, environment, sunat_code, sunat_description, sunat_notes, hash, attempts'

type Row = {
  id: string
  sale_id: string
  doc_type: string
  series: string
  number: number
  status: EinvoiceStatus
  environment: string
  sunat_code: string | null
  sunat_description: string | null
  sunat_notes: string[] | null
  hash: string | null
  attempts: number
}

const toEinvoice = (r: Row): Einvoice => ({
  id: r.id,
  saleId: r.sale_id,
  docType: r.doc_type as Einvoice['docType'],
  series: r.series,
  number: r.number,
  status: r.status,
  environment: r.environment as Einvoice['environment'],
  sunatCode: r.sunat_code,
  sunatDescription: r.sunat_description,
  sunatNotes: r.sunat_notes ?? [],
  hash: r.hash,
  attempts: r.attempts,
})

/** Errores que devuelve la Edge Function `einvoice-emit`. */
const EMIT_ERRORS: Record<string, string> = {
  einvoice_disabled: 'La facturación electrónica está desactivada. Actívala en Configuración.',
  issuer_incomplete: 'Faltan datos del emisor: completa el RUC y la dirección fiscal en Configuración.',
  igv_required: 'En esta versión solo se emiten comprobantes de boticas que cobran IGV.',
  sale_voided: 'La venta está anulada: no se envía a SUNAT.',
  forbidden: 'No tienes permiso para emitir comprobantes de esta botica.',
  certificate_missing: 'El servidor no tiene el certificado para firmar. Genéralo con `npm run einvoice:cert`.',
}

export const DOC_TYPE_NAMES: Record<Einvoice['docType'], string> = {
  '01': 'Factura electrónica',
  '03': 'Boleta de venta electrónica',
}

export const einvoiceService = {
  async getBySale(saleId: string): Promise<Einvoice | null> {
    const { data, error } = await supabase.from('einvoices').select(COLUMNS).eq('sale_id', saleId).maybeSingle()
    if (error) throw new EinvoiceServiceError(translateDbError(error, {}, 'No se pudo consultar el comprobante electrónico.'))
    return data ? toEinvoice(data as Row) : null
  },

  /** Emite (o reintenta) el comprobante de una venta. Idempotente: si ya fue aceptado, lo devuelve. */
  async emit(saleId: string): Promise<Einvoice> {
    const { data, error } = await supabase.functions.invoke<Row>('einvoice-emit', { body: { sale_id: saleId } })
    if (error) {
      let code = ''
      if (error instanceof FunctionsHttpError) {
        code = ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error ?? ''
      }
      throw new EinvoiceServiceError(
        EMIT_ERRORS[code] ?? (code ? 'No se pudo emitir el comprobante electrónico.' : 'No pudimos conectar con el servidor. Revisa tu conexión a internet.'),
      )
    }
    if (!data) throw new EinvoiceServiceError('No se pudo emitir el comprobante electrónico.')
    return toEinvoice(data)
  },
}
