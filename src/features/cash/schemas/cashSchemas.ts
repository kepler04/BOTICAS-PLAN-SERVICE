import { z } from 'zod'
import { parseMoney } from '@/lib/format'

const money = (empty: string) =>
  z
    .string()
    .trim()
    .refine((v) => v !== '', empty)
    .refine((v) => v === '' || parseMoney(v) !== null, 'Ingresa un monto válido, p. ej. 50 o 12.50')

export const openCashSchema = z.object({
  amount: money('Ingresa el efectivo con el que abres la caja (0 si no hay)'),
})
export type OpenCashValues = z.infer<typeof openCashSchema>

export const cashMovementSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: money('Ingresa el monto').refine((v) => v === '' || (parseMoney(v) ?? 0) > 0, 'El monto debe ser mayor a 0'),
  reason: z.string().trim().min(3, 'Escribe el motivo (mínimo 3 letras)').max(300, 'Máximo 300 caracteres'),
})
export type CashMovementValues = z.infer<typeof cashMovementSchema>

export const closeCashSchema = z.object({
  counted: money('Ingresa el efectivo que contaste'),
  notes: z.string().trim().max(300, 'Máximo 300 caracteres'),
})
export type CloseCashValues = z.infer<typeof closeCashSchema>
