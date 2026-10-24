// Auditoría de accesibilidad automática (axe-core, reglas WCAG 2.1 A y AA) sobre las pantallas reales,
// con la demo, como administrador y como cajero. Falla si hay infracciones.
//   1) npx supabase start    2) npm run demo:seed    3) npm run test:a11y
// axe detecta ~30-40 % de los problemas de accesibilidad: no reemplaza probar con teclado y lector de pantalla.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'
import { startVite, stopProcess, waitForHttp } from './lib/devServer.mjs'

const PROJECT = process.cwd()
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
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
const PORT = 5176
const BASE = `http://127.0.0.1:${PORT}`
const vite = startVite(['--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  cwd: PROJECT,
  env: { ...process.env, VITE_SUPABASE_URL: j.API_URL, VITE_SUPABASE_ANON_KEY: j.ANON_KEY ?? j.PUBLISHABLE_KEY },
})
const killVite = () => stopProcess(vite.child)
const waitForServer = () => waitForHttp(BASE, { log: vite.log })

const report = []
let failures = 0

async function audit(page, name) {
  await page.waitForTimeout(400) // transiciones y gráficos
  await page.addScriptTag({ content: AXE })
  const result = await page.evaluate(async () =>
    // eslint-disable-next-line no-undef
    axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }),
  )
  const v = result.violations
  failures += v.length
  report.push(v.length === 0 ? `OK   ${name}` : `FAIL ${name}`)
  for (const x of v) {
    report.push(`       [${x.impact}] ${x.id}: ${x.help} (${x.nodes.length})`)
    for (const n of x.nodes.slice(0, 3)) report.push(`         → ${n.target.join(' ')}  ${(n.failureSummary ?? '').split('\n')[1]?.trim() ?? ''}`)
  }
}

async function login(page, email) {
  await page.goto(BASE + '/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('DemoBotica2026')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByText(/^Hola/).waitFor()
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ executablePath: BROWSER, headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' })
  page.setDefaultTimeout(15000)
  const nav = async (label) => page.getByRole('link', { name: label }).first().click()

  await page.goto(BASE + '/login')
  await page.getByLabel('Correo electrónico').waitFor()
  await audit(page, 'Login')
  await page.goto(BASE + '/registro')
  await page.getByRole('button', { name: /Crear cuenta/ }).waitFor()
  await audit(page, 'Registro')

  await login(page, 'demo@boticas-erp.demo')
  await page.getByText('Requiere atención').waitFor()
  await audit(page, 'Dashboard (admin)')

  await nav('Ventas')
  for (const [term, name, qty] of [['amoxicilina', 'Amoxicilina 500 mg', '7'], ['naproxeno', 'Naproxeno 550 mg', '2'], ['paracetamol', 'Paracetamol 500 mg', '2']]) {
    await page.getByLabel('Buscar producto para vender').fill(term)
    await page.getByRole('button', { name: new RegExp(`Agregar caja de ${name.split(' ')[0]}`) }).click()
    await page.getByLabel(`Cantidad de ${name} (caja)`).fill(qty)
  }
  await page.getByLabel('Número de DNI').waitFor()
  await audit(page, 'Ventas: carrito con cliente obligatorio')
  await page.getByRole('tab', { name: 'Historial' }).click()
  await page.getByRole('button', { name: /Ver venta/ }).first().waitFor()
  await audit(page, 'Ventas: historial')

  await nav('Productos')
  await page.getByRole('cell', { name: /Paracetamol 500 mg/ }).first().waitFor()
  await audit(page, 'Productos')
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  await page.getByRole('dialog').waitFor()
  await audit(page, 'Productos: formulario')
  await page.keyboard.press('Escape')

  await nav('Inventario')
  await page.getByRole('cell', { name: /Paracetamol 500 mg/ }).first().waitFor()
  await audit(page, 'Inventario: stock')
  await page.getByRole('tab', { name: 'Alertas' }).click()
  await page.getByRole('heading', { name: 'Vencimientos' }).waitFor()
  await audit(page, 'Inventario: alertas')
  await page.getByRole('tab', { name: 'Kardex' }).click()
  await page.getByLabel('Buscar producto').fill('paracetamol')
  await page.getByRole('button', { name: /Paracetamol 500 mg/ }).first().click()
  await page.getByText('Saldo al cierre').waitFor()
  await audit(page, 'Inventario: kardex')

  await nav('Caja')
  await page.getByText('Caja abierta', { exact: true }).waitFor()
  await audit(page, 'Caja')

  await nav('Temperatura')
  await page.getByText('Últimos 30 días').waitFor()
  await page.getByLabel('Temperatura (°C) · Ambiente').fill('31')
  await page.getByLabel('¿Qué se hizo? · Ambiente').waitFor()
  await audit(page, 'Temperatura (con lectura fuera de rango)')

  await nav('Compras')
  await page.getByText('Factura F001-004512').waitFor()
  await audit(page, 'Compras')
  await page.getByRole('button', { name: 'Registrar compra' }).click()
  await page.getByRole('dialog').getByLabel('Buscar producto').fill('paracetamol')
  await page.getByRole('dialog').getByRole('button', { name: /Paracetamol 500 mg/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar compra' }).click() // muestra los errores
  await page.getByRole('dialog').getByText('Ingresa el lote').waitFor()
  await audit(page, 'Compras: formulario con errores')
  await page.keyboard.press('Escape')

  await nav('Reportes')
  await page.getByRole('img', { name: /Ventas por día/ }).waitFor()
  await audit(page, 'Reportes')

  await nav('Usuarios')
  await page.getByText('cajero@boticas-erp.demo').waitFor()
  await audit(page, 'Usuarios')

  await nav('Configuración')
  await page.getByText('Impuesto General a las Ventas (IGV)').waitFor()
  await audit(page, 'Configuración')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE + '/ventas')
  await page.getByLabel('Buscar producto para vender').waitFor()
  await audit(page, 'Ventas en celular')

  const cashier = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' })
  cashier.setDefaultTimeout(15000)
  await login(cashier, 'cajero@boticas-erp.demo')
  await cashier.getByText('Requiere atención').waitFor()
  await audit(cashier, 'Dashboard (cajero)')
} catch (e) {
  report.push(`ERROR ${String(e.message).split('\n')[0]}`)
  failures++
  try {
    await browser?.contexts().at(-1)?.pages().at(-1)?.screenshot({ path: 'e2e-output/a11y-fallo.png', fullPage: true })
  } catch {}
} finally {
  await browser?.close()
  killVite()
}

console.log(report.join('\n'))
console.log(failures === 0 ? '\nSin infracciones WCAG 2.1 A/AA detectables por axe.' : `\n${failures} infracción(es).`)
process.exit(failures === 0 ? 0 : 1)
