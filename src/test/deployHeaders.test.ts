// Las cabeceras de seguridad viven en dos formatos: public/_headers (Netlify y Cloudflare Pages) y vercel.json.
// Esta prueba evita que se desincronicen (p. ej. relajar la CSP en uno y olvidarse del otro).
import { describe, expect, it } from 'vitest'
import headersFile from '../../public/_headers?raw'
import vercelFile from '../../vercel.json?raw'

type Headers = Record<string, Record<string, string>>
type VercelConfig = { headers: { source: string; headers: { key: string; value: string }[] }[]; rewrites: unknown[] }

const vercel = JSON.parse(vercelFile) as VercelConfig

/** Bloques del archivo _headers: ruta -> { cabecera: valor }. */
function parseHeadersFile(): Headers {
  const out: Headers = {}
  let current = ''
  for (const raw of headersFile.split(/\r?\n/)) {
    if (raw.startsWith('#') || raw.trim() === '') continue
    if (!raw.startsWith(' ')) {
      current = raw.trim()
      out[current] = {}
      continue
    }
    const i = raw.indexOf(':')
    out[current]![raw.slice(0, i).trim()] = raw.slice(i + 1).trim()
  }
  return out
}

/** Las mismas rutas de vercel.json, escritas como en _headers ("/(.*)" -> "/*"). */
function parseVercel(): Headers {
  const toHeadersPath = (s: string) => (s === '/(.*)' ? '/*' : s.replace('(.*)', '*'))
  return Object.fromEntries(
    vercel.headers.map((h) => [toHeadersPath(h.source), Object.fromEntries(h.headers.map((x) => [x.key, x.value]))]),
  )
}

describe('cabeceras de despliegue', () => {
  it('vercel.json y public/_headers declaran exactamente las mismas cabeceras', () => {
    expect(parseVercel()).toEqual(parseHeadersFile())
  })

  it('la CSP no permite scripts en línea ni eval', () => {
    const csp = parseHeadersFile()['/*']!['Content-Security-Policy']!
    expect(csp).toMatch(/script-src 'self'(;|$)/)
    expect(csp).not.toMatch(/script-src[^;]*unsafe/)
  })

  it('Vercel sirve index.html en las rutas de la app (sin 404 al recargar /ventas)', () => {
    expect(vercel.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }])
  })
})
