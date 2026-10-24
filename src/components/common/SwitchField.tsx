import { useId } from 'react'
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'

type SwitchFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  description?: string
  disabled?: boolean
}

export function SwitchField<T extends FieldValues>({ control, name, label, description, disabled }: SwitchFieldProps<T>) {
  const id = useId()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal" className="items-center justify-between gap-4">
          <div className="space-y-0.5">
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {description ? <FieldDescription>{description}</FieldDescription> : null}
          </div>
          <Switch id={id} checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={disabled} />
        </Field>
      )}
    />
  )
}
