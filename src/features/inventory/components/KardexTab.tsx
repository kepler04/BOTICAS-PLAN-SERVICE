import { useId, useState } from 'react'
import { FileDown } from 'lucide-react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProductPicker } from '@/features/inventory/components/ProductPicker'
import { useKardex } from '@/features/inventory/hooks/useInventory'
import type { KardexRow } from '@/features/inventory/services/inventoryService'
import type { ProductRef } from '@/features/inventory/types'
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv'
import { formatCost, formatPEN, todayISO } from '@/lib/format'

const KIND_LABELS: Record<string, string> = {
  opening: 'Saldo inicial',
  entry: 'Entrada',
  adjustment: 'Ajuste',
  write_off: 'Merma',
  sale: 'Venta',
  sale_void: 'Anulación',
}

const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' })

const CSV_COLUMNS: CsvColumn<KardexRow>[] = [
  { header: 'Fecha', value: (r) => (r.kind === 'opening' ? '' : dateTime.format(new Date(r.movedAt))) },
  { header: 'Movimiento', value: (r) => KIND_LABELS[r.kind] ?? r.kind },
  { header: 'Documento / motivo', value: (r) => (r.kind === 'opening' ? '' : r.document) },
  { header: 'Lote', value: (r) => r.lotCode },
  { header: 'Entrada (u.)', value: (r) => r.quantityIn },
  { header: 'Salida (u.)', value: (r) => r.quantityOut },
  { header: 'Costo unitario sin IGV (S/)', value: (r) => r.unitCost },
  { header: 'Valor del movimiento (S/)', value: (r) => r.valueDelta?.toFixed(2) },
  { header: 'Saldo (u.)', value: (r) => r.balanceQuantity },
  { header: 'Saldo valorizado (S/)', value: (r) => r.balanceValue.toFixed(2) },
  { header: 'Usuario', value: (r) => r.createdBy },
]

const firstOfMonth = () => `${todayISO().slice(0, 8)}01`

/**
 * Kardex valorizado: cada movimiento de un producto con su saldo en unidades y en soles (al costo de cada lote,
 * sin IGV). Solo administradores (tiene costos).
 */
export function KardexTab() {
  const id = useId()
  const [product, setProduct] = useState<ProductRef | null>(null)
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(todayISO)
  const kardex = useKardex(product?.id ?? null, from, to)
  const rows = kardex.data ?? []
  const rangeError = from > to ? '“Desde” debe ser anterior o igual a “hasta”.' : null
  const last = rows.at(-1)

  if (!product) {
    return (
      <div className="max-w-xl space-y-2">
        <p className="text-sm text-muted-foreground">Elige un producto para ver todos sus movimientos con saldo y valor.</p>
        <ProductPicker onSelect={setProduct} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Producto</p>
          <p className="font-medium">{product.name}</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-from`} className="text-xs font-medium">
            Desde
          </label>
          <Input id={`${id}-from`} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-to`} className="text-xs font-medium">
            Hasta
          </label>
          <Input id={`${id}-to`} type="date" value={to} max={todayISO()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => setProduct(null)}>
          Cambiar producto
        </Button>
        <Button
          variant="outline"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(`kardex-${product.name.replace(/[^\w-]+/g, '-')}-${from}-a-${to}.csv`, toCsv(CSV_COLUMNS, rows))}
        >
          <FileDown aria-hidden="true" />
          CSV
        </Button>
      </div>

      {rangeError ? <ErrorMessage message={rangeError} /> : null}
      {kardex.isError ? <ErrorMessage message={kardex.error.message} /> : null}
      {kardex.isPending && !rangeError ? <Skeleton className="h-40 w-full" /> : null}

      {rows.length > 0 ? (
        <>
          <p className="text-sm" aria-live="polite">
            Saldo al cierre: <strong className="tabular-nums">{last?.balanceQuantity ?? 0} {product.unit_label}(s)</strong>{' '}
            valorizado en <strong className="tabular-nums">{formatPEN(last?.balanceValue ?? 0)}</strong> (sin IGV).
          </p>
          <div className="rounded-xl border bg-card">
            <Table aria-label={`Kardex de ${product.name}`}>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Movimiento</TableHead>
                  <TableHead className="text-right">Entrada</TableHead>
                  <TableHead className="text-right">Salida</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Costo u.</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Saldo S/</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i} className={r.kind === 'opening' ? 'bg-muted/40 font-medium' : undefined}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.kind === 'opening' ? '—' : dateTime.format(new Date(r.movedAt))}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {KIND_LABELS[r.kind] ?? r.kind}
                      {r.kind !== 'opening' ? (
                        <div className="text-xs text-muted-foreground">
                          {[r.document, r.lotCode ? `lote ${r.lotCode}` : null].filter(Boolean).join(' · ')}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantityIn ?? ''}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantityOut ?? ''}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {r.unitCost === null ? '' : formatCost(r.unitCost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.balanceQuantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPEN(r.balanceValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rows.length === 1 ? <p className="text-sm text-muted-foreground">Sin movimientos en este periodo.</p> : null}
        </>
      ) : null}
    </div>
  )
}
