import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { TextareaField } from '@/components/common/TextareaField'
import { TextField } from '@/components/common/TextField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import { useRecordReading } from '@/features/sanitary/hooks/useEnvironment'
import { AREA_LABELS, parseReading, type EnvironmentLimit } from '@/features/sanitary/lib/environment'
import {
  EMPTY_READING,
  parseHumidity,
  readingOutOfRange,
  readingSchema,
  type ReadingValues,
} from '@/features/sanitary/schemas/readingSchema'

/** Registrar una lectura de un área (ambiente o refrigeración). Fuera de rango pide anotar qué se hizo. */
export function ReadingForm({ limit }: { limit: EnvironmentLimit }) {
  const branch = useMainBranch()
  const record = useRecordReading()
  const [serverError, setServerError] = useState<string | null>(null)
  const [key, setKey] = useState(() => crypto.randomUUID())
  const { control, handleSubmit, formState, reset } = useForm<ReadingValues>({
    resolver: zodResolver(readingSchema(limit)),
    defaultValues: EMPTY_READING,
  })
  const values = useWatch({ control }) as ReadingValues
  const out = readingOutOfRange(limit, values)
  const withHumidity = limit.humidityMax !== null
  const label = AREA_LABELS[limit.area]
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async (v) => {
    if (!branch.data) return
    setServerError(null)
    try {
      await record.mutateAsync({
        branchId: branch.data.id,
        area: limit.area,
        temperature: parseReading(v.temperature)!,
        humidity: withHumidity ? (parseHumidity(v.humidity) ?? null) : null,
        note: v.note.trim() || null,
        idempotencyKey: key,
      })
      toast.success(`${label}: lectura registrada.`)
      reset(EMPTY_READING)
      setKey(crypto.randomUUID())
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar la lectura.')
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>
          Referencia: {limit.tempMin}–{limit.tempMax} °C
          {withHumidity ? `, humedad hasta ${limit.humidityMax} %` : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          {serverError ? <ErrorMessage message={serverError} /> : null}
          <div className={withHumidity ? 'grid grid-cols-2 gap-3' : 'grid gap-3'}>
            <TextField
              control={control}
              name="temperature"
              label={`Temperatura (°C) · ${label}`}
              inputMode="decimal"
              placeholder={limit.area === 'room' ? '22.5' : '5.0'}
              disabled={submitting}
            />
            {withHumidity ? (
              <TextField
                control={control}
                name="humidity"
                label={`Humedad (%) · ${label}`}
                inputMode="decimal"
                placeholder="55"
                disabled={submitting}
              />
            ) : null}
          </div>
          {out ? (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-sm font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle className="size-4" aria-hidden="true" /> Fuera del rango de referencia
              </p>
              <TextareaField
                control={control}
                name="note"
                label={`¿Qué se hizo? · ${label}`}
                maxLength={300}
                placeholder="Ej.: se encendió el aire acondicionado y se revisó en 1 hora"
                disabled={submitting}
              />
            </div>
          ) : null}
          <Button type="submit" disabled={submitting || !branch.data}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Registrar {label.toLowerCase()}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
