import { useEffect, useRef } from 'react'
import { AlertTriangle, CheckCircle2, CircleX, FileUp, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useEinvoice, useEmitEinvoice } from '@/features/einvoice/hooks/useEinvoice'
import { DOC_TYPE_NAMES, type Einvoice } from '@/features/einvoice/services/einvoiceService'
import { usePharmacySettings } from '@/features/settings/hooks/useSettings'

type Props = {
  saleId: string
  /** Emitir apenas se abre (después de cobrar). En el historial solo se muestra el estado. */
  autoEmit?: boolean
  /** La venta está anulada: no se ofrece emitir. */
  voided?: boolean
}

const STYLES: Record<Einvoice['status'], string> = {
  accepted: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  observed: 'border-amber-300 bg-amber-50 text-amber-900',
  pending: 'border-sky-300 bg-sky-50 text-sky-900',
  rejected: 'border-red-300 bg-red-50 text-red-900',
  error: 'border-red-300 bg-red-50 text-red-900',
}

/** Estado del comprobante electrónico de una venta: emitir, ver la respuesta de SUNAT y reintentar si falló. */
export function EinvoicePanel({ saleId, autoEmit = false, voided = false }: Props) {
  const settings = usePharmacySettings()
  const einvoice = useEinvoice(saleId)
  const emit = useEmitEinvoice()
  const enabled = settings.data?.einvoiceEnabled ?? false
  const started = useRef(false)

  // Recién cobrada: se envía sola una vez (el servidor es idempotente si se repite).
  useEffect(() => {
    if (!autoEmit || !enabled || voided || started.current || !einvoice.isSuccess || einvoice.data) return
    started.current = true
    emit.mutate(saleId)
  }, [autoEmit, enabled, voided, einvoice.isSuccess, einvoice.data, emit, saleId])

  if (settings.isPending || einvoice.isPending) return <Skeleton className="h-12 w-full" />
  const doc = einvoice.data
  if (!doc && (!enabled || voided)) return null

  const sending = emit.isPending || (doc?.status === 'pending' && doc.attempts > 0 && !emit.isError)
  const canRetry = !voided && !emit.isPending && (doc === null || doc === undefined || doc.status === 'error' || doc.status === 'pending')

  return (
    <section aria-label="Comprobante electrónico" className="space-y-2" aria-live="polite">
      {doc ? (
        <div className={`space-y-1 rounded-lg border p-3 text-sm ${STYLES[doc.status]}`}>
          <p className="flex items-center gap-2 font-medium">
            {doc.status === 'accepted' ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
            {doc.status === 'observed' ? <AlertTriangle className="size-4" aria-hidden="true" /> : null}
            {doc.status === 'rejected' || doc.status === 'error' ? <CircleX className="size-4" aria-hidden="true" /> : null}
            {doc.status === 'pending' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {DOC_TYPE_NAMES[doc.docType]} {doc.series}-{doc.number}
          </p>
          <p>
            {doc.status === 'accepted' ? `Aceptada por SUNAT${doc.environment === 'beta' ? ' (BETA, prueba)' : ''}.` : null}
            {doc.status === 'observed' ? 'Aceptada por SUNAT con observaciones.' : null}
            {doc.status === 'rejected' ? 'Rechazada por SUNAT.' : null}
            {doc.status === 'error' ? 'No se pudo enviar a SUNAT. Puedes reintentar.' : null}
            {doc.status === 'pending' ? (sending ? 'Enviando a SUNAT…' : 'Pendiente de envío.') : null}{' '}
            {doc.sunatDescription && doc.status !== 'accepted' ? <span className="block text-xs">{doc.sunatDescription}</span> : null}
          </p>
          {doc.sunatNotes.length > 0 ? (
            <ul className="list-disc pl-5 text-xs">
              {doc.sunatNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : emit.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Enviando a SUNAT…
        </p>
      ) : null}

      {emit.isError ? <p className="text-sm text-destructive">{emit.error.message}</p> : null}

      {canRetry && !sending ? (
        <Button type="button" size="sm" variant="outline" onClick={() => emit.mutate(saleId)}>
          {doc ? <RotateCcw aria-hidden="true" /> : <FileUp aria-hidden="true" />}
          {doc ? 'Reintentar envío a SUNAT' : 'Emitir comprobante electrónico'}
        </Button>
      ) : null}
    </section>
  )
}
