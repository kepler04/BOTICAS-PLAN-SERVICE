import type { Enums } from '@/types/database.types'

/**
 * IGV peruano. Los precios de venta al público YA INCLUYEN IGV; este módulo lo "extrae".
 * Debe dar EXACTAMENTE lo mismo que `private.igv_of` en la base de datos (hay vectores
 * compartidos en igv.test.ts y en supabase/tests/igv.test.sql). El servidor es quien manda:
 * esto es solo la vista previa del carrito.
 *
 * Tasa total 2026: IGV 15.5 % + IPM 2.5 % = 18 % (el IPM sube hasta 4 % en 2029 por la Ley 32387,
 * y el total se mantiene en 18 %).
 */
export type TaxAffectation = Enums<'tax_affectation'>

export const IGV_RATE_PERCENT = 18

export const AFFECTATION_LABELS: Record<TaxAffectation, string> = {
  gravado: 'Gravado (IGV 18 %)',
  exonerado: 'Exonerado',
  inafecto: 'Inafecto',
}

export const AFFECTATION_SHORT: Record<TaxAffectation, string> = {
  gravado: 'Gravado',
  exonerado: 'Exonerado',
  inafecto: 'Inafecto',
}

/**
 * IGV (en centavos) contenido en un monto en centavos con IGV incluido.
 * base = round(total / 1.18) con redondeo "half up" (igual que Postgres), igv = total - base.
 * Todo en enteros: sin errores de punto flotante.
 */
export function igvOfCents(grossCents: number, affectation: TaxAffectation, chargesIgv: boolean): number {
  if (!chargesIgv || affectation !== 'gravado') return 0
  // round_half_up(gross * 100 / 118) = floor((200 * gross + 118) / 236)   (118 = 100 + tasa)
  const divisor = 100 + IGV_RATE_PERCENT
  const baseCents = Math.floor((200 * grossCents + divisor) / (2 * divisor))
  return grossCents - baseCents
}

export type IgvBreakdown = {
  /** Base imponible de las operaciones gravadas (sin IGV). */
  gravado: number
  exonerado: number
  inafecto: number
  igv: number
  total: number
}

type TaxedLine = { taxAffectation: TaxAffectation; totalCents: number }

/** Desglose de un conjunto de líneas (centavos). Sin IGV (botica que no lo cobra) todo es "total". */
export function igvBreakdown(lines: TaxedLine[], chargesIgv: boolean): IgvBreakdown {
  const out: IgvBreakdown = { gravado: 0, exonerado: 0, inafecto: 0, igv: 0, total: 0 }
  for (const l of lines) {
    out.total += l.totalCents
    if (!chargesIgv) continue
    const igv = igvOfCents(l.totalCents, l.taxAffectation, true)
    out.igv += igv
    if (l.taxAffectation === 'gravado') out.gravado += l.totalCents - igv
    else if (l.taxAffectation === 'exonerado') out.exonerado += l.totalCents
    else out.inafecto += l.totalCents
  }
  return out
}

/** Costo SIN IGV a partir de un costo que lo incluye (el IGV de las compras es crédito fiscal, no costo). */
export function costWithoutIgv(costWithIgv: number): number {
  return costWithIgv / (1 + IGV_RATE_PERCENT / 100)
}
