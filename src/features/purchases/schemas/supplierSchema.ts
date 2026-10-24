import { z } from 'zod'
import { isValidRuc } from '@/lib/peruDocs'
import type { Supplier, SupplierPayload } from '@/features/purchases/services/purchasesService'

export const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa el nombre o la razón social').max(200, 'Máximo 200 caracteres'),
  ruc: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidRuc(v), 'RUC no válido: 11 dígitos con dígito verificador correcto'),
  phone: z.string().trim().max(30, 'Máximo 30 caracteres'),
  email: z
    .string()
    .trim()
    .max(254, 'Máximo 254 caracteres')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Correo no válido'),
})
export type SupplierValues = z.infer<typeof supplierSchema>

export const EMPTY_SUPPLIER: SupplierValues = { name: '', ruc: '', phone: '', email: '' }

const orNull = (v: string) => (v.trim() === '' ? null : v.trim())

export function toSupplierPayload(v: SupplierValues): SupplierPayload {
  return { name: v.name.trim(), ruc: orNull(v.ruc), phone: orNull(v.phone), email: orNull(v.email) }
}

export function supplierToValues(s: Supplier): SupplierValues {
  return { name: s.name, ruc: s.ruc ?? '', phone: s.phone ?? '', email: s.email ?? '' }
}
