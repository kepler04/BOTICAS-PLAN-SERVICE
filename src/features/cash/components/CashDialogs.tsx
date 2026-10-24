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
import { useAddCashMovement, useCloseCash } from '@/features/cash/hooks/useCash'
import {
  cashMovementSchema,
  closeCashSchema,
  type CashMovementValues,
  type CloseCashValues,
} from '@/features/cash/schemas/cashSchemas'
import type { CashSummary } from '@/features/cash/services/cashService'
import { toCents } from '@/features/sales/lib/cart'
import { formatPEN, parseMoney } from '@/lib/format'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: CashSummary
}

// ---------------------------------------------------------------- Ingreso / egreso
export function CashMovementDialog({ open, onOpenChange, session }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ingreso o egreso de caja</DialogTitle>
          <DialogDescription>
            Registra dinero que entra o sale de la caja y que no es una venta (sencillo, pago a un proveedor, gastos…).
          </DialogDescription>
        </DialogHeader>
        <MovementForm session={session} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function MovementForm({ session, onDone }: { session: CashSummary; onDone: () => void }) {
  const add = useAddCashMovement()
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit, formState } = useForm<CashMovementValues>({
    resolver: zodResolver(cashMovementSchema),
    defaultValues: { type: 'expense', amount: '', reason: '' },
  })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null)
    try {
      await add.mutateAsync({ sessionId: session.id, type: v.type, amount: parseMoney(v.amount) ?? 0, reason: v.reason })
      toast.success(v.type === 'income' ? 'Ingreso registrado.' : 'Egreso registrado.')
      onDone()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo registrar el movimiento.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage message={serverError} /> : null}
      <SelectField
        control={control}
        name="type"
        label="Tipo"
        options={[
          { value: 'expense', label: 'Egreso (sale dinero)' },
          { value: 'income', label: 'Ingreso (entra dinero)' },
        ]}
        disabled={submitting}
      />
      <TextField control={control} name="amount" label="Monto (S/)" inputMode="decimal" placeholder="10.00" disabled={submitting} />
      <TextField control={control} name="reason" label="Motivo" placeholder="Ej.: compra de bolsas, sencillo…" maxLength={300} disabled={submitting} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Registrar
        </Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- Cierre
export function CloseCashDialog({ open, onOpenChange, session }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar caja</DialogTitle>
          <DialogDescription>Cuenta el efectivo que hay en la caja e ingrésalo para cerrar el turno.</DialogDescription>
        </DialogHeader>
        <CloseForm session={session} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CloseForm({ session, onDone }: { session: CashSummary; onDone: () => void }) {
  const close = useCloseCash()
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit, formState, setError } = useForm<CloseCashValues>({
    resolver: zodResolver(closeCashSchema),
    defaultValues: { counted: '', notes: '' },
  })
  const counted = useWatch({ control, name: 'counted' })
  const submitting = formState.isSubmitting

  const countedValue = parseMoney(counted ?? '')
  const diffCents = countedValue === null ? null : toCents(countedValue) - toCents(session.expectedCash)

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null)
    const value = parseMoney(v.counted) ?? 0
    const diff = toCents(value) - toCents(session.expectedCash)
    if (diff !== 0 && v.notes.trim().length < 3) {
      setError('notes', { message: 'Hay diferencia: escribe una nota explicando el motivo' })
      return
    }
    try {
      const result = await close.mutateAsync({ sessionId: session.id, counted: value, notes: v.notes.trim() || null })
      toast.success(
        result.difference === 0
          ? 'Caja cerrada sin diferencia.'
          : `Caja cerrada con diferencia de ${formatPEN(result.difference)}.`,
      )
      onDone()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo cerrar la caja.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage message={serverError} /> : null}
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        Efectivo esperado: <strong>{formatPEN(session.expectedCash)}</strong>
        <span className="block text-xs text-muted-foreground">
          Apertura + ventas en efectivo + ingresos − egresos. Yape y Plin no cuentan.
        </span>
      </p>
      <TextField control={control} name="counted" label="Efectivo contado (S/)" inputMode="decimal" disabled={submitting} />
      {diffCents !== null ? (
        <p
          aria-live="polite"
          className={`rounded-lg px-3 py-2 text-sm ${diffCents === 0 ? 'bg-muted' : 'bg-amber-100 text-amber-900'}`}
        >
          {diffCents === 0
            ? 'Cuadra exacto.'
            : diffCents > 0
              ? `Sobran ${formatPEN(diffCents / 100)}.`
              : `Faltan ${formatPEN(-diffCents / 100)}.`}
        </p>
      ) : null}
      <TextField
        control={control}
        name="notes"
        label={diffCents !== null && diffCents !== 0 ? 'Nota (obligatoria por la diferencia)' : 'Nota (opcional)'}
        maxLength={300}
        disabled={submitting}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Cerrar caja
        </Button>
      </DialogFooter>
    </form>
  )
}
