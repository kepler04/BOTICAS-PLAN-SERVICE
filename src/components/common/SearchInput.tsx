import { Search } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'

/** Caja de búsqueda. Un lector de código de barras USB "teclea" el código y envía Enter, así que funciona igual. */
export function SearchInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input type="search" className="pl-8" {...props} />
    </div>
  )
}
