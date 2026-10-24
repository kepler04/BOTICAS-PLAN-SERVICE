import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
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
import { useSaveSupplier } from '@/features/purchases/hooks/usePurchases'
import {
  EMPTY_SUPPLIER,
  supplierSchema,
  supplierToValues,
  toSupplierPayload,
  type SupplierValues,
} from '@/features/purchases/schemas/supplierSchema'
import type { Supplier } from '@/features/purchases/services/purchasesService'

type Props = { open: boolean; onOpenChange: (open: boolean) => void; supplier: Supplier | null }

export function SupplierDialog({ open, onOpenChange, supplier }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
          <DialogDescription>Droguería o laboratorio al que le compras.</DialogDescription>
        </DialogHeader>
        {open ? <SupplierForm key={supplier?.id ?? 'new'} supplier={supplier} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function SupplierForm({ supplier, onDone }: { supplier: Supplier | null; onDone: () => void }) {
  const save = useSaveSupplier()
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit, formState } = useForm<SupplierValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: supplier ? supplierToValues(supplier) : EMPTY_SUPPLIER,
  })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null)
    try {
      await save.mutateAsync({ id: supplier?.id ?? null, values: toSupplierPayload(v) })
      toast.success(supplier ? 'Proveedor actualizado.' : 'Proveedor creado.')
      onDone()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar el proveedor.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage message={serverError} /> : null}
      <TextField control={control} name="name" label="Nombre o razón social" disabled={submitting} />
      <TextField control={control} name="ruc" label="RUC (opcional)" inputMode="numeric" maxLength={11} placeholder="20123456789" disabled={submitting} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={control} name="phone" label="Teléfono (opcional)" inputMode="tel" disabled={submitting} />
        <TextField control={control} name="email" label="Correo (opcional)" type="email" disabled={submitting} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  )
}
