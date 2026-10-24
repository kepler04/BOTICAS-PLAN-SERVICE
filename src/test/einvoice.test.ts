// Facturación electrónica: módulos compartidos con la Edge Function `einvoice-emit` (supabase/functions/_shared).
// La aceptación real la prueban la integración contra SUNAT BETA y el E2E.
import { describe, expect, it } from 'vitest'
import { amountInWords, integerInWords } from '../../supabase/functions/_shared/einvoice/amountInWords.ts'
import {
  ANONYMOUS_CUSTOMER,
  classifyCdr,
  classifyFault,
  parseSoapResponse,
  qrText,
} from '../../supabase/functions/_shared/einvoice/sunat.ts'
import { buildInvoiceXml, documentName, type UblInput } from '../../supabase/functions/_shared/einvoice/ubl.ts'

describe('amountInWords (leyenda 1000)', () => {
  it.each([
    [0, 'CERO'],
    [1, 'UNO'],
    [16, 'DIECISEIS'],
    [21, 'VEINTIUNO'],
    [35, 'TREINTA Y CINCO'],
    [100, 'CIEN'],
    [101, 'CIENTO UNO'],
    [118, 'CIENTO DIECIOCHO'],
    [500, 'QUINIENTOS'],
    [1000, 'MIL'],
    [1001, 'MIL UNO'],
    [2021, 'DOS MIL VEINTIUNO'],
    [21000, 'VEINTIUN MIL'],
    [100000, 'CIEN MIL'],
    [1_000_000, 'UN MILLON'],
    [2_500_000, 'DOS MILLONES QUINIENTOS MIL'],
  ])('%i -> %s', (n, words) => {
    expect(integerInWords(n)).toBe(words)
  })

  it('agrega los céntimos como fracción y la moneda', () => {
    expect(amountInWords(118.5)).toBe('CIENTO DIECIOCHO CON 50/100 SOLES')
    expect(amountInWords(0.05)).toBe('CERO CON 05/100 SOLES')
    expect(amountInWords(770)).toBe('SETECIENTOS SETENTA CON 00/100 SOLES')
  })

  it('rechaza montos fuera de rango', () => {
    expect(() => integerInWords(-1)).toThrow()
    expect(() => integerInWords(1.5)).toThrow()
  })
})

const base: UblInput = {
  docType: '03',
  series: 'B001',
  number: 12,
  issueDate: '2026-10-24',
  issueTime: '10:30:00',
  supplier: { ruc: '20600000013', legalName: 'BOTICA DEMO S.A.C.', tradeName: 'Botica & Salud', address: 'AV. LARCO 123', ubigeo: '150122' },
  customer: ANONYMOUS_CUSTOMER,
  lines: [
    { description: 'Paracetamol 500 mg (caja x100)', quantity: 2, lineTotal: 50, taxable: 42.37, igv: 7.63, affectation: 'gravado' },
    { description: 'Metformina <850 mg>', quantity: 3, lineTotal: 1.05, taxable: 1.05, igv: 0, affectation: 'inafecto' },
  ],
  totals: { gravado: 42.37, exonerado: 0, inafecto: 1.05, igv: 7.63, total: 51.05 },
  igvRate: 18,
}

describe('buildInvoiceXml (UBL 2.1)', () => {
  const xml = buildInvoiceXml(base)

  it('identifica el comprobante, el tipo y la leyenda en letras', () => {
    expect(xml).toContain('<cbc:ID>B001-12</cbc:ID>')
    expect(xml).toMatch(/<cbc:InvoiceTypeCode[^>]*listID="0101"[^>]*>03<\/cbc:InvoiceTypeCode>/)
    expect(xml).toContain('CINCUENTA Y UNO CON 05/100 SOLES')
    expect(xml).toContain('<ext:ExtensionContent/>') // aquí va la firma
  })

  it('emisor con RUC (tipo 6) y cliente "varios" (tipo 0, número -) en una boleta sin cliente', () => {
    expect(xml).toMatch(/schemeID="6"[^>]*>20600000013</)
    expect(xml).toMatch(/schemeID="0"[^>]*>-</)
  })

  it('totales: IGV solo de lo gravado; operación inafecta con su código de tributo 9998', () => {
    expect(xml).toContain('<cbc:LineExtensionAmount currencyID="PEN">43.42</cbc:LineExtensionAmount>')
    expect(xml).toContain('<cbc:PayableAmount currencyID="PEN">51.05</cbc:PayableAmount>')
    expect(xml.match(/>1000<\/cbc:ID>/g)).toHaveLength(2) // IGV: cabecera + línea gravada
    expect(xml.match(/>9998<\/cbc:ID>/g)).toHaveLength(2) // INA: cabecera + línea inafecta
    expect(xml).not.toContain('>9997<') // no hay exonerados
  })

  it('por línea: precio con IGV, valor unitario sin IGV y código de afectación', () => {
    expect(xml).toContain('<cbc:PriceAmount currencyID="PEN">25</cbc:PriceAmount>') // 50 / 2 con IGV
    expect(xml).toContain('<cbc:PriceAmount currencyID="PEN">21.185</cbc:PriceAmount>') // 42.37 / 2 sin IGV
    expect(xml).toMatch(/catalogo07">10</) // gravado - operación onerosa
    expect(xml).toMatch(/catalogo07">30</) // inafecto
  })

  it('escapa el texto del usuario (nombres de producto)', () => {
    expect(xml).toContain('Metformina &lt;850 mg&gt;')
    expect(xml).toContain('<![CDATA[Botica & Salud]]>')
  })

  it('la factura lleva forma de pago "Contado"; la boleta no', () => {
    expect(xml).not.toContain('FormaPago')
    expect(buildInvoiceXml({ ...base, docType: '01', series: 'F001' })).toContain('<cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>')
  })

  it('nombre del archivo: RUC-TIPO-SERIE-NUMERO', () => {
    expect(documentName('20600000013', '01', 'F001', 7)).toBe('20600000013-01-F001-7')
  })
})

describe('respuesta de SUNAT', () => {
  const cdr = (code: string, notes: string[] = []) =>
    `<ApplicationResponse><cac:DocumentResponse><cac:Response><cbc:ResponseCode>${code}</cbc:ResponseCode><cbc:Description>La Boleta numero B001-1, ha sido aceptada</cbc:Description></cac:Response></cac:DocumentResponse>${notes.map((n) => `<cbc:Note>${n}</cbc:Note>`).join('')}</ApplicationResponse>`

  it('código 0 sin notas = aceptado; con notas = aceptado con observaciones', () => {
    expect(classifyCdr(cdr('0'))).toMatchObject({ status: 'accepted', code: '0' })
    expect(classifyCdr(cdr('0', ['4252 - El dato ingresado como atributo @listName es incorrecto']))).toMatchObject({
      status: 'observed',
      notes: ['4252 - El dato ingresado como atributo @listName es incorrecto'],
    })
  })

  it('SOAP Fault 2000-3999 = rechazado; el resto = error que se puede reintentar', () => {
    expect(classifyFault('soap-env:Client.2335', 'El documento electr&#243;nico ingresado ha sido alterado')).toEqual({
      status: 'rejected',
      code: '2335',
      description: 'El documento electrónico ingresado ha sido alterado',
      notes: [],
    })
    expect(classifyFault('soap-env:Server.0130', 'El sistema no puede responder su solicitud').status).toBe('error')
  })

  it('distingue la respuesta con CDR, el Fault y una página de error HTTP', () => {
    expect(parseSoapResponse('<x><applicationResponse>UEsDBA==</applicationResponse></x>')).toEqual({ cdrZipBase64: 'UEsDBA==' })
    expect(parseSoapResponse('<faultcode>soap-env:Client.2335</faultcode><faultstring>x</faultstring>')).toMatchObject({
      fault: { status: 'rejected', code: '2335' },
    })
    expect(parseSoapResponse('<html><h1>401 Authorization Required</h1></html>')).toMatchObject({
      fault: { status: 'error', code: 'HTTP', description: '401 Authorization Required' },
    })
  })

  it('texto del QR de la representación impresa', () => {
    expect(
      qrText({ ruc: '20600000013', docType: '03', series: 'B001', number: 12, igv: 7.63, total: 51.05, issueDate: '2026-10-24', customerDocType: '1', customerDocNumber: '40123456', hash: 'abc=' }),
    ).toBe('20600000013|03|B001|12|7.63|51.05|2026-10-24|1|40123456|abc=|')
  })
})
