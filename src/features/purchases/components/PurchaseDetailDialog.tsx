import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePurchase } from '@/features/purchases/hooks/usePurchases'
import { DOC_TYPE_LABELS } from '@/features/purchases/lib/purchase'
import { formatCost, formatDate, formatPEN } from '@/lib/format'

type Props = { purchaseId: string | null; onOpenChange: (open: boolean) => void }

export function PurchaseDetailDialog({ purchaseId, onOpenChange }: Props) {
  const purchase = usePurchase(purchaseId)
  const p = purchase.data

  return (
    <Dialog open={purchaseId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{p ? `${DOC_TYPE_LABELS[p.doc_type]} ${p.doc_number}` : 'Compra'}</DialogTitle>
          <DialogDescription>
            {p
              ? `${p.suppliers?.name ?? '—'} · emitida el ${formatDate(p.issue_date)} · registró ${p.profiles?.full_name ?? '—'}`
              : 'Cargando…'}
          </DialogDescription>
        </DialogHeader>
        {purchase.isPending ? <Skeleton className="h-40 w-full" /> : null}
        {purchase.isError ? <ErrorMessage message={purchase.error.message} /> : null}
        {p ? (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo c/u</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.purchase_items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-normal">{i.product_name}</TableCell>
                    <TableCell className="whitespace-normal text-xs">
                      {i.lot_code}
                      <div className="text-muted-foreground">{i.expiry_date ? `Vence ${formatDate(i.expiry_date)}` : 'No vence'}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCost(i.unit_cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPEN(i.line_subtotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <dl className="ml-auto w-full max-w-xs space-y-1 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt>Subtotal (sin IGV)</dt>
                <dd>{formatPEN(p.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>IGV (estimado)</dt>
                <dd>{formatPEN(p.igv)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{formatPEN(p.total ?? p.subtotal + p.igv)}</dd>
              </div>
            </dl>
            {p.note ? <p className="text-sm text-muted-foreground">Nota: {p.note}</p> : null}
            <p className="text-xs text-muted-foreground">
              Cantidades en unidad mínima y costos sin IGV. Para corregir una compra, usa un ajuste de stock con motivo.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
