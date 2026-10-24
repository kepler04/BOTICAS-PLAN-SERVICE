import { z } from 'zod'

export const pharmacySettingsSchema = z.object({
  legalName: z.string().trim().min(2, 'Ingresa el nombre o razón social').max(200, 'El nombre es demasiado largo'),
  tradeName: z.string().trim().max(200, 'El nombre comercial es demasiado largo'),
  // Opcional; si se escribe debe ser un RUC peruano válido (11 dígitos, empieza con 10 o 20).
  ruc: z
    .string()
    .trim()
    .refine((v) => v === '' || /^(10|20)\d{9}$/.test(v), 'El RUC debe tener 11 dígitos y empezar con 10 o 20'),
  chargesIgv: z.boolean(),
})
export type PharmacySettingsValues = z.infer<typeof pharmacySettingsSchema>
