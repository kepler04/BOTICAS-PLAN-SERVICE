import type { Product } from '@/features/products/types'
import type { CsvColumn } from '@/lib/csv'

/**
 * Lista de precios para el reporte mensual al Observatorio de Productos Farmacéuticos (DIGEMID).
 * El envío se hace en la plataforma de DIGEMID; este archivo reúne los datos que pide, con el código DIGEMID de
 * cada producto. Verifica el formato vigente de la plataforma antes de subirlo.
 */
export const PRICE_REPORT_COLUMNS: CsvColumn<Product>[] = [
  { header: 'Código DIGEMID', value: (p) => p.digemid_code },
  { header: 'Producto', value: (p) => p.name },
  { header: 'Principio activo', value: (p) => p.generic_name },
  { header: 'Concentración', value: (p) => p.concentration },
  { header: 'Laboratorio', value: (p) => p.laboratory },
  { header: 'Registro sanitario', value: (p) => p.sanitary_registry },
  { header: 'Unidad', value: (p) => p.unit_label },
  { header: 'Precio por unidad (S/)', value: (p) => p.price_unit.toFixed(2) },
  { header: 'Unidades por blíster', value: (p) => p.units_per_blister },
  { header: 'Precio por blíster (S/)', value: (p) => p.price_blister?.toFixed(2) },
  { header: 'Unidades por caja', value: (p) => p.units_per_box },
  { header: 'Precio por caja (S/)', value: (p) => p.price_box?.toFixed(2) },
]

/** Primero los que tienen código DIGEMID (los reportables), luego el resto; cada grupo por nombre. */
export function sortForPriceReport(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const ca = a.digemid_code ? 0 : 1
    const cb = b.digemid_code ? 0 : 1
    return ca - cb || a.name.localeCompare(b.name, 'es')
  })
}

export function missingDigemidCode(products: Product[]): number {
  return products.filter((p) => !p.digemid_code).length
}
