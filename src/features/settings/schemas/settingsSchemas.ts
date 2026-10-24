import { z } from 'zod'
import { isValidRuc } from '@/lib/peruDocs'

export const pharmacySettingsSchema = z
  .object({
    legalName: z.string().trim().min(2, 'Ingresa el nombre o razón social').max(200, 'El nombre es demasiado largo'),
    tradeName: z.string().trim().max(200, 'El nombre comercial es demasiado largo'),
    // Opcional; si se escribe debe ser un RUC peruano válido (11 dígitos, empieza con 10 o 20).
    ruc: z
      .string()
      .trim()
      .refine((v) => v === '' || /^(10|20)\d{9}$/.test(v), 'El RUC debe tener 11 dígitos y empezar con 10 o 20'),
    chargesIgv: z.boolean(),
    fiscalAddress: z
      .string()
      .trim()
      .refine((v) => v === '' || (v.length >= 5 && v.length <= 200), 'Entre 5 y 200 caracteres'),
    ubigeo: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{6}$/.test(v), 'El ubigeo tiene 6 dígitos (p. ej. 150122)'),
    einvoiceEnabled: z.boolean(),
  })
  // Mismas condiciones que `reserve_einvoice`: sin ellas SUNAT no puede recibir el comprobante.
  .superRefine((v, ctx) => {
    if (!v.einvoiceEnabled) return
    if (!isValidRuc(v.ruc)) {
      ctx.addIssue({ code: 'custom', path: ['ruc'], message: 'Para emitir comprobantes electrónicos se necesita un RUC válido (con dígito verificador)' })
    }
    if (v.fiscalAddress === '') {
      ctx.addIssue({ code: 'custom', path: ['fiscalAddress'], message: 'Ingresa la dirección fiscal: va en el comprobante' })
    }
    if (!v.chargesIgv) {
      ctx.addIssue({ code: 'custom', path: ['einvoiceEnabled'], message: 'En esta versión la facturación electrónica requiere que la botica cobre IGV' })
    }
  })
export type PharmacySettingsValues = z.infer<typeof pharmacySettingsSchema>
