// Firma digital XMLDSig del comprobante (dentro de ext:ExtensionContent) y empaquetado ZIP para SUNAT.
// Solo la usa la Edge Function (Deno, dependencias npm:).
//
// Lo que exige SUNAT y se comprobó contra el servicio BETA (ADR 074):
//  * Firma "enveloped" sobre todo el documento (URI="").
//  * Canonicalización C14N INCLUSIVA declarada como transformación explícita. Sin ella, la librería usa la
//    variante exclusiva (descarta xmlns:ds del elemento raíz) y SUNAT responde 2335 "Incorrect reference digest
//    value" porque verifica con la inclusiva.
//  * RSA-SHA256 / SHA-256 (SUNAT también acepta SHA-1; se usa el más seguro).
import { SignedXml } from 'npm:xml-crypto@6.1.2'
import { strFromU8, strToU8, unzipSync, zipSync } from 'npm:fflate@0.8.2'

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'

export function signInvoiceXml(xml: string, certPem: string, keyPem: string): { xml: string; hash: string } {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: C14N,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  })
  sig.addReference({
    xpath: '/*',
    uri: '',
    isEmptyUri: true,
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', C14N],
  })
  sig.computeSignature(xml, {
    prefix: 'ds',
    attrs: { Id: 'SignatureSP' },
    location: { reference: "//*[local-name(.)='ExtensionContent']", action: 'append' },
  })
  const signed = sig.getSignedXml()
  const hash = /<ds:DigestValue>([^<]+)<\/ds:DigestValue>/.exec(signed)?.[1] ?? ''
  return { xml: signed, hash }
}

const toBase64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/** ZIP con un único XML llamado como el documento (RUC-TIPO-SERIE-NUMERO.xml), en base64. */
export function zipXml(name: string, xml: string): string {
  return toBase64(zipSync({ [`${name}.xml`]: strToU8(xml) }))
}

/** Extrae el XML de la constancia (CDR) del ZIP que devuelve SUNAT. */
export function unzipCdr(zipBase64: string): string {
  const files = unzipSync(fromBase64(zipBase64))
  const name = Object.keys(files).find((f) => f.toLowerCase().endsWith('.xml'))
  if (!name) throw new Error('La respuesta de SUNAT no trae el XML de la constancia')
  return strFromU8(files[name]!)
}
