import { z } from 'zod'
import { addDaysISO, parseInteger, parseMoney, todayISO } from '@/lib/format'
import { costWithoutIgv } from '@/lib/igv'
import { toBaseUnits, unitsPer, type PackSpec, type Presentation } from '@/features/products/lib/presentations'

/** Tope por movimiento: coincide con la validación de la BD (1 000 000 de unidades mínimas). */
export const MAX_MOVEMENT_UNITS = 1_000_000
const MAX_EXPIRY_YEARS = 15

const presentation = z.enum(['unit', 'blister', 'box'])
const isoDate = /^\d{4}-\d{2}-\d{2}$/

// ---------------------------------------------------------------- Entrada
export const stockEntrySchema = z
  .object({
    presentation,
    quantity: z.string().trim(),
    lotCode: z.string().trim().min(1, 'Ingresa el número de lote').max(60, 'Máximo 60 caracteres'),
    noExpiry: z.boolean(),
    expiryDate: z.string().trim(),
    cost: z.string().trim(),
    /** El costo ingresado incluye IGV: se guarda sin IGV (el IGV de las compras es crédito fiscal). */
    costIncludesIgv: z.boolean(),
    reason: z.string().trim().max(300, 'Máximo 300 caracteres'),
  })
  .superRefine((v, ctx) => {
    const fail = (path: keyof StockEntryValues, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })

    const qty = parseInteger(v.quantity)
    if (qty === null || qty < 1) fail('quantity', 'Ingresa una cantidad entera mayor a 0')
    if (parseMoney(v.cost) === null) fail('cost', 'Ingresa un costo válido, p. ej. 12.50 (0 si fue gratis)')

    if (!v.noExpiry) {
      if (!isoDate.test(v.expiryDate)) {
        fail('expiryDate', 'Ingresa la fecha de vencimiento')
      } else if (v.expiryDate < todayISO()) {
        fail('expiryDate', 'Ese lote ya venció: no se puede ingresar')
      } else if (v.expiryDate > addDaysISO(365 * MAX_EXPIRY_YEARS)) {
        fail('expiryDate', 'La fecha de vencimiento es demasiado lejana')
      }
    }
  })
export type StockEntryValues = z.infer<typeof stockEntrySchema>

export type EntryComputation = {
  /** Cantidad total en unidades mínimas. */
  quantity: number
  /** Costo por unidad mínima. */
  unitCost: number
}

/** Calcula cantidad y costo en unidad mínima a partir de valores YA validados. Devuelve null si excede el tope. */
export function computeEntry(pack: PackSpec, v: StockEntryValues): EntryComputation | null {
  const qty = parseInteger(v.quantity)
  const cost = parseMoney(v.cost)
  if (qty === null || cost === null) return null
  const base = toBaseUnits(pack, v.presentation as Presentation, qty)
  if (base === null || base > MAX_MOVEMENT_UNITS) return null
  const net = v.costIncludesIgv ? costWithoutIgv(cost) : cost
  return { quantity: base, unitCost: net / unitsPer(pack, v.presentation as Presentation) }
}

// ---------------------------------------------------------------- Ajuste
export const adjustKinds = ['writeoff', 'remove', 'add'] as const
export type AdjustKind = (typeof adjustKinds)[number]

export const ADJUST_KIND_LABELS: Record<AdjustKind, string> = {
  writeoff: 'Merma (vencido, dañado, perdido) — resta',
  remove: 'Corrección de conteo — resta',
  add: 'Corrección de conteo — suma',
}

export const stockAdjustSchema = z
  .object({
    kind: z.enum(adjustKinds),
    presentation,
    quantity: z.string().trim(),
    reason: z.string().trim().min(3, 'Escribe el motivo (mínimo 3 letras)').max(300, 'Máximo 300 caracteres'),
  })
  .superRefine((v, ctx) => {
    const qty = parseInteger(v.quantity)
    if (qty === null || qty < 1) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Ingresa una cantidad entera mayor a 0' })
    }
  })
export type StockAdjustValues = z.infer<typeof stockAdjustSchema>

export type AdjustComputation = {
  delta: number
  type: 'adjustment' | 'write_off'
}

/** Convierte el formulario (ya validado) a delta con signo y tipo de movimiento. */
export function computeAdjustment(pack: PackSpec, v: StockAdjustValues): AdjustComputation | null {
  const qty = parseInteger(v.quantity)
  if (qty === null) return null
  const base = toBaseUnits(pack, v.presentation as Presentation, qty)
  if (base === null || base > MAX_MOVEMENT_UNITS) return null
  if (v.kind === 'add') return { delta: base, type: 'adjustment' }
  if (v.kind === 'remove') return { delta: -base, type: 'adjustment' }
  return { delta: -base, type: 'write_off' }
}
