import { createPortal } from 'react-dom'
import { EinvoiceReceiptFooter } from '@/features/einvoice/components/EinvoiceReceiptFooter'
import { DOC_TYPE_NAMES, type Einvoice } from '@/features/einvoice/services/einvoiceService'
import { PRESENTATION_LABELS, pluralize } from '@/features/products/lib/presentations'
import { formatReceiptNumber } from '@/features/sales/lib/cart'
import type { ReceiptHeader } from '@/features/sales/services/salesService'
import { PAYMENT_LABELS, type SaleDetail } from '@/features/sales/types'
import { formatPEN } from '@/lib/format'
import { IGV_RATE_PERCENT } from '@/lib/igv'
import { DOC_TYPE_LABELS } from '@/lib/peruDocs'

const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' })

type ReceiptViewProps = {
  sale: SaleDetail
  header: ReceiptHeader | undefined
  /** Si SUNAT lo aceptó, se imprime como representación del comprobante electrónico. */
  einvoice?: Einvoice | null
}

/**
 * Comprobante de la venta. Por defecto es un comprobante INTERNO; si SUNAT aceptó su boleta o factura electrónica,
 * se imprime como su representación impresa (con hash y QR).
 */
export function ReceiptView({ sale, header, einvoice }: ReceiptViewProps) {
  const number = formatReceiptNumber(sale.receipt_series, sale.receipt_number)
  const voided = sale.status === 'voided'
  const electronic = einvoice && (einvoice.status === 'accepted' || einvoice.status === 'observed') && header?.ruc ? einvoice : null
  return (
    <div className="mx-auto w-full max-w-[80mm] bg-white p-3 font-mono text-[12px] leading-snug text-black">
      <div className="space-y-0.5 text-center">
        <p className="text-sm font-bold">{header?.name ?? ' '}</p>
        {header?.ruc ? <p>RUC {header.ruc}</p> : null}
        {header?.branchName ? <p>{header.branchName}</p> : null}
        {header?.branchAddress ? <p>{header.branchAddress}</p> : null}
      </div>

      <div className="my-2 border-y border-dashed border-black py-1 text-center">
        {electronic ? (
          <>
            <p className="font-bold">{DOC_TYPE_NAMES[electronic.docType].toUpperCase()}</p>
            <p className="text-sm font-bold">
              {electronic.series}-{String(electronic.number).padStart(8, '0')}
            </p>
          </>
        ) : (
          <>
            <p className="font-bold">COMPROBANTE INTERNO DE PRUEBA</p>
            <p className="text-[10px]">No es boleta ni factura electrónica SUNAT</p>
          </>
        )}
      </div>

      <div className="space-y-0.5">
        <p>
          <span className={electronic ? '' : 'font-bold'}>{electronic ? `Ticket interno ${number}` : `N.º ${number}`}</span>
          {voided ? <span className="ml-2 font-bold">[ANULADA]</span> : null}
        </p>
        <p>Fecha: {dateTime.format(new Date(sale.created_at))}</p>
        <p>Atendió: {sale.profiles?.full_name ?? '—'}</p>
        {sale.customer_name && sale.customer_doc_type ? (
          <>
            <p>Cliente: {sale.customer_name}</p>
            <p>
              {DOC_TYPE_LABELS[sale.customer_doc_type]}: {sale.customer_doc_number}
            </p>
          </>
        ) : null}
      </div>

      <table className="my-2 w-full border-y border-dashed border-black">
        <thead>
          <tr className="text-left">
            <th className="py-1 font-bold">Descripción</th>
            <th className="py-1 text-right font-bold">Importe</th>
          </tr>
        </thead>
        <tbody>
          {sale.sale_items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-0.5 pr-2">
                {item.quantity} {item.presentation === 'unit' ? 'x' : `${PRESENTATION_LABELS[item.presentation].toLowerCase()}${item.quantity === 1 ? '' : 's'} de`}{' '}
                {item.product_name}
                <div className="text-[10px]">
                  {formatPEN(item.unit_price)} c/u
                  {item.units_per_presentation > 1
                    ? ` · ${item.units_per_presentation} ${pluralize('unid.', item.units_per_presentation)} por ${PRESENTATION_LABELS[item.presentation].toLowerCase()}`
                    : ''}
                </div>
              </td>
              <td className="py-0.5 text-right tabular-nums">{formatPEN(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-0.5">
        {sale.charges_igv ? (
          <>
            {sale.total_gravado > 0 ? (
              <p className="flex justify-between">
                <span>Op. gravada</span>
                <span className="tabular-nums">{formatPEN(sale.total_gravado)}</span>
              </p>
            ) : null}
            {sale.total_exonerado > 0 ? (
              <p className="flex justify-between">
                <span>Op. exonerada</span>
                <span className="tabular-nums">{formatPEN(sale.total_exonerado)}</span>
              </p>
            ) : null}
            {sale.total_inafecto > 0 ? (
              <p className="flex justify-between">
                <span>Op. inafecta</span>
                <span className="tabular-nums">{formatPEN(sale.total_inafecto)}</span>
              </p>
            ) : null}
            {sale.total_igv > 0 ? (
              <p className="flex justify-between">
                <span>IGV ({IGV_RATE_PERCENT} %)</span>
                <span className="tabular-nums">{formatPEN(sale.total_igv)}</span>
              </p>
            ) : null}
          </>
        ) : null}
        <p className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatPEN(sale.total)}</span>
        </p>
        <p className="flex justify-between">
          <span>Pago: {PAYMENT_LABELS[sale.payment_method]}</span>
          {sale.payment_method === 'cash' ? <span className="tabular-nums">Recibido {formatPEN(sale.amount_received)}</span> : null}
        </p>
        {sale.payment_method === 'cash' ? (
          <p className="flex justify-between">
            <span>Vuelto</span>
            <span className="tabular-nums">{formatPEN(sale.change_given)}</span>
          </p>
        ) : null}
        {sale.payment_reference ? <p>Operación: {sale.payment_reference}</p> : null}
        {voided && sale.void_reason ? <p>Motivo de anulación: {sale.void_reason}</p> : null}
      </div>

      {electronic && header?.ruc ? <EinvoiceReceiptFooter sale={sale} einvoice={electronic} ruc={header.ruc} /> : null}
      <p className="mt-3 text-center text-[10px]">¡Gracias por su compra!</p>
    </div>
  )
}

/**
 * Copia del comprobante para IMPRIMIR: vive directo bajo <body> (fuera de los diálogos, que están
 * transformados) y la hoja de estilos de impresión oculta todo lo demás. Ver index.css.
 */
export function ReceiptPrintPortal(props: ReceiptViewProps) {
  return createPortal(
    <div id="receipt-print-root" aria-hidden="true">
      <ReceiptView {...props} />
    </div>,
    document.body,
  )
}
