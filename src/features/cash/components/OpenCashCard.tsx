import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { TextField } from '@/components/common/TextField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useOpenCash } from '@/features/cash/hooks/useCash'
import { openCashSchema, type OpenCashValues } from '@/features/cash/schemas/cashSchemas'
import { parseMoney } from '@/lib/format'

export function OpenCashCard() {
  const open = useOpenCash()
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit, formState } = useForm<OpenCashValues>({
    resolver: zodResolver(openCashSchema),
    defaultValues: { amount: '' },
  })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null)
    try {
      await open.mutateAsync(parseMoney(v.amount) ?? 0)
      toast.success('Caja abierta. Ya puedes vender.')
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo abrir la caja.')
    }
  })

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-5" aria-hidden="true" />
          La caja está cerrada
        </CardTitle>
        <CardDescription>Ábrela con el efectivo que tienes al empezar el turno para poder vender.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {serverError ? <ErrorMessage message={serverError} /> : null}
          <TextField
            control={control}
            name="amount"
            label="Efectivo inicial (S/)"
            inputMode="decimal"
            placeholder="100.00"
            description="Pon 0 si empiezas sin sencillo."
            disabled={submitting}
          />
          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Abrir caja
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
