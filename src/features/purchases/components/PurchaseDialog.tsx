import { useId, useState } from 'react'
import { useFieldArray, useForm, useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { NativeSelect } from '@/components/common/NativeSelect'
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
import { Input } from '@/components/ui/input'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import { ProductPicker } from '@/features/inventory/components/ProductPicker'
import { availablePresentations, pluralize, presentationOptionLabel } from '@/features/products/lib/presentations'
import { useRegisterPurchase, useSuppliers } from '@/features/purchases/hooks/usePurchases'
import {
  computeLine,
  DOC_TYPE_LABELS,
  MAX_ITEMS,
  newLine,
  purchaseTotals,
  toPurchaseItems,
  type PurchaseDocType,
} from '@/features/purchases/lib/purchase'
import { emptyPurchase, purchaseSchema, type PurchaseFormValues } from '@/features/purchases/schemas/purchaseSchema'
import { formatCost, formatPEN, todayISO } from '@/lib/format'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

export function PurchaseDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
          <DialogDescription>
            Copia los datos de la factura o guía del proveedor. El stock entra al confirmar, todo junto.
          </DialogDescription>
        </DialogHeader>
        {open ? <PurchaseForm onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

const DOC_TYPE_OPTIONS = (Object.keys(DOC_TYPE_LABELS) as PurchaseDocType[]).map((t) => ({ value: t, label: DOC_TYPE_LABELS[t] }))

function PurchaseForm({ onDone }: { onDone: () => void }) {
  const branch = useMainBranch()
  const suppliers = useSuppliers()
  const register = useRegisterPurchase()
  const [picking, setPicking] = useState(true)
  const [serverError, setServerError] = useState<string | null>(null)
  const [key] = useState(() => crypto.randomUUID())

  const form = useForm<PurchaseFormValues>({ resolver: zodResolver(purchaseSchema), defaultValues: emptyPurchase() })
  const { control, handleSubmit, formState } = form
  const lines = useFieldArray({ control, name: 'lines', keyName: 'fieldKey' })
  const watched = useWatch({ control, name: ['lines', 'includesIgv'] })
  const [watchedLines, includesIgv] = watched as [PurchaseFormValues['lines'], boolean]
  const computed = (watchedLines ?? []).map((l) => computeLine(l, includesIgv))
  const totals = purchaseTotals(computed)
  const submitting = formState.isSubmitting

  const active = (suppliers.data ?? []).filter((s) => s.active)
  const supplierOptions = [
    { value: '', label: 'Elige el proveedor…' },
    ...active.map((s) => ({ value: s.id, label: s.ruc ? `${s.name} · RUC ${s.ruc}` : s.name })),
  ]

  const onSubmit = handleSubmit(async (v) => {
    if (!branch.data) return
    setServerError(null)
    const items = toPurchaseItems(v.lines, v.lines.map((l) => computeLine(l, v.includesIgv)))
    try {
      await register.mutateAsync({
        branchId: branch.data.id,
        supplierId: v.supplierId,
        docType: v.docType,
        docNumber: v.docNumber.trim(),
        issueDate: v.issueDate,
        items,
        note: v.note.trim() || null,
        idempotencyKey: key,
      })
      const total = purchaseTotals(v.lines.map((l) => computeLine(l, v.includesIgv))).total
      toast.success(`Compra registrada: ${v.lines.length} ${v.lines.length === 1 ? 'producto' : 'productos'}, ${formatPEN(total)}.`)
      onDone()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo registrar la compra.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage message={serverError} /> : null}
      {suppliers.isSuccess && active.length === 0 ? (
        <ErrorMessage title="No hay proveedores activos" message="Crea uno en la pestaña “Proveedores” antes de registrar compras." />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <SelectField control={control} name="supplierId" label="Proveedor" options={supplierOptions} disabled={submitting} />
        </div>
        <SelectField control={control} name="docType" label="Documento" options={DOC_TYPE_OPTIONS} disabled={submitting} />
        <TextField control={control} name="docNumber" label="N.º de documento" maxLength={30} placeholder="F001-000123" disabled={submitting} />
        <TextField control={control} name="issueDate" label="Fecha de emisión" type="date" disabled={submitting} />
        <div className="rounded-lg border p-2 sm:col-span-3">
          <SwitchField
            control={control}
            name="includesIgv"
            label="Los costos que escribo incluyen IGV"
            description="Se guardan sin IGV: el IGV de las compras es crédito fiscal."
            disabled={submitting}
          />
        </div>
      </div>

      <section aria-label="Productos de la compra" className="space-y-3">
        {lines.fields.map((field, i) => (
          <LineEditor
            key={field.fieldKey}
            index={i}
            control={control}
            registerField={form.register}
            errors={formState.errors}
            computed={computed[i]}
            onRemove={() => lines.remove(i)}
          />
        ))}
        {formState.errors.lines?.root?.message || formState.errors.lines?.message ? (
          <p className="text-sm text-destructive">{formState.errors.lines?.root?.message ?? formState.errors.lines?.message}</p>
        ) : null}

        {picking ? (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-sm font-medium">Agregar producto</p>
            <ProductPicker
              onSelect={(p) => {
                lines.append(newLine(p))
                setPicking(false)
              }}
            />
          </div>
        ) : lines.fields.length < MAX_ITEMS ? (
          <Button type="button" variant="outline" onClick={() => setPicking(true)}>
            <Plus aria-hidden="true" />
            Agregar otro producto
          </Button>
        ) : null}
      </section>

      <TextField control={control} name="note" label="Nota (opcional)" maxLength={300} disabled={submitting} />

      <dl className="ml-auto w-full max-w-xs space-y-1 text-sm tabular-nums" aria-label="Totales de la compra">
        <div className="flex justify-between">
          <dt>Subtotal (sin IGV)</dt>
          <dd>{formatPEN(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>IGV (estimado)</dt>
          <dd>{formatPEN(totals.igv)}</dd>
        </div>
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatPEN(totals.total)}</dd>
        </div>
      </dl>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || !branch.data}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Registrar compra
        </Button>
      </DialogFooter>
    </form>
  )
}

type LineEditorProps = {
  index: number
  control: Control<PurchaseFormValues>
  registerField: UseFormRegister<PurchaseFormValues>
  errors: FieldErrors<PurchaseFormValues>
  computed: ReturnType<typeof computeLine> | undefined
  onRemove: () => void
}

/** Una línea de la compra. Los campos se registran en react-hook-form como `lines.<i>.<campo>`. */
function LineEditor({ index, control, registerField, errors, computed, onRemove }: LineEditorProps) {
  const id = useId()
  const line = useWatch({ control, name: `lines.${index}` })
  const product = line.product
  const err = errors.lines?.[index]
  const msg = (k: 'quantity' | 'cost' | 'lotCode' | 'expiryDate') => err?.[k]?.message
  const ok = computed !== undefined && Object.keys(computed.errors).length === 0

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{product.name}</p>
        <Button type="button" size="icon-sm" variant="ghost" onClick={onRemove} aria-label={`Quitar ${product.name} de la compra`}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1.4fr_0.7fr_0.9fr_1fr_1.2fr]">
        <LineField id={`${id}-pres`} label="Presentación">
          <NativeSelect id={`${id}-pres`} {...registerField(`lines.${index}.presentation`)}>
            {availablePresentations(product).map((p) => (
              <option key={p} value={p}>
                {presentationOptionLabel(product, p)}
              </option>
            ))}
          </NativeSelect>
        </LineField>
        <LineField id={`${id}-qty`} label="Cantidad" error={msg('quantity')}>
          <Input
            id={`${id}-qty`}
            inputMode="numeric"
            aria-label={`Cantidad de ${product.name}`}
            aria-invalid={msg('quantity') ? true : undefined}
            {...registerField(`lines.${index}.quantity`)}
          />
        </LineField>
        <LineField id={`${id}-cost`} label="Costo c/u (S/)" error={msg('cost')}>
          <Input
            id={`${id}-cost`}
            inputMode="decimal"
            aria-label={`Costo por presentación de ${product.name}`}
            aria-invalid={msg('cost') ? true : undefined}
            {...registerField(`lines.${index}.cost`)}
          />
        </LineField>
        <LineField id={`${id}-lot`} label="Lote" error={msg('lotCode')}>
          <Input
            id={`${id}-lot`}
            maxLength={60}
            aria-label={`Lote de ${product.name}`}
            aria-invalid={msg('lotCode') ? true : undefined}
            {...registerField(`lines.${index}.lotCode`)}
          />
        </LineField>
        <LineField id={`${id}-exp`} label="Vencimiento" error={msg('expiryDate')}>
          <Input
            id={`${id}-exp`}
            type="date"
            min={todayISO()}
            disabled={line.noExpiry}
            aria-label={`Vencimiento de ${product.name}`}
            aria-invalid={msg('expiryDate') ? true : undefined}
            {...registerField(`lines.${index}.expiryDate`)}
          />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" className="size-4 accent-primary" {...registerField(`lines.${index}.noExpiry`)} />
            No vence
          </label>
        </LineField>
      </div>
      {ok ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          = {computed.quantity} {pluralize(product.unit_label, computed.quantity)} a {formatCost(computed.unitCost)} c/u sin IGV ·
          Subtotal {formatPEN(computed.subtotal)}
        </p>
      ) : null}
    </div>
  )
}

function LineField({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
