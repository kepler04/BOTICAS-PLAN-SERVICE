import { z } from 'zod'
import {
  computeLine,
  MAX_ITEMS,
  validateHeader,
  type PurchaseDocType,
  type PurchaseLineDraft,
} from '@/features/purchases/lib/purchase'
import { todayISO } from '@/lib/format'

export type PurchaseFormValues = {
  supplierId: string
  docType: PurchaseDocType
  docNumber: string
  issueDate: string
  /** Los costos escritos incluyen IGV (se guardan sin IGV). */
  includesIgv: boolean
  note: string
  lines: PurchaseLineDraft[]
}

export function emptyPurchase(): PurchaseFormValues {
  return { supplierId: '', docType: 'invoice', docNumber: '', issueDate: todayISO(), includesIgv: true, note: '', lines: [] }
}

const docTypes = ['invoice', 'receipt', 'guide', 'other'] as const

/**
 * Esquema del formulario de compra. Las reglas viven en `lib/purchase` (probadas y alineadas con
 * `register_purchase`); aquí solo se traducen a errores por campo para react-hook-form.
 */
export const purchaseSchema = z
  .object({
    supplierId: z.string(),
    docType: z.enum(docTypes),
    docNumber: z.string(),
    issueDate: z.string(),
    includesIgv: z.boolean(),
    note: z.string().trim().max(300, 'Máximo 300 caracteres'),
    lines: z.array(z.custom<PurchaseLineDraft>()).max(MAX_ITEMS, `Máximo ${MAX_ITEMS} productos por compra`),
  })
  .superRefine((v, ctx) => {
    const header = validateHeader(v)
    for (const [path, message] of Object.entries(header)) ctx.addIssue({ code: 'custom', path: [path], message })
    if (v.lines.length === 0) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Agrega al menos un producto.' })
    v.lines.forEach((line, i) => {
      for (const [path, message] of Object.entries(computeLine(line, v.includesIgv).errors)) {
        ctx.addIssue({ code: 'custom', path: ['lines', i, path], message })
      }
    })
  })
