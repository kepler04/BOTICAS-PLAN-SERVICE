// Reglas de SUNAT que no dependen de la red ni de la firma: tipos de documento, cliente "varios" y cómo leer
// la respuesta (CDR o SOAP Fault). Sin dependencias: la usan la Edge Function (Deno) y Vitest.
import type { PartyDocType } from './ubl.ts'

export type CustomerDocType = 'dni' | 'ruc' | 'ce' | 'passport'

/** Catálogo 06 de SUNAT a partir del tipo de documento del cliente en la venta. */
export const PARTY_DOC: Record<CustomerDocType, PartyDocType> = { dni: '1', ruc: '6', ce: '4', passport: '7' }

/** Boleta sin cliente identificado (permitido hasta S/ 700): tipo 0, número "-". */
export const ANONYMOUS_CUSTOMER = { docType: '0' as PartyDocType, docNumber: '-', name: 'CLIENTES VARIOS' }

export type CdrStatus = 'accepted' | 'observed' | 'rejected' | 'error'

export type SunatResult = {
  status: CdrStatus
  code: string
  description: string
  notes: string[]
}

/**
 * Lee la Constancia de Recepción (CDR, el XML que SUNAT devuelve comprimido).
 * ResponseCode 0 = aceptado (con notas = aceptado con observaciones); 2000-3999 = rechazado.
 */
export function classifyCdr(cdrXml: string): SunatResult {
  const code = /<cbc:ResponseCode[^>]*>([^<]+)</.exec(cdrXml)?.[1]?.trim() ?? ''
  const description = decodeXml(/<cbc:Description[^>]*>([^<]+)</.exec(cdrXml)?.[1]?.trim() ?? '')
  const notes = [...cdrXml.matchAll(/<cbc:Note[^>]*>([^<]+)</g)].map((m) => decodeXml(m[1]!.trim()))
  const n = Number(code)
  const status: CdrStatus =
    code === '0' ? (notes.length > 0 ? 'observed' : 'accepted') : n >= 2000 && n < 4000 ? 'rejected' : n >= 4000 ? 'observed' : 'error'
  return { status, code, description, notes }
}

/**
 * SOAP Fault (p. ej. faultcode "soap-env:Client.2335"). Los códigos 2000-3999 son rechazos del comprobante
 * (corregir y emitir otro); el resto (0100-1999, servidor caído, credenciales) son excepciones: se puede reintentar.
 */
export function classifyFault(faultcode: string, faultstring: string): SunatResult {
  const code = /(\d{4})\s*$/.exec(faultcode)?.[1] ?? faultcode
  const n = Number(code)
  return {
    status: n >= 2000 && n < 4000 ? 'rejected' : 'error',
    code,
    description: decodeXml(faultstring),
    notes: [],
  }
}

/** Respuesta SOAP completa sin la parte comprimida: devuelve el CDR en base64 o el Fault ya clasificado. */
export function parseSoapResponse(text: string): { cdrZipBase64: string } | { fault: SunatResult } {
  const app = /<applicationResponse>([^<]+)<\/applicationResponse>/.exec(text)?.[1]
  if (app) return { cdrZipBase64: app.trim() }
  const faultcode = /<faultcode>([^<]+)<\/faultcode>/.exec(text)?.[1]
  const faultstring = /<faultstring>([^<]+)<\/faultstring>/.exec(text)?.[1]
  if (faultcode) return { fault: classifyFault(faultcode, faultstring ?? '') }
  return { fault: { status: 'error', code: 'HTTP', description: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200), notes: [] } }
}

export function soapEnvelope(user: string, password: string, fileName: string, zipBase64: string): string {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
<soapenv:Header><wsse:Security><wsse:UsernameToken><wsse:Username>${user}</wsse:Username><wsse:Password>${password}</wsse:Password></wsse:UsernameToken></wsse:Security></soapenv:Header>
<soapenv:Body><ser:sendBill><fileName>${fileName}</fileName><contentFile>${zipBase64}</contentFile></ser:sendBill></soapenv:Body>
</soapenv:Envelope>`
}

/**
 * Texto del QR de la representación impresa:
 * RUC | TIPO | SERIE | NUMERO | IGV | TOTAL | FECHA | TIPO DOC. CLIENTE | NUM. DOC. CLIENTE | HASH
 */
export function qrText(d: {
  ruc: string
  docType: string
  series: string
  number: number
  igv: number
  total: number
  issueDate: string
  customerDocType: string
  customerDocNumber: string
  hash: string
}): string {
  return [d.ruc, d.docType, d.series, d.number, d.igv.toFixed(2), d.total.toFixed(2), d.issueDate, d.customerDocType, d.customerDocNumber, d.hash].join('|') + '|'
}

function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
