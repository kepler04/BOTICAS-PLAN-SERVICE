import { useEffect, useEffectEvent, useId, useState } from 'react'
import { UserRound } from 'lucide-react'
import { NativeSelect } from '@/components/common/NativeSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useKnownCustomer } from '@/features/sales/hooks/useSales'
import type { CustomerCheck, CustomerDraft } from '@/features/sales/lib/customer'
import { DOC_HINTS, DOC_TYPE_LABELS, normalizeDocNumber, type CustomerDocType } from '@/lib/peruDocs'

type Props = {
  draft: CustomerDraft
  onChange: (draft: CustomerDraft) => void
  check: CustomerCheck
}

/**
 * Cliente de la venta. Opcional, salvo que la venta supere S/ 700 (SUNAT exige nombre y documento).
 * Si el documento ya está registrado en la botica, completa el nombre.
 */
export function CustomerFields({ draft, onChange, check }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const docNumber = normalizeDocNumber(draft.docNumber)
  const known = useKnownCustomer(draft.docType, docNumber)
  const knownName = known.data ?? null
  const nameEmpty = draft.name.trim() === ''

  // Documento conocido y nombre vacío: lo completa (el cajero puede corregirlo). El evento lee el borrador más
  // reciente sin que cada tecla vuelva a disparar el efecto.
  const fillName = useEffectEvent((name: string) => onChange({ ...draft, name }))
  useEffect(() => {
    if (knownName && nameEmpty) fillName(knownName)
  }, [knownName, nameEmpty])

  const hasContent = docNumber !== '' || !nameEmpty
  if (!open && !check.required && !hasContent) {
    return (
      <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => setOpen(true)}>
        <UserRound aria-hidden="true" />
        Agregar cliente (DNI / RUC)
      </Button>
    )
  }

  const showErrors = check.required || hasContent
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        Cliente{' '}
        <span className={check.required ? 'text-destructive' : 'font-normal text-muted-foreground'}>
          {check.required ? '(obligatorio: la venta supera S/ 700)' : '(opcional)'}
        </span>
      </legend>
      <div className="grid grid-cols-[8.5rem_1fr] gap-2">
        <NativeSelect
          aria-label="Tipo de documento"
          value={draft.docType}
          onChange={(e) => onChange({ ...draft, docType: e.target.value as CustomerDocType })}
        >
          {(Object.keys(DOC_TYPE_LABELS) as CustomerDocType[]).map((t) => (
            <option key={t} value={t}>
              {DOC_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
        <Input
          id={`${id}-doc`}
          aria-label={`Número de ${DOC_TYPE_LABELS[draft.docType]}`}
          aria-invalid={showErrors && check.docError !== null ? true : undefined}
          inputMode={draft.docType === 'dni' || draft.docType === 'ruc' ? 'numeric' : 'text'}
          maxLength={12}
          placeholder={DOC_HINTS[draft.docType]}
          value={draft.docNumber}
          onChange={(e) => onChange({ ...draft, docNumber: e.target.value })}
        />
      </div>
      <Input
        aria-label="Nombre o razón social del cliente"
        aria-invalid={showErrors && check.nameError !== null ? true : undefined}
        maxLength={200}
        placeholder={draft.docType === 'ruc' ? 'Razón social' : 'Nombres y apellidos'}
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
      />
      {showErrors && (check.docError || check.nameError) ? (
        <p className="text-xs text-destructive" aria-live="polite">
          {[check.docError, check.nameError].filter(Boolean).join(' · ')}
        </p>
      ) : knownName ? (
        <p className="text-xs text-muted-foreground">Cliente registrado.</p>
      ) : null}
    </fieldset>
  )
}
