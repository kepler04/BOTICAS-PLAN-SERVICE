// Capturas de pantalla para el README, tomadas de la DEMO (datos ficticios).
//   1) npx supabase start      2) npm run demo:reseed      3) npm run screenshots
// Guarda las imágenes en docs/screenshots/. Usa Edge/Chrome ya instalados (E2E_BROWSER para otra ruta).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { startVite, stopProcess, waitForHttp } from './lib/devServer.mjs'

const PROJECT = process.cwd()
const OUT = `${PROJECT}/docs/screenshots/`
mkdirSync(OUT, { recursive: true })

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
const PORT = 5175
const BASE = `http://127.0.0.1:${PORT}`
const vite = startVite(['--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  cwd: PROJECT,
  env: { ...process.env, VITE_SUPABASE_URL: j.API_URL, VITE_SUPABASE_ANON_KEY: j.ANON_KEY ?? j.PUBLISHABLE_KEY },
})
const killVite = () => stopProcess(vite.child)
const waitForServer = () => waitForHttp(BASE, { log: vite.log })

const taken = []
let browser
try {
  await waitForServer()
  browser = await chromium.launch({ executablePath: BROWSER, headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-PE', timezoneId: 'America/Lima', deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const desktop = page.viewportSize().width === 1280
  // Altura de ventana por captura (no fullPage: con fullPage la barra lateral fija queda cortada).
  const shot = async (name, { height = 800 } = {}) => {
    if (desktop && page.viewportSize().width === 1280) await page.setViewportSize({ width: 1280, height })
    await page.mouse.move(640, 3) // el mouse fuera de gráficos y botones: sin tooltips ni hover pegados
    await page.waitForTimeout(500) // deja terminar transiciones y re-render de gráficos
    await page.screenshot({ path: `${OUT}${name}.png` })
    taken.push(name)
  }

  // ---- Login ----
  await page.goto(BASE + '/login')
  await page.getByLabel('Correo electrónico').waitFor()
  await shot('01-login')
  await page.getByLabel('Correo electrónico').fill('demo@boticas-erp.demo')
  await page.getByLabel('Contraseña').fill('DemoBotica2026')
  await page.getByRole('button', { name: 'Ingresar' }).click()

  // ---- Dashboard ----
  await page.getByText('Hola, Admin').waitFor()
  await page.getByRole('img', { name: /Ventas de los últimos 7 días/ }).waitFor()
  await page.getByText('Requiere atención').waitFor()
  await page.getByText('Últimas ventas').first().waitFor()
  await shot('02-dashboard', { height: 1090 })

  // ---- Punto de venta ----
  await page.getByRole('link', { name: 'Ventas' }).first().click()
  await page.getByLabel('Buscar producto para vender').fill('paracetamol')
  await page.getByRole('button', { name: /Agregar caja de Paracetamol/ }).click()
  await page.getByRole('button', { name: /Agregar blíster de Paracetamol/ }).click()
  await page.getByLabel('Buscar producto para vender').fill('ibuprofeno')
  await page.getByRole('button', { name: /Agregar unidad de Ibuprofeno/ }).click()
  await page.getByLabel('Efectivo recibido (S/)').fill('100')
  await page.getByText(/Vuelto:/).waitFor()
  await shot('03-punto-de-venta')
  await page.getByRole('button', { name: /^Cobrar/ }).click()
  await page.getByText('COMPROBANTE INTERNO DE PRUEBA').first().waitFor()
  await shot('04-comprobante')
  await page.getByRole('dialog').getByRole('button', { name: 'Nueva venta' }).click()

  // ---- Productos ----
  await page.getByRole('link', { name: 'Productos' }).first().click()
  await page.getByRole('cell', { name: /Paracetamol 500 mg/ }).first().waitFor()
  await shot('05-productos')

  // ---- Inventario ----
  await page.getByRole('link', { name: 'Inventario' }).first().click()
  await page.getByRole('cell', { name: /Paracetamol 500 mg/ }).first().waitFor()
  await shot('06-inventario')
  await page.getByRole('tab', { name: 'Alertas' }).click()
  await page.getByRole('heading', { name: 'Vencimientos' }).waitFor()
  await page.getByRole('heading', { name: 'Stock bajo y agotados' }).waitFor()
  await page.getByRole('row').nth(1).waitFor()
  await shot('07-alertas-inventario', { height: 830 })

  // ---- Caja ----
  await page.getByRole('link', { name: 'Caja' }).first().click()
  await page.getByText('Caja abierta', { exact: true }).waitFor()
  await shot('08-caja')

  // ---- Reportes ----
  await page.getByRole('link', { name: 'Reportes' }).first().click()
  await page.getByRole('img', { name: /Ventas por día/ }).waitFor()
  await page.getByText('Ganancia estimada').first().waitFor()
  await shot('09-reportes-resumen', { height: 1160 })
  await page.getByRole('tab', { name: 'Productos' }).click()
  await page.getByRole('heading', { name: 'Baja rotación' }).waitFor()
  await page.getByRole('row').nth(1).waitFor()
  await shot('10-reportes-productos', { height: 1000 })
  await page.getByRole('tab', { name: 'Inventario' }).click()
  await page.getByText('Dinero en riesgo por vencimiento').waitFor()
  await page.getByText('Inventario a costo').waitFor()
  await shot('11-reportes-inventario')

  // ---- Configuración (IGV) ----
  await page.getByRole('link', { name: 'Configuración' }).first().click()
  await page.getByText('Impuesto General a las Ventas (IGV)').waitFor()
  await shot('15-configuracion', { height: 900 })

  // ---- Usuarios ----
  await page.getByRole('link', { name: 'Usuarios' }).first().click()
  await page.getByRole('heading', { name: 'Usuarios' }).waitFor()
  await page.getByText('cajero@boticas-erp.demo').waitFor()
  await shot('17-usuarios', { height: 560 })

  // ---- Alternativas por principio activo (producto agotado) ----
  await page.getByRole('link', { name: 'Ventas' }).first().click()
  await page.getByLabel('Buscar producto para vender').fill('diclofenaco')
  await page.getByText('Diclofenaco 50 mg').first().waitFor() // espera la lista ya filtrada
  await page.getByRole('listitem').filter({ hasText: 'Diclofenaco 50 mg' }).getByRole('button', { name: 'Ver alternativas' }).click()
  await page.getByRole('region', { name: /Alternativas a Diclofenaco 50 mg/ }).getByText('Diclofenaco 75 mg').waitFor()
  await shot('18-alternativas', { height: 900 })

  // ---- Cliente en la venta (más de S/ 700 exige DNI/RUC; el DNI conocido completa el nombre) ----
  // 7 cajas de amoxicilina (560) + 2 de naproxeno (140) + 2 de paracetamol (50) = S/ 750
  for (const [term, name, qty] of [['amoxicilina', 'Amoxicilina 500 mg', '7'], ['naproxeno', 'Naproxeno 550 mg', '2'], ['paracetamol', 'Paracetamol 500 mg', '2']]) {
    await page.getByLabel('Buscar producto para vender').fill(term)
    await page.getByRole('button', { name: new RegExp(`Agregar caja de ${name.split(' ')[0]}`) }).click()
    await page.getByLabel(`Cantidad de ${name} (caja)`).fill(qty)
  }
  await page.getByText('S/ 750.00').first().waitFor()
  await page.getByText('(obligatorio: la venta supera S/ 700)').waitFor()
  await page.getByLabel('Número de DNI').fill('40123456')
  await page.getByText('Cliente registrado.').waitFor()
  await shot('19-cliente-en-venta', { height: 1000 })

  // ---- Temperatura ----
  await page.getByRole('link', { name: 'Temperatura' }).first().click()
  await page.getByText('Últimos 30 días').waitFor()
  await page.getByText('Sin registro').first().waitFor()
  await shot('20-temperatura', { height: 1250 })

  // ---- Compras ----
  await page.getByRole('link', { name: 'Compras' }).first().click()
  await page.getByText('Factura F001-004512').waitFor()
  await page.getByRole('button', { name: 'Ver Factura F001-004512' }).click()
  await page.getByRole('dialog').getByText('Reposición quincenal').waitFor()
  await shot('21-compra', { height: 900 })
  await page.keyboard.press('Escape')

  // ---- Kardex ----
  await page.getByRole('link', { name: 'Inventario' }).first().click()
  await page.getByRole('tab', { name: 'Kardex' }).click()
  await page.getByLabel('Buscar producto').fill('paracetamol')
  await page.getByRole('button', { name: /Paracetamol 500 mg/ }).first().click()
  await page.getByText('Saldo al cierre').waitFor()
  await shot('22-kardex', { height: 900 })

  // ---- Móvil ----
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE + '/ventas')
  await page.getByLabel('Buscar producto para vender').fill('loratadina')
  await page.getByRole('button', { name: /Agregar blíster de Loratadina/ }).click()
  await shot('12-movil-punto-de-venta')
  await page.goto(BASE + '/')
  await page.getByText('Requiere atención').waitFor()
  await shot('13-movil-dashboard')
  await page.goto(BASE + '/reportes')
  await page.getByRole('img', { name: /Ventas por día/ }).waitFor()
  await shot('14-movil-reportes')
  console.log(`✔ ${taken.length} capturas en docs/screenshots/: ${taken.join(', ')}`)
} catch (e) {
  console.error('Falló la captura:', String(e.message).split('\n')[0])
  try {
    await browser?.contexts()[0]?.pages()[0]?.screenshot({ path: `${OUT}zz-fallo.png` })
  } catch {}
  process.exitCode = 1
} finally {
  await browser?.close()
  killVite()
}
