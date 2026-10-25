import { useState } from 'react'
import { FileMinus, Loader2 } from 'lucide-react'
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
import { useCreditNote, useEinvoice, useIssueCreditNote } from '@/features/einvoice/hooks/useEinvoice'
import { useVoidSale } from '@/features/sales/hooks/useSales'

type VoidSaleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: string
  receiptLabel: string
  onVoided: () => void
}

/**
 * Anular una venta. Si SUNAT ya aceptó su boleta o factura, anular exige una NOTA DE CRÉDITO: se emite y envía
 * primero, y la venta solo se anula si SUNAT la acepta (ADR 078).
 */
export function VoidSaleDialog({ open, onOpenChange, saleId, receiptLabel, onVoided }: VoidSaleDialogProps) {
  const voidSale = useVoidSale()
  const issueCreditNote = useIssueCreditNote()
  const einvoice = useEinvoice(saleId)
  const creditNote = useCreditNote(saleId)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const accepted = einvoice.data && (einvoice.data.status === 'accepted' || einvoice.data.status === 'observed') ? einvoice.data : null
  const pending = voidSale.isPending || issueCreditNote.isPending
  const previous = creditNote.data

  async function handleConfirm() {
    setError(null)
    if (reason.trim().length < 3 && !previous) {
      setError('Escribe el motivo (mínimo 3 letras).')
      return
    }
    try {
      if (!accepted) {
        await voidSale.mutateAsync({ id: saleId, reason: reason.trim() })
        toast.success('Venta anulada. El stock volvió al inventario.')
      } else {
        const r = await issueCreditNote.mutateAsync({ saleId, reason: reason.trim() || (previous?.reason ?? '') })
        const label = `${r.creditNote.series}-${r.creditNote.number}`
        if (r.saleVoided) {
          toast.success(`Nota de crédito ${label} aceptada por SUNAT. Venta anulada y stock devuelto.`)
        } else if (r.creditNote.status === 'accepted' || r.creditNote.status === 'observed') {
          setError(`SUNAT aceptó la nota de crédito ${label}, pero la venta no se pudo anular: ${r.voidError ?? 'inténtalo de nuevo'}.`)
          return
        } else {
          setError(
            r.creditNote.status === 'rejected'
              ? `SUNAT rechazó la nota de crédito ${label}: ${r.creditNote.sunatDescription ?? ''}. La venta sigue vigente.`
              : `No se pudo enviar la nota de crédito ${label} a SUNAT. La venta sigue vigente; puedes reintentar.`,
          )
          return
        }
      }
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
        {accepted ? (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="note">
            <FileMinus className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              SUNAT ya aceptó la {accepted.docType === '01' ? 'factura' : 'boleta'} <strong>{accepted.series}-{accepted.number}</strong>. Para anularla se
              emitirá una <strong>nota de crédito</strong> ({accepted.docType === '01' ? 'FC01' : 'BC01'}, anulación de la operación).{' '}
              <strong>La venta solo se anula si SUNAT acepta la nota.</strong>
              {previous ? ` Ya existe la nota ${previous.series}-${previous.number}: se reintentará con ella.` : ''}
            </p>
          </div>
        ) : null}
        {error ? <ErrorMessage message={error} /> : null}
        <div className="space-y-2">
          <label htmlFor="void-reason" className="text-sm font-medium">
            Motivo
          </label>
          <Input
            id="void-reason"
            value={reason}
            maxLength={accepted ? 250 : 300}
            placeholder={previous?.reason ?? 'Ej.: error de cobro, cliente devolvió'}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={pending || einvoice.isPending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {accepted ? (issueCreditNote.isPending ? 'Enviando a SUNAT…' : 'Emitir nota de crédito y anular') : 'Anular venta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
