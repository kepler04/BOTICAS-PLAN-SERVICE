// Verifica la PWA contra la COMPILACIÓN DE PRODUCCIÓN (vite build + vite preview) en un navegador real.
//   1) npx supabase start      2) npm run test:pwa
// Comprueba: manifiesto, íconos (dimensiones reales), service worker, que NO se cachee nada de Supabase,
// y que sin conexión aparezca la página "Sin conexión".
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { startVite, stopProcess } from './lib/devServer.mjs'

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

const PORT = 4174
const BASE = `http://127.0.0.1:${PORT}`
const preview = startVite(['preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: PROJECT, env })
const killPreview = () => stopProcess(preview.child)

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
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

/** Ancho y alto reales de un PNG (cabecera IHDR). */
function pngSize(buf) {
  assert(buf.subarray(1, 4).toString() === 'PNG', 'no es un PNG')
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

let browser
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }

  browser = await chromium.launch({ executablePath: BROWSER, headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-PE', timezoneId: 'America/Lima' })
  const page = await context.newPage()
  await page.goto(BASE + '/login')
  await page.getByLabel('Correo electrónico').waitFor()

  await check('el HTML enlaza manifiesto, theme-color e ícono de iOS', async () => {
    assert((await page.locator('link[rel="manifest"]').getAttribute('href')) === '/manifest.webmanifest', 'falta <link rel="manifest">')
    assert((await page.locator('meta[name="theme-color"]').getAttribute('content')) === '#171717', 'falta theme-color')
    assert((await page.locator('link[rel="apple-touch-icon"]').count()) === 1, 'falta apple-touch-icon')
  })

  let manifest
  await check('el manifiesto es válido y completo', async () => {
    const r = await fetch(BASE + '/manifest.webmanifest')
    assert(r.ok, `manifiesto HTTP ${r.status}`)
    manifest = await r.json()
    assert(manifest.name && manifest.short_name, 'faltan name/short_name')
    assert(manifest.start_url === '/' && manifest.display === 'standalone', 'start_url/display incorrectos')
    assert(manifest.lang === 'es-PE', 'lang debería ser es-PE')
    const any = manifest.icons.filter((i) => i.purpose === 'any')
    assert(any.some((i) => i.sizes === '192x192') && any.some((i) => i.sizes === '512x512'), 'faltan íconos 192 y 512')
    assert(manifest.icons.some((i) => i.purpose === 'maskable'), 'falta un ícono maskable')
  })

  await check('cada ícono existe y su tamaño REAL coincide con el declarado', async () => {
    for (const icon of manifest.icons) {
      const r = await fetch(BASE + icon.src)
      assert(r.ok, `${icon.src} HTTP ${r.status}`)
      assert(r.headers.get('content-type')?.includes('image/png'), `${icon.src} no es image/png`)
      const { w, h } = pngSize(Buffer.from(await r.arrayBuffer()))
      assert(`${w}x${h}` === icon.sizes, `${icon.src}: declara ${icon.sizes} pero mide ${w}x${h}`)
    }
    const apple = await fetch(BASE + '/apple-touch-icon.png')
    assert(apple.ok, 'apple-touch-icon.png no existe')
  })

  await check('el service worker se registra y queda activo', async () => {
    const active = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)
    assert(active === 'activated', `estado del service worker: ${active}`)
  })

  await check('la página "Sin conexión" queda precacheada', async () => {
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys()
      const cache = await caches.open(keys.find((k) => k.startsWith('boticas-static-')) ?? '')
      return (await cache.keys()).map((r) => new URL(r.url).pathname)
    })
    assert(cached.includes('/offline.html'), 'offline.html no está en la caché')
    assert(cached.includes('/icon-192.png'), 'los íconos no están precacheados')
  })

  await check('los archivos con hash se cachean tras recargar (ya controlados por el service worker)', async () => {
    await page.reload()
    await page.getByLabel('Correo electrónico').waitFor()
    const hasAssets = await page.evaluate(async () => {
      const keys = await caches.keys()
      const cache = await caches.open(keys.find((k) => k.startsWith('boticas-static-')) ?? '')
      return (await cache.keys()).some((r) => new URL(r.url).pathname.startsWith('/assets/'))
    })
    assert(hasAssets, 'no se cachearon los archivos de /assets/')
  })

  await check('SEGURIDAD: nada de Supabase (datos, auth, tokens) queda en la caché', async () => {
    // Fuerza una petición real a Supabase (login fallido) para que, si el SW cachease algo, aparezca.
    await page.getByLabel('Correo electrónico').fill('nadie@test.local')
    await page.getByLabel('Contraseña').fill('incorrecta-123')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.getByText(/incorrectos/).waitFor()
    const urls = await page.evaluate(async () => {
      const out = []
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url)
      return out
    })
    const foreign = urls.filter((u) => new URL(u).origin !== new URL(BASE).origin)
    assert(foreign.length === 0, `hay URLs de otro origen en la caché: ${foreign.join(', ')}`)
    assert(!urls.some((u) => /\/(auth|rest)\/v1\//.test(u)), 'hay respuestas de la API en la caché')
  })

  await check('sin conexión: una ruta de la app muestra "Sin conexión" (no el error del navegador)', async () => {
    await context.setOffline(true)
    await page.goto(BASE + '/ventas')
    await page.getByRole('heading', { name: 'Sin conexión' }).waitFor()
    assert((await page.getByRole('button', { name: 'Reintentar' }).count()) === 1, 'falta el botón Reintentar')
    await page.screenshot({ path: 'docs/screenshots/16-sin-conexion.png' })
  })

  await check('al volver la conexión, la app carga normalmente', async () => {
    await context.setOffline(false)
    await page.goto(BASE + '/login')
    await page.getByLabel('Correo electrónico').waitFor()
  })
} catch {
  // el detalle ya quedó en results
} finally {
  await browser?.close()
  killPreview()
}

console.log(results.join('\n'))
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1)
