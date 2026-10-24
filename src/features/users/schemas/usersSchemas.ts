import { z } from 'zod'

export const inviteUserSchema = z.object({
  fullName: z.string().trim().max(120, 'Máximo 120 caracteres'),
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa el correo electrónico')
    .pipe(z.email('Ingresa un correo electrónico válido')),
  role: z.enum(['cashier', 'admin']),
})
export type InviteUserValues = z.infer<typeof inviteUserSchema>

export const ROLE_LABELS = { admin: 'Administrador', cashier: 'Cajero' } as const
