import { unitsPer, type PackSpec, type Presentation } from '@/features/products/lib/presentations'
import type { TaxAffectation } from '@/lib/igv'

/**
 * Carrito del POS. TODO el dinero se calcula en CENTAVOS enteros para evitar errores de
 * punto flotante (0.1 + 0.2). El servidor recalcula precios y total: esto es solo la vista previa.
 */
export type CartLine = PackSpec & {
  productId: string
  name: string
  presentation: Presentation
  quantity: number
  /** Precio de UNA presentación, en centavos. */
  unitPriceCents: number
  /** Stock vendible del producto (sin lotes vencidos), en unidades mínimas, al momento de agregarlo. */
  sellableUnits: number
  requiresPrescription: boolean
  taxAffectation: TaxAffectation
}

export function toCents(soles: number): number {
  return Math.round(soles * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

export function cartLineKey(line: Pick<CartLine, 'productId' | 'presentation'>): string {
  return `${line.productId}:${line.presentation}`
}

export function lineTotalCents(line: CartLine): number {
  return line.unitPriceCents * line.quantity
}

export function cartTotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotalCents(l), 0)
}

/** Agrega una unidad de la presentación; si ya existe esa línea, suma 1. */
export function addToCart(lines: CartLine[], item: Omit<CartLine, 'quantity'>): CartLine[] {
  const key = cartLineKey(item)
  const found = lines.find((l) => cartLineKey(l) === key)
  if (!found) return [...lines, { ...item, quantity: 1 }]
  return lines.map((l) => (cartLineKey(l) === key ? { ...l, quantity: l.quantity + 1, sellableUnits: item.sellableUnits } : l))
}

/** Cambia la cantidad de una línea. Cantidad < 1 la quita. */
export function setLineQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (!Number.isInteger(quantity) || quantity < 1) return lines.filter((l) => cartLineKey(l) !== key)
  return lines.map((l) => (cartLineKey(l) === key ? { ...l, quantity } : l))
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((l) => cartLineKey(l) !== key)
}

/** Unidades mínimas que el carrito pide de un producto (sumando todas sus presentaciones). */
export function requestedUnits(lines: CartLine[], productId: string): number {
  return lines
    .filter((l) => l.productId === productId)
    .reduce((sum, l) => sum + l.quantity * unitsPer(l, l.presentation), 0)
}

export type StockProblem = { productId: string; name: string; requested: number; available: number }

/** Productos del carrito que piden más de lo vendible. El servidor lo vuelve a validar. */
export function stockProblems(lines: CartLine[]): StockProblem[] {
  const seen = new Set<string>()
  const problems: StockProblem[] = []
  for (const l of lines) {
    if (seen.has(l.productId)) continue
    seen.add(l.productId)
    const requested = requestedUnits(lines, l.productId)
    if (requested > l.sellableUnits) {
      problems.push({ productId: l.productId, name: l.name, requested, available: l.sellableUnits })
    }
  }
  return problems
}

/** Cuántas unidades más de esta presentación caben todavía según el stock. */
export function remainingFor(lines: CartLine[], item: Omit<CartLine, 'quantity'>): number {
  const left = item.sellableUnits - requestedUnits(lines, item.productId)
  return Math.max(0, Math.floor(left / unitsPer(item, item.presentation)))
}

/** Vuelto en centavos; null si lo recibido no alcanza. */
export function changeCents(totalCents: number, receivedCents: number): number | null {
  return receivedCents >= totalCents ? receivedCents - totalCents : null
}

/** Billetes frecuentes para cobrar rápido: los que alcanzan para pagar, redondeados hacia arriba. */
export function quickCashOptions(totalCents: number): number[] {
  const bills = [1000, 2000, 5000, 10000, 20000].filter((b) => b >= totalCents)
  const options = new Set<number>()
  for (const b of bills) options.add(b)
  // Si el total supera los billetes, ofrece el siguiente múltiplo de 100 soles.
  if (options.size === 0) options.add(Math.ceil(totalCents / 10000) * 10000)
  return [...options].filter((c) => c !== totalCents).slice(0, 3)
}

/** Formato del comprobante interno: T001-000123. */
export function formatReceiptNumber(series: string, number: number): string {
  return `${series}-${String(number).padStart(6, '0')}`
}

/** Lo que se envía a la RPC: solo producto, presentación y cantidad (nunca precios). */
export function toSaleItems(lines: CartLine[]): { product_id: string; presentation: Presentation; quantity: number }[] {
  return lines.map((l) => ({ product_id: l.productId, presentation: l.presentation, quantity: l.quantity }))
}
