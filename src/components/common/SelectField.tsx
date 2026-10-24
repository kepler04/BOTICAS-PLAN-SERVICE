import { useId } from 'react'
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form'
import { NativeSelect } from '@/components/common/NativeSelect'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'

type SelectFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  options: { value: string; label: string }[]
  disabled?: boolean
}

export function SelectField<T extends FieldValues>({ control, name, label, options, disabled }: SelectFieldProps<T>) {
  const id = useId()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <NativeSelect {...field} id={id} disabled={disabled} aria-invalid={fieldState.invalid || undefined}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
          {fieldState.error?.message ? <FieldError>{fieldState.error.message}</FieldError> : null}
        </Field>
      )}
    />
  )
}
