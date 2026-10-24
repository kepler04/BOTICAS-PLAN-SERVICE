import { useState, type ReactNode } from 'react'
import { AlertTriangle, Loader2, Minus, Plus, Trash2 } from 'lucide-react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PRESENTATION_LABELS } from '@/features/products/lib/presentations'
import {
  cartLineKey,
  cartTotalCents,
  fromCents,
  lineTotalCents,
  quickCashOptions,
  remainingFor,
  type CartLine,
  type StockProblem,
} from '@/features/sales/lib/cart'
import { PAYMENT_LABELS, type PaymentMethod } from '@/features/sales/types'
import { formatPEN } from '@/lib/format'
import { IGV_RATE_PERCENT, igvBreakdown } from '@/lib/igv'

type CartPanelProps = {
  lines: CartLine[]
  problems: StockProblem[]
  onChangeQuantity: (key: string, quantity: number) => void
  onRemove: (key: string) => void
  paymentMethod: PaymentMethod
  onPaymentMethod: (m: PaymentMethod) => void
  received: string
  onReceived: (v: string) => void
  /** Vuelto en centavos; null = falta dinero; undefined = no es efectivo o aún no se ingresó. */
  changeCents: number | null | undefined
  reference: string
  onReference: (v: string) => void
  onCharge: () => void
  submitting: boolean
  error: string | null
  cashClosed: boolean
  /** Si la botica cobra IGV, se muestra el desglose (los precios ya lo incluyen). */
  chargesIgv: boolean
  canCharge: boolean
  /** Datos del cliente (DNI/RUC), antes del medio de pago. */
  customer?: ReactNode
}

/** Cantidad editable: escribe un número o usa +/−. Nunca pasa del stock disponible. */
function QuantityInput({ line, max, onChange }: { line: CartLine; max: number; onChange: (q: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        onClick={() => onChange(line.quantity - 1)}
        aria-label={`Quitar una ${PRESENTATION_LABELS[line.presentation].toLowerCase()} de ${line.name}`}
      >
        <Minus aria-hidden="true" />
      </Button>
      <Input
        value={text ?? String(line.quantity)}
        inputMode="numeric"
        className="h-7 w-12 px-1 text-center"
        aria-label={`Cantidad de ${line.name} (${PRESENTATION_LABELS[line.presentation].toLowerCase()})`}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, '')
          setText(raw)
          const n = parseInt(raw, 10)
          if (!Number.isNaN(n) && n >= 1) onChange(Math.min(n, max))
        }}
        onBlur={() => setText(null)}
      />
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled={line.quantity >= max}
        onClick={() => onChange(line.quantity + 1)}
        aria-label={`Agregar una ${PRESENTATION_LABELS[line.presentation].toLowerCase()} de ${line.name}`}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}

export function CartPanel(props: CartPanelProps) {
  const { lines, problems, paymentMethod, changeCents } = props
  const total = cartTotalCents(lines)
  const tax = igvBreakdown(lines.map((l) => ({ taxAffectation: l.taxAffectation, totalCents: lineTotalCents(l) })), props.chargesIgv)
  const isCash = paymentMethod === 'cash'

  return (
    <Card id="cart" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Venta actual</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Agrega productos para empezar la venta.</p>
        ) : (
          <ul className="divide-y">
            {lines.map((line) => {
              const key = cartLineKey(line)
              // Máximo que se puede tener de ESTA línea según el stock (descontando las demás líneas del producto).
              const max = line.quantity + remainingFor(lines, line)
              return (
                <li key={key} className="space-y-1 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{line.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {PRESENTATION_LABELS[line.presentation]} · {formatPEN(fromCents(line.unitPriceCents))} c/u
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => props.onRemove(key)}
                      aria-label={`Quitar ${line.name} (${PRESENTATION_LABELS[line.presentation].toLowerCase()}) de la venta`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <QuantityInput line={line} max={max} onChange={(q) => props.onChangeQuantity(key, q)} />
                    <p className="text-sm font-semibold tabular-nums">{formatPEN(fromCents(lineTotalCents(line)))}</p>
                  </div>
                  {line.requiresPrescription ? (
                    <Badge variant="outline" className="gap-1">
                      <AlertTriangle aria-hidden="true" /> Requiere receta
                    </Badge>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        {problems.map((p) => (
          <ErrorMessage
            key={p.productId}
            title="Stock insuficiente"
            message={`“${p.name}”: pides más de lo disponible. Quita unidades o cambia la presentación.`}
          />
        ))}

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-base font-medium">Total</span>
          <span className="text-2xl font-bold tabular-nums" aria-live="polite">
            {formatPEN(fromCents(total))}
          </span>
        </div>
        {props.chargesIgv && lines.length > 0 ? (
          <dl className="space-y-0.5 text-xs text-muted-foreground tabular-nums" aria-label="Desglose del IGV">
            {tax.gravado > 0 ? (
              <div className="flex justify-between">
                <dt>Op. gravada</dt>
                <dd>{formatPEN(fromCents(tax.gravado))}</dd>
              </div>
            ) : null}
            {tax.exonerado > 0 ? (
              <div className="flex justify-between">
                <dt>Op. exonerada</dt>
                <dd>{formatPEN(fromCents(tax.exonerado))}</dd>
              </div>
            ) : null}
            {tax.inafecto > 0 ? (
              <div className="flex justify-between">
                <dt>Op. inafecta</dt>
                <dd>{formatPEN(fromCents(tax.inafecto))}</dd>
              </div>
            ) : null}
            {tax.igv > 0 ? (
              <div className="flex justify-between">
                <dt>IGV ({IGV_RATE_PERCENT} %) incluido</dt>
                <dd>{formatPEN(fromCents(tax.igv))}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {props.customer}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Medio de pago</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Medio de pago">
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
              <Button
                key={m}
                type="button"
                role="radio"
                aria-checked={paymentMethod === m}
                variant={paymentMethod === m ? 'default' : 'outline'}
                onClick={() => props.onPaymentMethod(m)}
              >
                {PAYMENT_LABELS[m]}
              </Button>
            ))}
          </div>
        </fieldset>

        {isCash ? (
          <div className="space-y-2">
            <label htmlFor="received" className="text-sm font-medium">
              Efectivo recibido (S/)
            </label>
            <Input
              id="received"
              value={props.received}
              inputMode="decimal"
              placeholder={lines.length ? fromCents(total).toFixed(2) : '0.00'}
              onChange={(e) => props.onReceived(e.target.value)}
            />
            {lines.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => props.onReceived(fromCents(total).toFixed(2))}>
                  Exacto
                </Button>
                {quickCashOptions(total).map((c) => (
                  <Button key={c} type="button" size="sm" variant="outline" onClick={() => props.onReceived(fromCents(c).toFixed(2))}>
                    {formatPEN(fromCents(c))}
                  </Button>
                ))}
              </div>
            ) : null}
            {changeCents === null ? (
              <p className="text-sm font-medium text-destructive" aria-live="polite">
                El monto recibido no alcanza.
              </p>
            ) : changeCents !== undefined ? (
              <p className="text-lg font-semibold tabular-nums" aria-live="polite">
                Vuelto: {formatPEN(fromCents(changeCents))}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="reference" className="text-sm font-medium">
              N.º de operación (opcional)
            </label>
            <Input
              id="reference"
              value={props.reference}
              maxLength={60}
              placeholder="Ej.: 123456"
              onChange={(e) => props.onReference(e.target.value)}
            />
          </div>
        )}

        {props.cashClosed ? (
          <ErrorMessage title="La caja está cerrada" message="Abre la caja en la sección “Caja” para poder cobrar." />
        ) : null}
        {props.error ? <ErrorMessage title="No se pudo registrar la venta" message={props.error} /> : null}

        <Button type="button" size="lg" className="w-full" disabled={!props.canCharge || props.submitting} onClick={props.onCharge}>
          {props.submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {props.submitting ? 'Registrando…' : `Cobrar ${formatPEN(fromCents(total))}`}
        </Button>

      </CardContent>
    </Card>
  )
}
