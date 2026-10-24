import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Einvoice } from '@/features/einvoice/services/einvoiceService'
import type { SaleDetail } from '@/features/sales/types'
import { ANONYMOUS_CUSTOMER, PARTY_DOC, qrText } from '../../../../supabase/functions/_shared/einvoice/sunat'

/** Fecha de emisión en hora de Lima (la misma que va en el XML). */
const limaDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

type Props = { sale: SaleDetail; einvoice: Einvoice; ruc: string }

/**
 * Pie de la representación impresa de un comprobante electrónico: valor resumen (hash) y QR con el formato de
 * SUNAT (RUC|TIPO|SERIE|NÚMERO|IGV|TOTAL|FECHA|TIPO DOC|NÚM DOC|HASH|). Mismo texto que arma el servidor.
 */
export function EinvoiceReceiptFooter({ sale, einvoice, ruc }: Props) {
  const [qr, setQr] = useState<string | null>(null)
  const text = qrText({
    ruc,
    docType: einvoice.docType,
    series: einvoice.series,
    number: einvoice.number,
    igv: sale.total_igv,
    total: sale.total,
    issueDate: limaDate(sale.created_at),
    customerDocType: sale.customer_doc_type ? PARTY_DOC[sale.customer_doc_type] : ANONYMOUS_CUSTOMER.docType,
    customerDocNumber: sale.customer_doc_number ?? ANONYMOUS_CUSTOMER.docNumber,
    hash: einvoice.hash ?? '',
  })

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(text, { margin: 0, width: 116, errorCorrectionLevel: 'M' })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null))
    return () => {
      alive = false
    }
  }, [text])

  return (
    <div className="mt-2 space-y-1 border-t border-dashed border-black pt-2 text-center text-[10px]">
      {qr ? <img src={qr} alt={`Código QR del comprobante ${einvoice.series}-${einvoice.number}`} className="mx-auto size-[116px]" /> : null}
      <p className="break-all">Valor resumen: {einvoice.hash}</p>
      <p>Representación impresa de la {einvoice.docType === '01' ? 'factura' : 'boleta de venta'} electrónica.</p>
      {einvoice.environment === 'beta' ? <p className="font-bold">PRUEBA EN SUNAT BETA · SIN VALOR LEGAL</p> : null}
    </div>
  )
}
