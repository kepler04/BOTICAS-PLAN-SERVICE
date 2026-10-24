// Crea .env.local apuntando al Supabase LOCAL (`npx supabase start`), sin copiar claves a mano.
//   npm run env:local              (no sobrescribe un .env.local existente)
//   npm run env:local -- --force   (lo sobrescribe)
//   npm run env:local -- --out ruta/.env.demo
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const force = args.includes('--force')
const outIdx = args.indexOf('--out')
const out = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : '.env.local'

if (existsSync(out) && !force) {
  console.error(`${out} ya existe y no se sobrescribe (podría apuntar a otro proyecto). Usa --force si quieres reemplazarlo.`)
  process.exit(1)
}

const st = spawnSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: true })
if (st.status !== 0) {
  console.error('No se pudo leer `supabase status`. ¿Está corriendo `npx supabase start` (requiere Docker)?')
  process.exit(1)
}
const json = JSON.parse(st.stdout.slice(st.stdout.indexOf('{')))
const key = json.ANON_KEY ?? json.PUBLISHABLE_KEY
if (!json.API_URL || !key) {
  console.error('`supabase status` no devolvió la URL o la clave pública.')
  process.exit(1)
}

writeFileSync(
  out,
  [
    '# Generado por `npm run env:local`: apunta al Supabase LOCAL (solo desarrollo).',
    `VITE_SUPABASE_URL=${json.API_URL}`,
    `VITE_SUPABASE_ANON_KEY=${key}`,
    '',
  ].join('\n'),
)
console.log(`✔ ${out} creado (Supabase local: ${json.API_URL}).`)
