// Monto en letras para la leyenda 1000 del comprobante: "CIENTO DIECIOCHO CON 50/100 SOLES".
// Sin dependencias: lo usan la Edge Function (Deno) y las pruebas (Vitest).

const UNITS = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const TEENS = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const TWENTIES = ['VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

/** 0..999 en letras (sin "UN" apocopado: eso lo resuelve quien llama). */
function hundreds(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (c > 0) parts.push(HUNDREDS[c]!)
  if (rest > 0) {
    if (rest < 10) parts.push(UNITS[rest]!)
    else if (rest < 20) parts.push(TEENS[rest - 10]!)
    else if (rest < 30) parts.push(TWENTIES[rest - 20]!)
    else {
      const t = Math.floor(rest / 10)
      const u = rest % 10
      parts.push(u === 0 ? TENS[t]! : `${TENS[t]} Y ${UNITS[u]}`)
    }
  }
  return parts.join(' ')
}

/** "UNO" -> "UN" al final de un grupo que precede a MIL/MILLONES ("VEINTIUNO" -> "VEINTIUN"). */
const apocope = (s: string) => s.replace(/UNO$/, 'UN')

/** Entero 0..999 999 999 en letras. */
export function integerInWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) throw new RangeError('Monto fuera de rango')
  if (n === 0) return 'CERO'
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (millions > 0) parts.push(millions === 1 ? 'UN MILLON' : `${apocope(hundreds(millions))} MILLONES`)
  if (thousands > 0) parts.push(thousands === 1 ? 'MIL' : `${apocope(hundreds(thousands))} MIL`)
  if (rest > 0) parts.push(hundreds(rest))
  return parts.join(' ')
}

/** 118.5 -> "CIENTO DIECIOCHO CON 50/100 SOLES" */
export function amountInWords(amount: number): string {
  const cents = Math.round(amount * 100)
  const soles = Math.floor(cents / 100)
  const rest = String(cents % 100).padStart(2, '0')
  return `${integerInWords(soles)} CON ${rest}/100 SOLES`
}
