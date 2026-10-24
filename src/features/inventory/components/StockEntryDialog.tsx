import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Skeleton } from '@/components/ui/skeleton'
import { SelectField } from '@/components/common/SelectField'
import { SwitchField } from '@/components/common/SwitchField'
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
import { ProductPicker } from '@/features/inventory/components/ProductPicker'
import { useActiveBranchId, useRegisterEntry } from '@/features/inventory/hooks/useInventory'
import {
  computeEntry,
  stockEntrySchema,
  type StockEntryValues,
} from '@/features/inventory/schemas/stockSchemas'
import type { ProductRef } from '@/features/inventory/types'
import {
  availablePresentations,
  formatStock,
  presentationOptionLabel,
  type Presentation,
} from '@/features/products/lib/presentations'
import { formatCost } from '@/lib/format'
import { usePharmacySettings } from '@/features/settings/hooks/useSettings'

type StockEntryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si viene, se salta la búsqueda de producto. */
  product?: ProductRef | null
}

export function StockEntryDialog({ open, onOpenChange, product }: StockEntryDialogProps) {
  const [picked, setPicked] = useState<ProductRef | null>(null)
  const current = product ?? picked

  function handleOpenChange(next: boolean) {
    if (!next) setPicked(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar entrada de stock</DialogTitle>
          <DialogDescription>
            {current ? current.name : 'Elige el producto que recibiste.'}
          </DialogDescription>
        </DialogHeader>
        {current ? (
          <EntryForm
            key={current.id}
            product={current}
            onBack={product ? undefined : () => setPicked(null)}
            onDone={() => handleOpenChange(false)}
          />
        ) : (
          <ProductPicker onSelect={setPicked} />
        )}
      </DialogContent>
    </Dialog>
  )
}

type EntryFormProps = {
  product: ProductRef
  onBack?: () => void
  onDone: () => void
}

/**
 * Espera la configuración de la botica ANTES de montar el formulario: el valor por defecto del interruptor
 * "el costo incluye IGV" depende de ella y useForm solo lee los valores por defecto en el primer render.
 */
function EntryForm(props: EntryFormProps) {
  const settings = usePharmacySettings()
  if (settings.isPending) return <Skeleton className="h-64 w-full" />
  const showIgvToggle = Boolean(settings.data?.chargesIgv) && (props.product.tax_affectation ?? 'gravado') === 'gravado'
  return <EntryFormBody {...props} showIgvToggle={showIgvToggle} />
}

function EntryFormBody({
  product,
  onBack,
  onDone,
  showIgvToggle,
}: EntryFormProps & { showIgvToggle: boolean }) {
  const branchId = useActiveBranchId()
  const register = useRegisterEntry()
  const [serverError, setServerError] = useState<string | null>(null)
  // Misma clave en los reintentos de este formulario: evita sumar dos veces el mismo ingreso.
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const presentations = availablePresentations(product)

  const { control, handleSubmit, formState } = useForm<StockEntryValues>({
    resolver: zodResolver(stockEntrySchema),
    defaultValues: {
      presentation: presentations.includes('box') ? 'box' : presentations.includes('blister') ? 'blister' : 'unit',
      quantity: '',
      lotCode: '',
      noExpiry: false,
      expiryDate: '',
      cost: '',
      costIncludesIgv: showIgvToggle,
      reason: '',
    },
  })
  const values = useWatch({ control }) as StockEntryValues
  const noExpiry = values.noExpiry
  const submitting = formState.isSubmitting
  const preview = computeEntry(product, { ...values, costIncludesIgv: showIgvToggle && values.costIncludesIgv })

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null)
    const computed = computeEntry(product, { ...v, costIncludesIgv: showIgvToggle && v.costIncludesIgv })
    if (!computed) {
      setServerError('La cantidad es demasiado grande. Registra la entrada en partes más pequeñas.')
      return
    }
    if (!branchId) {
      setServerError('No se pudo identificar la sucursal. Recarga la página.')
      return
    }
    try {
      await register.mutateAsync({
        branchId,
        productId: product.id,
        lotCode: v.lotCode,
        expiryDate: v.noExpiry ? null : v.expiryDate,
        quantity: computed.quantity,
        unitCost: computed.unitCost,
        reason: v.reason || null,
        idempotencyKey,
      })
      toast.success(`Entrada registrada: ${formatStock(product, computed.quantity)}.`)
      onDone()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo registrar la entrada.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage title="No se pudo registrar" message={serverError} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {presentations.length > 1 ? (
          <SelectField
            control={control}
            name="presentation"
            label="Llegó en"
            options={presentations.map((p: Presentation) => ({
              value: p,
              label: presentationOptionLabel(product, p),
            }))}
            disabled={submitting}
          />
        ) : null}
        <TextField control={control} name="quantity" label="Cantidad" inputMode="numeric" placeholder="3" disabled={submitting} />
        <TextField control={control} name="lotCode" label="N.º de lote" placeholder="L-2026-001" disabled={submitting} />
        <TextField
          control={control}
          name="cost"
          label={`Costo por ${presentations.length > 1 ? 'presentación' : product.unit_label} (S/)`}
          inputMode="decimal"
          placeholder="40.00"
          disabled={submitting}
        />
      </div>

      {showIgvToggle ? (
        <SwitchField
          control={control}
          name="costIncludesIgv"
          label="El costo que ingresé incluye IGV (18 %)"
          description="Se guarda el costo sin IGV: el IGV de tus compras es crédito fiscal, no costo. Así la ganancia sale correcta."
          disabled={submitting}
        />
      ) : null}

      <SwitchField control={control} name="noExpiry" label="Este producto no vence" disabled={submitting} />
      {!noExpiry ? (
        <TextField control={control} name="expiryDate" label="Fecha de vencimiento" type="date" disabled={submitting} />
      ) : null}
      <TextField
        control={control}
        name="reason"
        label="Nota (opcional)"
        placeholder="Factura F001-123, proveedor…"
        maxLength={300}
        disabled={submitting}
      />

      {preview ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm" aria-live="polite">
          Ingresarán <strong>{formatStock(product, preview.quantity)}</strong> ({preview.quantity}{' '}
          {product.unit_label}
          {preview.quantity === 1 ? '' : 's'}) a {formatCost(preview.unitCost)} cada una.
        </p>
      ) : null}

      <DialogFooter>
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
            Cambiar producto
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {submitting ? 'Registrando…' : 'Registrar entrada'}
        </Button>
      </DialogFooter>
    </form>
  )
}
