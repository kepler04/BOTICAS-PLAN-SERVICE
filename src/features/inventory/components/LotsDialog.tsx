import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useIsAdmin } from '@/features/auth/hooks/useIsAdmin'
import { AdjustStockDialog } from '@/features/inventory/components/AdjustStockDialog'
import { ExpiryLabel } from '@/features/inventory/components/StockBadges'
import { useLots } from '@/features/inventory/hooks/useInventory'
import type { Lot, ProductRef } from '@/features/inventory/types'
import { formatStock } from '@/features/products/lib/presentations'
import { formatCost } from '@/lib/format'

type LotsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: ProductRef | null
}

/** Lotes con existencias de un producto, el que vence primero arriba (orden FEFO). */
export function LotsDialog({ open, onOpenChange, product }: LotsDialogProps) {
  const isAdmin = useIsAdmin()
  const lots = useLots(open && product ? product.id : null)
  const [adjusting, setAdjusting] = useState<Lot | null>(null)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lotes de {product?.name}</DialogTitle>
            <DialogDescription>
              Se venden primero los lotes que vencen antes (FEFO). Solo se muestran lotes con existencias.
            </DialogDescription>
          </DialogHeader>

          {lots.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {lots.isError ? <ErrorMessage message={lots.error.message} /> : null}
          {lots.isSuccess && lots.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este producto no tiene lotes con stock.</p>
          ) : null}

          {product && lots.isSuccess && lots.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Costo/unid.</TableHead>
                  {isAdmin ? <TableHead className="w-12" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.data.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">{lot.lot_code}</TableCell>
                    <TableCell className="whitespace-normal">
                      <ExpiryLabel date={lot.expiry_date} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-normal">
                      {formatStock(product, lot.quantity)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCost(lot.unit_cost)}</TableCell>
                    {isAdmin ? (
                      <TableCell>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setAdjusting(lot)}
                          aria-label={`Ajustar lote ${lot.lot_code}`}
                        >
                          <SlidersHorizontal aria-hidden="true" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </DialogContent>
      </Dialog>

      {isAdmin && product ? (
        <AdjustStockDialog
          open={adjusting !== null}
          onOpenChange={(next) => {
            if (!next) setAdjusting(null)
          }}
          product={product}
          lot={adjusting}
        />
      ) : null}
    </>
  )
}
