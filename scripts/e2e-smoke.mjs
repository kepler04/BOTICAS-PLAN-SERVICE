// Prueba de humo E2E: recorrido real en un navegador contra la app (Vite) + Supabase LOCAL.
//   1) npx supabase start      2) npm run test:e2e
// Registra una cuenta y una botica nuevas en cada corrida (solo toca la BD local).
// Navegador: usa Edge/Chrome ya instalados. Otra ruta: E2E_BROWSER="C:/ruta/chrome.exe".
// Capturas en ./e2e-output/ (ignorada por git).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { startVite, stopProcess, waitForHttp } from './lib/devServer.mjs'

const PROJECT = process.cwd()
/** Fecha local + n días como YYYY-MM-DD (para <input type="date">). */
const addDaysISO = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const SHOTS = `${PROJECT}/e2e-output/`
mkdirSync(SHOTS, { recursive: true })

const BROWSERS = [
  process.env.E2E_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const BROWSER = BROWSERS.find((p) => existsSync(p))
if (!BROWSER) {
  console.error('No encontré Edge ni Chrome. Define E2E_BROWSER con la ruta del ejecutable.')
  process.exit(1)
}

const st = spawnSync('npx', ['supabase', 'status', '-o', 'json'], { cwd: PROJECT, encoding: 'utf8', shell: true })
const j = JSON.parse(st.stdout.slice(st.stdout.indexOf('{')))
const PORT = 5174
const BASE = `http://127.0.0.1:${PORT}`

const vite = startVite(['--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  cwd: PROJECT,
  env: { ...process.env, VITE_SUPABASE_URL: j.API_URL, VITE_SUPABASE_ANON_KEY: j.ANON_KEY ?? j.PUBLISHABLE_KEY },
})
const killVite = () => stopProcess(vite.child)
const waitForServer = () => waitForHttp(BASE, { log: vite.log })


// ---- Datos de apoyo (solo Supabase LOCAL): historial de ventas y un cajero ----
const SVC = j.SERVICE_ROLE_KEY ?? j.SECRET_KEY
const ANON = j.ANON_KEY ?? j.PUBLISHABLE_KEY
async function rest(method, path, body) {
  const r = await fetch(`${j.API_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`)
  return r.json()
}

let seededPharmacyId = null

/** 24 ventas (una por día, de hace 1 a 24 días): cajas de 100 u. a S/ 40, costo S/ 0.25 por unidad. */
async function seedHistory() {
  const [ph] = await rest('GET', 'pharmacies?select=id&legal_name=eq.Botica%20Prueba%20E2E%20S.A.C.&order=created_at.desc&limit=1')
  seededPharmacyId = ph.id
  const [branch] = await rest('GET', `branches?select=id&pharmacy_id=eq.${ph.id}&is_main=eq.true`)
  const [prod] = await rest('GET', `products?select=id,name&pharmacy_id=eq.${ph.id}&limit=1`)
  const [lot] = await rest('GET', `lots?select=id&product_id=eq.${prod.id}&limit=1`)
  const [cash] = await rest('GET', `cash_sessions?select=id&branch_id=eq.${branch.id}&limit=1`)
  const methods = ['cash', 'yape', 'plin', 'cash', 'cash', 'yape']
  const sales = []
  const items = []
  const lots = []
  for (let i = 1; i <= 24; i++) {
    const qty = 1 + (i % 3)
    const total = 40 * qty
    const id = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    // 10:00 en Lima (15:00 UTC) del día de Lima de hace `i` días. No se deriva del día UTC: de noche ya es "mañana".
    const limaDay = new Date(Date.now() - i * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const when = new Date(`${limaDay}T15:00:00Z`)
    sales.push({ id, pharmacy_id: ph.id, branch_id: branch.id, cash_session_id: cash.id, receipt_number: 100 + i, status: 'completed', payment_method: methods[i % methods.length], total, amount_received: total, change_given: 0, created_at: when.toISOString() })
    items.push({ id: itemId, pharmacy_id: ph.id, sale_id: id, product_id: prod.id, product_name: prod.name, presentation: 'box', quantity: qty, units_per_presentation: 100, base_quantity: 100 * qty, unit_price: 40, line_total: total })
    lots.push({ pharmacy_id: ph.id, sale_item_id: itemId, lot_id: lot.id, quantity: 100 * qty, unit_cost: 0.25 })
  }
  await rest('POST', 'sales', sales)
  await rest('POST', 'sale_items', items)
  await rest('POST', 'sale_item_lots', lots)
}

async function createCashier() {
  const email = `cajero-${Date.now().toString(36)}@test.local`
  const r = await fetch(`${j.API_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'clave-segura-123', data: { full_name: 'Cajero Prueba' } }),
  })
  const user = (await r.json()).user
  if (!user) throw new Error('No se pudo crear el cajero')
  await rest('POST', 'pharmacy_members', { pharmacy_id: seededPharmacyId, user_id: user.id, role: 'cashier' })
  return email
}

const results = []
const problems = []
const step = async (name, fn) => {
  try {
    await fn()
    results.push(`OK   ${name}`)
  } catch (e) {
    results.push(`FAIL ${name}\n       ${String(e.message).split('\n')[0]}`)
    throw e
  }
}

const email = `e2e-${Date.now().toString(36)}@test.local`
let browser
try {
  await waitForServer()
  browser = await chromium.launch({
    executablePath: BROWSER,
    headless: true,
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) problems.push(`[console.${m.type()}] ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message.slice(0, 300)}`))
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/auth/v1/token')) problems.push(`[http ${r.status()}] ${r.request().method()} ${r.url().replace(j.API_URL, '')}`.slice(0, 250))
  })
  const shot = (n) => page.screenshot({ path: `${SHOTS}${n}.png`, fullPage: true })

  await step('Login muestra enlace para registrar botica', async () => {
    await page.goto(BASE + '/login')
    await page.getByRole('link', { name: 'Registra tu botica' }).click()
    await page.waitForURL('**/registro')
    await shot('01-registro')
  })

  await step('Crear cuenta -> pantalla "Registra tu botica"', async () => {
    await page.getByLabel('Tu nombre').fill('María Pérez')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-123')
    await page.getByLabel('Confirmar contraseña').fill('clave-segura-123')
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await page.getByRole('button', { name: 'Registrar mi botica' }).waitFor()
    await shot('02-registrar-botica')
  })

  await step('Registrar botica -> Dashboard', async () => {
    await page.getByLabel('Nombre o razón social').fill('Botica Prueba E2E S.A.C.')
    await page.getByLabel('Nombre comercial (opcional)').fill('Botica Prueba')
    await page.getByRole('button', { name: 'Registrar mi botica' }).click()
    await page.getByText('Hola, María').waitFor()
    await page.getByText('Sucursal principal: Sucursal Principal').waitFor()
    await shot('03-dashboard-vacio')
  })

  await step('Dashboard con indicadores reales en 0', async () => {
    const prod = page.getByRole('link', { name: /Productos/ }).filter({ hasText: 'Activos en el catálogo' })
    await prod.getByText('0', { exact: true }).waitFor()
  })

  await step('Productos: lista vacía + crear producto con blíster y caja', async () => {
    await page.getByRole('link', { name: 'Productos' }).first().click()
    await page.getByText('Aún no tienes productos').waitFor()
    await page.getByRole('button', { name: 'Nuevo producto' }).click()
    await page.getByRole('dialog').getByText('Nuevo producto').first().waitFor()
    await page.getByLabel('Nombre', { exact: true }).fill('Paracetamol 500 mg')
    await page.getByLabel('Principio activo (opcional)').fill('Paracetamol')
    await page.getByLabel('Código de barras (opcional)').fill('7750001')
    await page.getByLabel('Nombre de la unidad').fill('tableta')
    await page.getByLabel(/^Precio por tableta/).fill('0.50')
    await page.getByRole('switch', { name: 'Se vende por blíster' }).click()
    await page.getByLabel('Unidades por blíster').fill('10')
    await page.getByLabel('Precio del blíster (S/)').fill('4.50')
    await page.getByRole('switch', { name: 'Se vende por caja' }).click()
    await page.getByLabel('Unidades por caja').fill('100')
    await page.getByLabel('Precio de la caja (S/)').fill('40')
    await page.getByLabel(/^Stock mínimo/).fill('50')
    await shot('04-form-producto')
    await page.getByRole('button', { name: 'Crear producto' }).click()
    await page.getByRole('cell', { name: /Paracetamol 500 mg/ }).first().waitFor()
    await shot('05-productos')
  })

  await step('Validación: caja que no es múltiplo del blíster', async () => {
    await page.getByRole('button', { name: 'Nuevo producto' }).click()
    await page.getByLabel('Nombre', { exact: true }).fill('Producto raro')
    await page.getByLabel(/^Precio por/).fill('1')
    await page.getByRole('switch', { name: 'Se vende por blíster' }).click()
    await page.getByLabel('Unidades por blíster').fill('10')
    await page.getByLabel('Precio del blíster (S/)').fill('8')
    await page.getByRole('switch', { name: 'Se vende por caja' }).click()
    await page.getByLabel('Unidades por caja').fill('25')
    await page.getByLabel('Precio de la caja (S/)').fill('20')
    await page.getByRole('button', { name: 'Crear producto' }).click()
    await page.getByText(/múltiplo de 10/).waitFor()
    await shot('06-validacion')
    await page.getByRole('button', { name: 'Cancelar' }).click()
  })

  await step('Error de código de barras duplicado en español', async () => {
    await page.getByRole('button', { name: 'Nuevo producto' }).click()
    await page.getByLabel('Nombre', { exact: true }).fill('Otro con mismo código')
    await page.getByLabel(/^Precio por/).fill('1')
    await page.getByLabel('Código de barras (opcional)').fill('7750001')
    await page.getByRole('button', { name: 'Crear producto' }).click()
    await page.getByText('Ya existe un producto con ese código de barras.').waitFor()
    await page.getByRole('button', { name: 'Cancelar' }).click()
  })

  await step('Categorías: crear una nueva', async () => {
    await page.getByRole('button', { name: 'Categorías' }).click()
    await page.getByLabel('Nombre de la nueva categoría').fill('Categoría E2E')
    await page.getByRole('button', { name: 'Agregar' }).click()
    await page.getByRole('listitem').filter({ hasText: 'Categoría E2E' }).waitFor()
    await shot('07-categorias')
    await page.keyboard.press('Escape')
  })

  await step('Inventario: registrar entrada buscando el producto', async () => {
    await page.getByRole('link', { name: 'Inventario' }).first().click()
    await page.getByRole('tab', { name: 'Stock' }).waitFor()
    await page.getByRole('button', { name: 'Registrar entrada', exact: true }).click()
    await page.getByLabel('Buscar producto').fill('parace')
    await page.getByRole('button', { name: /Paracetamol 500 mg/ }).click()
    await page.getByLabel('Cantidad').fill('3')
    await page.getByLabel('N.º de lote').fill('L-2026-001')
    await page.getByLabel('Fecha de vencimiento').fill('2028-12-31')
    await page.getByLabel(/^Costo por/).fill('40')
    await page.getByText(/Ingresarán/).waitFor()
    await shot('08-entrada')
    await page.getByRole('dialog').getByRole('button', { name: 'Registrar entrada', exact: true }).click()
    await page.getByRole('cell', { name: /3 cajas/ }).waitFor()
    await shot('09-stock')
  })

  await step('Lotes + ajuste (merma) con vista previa', async () => {
    await page.getByRole('button', { name: /Ver lotes de Paracetamol/ }).click()
    await page.getByRole('cell', { name: 'L-2026-001', exact: true }).waitFor()
    await page.getByRole('button', { name: /Ajustar lote L-2026-001/ }).click()
    await page.getByLabel('Cantidad').fill('5')
    await page.getByLabel('Motivo').fill('Blíster dañado')
    await page.getByText(/El lote quedará con/).waitFor()
    await shot('10-ajuste')
    await page.getByRole('button', { name: 'Confirmar ajuste' }).click()
    await page.getByRole('cell', { name: /2 cajas, 9 blísters, 5 tabletas/ }).waitFor()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })

  await step('Movimientos: entrada y merma con usuario', async () => {
    await page.getByRole('tab', { name: 'Movimientos' }).click()
    await page.getByRole('cell', { name: 'Merma', exact: true }).waitFor()
    await page.getByRole('cell', { name: 'Entrada', exact: true }).waitFor()
    await page.getByRole('cell', { name: 'María Pérez' }).first().waitFor()
    await shot('11-movimientos')
  })

  await step('Alertas: pestaña carga sin errores', async () => {
    await page.getByRole('tab', { name: 'Alertas' }).click()
    await page.getByRole('heading', { name: 'Vencimientos' }).waitFor()
    await page.getByRole('heading', { name: 'Stock bajo y agotados' }).waitFor()
    await shot('12-alertas')
  })

  await step('Dashboard refleja 1 producto', async () => {
    await page.getByRole('link', { name: 'Dashboard' }).first().click()
    await page.getByText('Hola, María').waitFor()
    const prod = page.getByRole('link', { name: /Productos/ }).filter({ hasText: 'Activos en el catálogo' })
    await prod.getByText('1', { exact: true }).waitFor()
    await shot('13-dashboard')
  })

  await step('Ventas con la caja cerrada: aviso y cobro deshabilitado', async () => {
    await page.getByRole('link', { name: 'Ventas' }).first().click()
    await page.getByText('La caja está cerrada. Ábrela para poder cobrar.').waitFor()
    await page.getByLabel('Buscar producto para vender').fill('parace')
    await page.getByRole('button', { name: /Agregar unidad de Paracetamol/ }).click()
    const cobrar = page.getByRole('button', { name: /^Cobrar/ }).first()
    if (!(await cobrar.isDisabled())) throw new Error('Cobrar debería estar deshabilitado con la caja cerrada')
    await shot('15-caja-cerrada')
  })

  await step('Caja: abrir con S/ 100', async () => {
    await page.getByRole('link', { name: 'Caja' }).first().click()
    await page.getByText('La caja está cerrada').first().waitFor()
    await page.getByLabel('Efectivo inicial (S/)').fill('100')
    await page.getByRole('button', { name: 'Abrir caja' }).click()
    await page.getByText('Caja abierta', { exact: true }).waitFor()
    await shot('16-caja-abierta')
  })

  await step('POS: agregar caja y unidad, cobrar en efectivo con vuelto', async () => {
    await page.getByRole('link', { name: 'Ventas' }).first().click()
    await page.getByLabel('Buscar producto para vender').fill('parace')
    await page.getByRole('button', { name: /Agregar caja de Paracetamol/ }).click()
    await page.getByRole('button', { name: /Agregar unidad de Paracetamol/ }).click()
    await page.getByRole('button', { name: /^Cobrar.*40[.,]50/ }).waitFor()
    await page.getByLabel('Efectivo recibido (S/)').fill('50')
    await page.getByText(/Vuelto: .*9[.,]50/).waitFor()
    await shot('17-pos')
    await page.getByRole('button', { name: /^Cobrar/ }).click()
    await page.getByText('COMPROBANTE INTERNO DE PRUEBA').first().waitFor()
    await page.getByText(/T001-000001/).first().waitFor()
    await shot('18-comprobante')
    await page.getByRole('dialog').getByRole('button', { name: 'Nueva venta' }).click()
  })

  await step('Descontó el stock vendido (la caja se vendió por FEFO)', async () => {
    await page.getByRole('link', { name: 'Inventario' }).first().click()
    // 3 cajas - 5 tabletas (merma) - 1 caja - 1 tableta = 1 caja, 9 blísters, 4 tabletas
    await page.getByRole('cell', { name: /1 caja, 9 blísters, 4 tabletas/ }).first().waitFor()
  })

  await step('Dashboard muestra la venta del día', async () => {
    await page.getByRole('link', { name: 'Dashboard' }).first().click()
    const card = page.getByRole('link', { name: /Ventas del día/ })
    await card.getByText('1', { exact: true }).waitFor()
    await page.getByRole('link', { name: /Ingresos/ }).getByText(/40[.,]50/).waitFor()
    await shot('19-dashboard-ventas')
  })

  await step('Historial: abrir la venta y anularla (admin)', async () => {
    await page.getByRole('link', { name: 'Ventas' }).first().click()
    await page.getByRole('tab', { name: 'Historial' }).click()
    await page.getByRole('button', { name: /Ver venta T001-000001/ }).click()
    await page.getByRole('button', { name: 'Anular', exact: true }).click()
    await page.getByLabel('Motivo').fill('Error de cobro')
    await page.getByRole('dialog').last().getByRole('button', { name: 'Anular venta', exact: true }).click()
    await page.getByText('Anulada', { exact: true }).waitFor()
    await shot('20-venta-anulada')
  })

  await step('Anular devolvió el stock', async () => {
    await page.getByRole('link', { name: 'Inventario' }).first().click()
    await page.getByRole('cell', { name: /2 cajas, 9 blísters, 5 tabletas/ }).first().waitFor()
    await page.getByRole('tab', { name: 'Movimientos' }).click()
    await page.getByRole('cell', { name: 'Anulación', exact: true }).waitFor()
    await page.getByRole('cell', { name: 'Venta', exact: true }).first().waitFor()
  })

  await step('Caja: cerrar sin diferencia (la venta anulada no suma)', async () => {
    await page.getByRole('link', { name: 'Caja' }).first().click()
    await page.getByRole('button', { name: 'Cerrar caja' }).click()
    await page.getByLabel('Efectivo contado (S/)').fill('100')
    await page.getByText('Cuadra exacto.').waitFor()
    await shot('21-cerrar-caja')
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar caja', exact: true }).click()
    await page.getByText('La caja está cerrada').first().waitFor()
    await page.getByRole('tab', { name: 'Historial' }).click()
    await page.getByText('Cuadra', { exact: true }).waitFor()
    await shot('22-historial-cajas')
  })

  await step('Preparar historial: 24 días de ventas y un cajero', async () => {
    await seedHistory()
  })

  await step('Reportes: cifras clave y gráfico (30 días)', async () => {
    await page.getByRole('link', { name: 'Reportes' }).first().click()
    await page.getByRole('heading', { name: 'Reportes' }).waitFor()
    const text = async () => page.locator('main').innerText()
    // 24 ventas de 40 × (2,3,1…) = 1,920.00 | costo 0.25 × 100 × 48 = 1,200.00 | ganancia 720.00 | margen 37.5 %
    await page.getByText('Sin datos del periodo anterior').first().waitFor()
    await page.getByText('37.5 %').waitFor()
    const t = await text()
    if (!/1,?920\.00/.test(t)) throw new Error('Ventas no suman S/ 1,920.00')
    if (!/720\.00/.test(t)) throw new Error('Ganancia no es S/ 720.00')
    if (!/80\.00/.test(t)) throw new Error('Ticket promedio no es S/ 80.00')
    await page.getByRole('img', { name: /Ventas por día/ }).waitFor()
    await page.getByText(/Mejor día:/).waitFor()
    await shot('24-reportes-resumen')
  })

  await step('Reportes: tooltip del gráfico al pasar el mouse', async () => {
    const chart = page.getByRole('img', { name: /Ventas por día/ })
    const box = await chart.boundingBox()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
    await page.getByText(/\d+ ventas?$/).first().waitFor({ timeout: 4000 })
    await shot('25-reportes-tooltip')
  })

  await step('Reportes: vista de tabla equivalente y descarga de CSV', async () => {
    await page.getByRole('button', { name: 'Tabla' }).first().click()
    await page.getByRole('columnheader', { name: 'Ganancia' }).waitFor()
    await shot('26-reportes-tabla')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).first().click()])
    const csv = readFileSync(await download.path(), 'utf8')
    if (!csv.startsWith('\uFEFFFecha,N.º de ventas,Total cobrado (S/),IGV cobrado (S/)')) throw new Error('Encabezado de CSV inesperado: ' + csv.slice(0, 60))
    const lines = csv.trim().split('\r\n')
    if (lines.length !== 31) throw new Error(`El CSV debe tener 30 días + encabezado, tiene ${lines.length}`)
    await page.getByRole('button', { name: 'Gráfico' }).first().click()
  })

  await step('Reportes: cambiar periodo y validar rango personalizado', async () => {
    await page.getByRole('button', { name: 'Últimos 7 días' }).click()
    // Hoy + 6 días atrás = ventas de hace 1 a 6 días: cajas 2,3,1,2,3,1 = 12 = S/ 480.00.
    // El periodo anterior (hace 7 a 13 días) vendió S/ 560.00, o sea -14.3 %.
    await page.getByText(/480\.00/).first().waitFor()
    await page.getByText(/−14\.3 %/).first().waitFor()
    await page.getByRole('button', { name: 'Personalizado' }).click()
    await page.getByLabel('Desde').fill('2099-01-02')
    await page.getByLabel('Hasta').fill('2099-01-01')
    await page.getByRole('alert').getByText(/Elige fechas válidas/).waitFor()
    await page.getByRole('button', { name: 'Últimos 30 días' }).click()
  })

  await step('Reportes: pestaña Ganancia y pestaña Productos', async () => {
    await page.getByRole('tab', { name: 'Ganancia' }).click()
    await page.getByRole('img', { name: /Ganancia estimada del/ }).waitFor()
    await page.getByRole('tab', { name: 'Productos' }).click()
    await page.getByRole('heading', { name: 'Productos más vendidos' }).waitFor()
    await page.getByRole('listitem').filter({ hasText: 'Paracetamol 500 mg' }).first().waitFor()
    await page.getByLabel('Ordenar productos').selectOption('units')
    await page.getByRole('heading', { name: 'Baja rotación' }).waitFor()
    await shot('27-reportes-productos')
  })

  await step('Reportes: inventario valorizado a costo', async () => {
    await page.getByRole('tab', { name: 'Inventario' }).click()
    await page.getByText('Inventario a costo').waitFor()
    // La entrada se hizo con "el costo incluye IGV" (por defecto): 40.00 con IGV = 33.90 sin IGV por caja.
    // 295 unidades × (40 / 1.18 / 100) = S/ 100.00 a costo SIN IGV (con IGV habrían sido 118.00).
    await page.getByText(/100.0[01]/).first().waitFor() // costo por unidad con 4 decimales (0.3390): 295 u. = 100.005
    await page.getByText('Dinero en riesgo por vencimiento').waitFor()
    await shot('28-reportes-inventario')
  })

  await step('Dashboard: gráfico de 7 días, últimas ventas y atención', async () => {
    await page.getByRole('link', { name: 'Dashboard' }).first().click()
    await page.getByRole('img', { name: /Ventas de los últimos 7 días/ }).waitFor()
    await page.getByRole('heading', { name: 'Últimas ventas' }).waitFor().catch(() => {})
    await page.getByText('Últimas ventas').first().waitFor()
    await page.getByText('Requiere atención').waitFor()
    await shot('29-dashboard-completo')
  })

  await step('Cajero: no ve el gráfico ni entra a Reportes (403)', async () => {
    const email = await createCashier()
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' })
    const cashierPage = await ctx.newPage()
    cashierPage.setDefaultTimeout(10000)
    await cashierPage.goto(BASE + '/login')
    await cashierPage.getByLabel('Correo electrónico').fill(email)
    await cashierPage.getByLabel('Contraseña').fill('clave-segura-123')
    await cashierPage.getByRole('button', { name: 'Ingresar' }).click()
    await cashierPage.getByText('Hola, Cajero').waitFor()
    if ((await cashierPage.getByRole('link', { name: 'Reportes' }).count()) !== 0) throw new Error('El cajero ve el enlace a Reportes')
    if ((await cashierPage.getByText('Últimos 7 días').count()) !== 0) throw new Error('El cajero ve el gráfico financiero')
    await cashierPage.getByText('Requiere atención').waitFor() // sí ve alertas de inventario
    await cashierPage.goto(BASE + '/reportes')
    await cashierPage.getByText('403 · Sin permiso').waitFor()
    await cashierPage.screenshot({ path: `${SHOTS}30-cajero-403.png` })
    await ctx.close()
  })

  await step('Caja: abrir de nuevo con S/ 50', async () => {
    await page.getByRole('link', { name: 'Caja' }).first().click()
    await page.getByText('La caja está cerrada').first().waitFor()
    await page.getByLabel('Efectivo inicial (S/)').fill('50')
    await page.getByRole('button', { name: 'Abrir caja' }).click()
    await page.getByText('Caja abierta', { exact: true }).waitFor()
  })

  await step('POS: IGV 18 % en el carrito, pago con tarjeta y desglose en el comprobante', async () => {
    await page.getByRole('link', { name: 'Ventas' }).first().click()
    await page.getByLabel('Buscar producto para vender').fill('parace')
    await page.getByRole('button', { name: /Agregar caja de Paracetamol/ }).click()
    // Caja de 40.00 (gravada): base 33.90 + IGV 6.10
    await page.getByText(/IGV \(18 %\) incluido/).waitFor()
    await page.getByRole('radio', { name: 'Tarjeta' }).click()
    await page.getByLabel('N.º de operación (opcional)').fill('POS-0001')
    await shot('32-pos-igv-tarjeta')
    await page.getByRole('button', { name: /^Cobrar/ }).click()
    await page.getByText('COMPROBANTE INTERNO DE PRUEBA').first().waitFor()
    await page.getByRole('dialog').getByText('Pago: Tarjeta').first().waitFor() // el comprobante termina de cargar (cabecera y desglose llegan por separado)
    const receipt = await page.getByRole('dialog').innerText()
    if (!/Op\. gravada/.test(receipt) || !/IGV \(18 %\)/.test(receipt)) throw new Error('El comprobante no desglosa el IGV')
    if (!/33[.,]90/.test(receipt) || !/6[.,]10/.test(receipt)) throw new Error('Base 33.90 / IGV 6.10 incorrectos en el comprobante')
    if (!/Pago: Tarjeta/.test(receipt)) throw new Error('El comprobante no indica pago con tarjeta')
    await shot('33-comprobante-igv')
    await page.getByRole('dialog').getByRole('button', { name: 'Nueva venta' }).click()
  })

  await step('Productos: la afectación al IGV está en el formulario', async () => {
    await page.getByRole('link', { name: 'Productos' }).first().click()
    await page.getByRole('button', { name: 'Nuevo producto' }).click()
    await page.getByLabel('Afectación al IGV').selectOption('exonerado')
    await page.getByText(/listas oficiales/).waitFor()
    await page.getByRole('button', { name: 'Cancelar' }).click()
  })

  await step('Configuración: desactivar y volver a activar el cobro de IGV', async () => {
    await page.getByRole('link', { name: 'Configuración' }).first().click()
    await page.getByRole('heading', { name: 'Configuración' }).waitFor()
    await page.getByText('Impuesto General a las Ventas (IGV)').waitFor()
    await shot('34-configuracion')
    const sw = page.getByRole('switch', { name: 'Mi botica cobra IGV' })
    if ((await sw.getAttribute('aria-checked')) !== 'true') throw new Error('Debería estar activado por defecto')
    await sw.click()
    await page.getByText(/Las ventas no desglosan IGV/).waitFor()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.getByText('Configuración guardada.').waitFor()
    await page.getByRole('switch', { name: 'Mi botica cobra IGV' }).click()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.getByText('Configuración guardada.').first().waitFor()
  })

  await step('Reportes con IGV: venta neta e IGV cobrado', async () => {
    await page.getByRole('link', { name: 'Reportes' }).first().click()
    await page.getByText('IGV cobrado').first().waitFor()
    await page.getByText('Venta neta (sin IGV)').waitFor()
    await shot('35-reportes-igv')
  })

  await step('Usuarios: invitar a un cajero, abrir su enlace, definir contraseña y luego desactivarlo', async () => {
    const email = `e2e-invitada-${Date.now()}@test.local`
    await page.getByRole('link', { name: 'Usuarios' }).first().click()
    await page.getByRole('heading', { name: 'Usuarios' }).waitFor()
    await page.getByRole('button', { name: 'Invitar usuario' }).click()
    await page.getByLabel('Nombre (opcional)').fill('Rosa Invitada')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByRole('button', { name: 'Crear invitación' }).click()
    await page.getByText('Invitación creada').waitFor()
    const link = await page.getByLabel('Enlace de invitación').inputValue()
    if (!link.includes('/auth/v1/verify')) throw new Error('El enlace de invitación no es el esperado')
    await shot('36-invitacion')
    await page.getByRole('button', { name: 'Listo' }).click()
    await page.getByText('Rosa Invitada').first().waitFor()

    // La invitada abre el enlace (otro navegador), elige contraseña y entra como cajera.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' })
    const guest = await ctx.newPage()
    guest.setDefaultTimeout(10000)
    await guest.goto(link)
    await guest.getByLabel('Nueva contraseña').fill('clave-segura-123')
    await guest.getByLabel('Confirmar contraseña').fill('clave-segura-123')
    await guest.getByRole('button', { name: /Guardar|Actualizar|Cambiar/ }).click()
    await guest.getByText('Hola, Rosa').waitFor()
    if ((await guest.getByRole('link', { name: 'Reportes' }).count()) !== 0) throw new Error('La cajera invitada ve Reportes')
    await ctx.close()

    // El administrador la desactiva y la lista lo refleja.
    await page.getByRole('button', { name: 'Desactivar a Rosa Invitada' }).click()
    await page.getByRole('button', { name: 'Activar a Rosa Invitada' }).waitFor()
    await shot('37-usuarios')
  })

  await step('Temperatura: aviso en el dashboard, registro y fuera de rango con nota', async () => {
    await page.getByRole('link', { name: 'Dashboard' }).first().click()
    await page.getByRole('link', { name: /Falta registrar la temperatura de hoy/ }).click()
    await page.getByRole('heading', { name: 'Temperatura y humedad' }).waitFor()
    await page.getByText('Aún no se registra la temperatura de hoy.').waitFor()
    await page.getByLabel('Temperatura (°C) · Ambiente').fill('22.5')
    await page.getByLabel('Humedad (%) · Ambiente').fill('55')
    await page.getByRole('button', { name: 'Registrar ambiente' }).click()
    await page.getByText('Ambiente: lectura registrada.').waitFor()
    // Refrigeración a 9 °C: fuera de 2-8, exige anotar qué se hizo.
    await page.getByLabel('Temperatura (°C) · Refrigeración').fill('9')
    await page.getByRole('button', { name: 'Registrar refrigeración' }).click()
    await page.getByText('Fuera de rango: anota qué se hizo').waitFor()
    await page.getByLabel('¿Qué se hizo? · Refrigeración').fill('Se cerró bien la puerta y se revisó en 1 hora')
    await page.getByRole('button', { name: 'Registrar refrigeración' }).click()
    await page.getByText('Refrigeración: lectura registrada.').waitFor()
    await page.getByText('Hoy ya hay 2 lecturas.').waitFor()
    await page.getByText('Sin registro').first().waitFor() // los días anteriores no tienen lecturas
    await shot('38-temperatura')
  })

  await step('Compras: proveedor con RUC validado y factura de 20 cajas', async () => {
    await page.getByRole('link', { name: 'Compras' }).first().click()
    await page.getByText('Aún no registras compras').waitFor()
    await page.getByRole('tab', { name: 'Proveedores' }).click()
    await page.getByRole('button', { name: 'Nuevo proveedor' }).click()
    await page.getByLabel('Nombre o razón social').fill('Droguería Andina SAC')
    await page.getByLabel('RUC (opcional)').fill('20131312954')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.getByText(/RUC no válido/).waitFor()
    await page.getByLabel('RUC (opcional)').fill('20131312955')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.getByText('Proveedor creado.').waitFor()

    await page.getByRole('button', { name: 'Registrar compra' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Proveedor').selectOption({ label: 'Droguería Andina SAC · RUC 20131312955' })
    await dlg.getByLabel('N.º de documento').fill('F001-000123')
    await dlg.getByLabel('Buscar producto').fill('paracetamol')
    await dlg.getByRole('button', { name: /Paracetamol 500 mg/ }).first().click()
    await dlg.getByLabel('Cantidad de Paracetamol 500 mg').fill('20')
    await dlg.getByLabel('Costo por presentación de Paracetamol 500 mg').fill('23.60') // con IGV: 20.00 sin IGV
    await dlg.getByLabel('Lote de Paracetamol 500 mg').fill('COMPRA-E2E')
    await dlg.getByLabel('Vencimiento de Paracetamol 500 mg').fill(addDaysISO(400))
    await dlg.getByText(/2000 tabletas a S\/ 0\.20 c\/u sin IGV/).waitFor()
    await dlg.getByText('S/ 472.00').waitFor() // 400.00 + IGV 72.00
    await shot('39-registrar-compra')
    await dlg.getByRole('button', { name: 'Registrar compra' }).click()
    await page.getByText('Compra registrada: 1 producto, S/ 472.00.').waitFor()
    await page.getByRole('tab', { name: 'Compras' }).click()
    await page.getByText('Factura F001-000123').waitFor()
  })

  await step('Compras: la misma factura del mismo proveedor no se registra dos veces', async () => {
    await page.getByRole('button', { name: 'Registrar compra' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Proveedor').selectOption({ label: 'Droguería Andina SAC · RUC 20131312955' })
    await dlg.getByLabel('N.º de documento').fill('f001-000123')
    await dlg.getByLabel('Buscar producto').fill('paracetamol')
    await dlg.getByRole('button', { name: /Paracetamol 500 mg/ }).first().click()
    await dlg.getByLabel('Cantidad de Paracetamol 500 mg').fill('1')
    await dlg.getByLabel('Costo por presentación de Paracetamol 500 mg').fill('23.60')
    await dlg.getByLabel('Lote de Paracetamol 500 mg').fill('OTRO')
    await dlg.getByLabel('Vencimiento de Paracetamol 500 mg').fill(addDaysISO(400))
    await dlg.getByRole('button', { name: 'Registrar compra' }).click()
    await dlg.getByText(/ya fue registrado/).waitFor()
    await dlg.getByRole('button', { name: 'Cancelar' }).click()
  })

  await step('Kardex: la compra aparece con su factura y el saldo cuadra con el stock', async () => {
    await page.getByRole('link', { name: 'Inventario' }).first().click()
    await page.getByRole('tab', { name: 'Kardex' }).click()
    await page.getByLabel('Buscar producto').fill('paracetamol')
    await page.getByRole('button', { name: /Paracetamol 500 mg/ }).first().click()
    await page.getByText('Factura F001-000123 · Droguería Andina SAC').waitFor()
    const summary = await page.getByText('Saldo al cierre').innerText()
    const units = Number(/(\d+) tableta/.exec(summary)?.[1])
    // 2000 tabletas compradas + lo que quedaba de la entrada inicial.
    if (!(units >= 2000)) throw new Error(`Saldo del kardex inesperado: ${summary}`)
    await shot('40-kardex')
  })

  await step('POS: una venta de más de S/ 700 exige el DNI del cliente y lo imprime', async () => {
    await page.getByRole('link', { name: 'Ventas' }).first().click()
    await page.getByLabel('Buscar producto para vender').fill('parace')
    // Espera el stock ya actualizado tras la compra (la lista muestra primero lo que tenía en caché).
    await page.getByText(/Stock: 2\d cajas/).waitFor()
    await page.getByRole('button', { name: /Agregar caja de Paracetamol/ }).click()
    await page.getByLabel('Cantidad de Paracetamol 500 mg (caja)').fill('18') // 18 x 40.00 = 720.00
    await page.getByText('(obligatorio: la venta supera S/ 700)').waitFor()
    await page.getByRole('radio', { name: 'Tarjeta' }).click()
    if (await page.getByRole('button', { name: /^Cobrar/ }).isEnabled()) throw new Error('Deja cobrar más de S/ 700 sin cliente')
    await page.getByLabel('Número de DNI').fill('4567891')
    await page.getByLabel('Nombre o razón social del cliente').fill('Rosa Quispe')
    await page.getByText('Documento no válido').waitFor()
    await page.getByLabel('Número de DNI').fill('45678912')
    await shot('41-pos-cliente')
    await page.getByRole('button', { name: /^Cobrar/ }).click()
    const receipt = page.getByRole('dialog')
    await receipt.getByText('Cliente: Rosa Quispe').waitFor()
    await receipt.getByText('DNI: 45678912').waitFor()
    await receipt.getByRole('button', { name: 'Nueva venta' }).click()

    // La siguiente venta reconoce al cliente por su DNI.
    await page.getByLabel('Buscar producto para vender').fill('parace')
    await page.getByRole('button', { name: /Agregar unidad de Paracetamol/ }).click()
    await page.getByRole('button', { name: 'Agregar cliente (DNI / RUC)' }).click()
    await page.getByLabel('Número de DNI').fill('45678912')
    await page.getByText('Cliente registrado.').waitFor()
    if ((await page.getByLabel('Nombre o razón social del cliente').inputValue()) !== 'Rosa Quispe') {
      throw new Error('No completó el nombre del cliente registrado')
    }
  })

  await step('Productos: código DIGEMID y exportación de precios', async () => {
    await page.getByRole('link', { name: 'Productos' }).first().click()
    await page.getByRole('button', { name: 'Editar Paracetamol 500 mg' }).click()
    await page.getByLabel('Código DIGEMID (opcional)').fill('AB12')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.getByText('El código DIGEMID es numérico (hasta 10 dígitos)').waitFor()
    await page.getByLabel('Código DIGEMID (opcional)').fill('12345')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Precios DIGEMID' }).click(),
    ])
    const csv = readFileSync(await download.path(), 'utf8')
    if (!csv.includes('Código DIGEMID,Producto') || !csv.includes('12345,Paracetamol 500 mg')) {
      throw new Error('El CSV de precios no trae el código DIGEMID')
    }
  })

  // SUNAT BETA es un servicio externo: si no responde desde aquí, el paso se informa como saltado (no falla).
  const sunatUp = await fetch('https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl', { signal: AbortSignal.timeout(10_000) })
    .then((r) => r.ok)
    .catch(() => false)

  await step(`Facturación electrónica: activarla y emitir boleta y factura aceptadas por SUNAT BETA${sunatUp ? '' : ' (SALTADO: SUNAT BETA no responde)'}`, async () => {
    if (!sunatUp) return
    // RUC válido y distinto en cada corrida (es único entre boticas).
    const base = '206' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
    const d = 11 - ([...base].reduce((s, c, i) => s + Number(c) * [5, 4, 3, 2, 7, 6, 5, 4, 3, 2][i], 0) % 11)
    const ruc = base + (d === 10 ? 0 : d === 11 ? 1 : d)

    await page.getByRole('link', { name: 'Configuración' }).first().click()
    await page.getByRole('switch', { name: 'Emitir comprobantes electrónicos' }).click()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.getByText('Para emitir comprobantes electrónicos se necesita un RUC válido (con dígito verificador)').waitFor()
    await page.getByLabel('RUC (opcional)').fill(ruc)
    await page.getByLabel('Dirección fiscal').fill('Av. Larco 1234, Miraflores, Lima')
    await page.getByLabel('Ubigeo (opcional)').fill('150122')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.getByText('Configuración guardada.').first().waitFor()

    // Boleta: venta sin cliente.
    await page.getByRole('link', { name: 'Ventas' }).first().click()
    await page.getByLabel('Buscar producto para vender').fill('parace')
    await page.getByRole('button', { name: /Agregar unidad de Paracetamol/ }).click()
    await page.getByRole('radio', { name: 'Tarjeta' }).click()
    await page.getByRole('button', { name: /^Cobrar/ }).click()
    let receipt = page.getByRole('dialog')
    await receipt.getByText('Boleta de venta electrónica B001-1').waitFor({ timeout: 30000 })
    await receipt.getByText(/Aceptada por SUNAT/).waitFor()
    await receipt.getByRole('img', { name: 'Código QR del comprobante B001-1' }).waitFor()
    await shot('42-boleta-electronica')
    await receipt.getByRole('button', { name: 'Nueva venta' }).click()

    // Factura: cliente con RUC.
    await page.getByLabel('Buscar producto para vender').fill('parace')
    await page.getByRole('button', { name: /Agregar unidad de Paracetamol/ }).click()
    await page.getByRole('button', { name: 'Agregar cliente (DNI / RUC)' }).click()
    await page.getByLabel('Tipo de documento').selectOption('ruc')
    await page.getByLabel('Número de RUC').fill('20600000048')
    await page.getByLabel('Nombre o razón social del cliente').fill('Clínica San Gabriel SAC')
    await page.getByRole('radio', { name: 'Tarjeta' }).click()
    await page.getByRole('button', { name: /^Cobrar/ }).click()
    receipt = page.getByRole('dialog')
    await receipt.getByText('Factura electrónica F001-1').waitFor({ timeout: 30000 })
    await receipt.getByText(/Aceptada por SUNAT/).waitFor()
    await receipt.getByText('RUC: 20600000048').waitFor()
    await receipt.getByRole('button', { name: 'Nueva venta' }).click()

    // Historial: cada venta muestra su comprobante electrónico.
    await page.getByRole('tab', { name: 'Historial' }).click()
    await page.getByText('F001-1 · aceptada').waitFor()
    await page.getByText('B001-1 · aceptada').waitFor()
  })

  await step('Vista móvil del POS', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE + '/ventas')
    await page.getByLabel('Buscar producto para vender').fill('parace')
    await page.getByRole('button', { name: /Agregar unidad de Paracetamol/ }).click()
    await page.getByRole('link', { name: /Cobrar/ }).waitFor()
    await shot('23-movil-pos')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    if (overflow) throw new Error('Hay scroll horizontal en el POS móvil')
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  await step('Vista móvil de Reportes', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE + '/reportes')
    await page.getByRole('img', { name: /Ventas por día/ }).waitFor()
    await shot('31-movil-reportes')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    if (overflow) throw new Error('Hay scroll horizontal en Reportes móvil')
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  await step('Vista móvil del inventario', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE + '/inventario')
    await page.getByRole('cell', { name: /Paracetamol 500 mg/ }).first().waitFor()
    await shot('14-movil-inventario')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    if (overflow) throw new Error('Hay scroll horizontal en móvil')
  })
} catch (e) {
  results.push('ABORTADO: ' + String(e.message).split('\n')[0])
  try {
    const pages = browser?.contexts()[0]?.pages() ?? []
    if (pages[0]) await pages[0].screenshot({ path: `${SHOTS}zz-fallo.png`, fullPage: true })
  } catch {}
} finally {
  await browser?.close()
  killVite()
}

console.log(results.join('\n'))
console.log('\n--- Problemas en consola/red ---')
console.log(problems.length ? [...new Set(problems)].join('\n') : '(ninguno)')

if (results.some((r) => r.startsWith('FAIL') || r.startsWith('ABORTADO')) || problems.some((p) => p.startsWith('[pageerror]'))) {
  process.exit(1)
}
