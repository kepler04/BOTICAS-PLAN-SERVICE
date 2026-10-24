import { describe, expect, it } from 'vitest'
import {
  lastSaleText,
  seriesToCsv,
  seriesToTable,
  slowMoversToCsv,
  topProductsToCsv,
} from '@/features/reports/lib/tables'
import type { SeriesPoint, SlowMover, TopProduct } from '@/features/reports/services/reportService'

const points: SeriesPoint[] = [
  { period: '2026-10-21', salesCount: 2, total: 30.8, igv: 4.7, net: 26.1, cash: 5, yape: 25.8, plin: 0, card: 0, cost: 18, profit: 8.1 },
  { period: '2026-10-22', salesCount: 0, total: 0, igv: 0, net: 0, cash: 0, yape: 0, plin: 0, card: 0, cost: 0, profit: 0 },
]

describe('tablas y CSV de reportes', () => {
  it('la tabla de ventas incluye todas las medidas por día', () => {
    const t = seriesToTable(points, 'day')
    expect(t.headers).toEqual(['Día', 'Ventas', 'Total', 'IGV', 'Neto', 'Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Costo', 'Ganancia'])
    expect(t.rows[0]![0]).toBe('21 oct 2026')
    expect(t.rows[0]![1]).toBe(2)
    expect(t.rows[1]![1]).toBe(0)
  })

  it('el CSV de ventas lleva números crudos y fecha ISO', () => {
    const csv = seriesToCsv(points, 'day')
    expect(csv).toContain('Fecha,N.º de ventas,Total cobrado (S/),IGV cobrado (S/)')
    expect(csv).toContain('2026-10-21,2,30.8,4.7,26.1,5,25.8,0,0,18,8.1')
  })

  it('el CSV de productos neutraliza fórmulas en el nombre', () => {
    const items: TopProduct[] = [
      { productId: '1', name: '=CMD|calc', units: 3, revenue: 10, net: 10, cost: 4, profit: 6, margin: 60 },
    ]
    const csv = topProductsToCsv(items)
    expect(csv).toContain("'=CMD|calc,3,10,10,4,6,60")
    expect(csv).not.toMatch(/\r\n=CMD/)
  })

  it('el CSV de baja rotación indica la ventana y deja vacía la última venta si nunca se vendió', () => {
    const items: SlowMover[] = [
      { productId: '1', name: 'Jarabe', unitLabel: 'frasco', stockUnits: 3, stockCost: 24, unitsSold: 0, lastSaleAt: null },
    ]
    const csv = slowMoversToCsv(items, 60)
    expect(csv).toContain('Vendido en 60 días (unidades)')
    expect(csv).toContain('Jarabe,frasco,3,24,0,\r\n')
  })

  it('texto de última venta', () => {
    const now = new Date('2026-10-22T12:00:00Z')
    expect(lastSaleText(null, now)).toBe('Nunca vendido')
    expect(lastSaleText('2026-10-22T08:00:00Z', now)).toBe('Hoy')
    expect(lastSaleText('2026-10-21T08:00:00Z', now)).toBe('Ayer')
    expect(lastSaleText('2026-10-10T08:00:00Z', now)).toBe('Hace 12 días')
    expect(lastSaleText('2026-01-10T08:00:00Z', now)).toBe('10/01/2026')
  })
})
