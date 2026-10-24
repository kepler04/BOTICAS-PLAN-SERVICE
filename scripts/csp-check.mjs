// Sirve la COMPILACIÓN con las cabeceras de public/_headers (CSP incluida) y recorre la app real en un navegador
// para comprobar que NO viola su propia política. Además hace un control negativo: un script inyectado debe bloquearse.
//   1) npx supabase start    2) npm run demo:seed    3) npm run test:csp
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright-core'

const PROJECT = process.cwd()
const BROWSER = [
  process.env.E2E_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find((p) => existsSync(p))
if (!BROWSER) {
  console.error('No encontré Edge ni Chrome. Define E2E_BROWSER con la ruta del ejecutable.')
  process.exit(1)
}

const st = spawnSync('npx', ['supabase', 'status', '-o', 'json'], { cwd: PROJECT, encoding: 'utf8', shell: true })
const j = JSON.parse(st.stdout.slice(st.stdout.indexOf('{')))
const env = { ...process.env, VITE_SUPABASE_URL: j.API_URL, VITE_SUPABASE_ANON_KEY: j.ANON_KEY ?? j.PUBLISHABLE_KEY }

console.log('→ vite build…')
const build = spawnSync('npx', ['vite', 'build'], { cwd: PROJECT, shell: true, env, encoding: 'utf8' })
if (build.status !== 0) {
  console.error(build.stdout + build.stderr)
  process.exit(1)
}

// ---- Lee las cabeceras del bloque "/*" de dist/_headers (las MISMAS que se desplegarán) ----
function globalHeaders() {
  const lines = readFileSync(join(PROJECT, 'dist/_headers'), 'utf8').split(/\r?\n/)
  const out = {}
  let inGlobal = false
  for (const raw of lines) {
    if (raw.startsWith('#') || raw.trim() === '') continue
    if (!raw.startsWith(' ')) {
      inGlobal = raw.trim() === '/*'
      continue
    }
    if (!inGlobal) continue
    const i = raw.indexOf(':')
    out[raw.slice(0, i).trim()] = raw.slice(i + 1).trim()
  }
  return out
}
const HEADERS = globalHeaders()
// Solo para esta prueba: la app apunta al Supabase LOCAL (en producción es *.supabase.co, ya permitido).
const local = new URL(j.API_URL)
const csp = HEADERS['Content-Security-Policy'].replace(
  "connect-src 'self'",
  `connect-src 'self' ${local.origin} ws://${local.host}`,
)

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain' }
const DIST = join(PROJECT, 'dist')
const server = createServer((req, res) => {
  const urlPath = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '')
  let file = join(DIST, urlPath)
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html') // SPA
  res.writeHead(200, { ...HEADERS, 'Content-Security-Policy': csp, 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(4175, '127.0.0.1', r))
const BASE = 'http://127.0.0.1:4175'

const results = []
const check = async (name, fn) => {
  try {
    await fn()
    results.push(`OK   ${name}`)
  } catch (e) {
    results.push(`FAIL ${name}\n       ${String(e.message).split('\n')[0]}`)
    throw e
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m)
}

let browser
const violations = []
try {
  browser = await chromium.launch({ executablePath: BROWSER, headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-PE', timezoneId: 'America/Lima' })
  await context.addInitScript(() => {
    window.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} → ${e.blockedURI || e.sample || 'inline'}`))
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text().slice(0, 200))
  })
  const dump = async () => violations.push(...(await page.evaluate(() => window.__csp ?? [])))

  await check('el servidor envía todas las cabeceras de seguridad', async () => {
    const r = await fetch(BASE + '/login')
    for (const h of ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security']) {
      assert(r.headers.has(h), `falta la cabecera ${h}`)
    }
    assert(r.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options debería ser DENY')
    assert(/script-src 'self'(;|$)/.test(r.headers.get('content-security-policy')), 'script-src debe ser solo \'self\'')
    assert(!/script-src[^;]*unsafe/.test(r.headers.get('content-security-policy')), 'script-src no debe permitir unsafe-*')
  })

  await check('CONTROL NEGATIVO: un script inyectado se BLOQUEA (la CSP está activa de verdad)', async () => {
    await page.goto(BASE + '/login')
    await page.getByLabel('Correo electrónico').waitFor()
    const ran = await page.evaluate(async () => {
      const s = document.createElement('script')
      s.textContent = 'window.__pwned = true'
      document.body.appendChild(s)
      await new Promise((r) => setTimeout(r, 200))
      return Boolean(window.__pwned)
    })
    assert(!ran, 'el script inyectado SE EJECUTÓ: la CSP no está protegiendo')
    const blocked = await page.evaluate(() => window.__csp.some((v) => v.startsWith('script-src')))
    assert(blocked, 'no se registró la violación de script-src esperada')
    await page.evaluate(() => (window.__csp = [])) // lo anterior era intencional
    violations.length = 0
  })

  await check('la app real funciona bajo la CSP: login, dashboard con gráfico, POS, reportes y diálogos', async () => {
    await page.goto(BASE + '/login')
    await page.getByLabel('Correo electrónico').fill('demo@boticas-erp.demo')
    await page.getByLabel('Contraseña').fill('DemoBotica2026')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.getByText('Hola, Admin').waitFor()
    await page.getByRole('img', { name: /Ventas de los últimos 7 días/ }).waitFor() // Recharts (atributos style)
    await page.getByRole('link', { name: 'Ventas' }).first().click()
    await page.getByLabel('Buscar producto para vender').fill('parace')
    await page.getByRole('button', { name: /Agregar unidad de Paracetamol/ }).click() // sonner/estilos
    await page.getByRole('link', { name: 'Productos' }).first().click()
    await page.getByRole('button', { name: 'Nuevo producto' }).click() // diálogo (Base UI)
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await page.getByRole('link', { name: 'Reportes' }).first().click()
    await page.getByRole('img', { name: /Ventas por día/ }).waitFor()
    await page.getByRole('link', { name: 'Configuración' }).first().click()
    await page.getByText('Impuesto General a las Ventas (IGV)').waitFor()
    await dump()
    assert(violations.length === 0, `la app viola su CSP: ${[...new Set(violations)].join(' | ')}`)
  })
} catch {
  // el detalle ya quedó en results
} finally {
  await browser?.close()
  server.close()
}

console.log(results.join('\n'))
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1)
