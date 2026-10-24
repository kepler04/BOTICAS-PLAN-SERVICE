import { toCsv, type CsvColumn } from '@/lib/csv'
import { formatDate, formatPEN } from '@/lib/format'
import { periodLabel } from '@/features/reports/lib/chartFormat'
import type {
  Granularity,
  SeriesPoint,
  SlowMover,
  TopProduct,
} from '@/features/reports/services/reportService'

/** Vista en tabla de un gráfico (su equivalente accesible). */
export type TableView = {
  headers: string[]
  rows: (string | number)[][]
}

// ---------------------------------------------------------------- Ventas en el tiempo
export function seriesToTable(points: SeriesPoint[], granularity: Granularity): TableView {
  return {
    headers: [granularity === 'day' ? 'Día' : 'Mes', 'Ventas', 'Total', 'IGV', 'Neto', 'Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Costo', 'Ganancia'],
    rows: points.map((p) => [
      periodLabel(p.period, granularity),
      p.salesCount,
      formatPEN(p.total),
      formatPEN(p.igv),
      formatPEN(p.net),
      formatPEN(p.cash),
      formatPEN(p.yape),
      formatPEN(p.plin),
      formatPEN(p.card),
      formatPEN(p.cost),
      formatPEN(p.profit),
    ]),
  }
}

export function seriesToCsv(points: SeriesPoint[], granularity: Granularity): string {
  const columns: CsvColumn<SeriesPoint>[] = [
    { header: granularity === 'day' ? 'Fecha' : 'Mes (primer día)', value: (p) => p.period },
    { header: 'N.º de ventas', value: (p) => p.salesCount },
    { header: 'Total cobrado (S/)', value: (p) => p.total },
    { header: 'IGV cobrado (S/)', value: (p) => p.igv },
    { header: 'Venta neta sin IGV (S/)', value: (p) => p.net },
    { header: 'Efectivo (S/)', value: (p) => p.cash },
    { header: 'Yape (S/)', value: (p) => p.yape },
    { header: 'Plin (S/)', value: (p) => p.plin },
    { header: 'Tarjeta (S/)', value: (p) => p.card },
    { header: 'Costo sin IGV (S/)', value: (p) => p.cost },
    { header: 'Ganancia estimada (S/)', value: (p) => p.profit },
  ]
  return toCsv(columns, points)
}

// ---------------------------------------------------------------- Más vendidos
export function topProductsToTable(items: TopProduct[]): TableView {
  return {
    headers: ['Producto', 'Unidades', 'Ventas', 'Neto', 'Costo', 'Ganancia', 'Margen'],
    rows: items.map((p) => [p.name, p.units, formatPEN(p.revenue), formatPEN(p.net), formatPEN(p.cost), formatPEN(p.profit), `${p.margin} %`]),
  }
}

export function topProductsToCsv(items: TopProduct[]): string {
  const columns: CsvColumn<TopProduct>[] = [
    { header: 'Producto', value: (p) => p.name },
    { header: 'Unidades vendidas', value: (p) => p.units },
    { header: 'Ventas cobradas (S/)', value: (p) => p.revenue },
    { header: 'Venta neta sin IGV (S/)', value: (p) => p.net },
    { header: 'Costo sin IGV (S/)', value: (p) => p.cost },
    { header: 'Ganancia estimada (S/)', value: (p) => p.profit },
    { header: 'Margen sobre venta neta (%)', value: (p) => p.margin },
  ]
  return toCsv(columns, items)
}

// ---------------------------------------------------------------- Baja rotación
export function slowMoversToCsv(items: SlowMover[], days: number): string {
  const columns: CsvColumn<SlowMover>[] = [
    { header: 'Producto', value: (p) => p.name },
    { header: 'Unidad', value: (p) => p.unitLabel },
    { header: 'Stock (unidades)', value: (p) => p.stockUnits },
    { header: 'Capital inmovilizado a costo (S/)', value: (p) => p.stockCost },
    { header: `Vendido en ${days} días (unidades)`, value: (p) => p.unitsSold },
    { header: 'Última venta', value: (p) => (p.lastSaleAt ? p.lastSaleAt.slice(0, 10) : '') },
  ]
  return toCsv(columns, items)
}

/** "Hace 12 días" / "Nunca vendido" a partir de la fecha de la última venta. */
export function lastSaleText(lastSaleAt: string | null, now: Date = new Date()): string {
  if (!lastSaleAt) return 'Nunca vendido'
  const days = Math.floor((now.getTime() - new Date(lastSaleAt).getTime()) / 86_400_000)
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 60) return `Hace ${days} días`
  return formatDate(lastSaleAt.slice(0, 10))
}
