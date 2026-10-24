import { describe, expect, it } from 'vitest'
import { sanitizeCell, toCsv, type CsvColumn } from '@/lib/csv'

type Row = { name: string; total: number | null }
const columns: CsvColumn<Row>[] = [
  { header: 'Producto', value: (r) => r.name },
  { header: 'Total', value: (r) => r.total },
]

describe('csv', () => {
  it('genera encabezado y filas con BOM y CRLF', () => {
    const csv = toCsv(columns, [{ name: 'Paracetamol', total: 12.5 }])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toBe('﻿Producto,Total\r\nParacetamol,12.5\r\n')
  })

  it('escapa comas, comillas y saltos de línea', () => {
    const csv = toCsv(columns, [{ name: 'Jarabe "forte", 120 ml\nlote', total: 1 }])
    expect(csv).toContain('"Jarabe ""forte"", 120 ml\nlote",1')
  })

  it('conserva tildes y la ñ', () => {
    expect(toCsv(columns, [{ name: 'Ácido fólico Peñaranda', total: 0 }])).toContain('Ácido fólico Peñaranda')
  })

  it('neutraliza inyección de fórmulas en texto', () => {
    expect(sanitizeCell('=HYPERLINK("http://malo")')).toBe(`'=HYPERLINK("http://malo")`)
    expect(sanitizeCell('+1+1')).toBe("'+1+1")
    expect(sanitizeCell('-2')).toBe("'-2")
    expect(sanitizeCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(sanitizeCell('\tx')).toBe("'\tx")
  })

  it('no altera textos normales ni números (incluso negativos)', () => {
    expect(sanitizeCell('Paracetamol 500 mg')).toBe('Paracetamol 500 mg')
    expect(sanitizeCell(-5.5)).toBe('-5.5')
    expect(sanitizeCell(0)).toBe('0')
  })

  it('celdas vacías y no finitas quedan en blanco', () => {
    expect(sanitizeCell(null)).toBe('')
    expect(sanitizeCell(undefined)).toBe('')
    expect(sanitizeCell(Number.NaN)).toBe('')
    expect(toCsv(columns, [{ name: 'X', total: null }])).toContain('X,\r\n')
  })
})
