import { useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { Link } from 'react-router'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import { useOpenCashSession } from '@/features/cash/hooks/useCash'
import { usePharmacySettings } from '@/features/settings/hooks/useSettings'
import type { Presentation } from '@/features/products/lib/presentations'
import { CartPanel } from '@/features/sales/components/CartPanel'
import { CustomerFields } from '@/features/sales/components/CustomerFields'
import { PosProductList } from '@/features/sales/components/PosProductList'
import { ReceiptDialog } from '@/features/sales/components/ReceiptDialog'
import { useCreateSale } from '@/features/sales/hooks/useSales'
import { toCartItem } from '@/features/sales/lib/cartItem'
import { checkCustomer, EMPTY_CUSTOMER, type CustomerDraft } from '@/features/sales/lib/customer'
import {
  addToCart,
  cartTotalCents,
  changeCents,
  fromCents,
  removeLine,
  setLineQuantity,
  stockProblems,
  toCents,
  type CartLine,
} from '@/features/sales/lib/cart'
import type { PaymentMethod, SellableProduct } from '@/features/sales/types'
import { formatPEN, parseMoney } from '@/lib/format'
import { PATHS } from '@/routes/paths'

export function PosView() {
  const branch = useMainBranch()
  const cash = useOpenCashSession()
  const createSale = useCreateSale()
  const settings = usePharmacySettings()

  const [lines, setLines] = useState<CartLine[]>([])
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState('')
  const [reference, setReference] = useState('')
  const [customer, setCustomer] = useState<CustomerDraft>(EMPTY_CUSTOMER)
  const [error, setError] = useState<string | null>(null)
  // Una clave por intento de cobro: si el doble clic o un reintento repite la petición, no se duplica la venta.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [doneSaleId, setDoneSaleId] = useState<string | null>(null)

  const totalCents = cartTotalCents(lines)
  const problems = stockProblems(lines)
  const cashOpen = cash.isSuccess && cash.data !== null

  // En efectivo, sin escribir nada se asume pago exacto.
  const receivedBlank = received.trim() === ''
  const receivedValue = parseMoney(received)
  const receivedCents = receivedBlank ? totalCents : receivedValue === null ? null : toCents(receivedValue)
  const change = method === 'cash' && receivedCents !== null ? changeCents(totalCents, receivedCents) : undefined
  const paymentOk = method !== 'cash' || (receivedCents !== null && change !== null)
  const customerCheck = checkCustomer(customer, totalCents)
  const canCharge =
    lines.length > 0 && problems.length === 0 && cashOpen && paymentOk && customerCheck.ok && Boolean(branch.data)

  function handleAdd(product: SellableProduct, presentation: Presentation) {
    setError(null)
    setLines((current) => addToCart(current, toCartItem(product, presentation)))
  }

  function resetSale() {
    setLines([])
    setMethod('cash')
    setReceived('')
    setReference('')
    setCustomer(EMPTY_CUSTOMER)
    setError(null)
    setDoneSaleId(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  async function handleCharge() {
    if (!branch.data || !canCharge || receivedCents === null) return
    setError(null)
    try {
      const id = await createSale.mutateAsync({
        branchId: branch.data.id,
        lines,
        paymentMethod: method,
        amountReceived: method === 'cash' ? fromCents(receivedCents) : null,
        paymentReference: method === 'cash' ? null : reference.trim() || null,
        idempotencyKey,
        customer: customerCheck.payload,
      })
      setDoneSaleId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la venta.')
    }
  }

  if (branch.isPending || (branch.data && cash.isPending)) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      {cash.isSuccess && cash.data === null ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>La caja está cerrada. Ábrela para poder cobrar.</span>
          <Link to={PATHS.cash} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            Ir a Caja
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <PosProductList lines={lines} onAdd={handleAdd} />
        <div className="lg:sticky lg:top-4">
          <CartPanel
            lines={lines}
            problems={problems}
            onChangeQuantity={(key, q) => setLines((c) => setLineQuantity(c, key, q))}
            onRemove={(key) => setLines((c) => removeLine(c, key))}
            paymentMethod={method}
            onPaymentMethod={setMethod}
            received={received}
            onReceived={setReceived}
            changeCents={receivedBlank ? undefined : change}
            reference={reference}
            onReference={setReference}
            onCharge={handleCharge}
            submitting={createSale.isPending}
            error={error}
            cashClosed={cash.isSuccess && cash.data === null}
            chargesIgv={settings.data?.chargesIgv ?? false}
            canCharge={canCharge}
            customer={lines.length > 0 ? <CustomerFields draft={customer} onChange={setCustomer} check={customerCheck} /> : null}
          />
        </div>
      </div>

      {/* Barra fija en celular: acceso rápido al carrito. */}
      {lines.length > 0 ? (
        <a
          href="#cart"
          className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg lg:hidden"
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="size-5" aria-hidden="true" />
            {lines.reduce((n, l) => n + l.quantity, 0)} artículo(s)
          </span>
          <span className="font-semibold tabular-nums">Cobrar {formatPEN(fromCents(totalCents))}</span>
        </a>
      ) : null}

      <ReceiptDialog
        saleId={doneSaleId}
        title="Venta registrada"
        autoEmitEinvoice
        onOpenChange={(open) => {
          if (!open) resetSale()
        }}
        footer={<Button onClick={resetSale}>Nueva venta</Button>}
      />
    </div>
  )
}
