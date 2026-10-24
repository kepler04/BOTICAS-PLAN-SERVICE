import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { SelectField } from '@/components/common/SelectField'
import { TextField } from '@/components/common/TextField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAdjustStock } from '@/features/inventory/hooks/useInventory'
import {
  ADJUST_KIND_LABELS,
  adjustKinds,
  computeAdjustment,
  stockAdjustSchema,
  type StockAdjustValues,
} from '@/features/inventory/schemas/stockSchemas'
import type { Lot, ProductRef } from '@/features/inventory/types'
import {
  availablePresentations,
  formatStock,
  presentationOptionLabel,
} from '@/features/products/lib/presentations'
import { formatDate } from '@/lib/format'

type AdjustStockDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: ProductRef
  lot: Lot | null
}

export function AdjustStockDialog({ open, onOpenChange, product, lot }: AdjustStockDialogProps) {
  return (
    <Dialog open={open && lot !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustar stock del lote</DialogTitle>
          <DialogDescription>
            {product.name}
            {lot ? ` · Lote ${lot.lot_code} · vence ${formatDate(lot.expiry_date)}` : null}
          </DialogDescription>
        </DialogHeader>
        {lot ? <AdjustForm key={lot.id} product={product} lot={lot} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AdjustForm({ product, lot, onDone }: { product: ProductRef; lot: Lot; onDone: () => void }) {
  const adjust = useAdjustStock()
  const [serverError, setServerError] = useState<string | null>(null)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const presentations = availablePresentations(product)

  const { control, handleSubmit, formState } = useForm<StockAdjustValues>({
    resolver: zodResolver(stockAdjustSchema),
    defaultValues: { kind: 'writeoff', presentation: 'unit', quantity: '', reason: '' },
  })
  const values = useWatch({ control }) as StockAdjustValues
  const submitting = formState.isSubmitting
  const preview = computeAdjustment(product, values)
  const after = preview ? lot.quantity + preview.delta : null

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null)
    const computed = computeAdjustment(product, v)
    if (!computed) {
      setServerError('La cantidad es demasiado grande.')
      return
    }
    if (lot.quantity + computed.delta < 0) {
      setServerError(`El lote solo tiene ${formatStock(product, lot.quantity)}. No puedes restar más.`)
      return
    }
    try {
      await adjust.mutateAsync({
        lotId: lot.id,
        delta: computed.delta,
        type: computed.type,
        reason: v.reason,
        idempotencyKey,
      })
      toast.success('Stock ajustado.')
      onDone()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo ajustar el stock.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage title="No se pudo ajustar" message={serverError} /> : null}
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        Stock actual del lote: <strong>{formatStock(product, lot.quantity)}</strong>
      </p>

      <SelectField
        control={control}
        name="kind"
        label="Tipo de ajuste"
        options={adjustKinds.map((k) => ({ value: k, label: ADJUST_KIND_LABELS[k] }))}
        disabled={submitting}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name="presentation"
          label="Contar en"
          options={presentations.map((p) => ({ value: p, label: presentationOptionLabel(product, p) }))}
          disabled={submitting}
        />
        <TextField control={control} name="quantity" label="Cantidad" inputMode="numeric" disabled={submitting} />
      </div>
      <TextField
        control={control}
        name="reason"
        label="Motivo"
        placeholder="Ej.: producto dañado, conteo físico, vencido…"
        maxLength={300}
        disabled={submitting}
      />

      {after !== null ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${after < 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted'}`}
          aria-live="polite"
        >
          {after < 0 ? 'No alcanza: el lote quedaría en negativo.' : (
            <>
              El lote quedará con <strong>{formatStock(product, after)}</strong>.
            </>
          )}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || (after !== null && after < 0)}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {submitting ? 'Guardando…' : 'Confirmar ajuste'}
        </Button>
      </DialogFooter>
    </form>
  )
}
