// Datos de demostración (ficticios) para probar el sistema sin registrarse.
//   npm run demo:seed     crea la botica demo con ~45 días de historia
//   npm run demo:reset    la borra por completo (solo la demo; no toca otras boticas)
//   npm run demo:reseed   reset + seed
// Por defecto usa el Supabase LOCAL (`npx supabase start`). Para otro destino:
//   npm run demo:seed -- --db-url "postgresql://postgres.xxx:CLAVE@host:5432/postgres"
// (la contraseña con caracteres especiales va codificada: @ -> %40).
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [action, ...rest] = process.argv.slice(2)
if (!['seed', 'reset', 'reseed'].includes(action ?? '')) {
  console.error('Uso: node scripts/demo.mjs <seed|reset|reseed> [--db-url <url>]')
  process.exit(1)
}

function getDbUrl() {
  const i = rest.indexOf('--db-url')
  if (i !== -1 && rest[i + 1]) return { url: rest[i + 1], local: false }
  const st = spawnSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: true })
  if (st.status !== 0) {
    console.error('No se pudo leer `supabase status`. ¿Está corriendo `npx supabase start`? (o usa --db-url)')
    process.exit(1)
  }
  const json = JSON.parse(st.stdout.slice(st.stdout.indexOf('{')))
  return { url: json.DB_URL, local: true }
}

const { url, local } = getDbUrl()
const where = local ? 'Supabase LOCAL' : 'la base de datos indicada con --db-url'

function runFile(file, label) {
  // Se valida que el archivo exista y se muestra qué se hará antes de hacerlo.
  readFileSync(file, 'utf8')
  console.log(`→ ${label} en ${where}…`)
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--db-url', `"${url}"`, '-f', `"${file}"`], {
    encoding: 'utf8',
    shell: true,
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0 || /"_tag":"Error"/.test(out)) {
    console.error(out.split('\n').filter((l) => /Error|error|exception|demo/i.test(l)).slice(0, 6).join('\n') || out)
    process.exit(1)
  }
  console.log(`✔ ${label}: listo.`)
}

if (action === 'reset' || action === 'reseed') runFile('supabase/demo/reset_demo.sql', 'Borrar la demo')
if (action === 'seed' || action === 'reseed') {
  runFile('supabase/demo/seed_demo.sql', 'Crear la demo')
  console.log('\nUsuarios de demostración (contraseñas públicas, solo para la demo):')
  console.log('  administrador: demo@boticas-erp.demo   / DemoBotica2026')
  console.log('  cajero:        cajero@boticas-erp.demo / DemoBotica2026')
}
