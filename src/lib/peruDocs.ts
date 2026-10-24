/**
 * Documentos de identidad peruanos. Misma regla que la BD (`private.valid_ruc`, `private.valid_customer_doc`):
 * los vectores de prueba son los mismos en src/lib/peruDocs.test.ts y supabase/tests/phase6.test.sql.
 */
export type CustomerDocType = 'dni' | 'ruc' | 'ce' | 'passport'

export const DOC_TYPE_LABELS: Record<CustomerDocType, string> = {
  dni: 'DNI',
  ruc: 'RUC',
  ce: 'Carné de extranjería',
  passport: 'Pasaporte',
}

/** SUNAT: una boleta de MÁS de S/ 700 debe identificar al cliente (nombre y documento). En centavos. */
export const CUSTOMER_ID_THRESHOLD_CENTS = 70_000

const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

/** RUC: 11 dígitos, prefijo 10/15/16/17/20 y dígito verificador (módulo 11). */
export function isValidRuc(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false
  const sum = RUC_WEIGHTS.reduce((s, w, i) => s + Number(ruc[i]) * w, 0)
  let check = 11 - (sum % 11)
  if (check === 10) check = 0
  else if (check === 11) check = 1
  return check === Number(ruc[10])
}

/** Normaliza como la BD: sin espacios a los lados y en mayúsculas. */
export function normalizeDocNumber(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidCustomerDoc(type: CustomerDocType, raw: string): boolean {
  const n = normalizeDocNumber(raw)
  switch (type) {
    case 'dni':
      return /^\d{8}$/.test(n)
    case 'ruc':
      return isValidRuc(n)
    case 'ce':
      return /^[A-Z0-9]{8,12}$/.test(n)
    case 'passport':
      return /^[A-Z0-9]{6,12}$/.test(n)
  }
}

export const DOC_HINTS: Record<CustomerDocType, string> = {
  dni: '8 dígitos',
  ruc: '11 dígitos',
  ce: '8 a 12 letras o números',
  passport: '6 a 12 letras o números',
}
