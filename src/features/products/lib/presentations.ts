/**
 * Modelo de unidades: el stock siempre se guarda en la unidad mínima (tableta, frasco...).
 * Blíster y caja son solo formas de contar/vender: "unidades por blíster/caja".
 */
export type Presentation = 'unit' | 'blister' | 'box'

export type PackSpec = {
  unit_label: string
  units_per_blister: number | null
  units_per_box: number | null
}

export const PRESENTATION_LABELS: Record<Presentation, string> = {
  unit: 'Unidad',
  blister: 'Blíster',
  box: 'Caja',
}

/** Presentaciones que el producto realmente tiene definidas (la unidad siempre existe). */
export function availablePresentations(pack: PackSpec): Presentation[] {
  const list: Presentation[] = ['unit']
  if (pack.units_per_blister) list.push('blister')
  if (pack.units_per_box) list.push('box')
  return list
}

/** Cuántas unidades mínimas trae una presentación. */
export function unitsPer(pack: PackSpec, presentation: Presentation): number {
  if (presentation === 'blister') return pack.units_per_blister ?? 1
  if (presentation === 'box') return pack.units_per_box ?? 1
  return 1
}

/** Convierte "3 cajas" a unidades mínimas. Devuelve null si la cantidad no es un entero positivo. */
export function toBaseUnits(pack: PackSpec, presentation: Presentation, quantity: number): number | null {
  if (!Number.isInteger(quantity) || quantity <= 0) return null
  return quantity * unitsPer(pack, presentation)
}

/** Nombre de la presentación para la UI, p. ej. "Caja (100 tabletas)". */
export function presentationOptionLabel(pack: PackSpec, presentation: Presentation): string {
  if (presentation === 'unit') return `Unidad (${pack.unit_label})`
  const n = unitsPer(pack, presentation)
  return `${PRESENTATION_LABELS[presentation]} (${n} ${pluralize(pack.unit_label, n)})`
}

/** Plural simple en español para el nombre de la unidad (tableta -> tabletas, unidad -> unidades, ml -> ml). */
export function pluralize(label: string, n: number): string {
  if (n === 1) return label
  const last = label.trim().slice(-1).toLowerCase()
  if ('aeiouáéíóú'.includes(last)) return `${label}s`
  if ('dnrz'.includes(last) && label.trim().length > 3) return `${label}es`
  return label
}

/**
 * Stock legible: 237 con caja=100 y blíster=10 -> "2 cajas, 3 blísters, 7 tabletas".
 * Con 0 devuelve "0 tabletas".
 */
export function formatStock(pack: PackSpec, baseQuantity: number): string {
  if (baseQuantity <= 0) return `0 ${pluralize(pack.unit_label, 0)}`
  let rest = baseQuantity
  const parts: string[] = []

  if (pack.units_per_box) {
    const boxes = Math.floor(rest / pack.units_per_box)
    if (boxes > 0) parts.push(`${boxes} ${boxes === 1 ? 'caja' : 'cajas'}`)
    rest -= boxes * pack.units_per_box
  }
  if (pack.units_per_blister) {
    const blisters = Math.floor(rest / pack.units_per_blister)
    if (blisters > 0) parts.push(`${blisters} ${blisters === 1 ? 'blíster' : 'blísters'}`)
    rest -= blisters * pack.units_per_blister
  }
  if (rest > 0) parts.push(`${rest} ${pluralize(pack.unit_label, rest)}`)

  return parts.join(', ')
}
