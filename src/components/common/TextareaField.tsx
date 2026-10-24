import { useId } from 'react'
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

type TextareaFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  placeholder?: string
  disabled?: boolean
  maxLength?: number
  description?: string
}

/** Texto de varias líneas accesible (react-hook-form + shadcn Field). Igual que TextField. */
export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  disabled,
  maxLength,
  description,
}: TextareaFieldProps<T>) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Textarea
            {...field}
            id={id}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            aria-invalid={fieldState.invalid || undefined}
            aria-describedby={fieldState.invalid ? errorId : undefined}
          />
          {description && !fieldState.error?.message ? <FieldDescription>{description}</FieldDescription> : null}
          {fieldState.error?.message ? <FieldError id={errorId}>{fieldState.error.message}</FieldError> : null}
        </Field>
      )}
    />
  )
}
