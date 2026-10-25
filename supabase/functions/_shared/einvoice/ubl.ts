// Generador del XML UBL 2.1 de comprobantes para SUNAT: boleta (03), factura (01) y nota de crédito (07).
// TypeScript puro y sin dependencias: lo usan las Edge Functions (Deno) y lo prueban Vitest y la integración contra
// el servicio BETA de SUNAT. La firma digital se agrega después dentro de ExtensionContent.
//
// Modelo: los precios de la botica INCLUYEN IGV (ADR 046). Cada línea trae su valor de venta (sin IGV), su IGV y su
// afectación, tal como los guarda `sale_items` (instantánea): el XML no recalcula nada, solo los expresa.
import { amountInWords } from './amountInWords.ts'

export type EInvoiceDocType = '01' | '03'
export type Affectation = 'gravado' | 'exonerado' | 'inafecto'
/** Catálogo 06 de SUNAT: 1 DNI, 4 carné de extranjería, 6 RUC, 7 pasaporte, 0 sin documento (ventas menores). */
export type PartyDocType = '0' | '1' | '4' | '6' | '7'

export type UblLine = {
  description: string
  /** Cantidad en la presentación vendida (cajas, blísteres o unidades). */
  quantity: number
  /** Total de la línea CON IGV (lo que pagó el cliente). */
  lineTotal: number
  /** Valor de venta de la línea SIN IGV. */
  taxable: number
  igv: number
  affectation: Affectation
}

/** Lo común a todo comprobante: emisor, cliente, líneas y totales. */
type DocumentBase = {
  series: string
  number: number
  issueDate: string
  issueTime: string
  supplier: { ruc: string; legalName: string; tradeName?: string | null; address?: string | null; ubigeo?: string | null }
  customer: { docType: PartyDocType; docNumber: string; name: string }
  lines: UblLine[]
  totals: { gravado: number; exonerado: number; inafecto: number; igv: number; total: number }
  igvRate: number
}

export type UblInput = DocumentBase & { docType: EInvoiceDocType }

/** Catálogo 09 (tipo de nota de crédito). Hoy solo se emite la anulación total de la operación. */
export type CreditNoteReason = '01'

export type CreditNoteInput = DocumentBase & {
  /** Comprobante que se anula: tipo (01/03) y número completo (p. ej. "B001-4"). */
  reference: { docType: EInvoiceDocType; id: string }
  reasonCode: CreditNoteReason
  reasonDescription: string
}

/** Código de tributo (catálogo 05) y razón de afectación (catálogo 07) por afectación. */
const TAX: Record<Affectation, { id: string; name: string; type: string; reason: string }> = {
  gravado: { id: '1000', name: 'IGV', type: 'VAT', reason: '10' },
  exonerado: { id: '9997', name: 'EXO', type: 'VAT', reason: '20' },
  inafecto: { id: '9998', name: 'INA', type: 'FRE', reason: '30' },
}

export const SUPPLIER_DOC_TYPE = '6'

const NS =
  'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const m2 = (n: number) => n.toFixed(2)
/** Valor unitario: hasta 10 decimales, sin ceros sobrantes. */
const m10 = (n: number) => String(Number(n.toFixed(10)))

/** Nombre del archivo y del documento: RUC-TIPO-SERIE-NUMERO (sin ceros a la izquierda en el número). */
export function documentName(ruc: string, docType: EInvoiceDocType | '07', series: string, number: number): string {
  return `${ruc}-${docType}-${series}-${number}`
}

function taxSubtotal(affectation: Affectation, taxable: number, tax: number, rate: number | null): string {
  const t = TAX[affectation]
  return `<cac:TaxSubtotal>
<cbc:TaxableAmount currencyID="PEN">${m2(taxable)}</cbc:TaxableAmount>
<cbc:TaxAmount currencyID="PEN">${m2(tax)}</cbc:TaxAmount>
<cac:TaxCategory>${rate === null ? '' : `
<cbc:Percent>${m2(affectation === 'gravado' ? rate : 0)}</cbc:Percent>
<cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${t.reason}</cbc:TaxExemptionReasonCode>`}
<cac:TaxScheme>
<cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">${t.id}</cbc:ID>
<cbc:Name>${t.name}</cbc:Name>
<cbc:TaxTypeCode>${t.type}</cbc:TaxTypeCode>
</cac:TaxScheme>
</cac:TaxCategory>
</cac:TaxSubtotal>`
}

// ---------- Piezas comunes ----------

/** UBLExtensions (aquí va la firma), versión y número del documento. */
const head = (d: DocumentBase) => `<ext:UBLExtensions>
<ext:UBLExtension>
<ext:ExtensionContent/>
</ext:UBLExtension>
</ext:UBLExtensions>
<cbc:UBLVersionID>2.1</cbc:UBLVersionID>
<cbc:CustomizationID>2.0</cbc:CustomizationID>
<cbc:ID>${d.series}-${d.number}</cbc:ID>
<cbc:IssueDate>${d.issueDate}</cbc:IssueDate>
<cbc:IssueTime>${d.issueTime}</cbc:IssueTime>`

const amountNote = (d: DocumentBase) => `<cbc:Note languageLocaleID="1000"><![CDATA[${amountInWords(d.totals.total)}]]></cbc:Note>`

const currency = `<cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listName="Currency" listAgencyName="United Nations Economic Commission for Europe">PEN</cbc:DocumentCurrencyCode>`

/** Firma referenciada (#SignatureSP), emisor y cliente. */
const parties = (d: DocumentBase) => `<cac:Signature>
<cbc:ID>${esc(d.supplier.ruc)}</cbc:ID>
<cac:SignatoryParty>
<cac:PartyIdentification><cbc:ID>${esc(d.supplier.ruc)}</cbc:ID></cac:PartyIdentification>
<cac:PartyName><cbc:Name><![CDATA[${d.supplier.legalName}]]></cbc:Name></cac:PartyName>
</cac:SignatoryParty>
<cac:DigitalSignatureAttachment>
<cac:ExternalReference><cbc:URI>#SignatureSP</cbc:URI></cac:ExternalReference>
</cac:DigitalSignatureAttachment>
</cac:Signature>
<cac:AccountingSupplierParty>
<cac:Party>
<cac:PartyIdentification>
<cbc:ID schemeID="${SUPPLIER_DOC_TYPE}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${esc(d.supplier.ruc)}</cbc:ID>
</cac:PartyIdentification>${d.supplier.tradeName ? `
<cac:PartyName><cbc:Name><![CDATA[${d.supplier.tradeName}]]></cbc:Name></cac:PartyName>` : ''}
<cac:PartyLegalEntity>
<cbc:RegistrationName><![CDATA[${d.supplier.legalName}]]></cbc:RegistrationName>
<cac:RegistrationAddress>${d.supplier.ubigeo ? `
<cbc:ID schemeName="Ubigeos" schemeAgencyName="PE:INEI">${esc(d.supplier.ubigeo)}</cbc:ID>` : ''}
<cbc:AddressTypeCode listAgencyName="PE:SUNAT" listName="Establecimientos anexos">0000</cbc:AddressTypeCode>${d.supplier.address ? `
<cac:AddressLine><cbc:Line><![CDATA[${d.supplier.address}]]></cbc:Line></cac:AddressLine>` : ''}
<cac:Country><cbc:IdentificationCode listID="ISO 3166-1" listAgencyName="United Nations Economic Commission for Europe" listName="Country">PE</cbc:IdentificationCode></cac:Country>
</cac:RegistrationAddress>
</cac:PartyLegalEntity>
</cac:Party>
</cac:AccountingSupplierParty>
<cac:AccountingCustomerParty>
<cac:Party>
<cac:PartyIdentification>
<cbc:ID schemeID="${d.customer.docType}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${esc(d.customer.docNumber)}</cbc:ID>
</cac:PartyIdentification>
<cac:PartyLegalEntity>
<cbc:RegistrationName><![CDATA[${d.customer.name}]]></cbc:RegistrationName>
</cac:PartyLegalEntity>
</cac:Party>
</cac:AccountingCustomerParty>`

/** IGV total y una subtotal por cada afectación presente. */
function taxTotal(d: DocumentBase): string {
  const subtotals = (['gravado', 'exonerado', 'inafecto'] as const)
    .map((a) => {
      const taxable = a === 'gravado' ? d.totals.gravado : a === 'exonerado' ? d.totals.exonerado : d.totals.inafecto
      return taxable > 0 ? taxSubtotal(a, taxable, a === 'gravado' ? d.totals.igv : 0, null) : ''
    })
    .join('\n')
  return `<cac:TaxTotal>
<cbc:TaxAmount currencyID="PEN">${m2(d.totals.igv)}</cbc:TaxAmount>
${subtotals}
</cac:TaxTotal>`
}

/** Totales: valor de venta (sin IGV), total con impuestos y monto a pagar. */
function monetaryTotal(d: DocumentBase): string {
  const lineExtension = d.lines.reduce((s, l) => s + l.taxable, 0)
  return `<cac:LegalMonetaryTotal>
<cbc:LineExtensionAmount currencyID="PEN">${m2(lineExtension)}</cbc:LineExtensionAmount>
<cbc:TaxInclusiveAmount currencyID="PEN">${m2(d.totals.total)}</cbc:TaxInclusiveAmount>
<cbc:PayableAmount currencyID="PEN">${m2(d.totals.total)}</cbc:PayableAmount>
</cac:LegalMonetaryTotal>`
}

/** Líneas: InvoiceLine/InvoicedQuantity en boletas y facturas; CreditNoteLine/CreditedQuantity en notas de crédito. */
function lines(d: DocumentBase, kind: 'Invoice' | 'CreditNote'): string {
  const quantityTag = kind === 'Invoice' ? 'InvoicedQuantity' : 'CreditedQuantity'
  return d.lines
    .map(
      (l, i) => `<cac:${kind}Line>
<cbc:ID>${i + 1}</cbc:ID>
<cbc:${quantityTag} unitCode="NIU" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${l.quantity}</cbc:${quantityTag}>
<cbc:LineExtensionAmount currencyID="PEN">${m2(l.taxable)}</cbc:LineExtensionAmount>
<cac:PricingReference>
<cac:AlternativeConditionPrice>
<cbc:PriceAmount currencyID="PEN">${m10(l.lineTotal / l.quantity)}</cbc:PriceAmount>
<cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode>
</cac:AlternativeConditionPrice>
</cac:PricingReference>
<cac:TaxTotal>
<cbc:TaxAmount currencyID="PEN">${m2(l.igv)}</cbc:TaxAmount>
${taxSubtotal(l.affectation, l.taxable, l.igv, d.igvRate)}
</cac:TaxTotal>
<cac:Item>
<cbc:Description>${esc(l.description)}</cbc:Description>
</cac:Item>
<cac:Price>
<cbc:PriceAmount currencyID="PEN">${m10(l.taxable / l.quantity)}</cbc:PriceAmount>
</cac:Price>
</cac:${kind}Line>`,
    )
    .join('\n')
}

// ---------- Documentos ----------

export function buildInvoiceXml(d: UblInput): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ${NS}>
${head(d)}
<cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${d.docType}</cbc:InvoiceTypeCode>
${amountNote(d)}
${currency}
<cbc:LineCountNumeric>${d.lines.length}</cbc:LineCountNumeric>
${parties(d)}${d.docType === '01' ? `
<cac:PaymentTerms>
<cbc:ID>FormaPago</cbc:ID>
<cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
</cac:PaymentTerms>` : ''}
${taxTotal(d)}
${monetaryTotal(d)}
${lines(d, 'Invoice')}
</Invoice>`
}

/**
 * Nota de crédito (07) que anula por completo un comprobante aceptado: mismo cliente, líneas y totales que el
 * original, con el motivo (catálogo 09) y la referencia al comprobante afectado.
 */
export function buildCreditNoteXml(d: CreditNoteInput): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" ${NS}>
${head(d)}
${amountNote(d)}
${currency}
<cac:DiscrepancyResponse>
<cbc:ReferenceID>${esc(d.reference.id)}</cbc:ReferenceID>
<cbc:ResponseCode listAgencyName="PE:SUNAT" listName="Tipo de nota de credito" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo09">${d.reasonCode}</cbc:ResponseCode>
<cbc:Description><![CDATA[${d.reasonDescription}]]></cbc:Description>
</cac:DiscrepancyResponse>
<cac:BillingReference>
<cac:InvoiceDocumentReference>
<cbc:ID>${esc(d.reference.id)}</cbc:ID>
<cbc:DocumentTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${d.reference.docType}</cbc:DocumentTypeCode>
</cac:InvoiceDocumentReference>
</cac:BillingReference>
${parties(d)}
${taxTotal(d)}
${monetaryTotal(d)}
${lines(d, 'CreditNote')}
</CreditNote>`
}
