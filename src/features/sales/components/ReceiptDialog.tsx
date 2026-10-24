import { Printer } from 'lucide-react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ReceiptPrintPortal, ReceiptView } from '@/features/sales/components/ReceiptView'
import { useReceiptHeader, useSale } from '@/features/sales/hooks/useSales'

type ReceiptDialogProps = {
  saleId: string | null
  onOpenChange: (open: boolean) => void
  /** Botones extra (p. ej. "Nueva venta" o "Anular"). */
  footer?: React.ReactNode
  title?: string
}

export function ReceiptDialog({ saleId, onOpenChange, footer, title = 'Comprobante' }: ReceiptDialogProps) {
  const sale = useSale(saleId)
  const header = useReceiptHeader()

  return (
    <Dialog open={saleId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Comprobante interno de prueba.</DialogDescription>
        </DialogHeader>

        {sale.isPending ? <Skeleton className="h-64 w-full" /> : null}
        {sale.isError ? <ErrorMessage message={sale.error.message} /> : null}
        {sale.isSuccess ? (
          <>
            <div className="rounded-lg border bg-white">
              <ReceiptView sale={sale.data} header={header.data} />
            </div>
            {/* Para imprimir: copia fuera del diálogo. */}
            <ReceiptPrintPortal sale={sale.data} header={header.data} />
          </>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={!sale.isSuccess} onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            Imprimir
          </Button>
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
