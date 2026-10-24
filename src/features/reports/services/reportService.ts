import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import type { DateRange } from '@/features/reports/lib/dateRange'

export class ReportServiceError extends Error {}

const KNOWN: Record<string, string> = {
  forbidden: 'Solo el administrador puede ver los reportes.',
  invalid_range: 'El rango de fechas no es válido. Revisa las fechas (máximo ~3 años).',
  invalid_granularity: 'La agrupación del reporte no es válida.',
  invalid_order: 'El orden del reporte no es válido.',
  invalid_limit: 'El límite del reporte no es válido.',
}

function fail(error: unknown, fallback: string): never {
  throw new ReportServiceError(translateDbError(error, KNOWN, fallback))
}

export type Granularity = 'day' | 'month'

export type SeriesPoint = {
  /** "YYYY-MM-DD": el día, o el primer día del mes. */
  period: string
  salesCount: number
  total: number
  /** IGV cobrado (débito fiscal: no es ingreso). */
  igv: number
  /** Venta neta = total - IGV. */
  net: number
  cash: number
  yape: number
  plin: number
  card: number
  cost: number
  /** Ganancia bruta estimada = venta neta - costo. */
  profit: number
}

export type SalesSummary = {
  salesCount: number
  total: number
  igv: number
  net: number
  cost: number
  profit: number
  avgTicket: number
  voidedCount: number
  voidedTotal: number
}

export type TopProductOrder = 'revenue' | 'units' | 'profit'

export type TopProduct = {
  productId: string
  name: string
  units: number
  /** Lo cobrado (con IGV). */
  revenue: number
  /** Venta neta (sin IGV). */
  net: number
  cost: number
  profit: number
  /** Porcentaje (0–100) sobre la venta neta. */
  margin: number
}

export type SlowMover = {
  productId: string
  name: string
  unitLabel: string
  stockUnits: number
  stockCost: number
  unitsSold: number
  lastSaleAt: string | null
}

export type InventoryValue = {
  stockCost: number
  stockUnits: number
  productsWithStock: number
  expiredCost: number
  expiring30Cost: number
  expiring60Cost: number
  expiring90Cost: number
}

const n = (v: number | string | null | undefined) => Number(v ?? 0)

export const reportService = {
  async salesSeries(branchId: string, range: DateRange, granularity: Granularity): Promise<SeriesPoint[]> {
    const { data, error } = await supabase.rpc('report_sales_series', {
      p_branch: branchId,
      p_from: range.from,
      p_to: range.to,
      p_granularity: granularity,
    })
    if (error) fail(error, 'No se pudo cargar las ventas.')
    return (data ?? []).map((r) => ({
      period: r.period,
      salesCount: r.sales_count,
      total: n(r.total),
      igv: n(r.igv),
      net: n(r.net),
      cash: n(r.cash),
      yape: n(r.yape),
      plin: n(r.plin),
      card: n(r.card),
      cost: n(r.cost),
      profit: n(r.profit),
    }))
  },

  async salesSummary(branchId: string, range: DateRange): Promise<SalesSummary> {
    const { data, error } = await supabase.rpc('report_sales_summary', {
      p_branch: branchId,
      p_from: range.from,
      p_to: range.to,
    })
    if (error) fail(error, 'No se pudo cargar el resumen.')
    const r = data?.[0]
    return {
      salesCount: r?.sales_count ?? 0,
      total: n(r?.total),
      igv: n(r?.igv),
      net: n(r?.net),
      cost: n(r?.cost),
      profit: n(r?.profit),
      avgTicket: n(r?.avg_ticket),
      voidedCount: r?.voided_count ?? 0,
      voidedTotal: n(r?.voided_total),
    }
  },

  async topProducts(branchId: string, range: DateRange, order: TopProductOrder, limit: number): Promise<TopProduct[]> {
    const { data, error } = await supabase.rpc('report_top_products', {
      p_branch: branchId,
      p_from: range.from,
      p_to: range.to,
      p_limit: limit,
      p_order: order,
    })
    if (error) fail(error, 'No se pudo cargar los productos más vendidos.')
    return (data ?? []).map((r) => ({
      productId: r.product_id,
      name: r.name,
      units: n(r.units),
      revenue: n(r.revenue),
      net: n(r.net),
      cost: n(r.cost),
      profit: n(r.profit),
      margin: n(r.margin),
    }))
  },

  async slowMovers(branchId: string, days: number, limit: number): Promise<SlowMover[]> {
    const { data, error } = await supabase.rpc('report_slow_movers', {
      p_branch: branchId,
      p_days: days,
      p_limit: limit,
    })
    if (error) fail(error, 'No se pudo cargar los productos de baja rotación.')
    return (data ?? []).map((r) => ({
      productId: r.product_id,
      name: r.name,
      unitLabel: r.unit_label,
      stockUnits: n(r.stock_units),
      stockCost: n(r.stock_cost),
      unitsSold: n(r.units_sold),
      lastSaleAt: r.last_sale_at,
    }))
  },

  async inventoryValue(branchId: string): Promise<InventoryValue> {
    const { data, error } = await supabase.rpc('report_inventory_value', { p_branch: branchId })
    if (error) fail(error, 'No se pudo calcular el valor del inventario.')
    const r = data?.[0]
    return {
      stockCost: n(r?.stock_cost),
      stockUnits: n(r?.stock_units),
      productsWithStock: r?.products_with_stock ?? 0,
      expiredCost: n(r?.expired_cost),
      expiring30Cost: n(r?.expiring_30_cost),
      expiring60Cost: n(r?.expiring_60_cost),
      expiring90Cost: n(r?.expiring_90_cost),
    }
  },
}
