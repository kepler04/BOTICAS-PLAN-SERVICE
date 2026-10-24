import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
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
import { useCategories, useSaveProduct } from '@/features/products/hooks/useProducts'
import { AFFECTATION_LABELS, type TaxAffectation } from '@/lib/igv'
import {
  EMPTY_PRODUCT_FORM,
  productFormSchema,
  productToFormValues,
  toProductPayload,
  type ProductFormValues,
} from '@/features/products/schemas/productSchemas'
import type { Product } from '@/features/products/types'

type ProductFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sin producto = crear. */
  product?: Product | null
}

export function ProductFormDialog({ open, onOpenChange, product }: ProductFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <DialogDescription>
            El stock siempre se cuenta en la unidad mínima (tableta, frasco…). Blíster y caja son
            formas de vender esa misma unidad.
          </DialogDescription>
        </DialogHeader>
        {/* key: reinicia el formulario al cambiar de producto. */}
        <ProductForm key={product?.id ?? 'new'} product={product ?? null} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ProductForm({ product, onDone }: { product: Product | null; onDone: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const save = useSaveProduct()
  const categories = useCategories()
  const { control, handleSubmit, formState } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product ? productToFormValues(product) : EMPTY_PRODUCT_FORM,
  })
  const sellsBlister = useWatch({ control, name: 'sellsBlister' })
  const sellsBox = useWatch({ control, name: 'sellsBox' })
  const unitLabel = useWatch({ control, name: 'unitLabel' })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await save.mutateAsync({ id: product?.id, payload: toProductPayload(values) })
      toast.success(product ? 'Producto actualizado.' : 'Producto creado.')
      onDone()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar el producto.')
    }
  })

  const categoryOptions = [
    { value: '', label: 'Sin categoría' },
    ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ]

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {serverError ? <ErrorMessage title="No se pudo guardar" message={serverError} /> : null}

      <section className="space-y-4" aria-label="Datos del producto">
        <h3 className="text-sm font-medium">Datos del producto</h3>
        <TextField control={control} name="name" label="Nombre" placeholder="Paracetamol 500 mg" disabled={submitting} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={control} name="genericName" label="Principio activo (opcional)" placeholder="Paracetamol" disabled={submitting} />
          <TextField control={control} name="concentration" label="Concentración (opcional)" placeholder="500 mg" disabled={submitting} />
          <TextField control={control} name="laboratory" label="Laboratorio (opcional)" disabled={submitting} />
          <SelectField control={control} name="categoryId" label="Categoría" options={categoryOptions} disabled={submitting} />
          <TextField
            control={control}
            name="barcode"
            label="Código de barras (opcional)"
            inputMode="numeric"
            description="Puedes escanearlo con el lector."
            disabled={submitting}
          />
          <TextField control={control} name="sanitaryRegistry" label="Registro sanitario (opcional)" placeholder="EN-12345" disabled={submitting} />
          <TextField
            control={control}
            name="digemidCode"
            label="Código DIGEMID (opcional)"
            inputMode="numeric"
            description="Código del producto en el catálogo de DIGEMID; lo usa el reporte de precios."
            disabled={submitting}
          />
        </div>
        <SwitchField control={control} name="requiresPrescription" label="Requiere receta médica" disabled={submitting} />
        <div className="space-y-1">
          <SelectField
            control={control}
            name="taxAffectation"
            label="Afectación al IGV"
            options={(Object.keys(AFFECTATION_LABELS) as TaxAffectation[]).map((k) => ({ value: k, label: AFFECTATION_LABELS[k] }))}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            La mayoría de productos son gravados. La exoneración o inafectación de medicamentos se limita a listas oficiales (decreto supremo): confírmalo con tu contador.
          </p>
        </div>
      </section>

      <section className="space-y-4" aria-label="Presentaciones y precios">
        <h3 className="text-sm font-medium">Presentaciones y precios</h3>
        <p className="text-xs text-muted-foreground">Los precios de venta incluyen IGV.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={control}
            name="unitLabel"
            label="Nombre de la unidad"
            placeholder="tableta, cápsula, frasco…"
            disabled={submitting}
          />
          <TextField
            control={control}
            name="priceUnit"
            label={`Precio por ${unitLabel?.trim() || 'unidad'} (S/)`}
            inputMode="decimal"
            placeholder="0.50"
            disabled={submitting}
          />
        </div>

        <SwitchField control={control} name="sellsBlister" label="Se vende por blíster" disabled={submitting} />
        {sellsBlister ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="unitsPerBlister" label="Unidades por blíster" inputMode="numeric" placeholder="10" disabled={submitting} />
            <TextField control={control} name="priceBlister" label="Precio del blíster (S/)" inputMode="decimal" placeholder="4.50" disabled={submitting} />
          </div>
        ) : null}

        <SwitchField control={control} name="sellsBox" label="Se vende por caja" disabled={submitting} />
        {sellsBox ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="unitsPerBox" label="Unidades por caja" inputMode="numeric" placeholder="100" disabled={submitting} />
            <TextField control={control} name="priceBox" label="Precio de la caja (S/)" inputMode="decimal" placeholder="40.00" disabled={submitting} />
          </div>
        ) : null}
      </section>

      <section className="space-y-4" aria-label="Inventario">
        <h3 className="text-sm font-medium">Inventario</h3>
        <TextField
          control={control}
          name="minStock"
          label={`Stock mínimo (en ${unitLabel?.trim() ? `${unitLabel.trim()}s` : 'unidades'})`}
          inputMode="numeric"
          description="Se avisa cuando el stock llega a esta cantidad. 0 = sin aviso."
          disabled={submitting}
        />
        <SwitchField
          control={control}
          name="active"
          label="Producto activo"
          description="Los productos inactivos no aparecen en búsquedas ni se pueden vender."
          disabled={submitting}
        />
      </section>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {submitting ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}
        </Button>
      </DialogFooter>
    </form>
  )
}
