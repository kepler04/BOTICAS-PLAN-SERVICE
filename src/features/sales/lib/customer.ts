import {
  CUSTOMER_ID_THRESHOLD_CENTS,
  isValidCustomerDoc,
  normalizeDocNumber,
  type CustomerDocType,
} from '@/lib/peruDocs'

export type CustomerDraft = { docType: CustomerDocType; docNumber: string; name: string }
export type CustomerInput = { docType: CustomerDocType; docNumber: string; name: string }

export const EMPTY_CUSTOMER: CustomerDraft = { docType: 'dni', docNumber: '', name: '' }

export type CustomerCheck = {
  /** La venta supera S/ 700: SUNAT exige identificar al cliente. */
  required: boolean
  /** Se puede cobrar con lo que hay escrito. */
  ok: boolean
  /** Lo que se envía a la BD (null = venta sin cliente). */
  payload: CustomerInput | null
  docError: string | null
  nameError: string | null
}

/**
 * Valida el cliente del POS. Vacío está bien salvo que la venta supere S/ 700; si se escribe algo,
 * documento y nombre deben ser válidos (igual que `create_sale`).
 */
export function checkCustomer(draft: CustomerDraft, totalCents: number): CustomerCheck {
  const required = totalCents > CUSTOMER_ID_THRESHOLD_CENTS
  const docNumber = normalizeDocNumber(draft.docNumber)
  const name = draft.name.trim()
  const empty = docNumber === '' && name === ''

  if (empty) {
    return { required, ok: !required, payload: null, docError: null, nameError: null }
  }
  const docError = isValidCustomerDoc(draft.docType, docNumber) ? null : 'Documento no válido'
  const nameError = name.length >= 2 && name.length <= 200 ? null : 'Escribe el nombre o la razón social'
  const ok = docError === null && nameError === null
  return {
    required,
    ok,
    payload: ok ? { docType: draft.docType, docNumber, name } : null,
    docError,
    nameError,
  }
}
