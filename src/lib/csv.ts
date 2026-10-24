/**
 * Exportación a CSV para Excel (Perú): separador `,`, saltos CRLF y BOM UTF-8 para que
 * Excel respete las tildes y la ñ.
 */
export type CsvColumn<T> = {
  header: string
  value: (row: T) => string | number | null | undefined
}

/**
 * Neutraliza la "inyección de fórmulas": si una celda de texto empieza con = + - @ (o tab/CR),
 * Excel la ejecuta como fórmula. Los nombres de producto los escribe el usuario, así que
 * se antepone un apóstrofo. Los números reales (incluso negativos) no se tocan.
 */
export function sanitizeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function escapeCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => escapeCell(sanitizeCell(c.header))).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(sanitizeCell(c.value(row)))).join(','))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** Descarga el CSV en el navegador. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
