import type { ComponentProps } from 'react'
import { cn } from 'cn'

/**
 * <select> nativo con el estilo de Input. Se usa en lugar del Select de Base UI porque en
 * celulares abre el selector del sistema (más rápido y accesible para personal no técnico).
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
