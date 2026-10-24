import { ShoppingCart } from 'lucide-react'
import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { PATHS } from '@/routes/paths'

/** Acceso rápido al punto de venta. */
export function NewSaleButton() {
  return (
    <Link to={PATHS.sales} className={buttonVariants({ size: 'lg' })}>
      <ShoppingCart aria-hidden="true" />
      Nueva venta
    </Link>
  )
}
