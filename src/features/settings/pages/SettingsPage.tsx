import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { PageHeader } from '@/components/common/PageHeader'
import { SwitchField } from '@/components/common/SwitchField'
import { TextField } from '@/components/common/TextField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useUpdatePharmacySettings, usePharmacySettings } from '@/features/settings/hooks/useSettings'
import {
  pharmacySettingsSchema,
  type PharmacySettingsValues,
} from '@/features/settings/schemas/settingsSchemas'
import type { PharmacySettings } from '@/features/settings/services/settingsService'

export function SettingsPage() {
  const settings = usePharmacySettings()
  return (
    <div className="space-y-4">
      <PageHeader title="Configuración" description="Datos de tu botica y tratamiento del IGV." />
      {settings.isPending ? <Skeleton className="h-64 w-full" /> : null}
      {settings.isError ? <ErrorMessage message={settings.error.message} /> : null}
      {settings.isSuccess ? <SettingsForm settings={settings.data} /> : null}
    </div>
  )
}

function SettingsForm({ settings }: { settings: PharmacySettings }) {
  const update = useUpdatePharmacySettings()
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit, formState } = useForm<PharmacySettingsValues>({
    resolver: zodResolver(pharmacySettingsSchema),
    defaultValues: {
      legalName: settings.legalName,
      tradeName: settings.tradeName ?? '',
      ruc: settings.ruc ?? '',
      chargesIgv: settings.chargesIgv,
      fiscalAddress: settings.fiscalAddress ?? '',
      ubigeo: settings.ubigeo ?? '',
      einvoiceEnabled: settings.einvoiceEnabled,
    },
  })
  const chargesIgv = useWatch({ control, name: 'chargesIgv' })
  const submitting = formState.isSubmitting

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null)
    try {
      await update.mutateAsync(v)
      toast.success('Configuración guardada.')
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar la configuración.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? <ErrorMessage message={serverError} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos de la botica</CardTitle>
          <CardDescription>Aparecen en el encabezado del comprobante.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField control={control} name="legalName" label="Nombre o razón social" disabled={submitting} />
          <TextField control={control} name="tradeName" label="Nombre comercial (opcional)" disabled={submitting} />
          <TextField control={control} name="ruc" label="RUC (opcional)" inputMode="numeric" placeholder="20123456789" disabled={submitting} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Impuesto General a las Ventas (IGV)</CardTitle>
          <CardDescription>
            La tasa vigente es <strong>18 %</strong> (en 2026: IGV 15.5 % + IPM 2.5 %; el IPM sube hasta 4 % en 2029 y el total se mantiene en 18 %).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchField
            control={control}
            name="chargesIgv"
            label="Mi botica cobra IGV"
            description="Actívalo si estás en el Régimen General, el RER o el Régimen MYPE Tributario. Desactívalo si estás en el Nuevo RUS: ahí el IGV no se cobra por separado."
            disabled={submitting}
          />

          <div className="flex gap-2 rounded-lg bg-muted px-3 py-2 text-sm" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              {chargesIgv ? (
                <>
                  <p>
                    Los precios de venta <strong>ya incluyen IGV</strong>. El comprobante desglosará la operación gravada, el IGV y,
                    si corresponde, las operaciones exoneradas o inafectas.
                  </p>
                  <p>
                    Cada producto tiene su <strong>afectación</strong> (gravado, exonerado o inafecto). Los medicamentos no tienen una tasa reducida
                    general: la exoneración o inafectación se limita a listas oficiales por decreto supremo (por ejemplo, ciertos tratamientos
                    oncológicos, de VIH/SIDA y de diabetes). <strong>El sistema no asume nada: marca cada producto</strong> con ayuda de tu contador.
                  </p>
                  <p>El costo de tus compras se guarda <strong>sin IGV</strong> (es crédito fiscal) y la ganancia se calcula sobre la venta neta.</p>
                </>
              ) : (
                <p>
                  Las ventas no desglosan IGV: el comprobante muestra solo el total y la ganancia se calcula sobre lo cobrado. Este cambio solo afecta
                  a las ventas nuevas; las anteriores conservan su desglose.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Es un comprobante interno de prueba: no reemplaza a la boleta o factura electrónica de SUNAT. Consulta con un contador qué te corresponde.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comprobantes electrónicos (SUNAT)</CardTitle>
          <CardDescription>Boleta (B001) o factura (F001) por cada venta, enviada a SUNAT al cobrar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchField
            control={control}
            name="einvoiceEnabled"
            label="Emitir comprobantes electrónicos"
            description="Factura si el cliente tiene RUC; boleta en los demás casos."
            disabled={submitting}
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <TextField control={control} name="fiscalAddress" label="Dirección fiscal" placeholder="Av. Larco 1234, Miraflores, Lima" disabled={submitting} />
            <TextField control={control} name="ubigeo" label="Ubigeo (opcional)" inputMode="numeric" maxLength={6} placeholder="150122" disabled={submitting} />
          </div>
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Se envían al <strong>entorno de PRUEBAS (BETA) de SUNAT</strong>: SUNAT valida y acepta el comprobante, pero{' '}
              <strong>no tiene validez legal</strong>. Para emitir de verdad se necesita el certificado digital y la Clave SOL de la botica, o
              un proveedor autorizado (OSE/PSE), con la asesoría de un contador.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {submitting ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
