import { useId, type HTMLAttributes, type HTMLInputTypeAttribute } from 'react'
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

type TextFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  type?: HTMLInputTypeAttribute
  autoComplete?: string
  placeholder?: string
  disabled?: boolean
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  maxLength?: number
  /** Texto de ayuda bajo el campo. */
  description?: string
}

/** Campo de formulario accesible (react-hook-form + shadcn Field). */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  autoComplete,
  placeholder,
  disabled,
  inputMode,
  maxLength,
  description,
}: TextFieldProps<T>) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            {...field}
            id={id}
            type={type}
            autoComplete={autoComplete}
            placeholder={placeholder}
            disabled={disabled}
            inputMode={inputMode}
            maxLength={maxLength}
            aria-invalid={fieldState.invalid || undefined}
            aria-describedby={fieldState.invalid ? errorId : undefined}
          />
          {description && !fieldState.error?.message ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
          {fieldState.error?.message ? (
            <FieldError id={errorId}>{fieldState.error.message}</FieldError>
          ) : null}
        </Field>
      )}
    />
  )
}
