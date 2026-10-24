import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { Input } from '@/components/ui/input'
import { useVoidSale } from '@/features/sales/hooks/useSales'

type VoidSaleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: string
  receiptLabel: string
  onVoided: () => void
}

export function VoidSaleDialog({ open, onOpenChange, saleId, receiptLabel, onVoided }: VoidSaleDialogProps) {
  const voidSale = useVoidSale()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setError(null)
    if (reason.trim().length < 3) {
      setError('Escribe el motivo (mínimo 3 letras).')
      return
    }
    try {
      await voidSale.mutateAsync({ id: saleId, reason: reason.trim() })
      toast.success('Venta anulada. El stock volvió al inventario.')
      setReason('')
      onVoided()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular la venta.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular venta {receiptLabel}</DialogTitle>
          <DialogDescription>
            El stock vuelve a los lotes de donde salió y la venta deja de sumar a la caja. Solo se puede anular mientras la caja de esa venta siga abierta.
          </DialogDescription>
        </DialogHeader>
        {error ? <ErrorMessage message={error} /> : null}
        <div className="space-y-2">
          <label htmlFor="void-reason" className="text-sm font-medium">
            Motivo
          </label>
          <Input id="void-reason" value={reason} maxLength={300} placeholder="Ej.: error de cobro, cliente devolvió" onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={voidSale.isPending}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={voidSale.isPending}>
            {voidSale.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Anular venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
