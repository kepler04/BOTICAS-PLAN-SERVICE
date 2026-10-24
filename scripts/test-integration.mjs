// Ejecuta las pruebas de integración contra el Supabase LOCAL (`npx supabase start`).
// Lee las claves locales con `supabase status` y NO las imprime.
import { spawnSync } from 'node:child_process'

const status = spawnSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: true })
if (status.status !== 0) {
  console.error('No se pudo leer `supabase status`. ¿Está corriendo `npx supabase start`?')
  process.exit(1)
}
const json = JSON.parse(status.stdout.slice(status.stdout.indexOf('{')))
const env = {
  ...process.env,
  VITE_IT_URL: json.API_URL ?? 'http://127.0.0.1:54321',
  VITE_IT_ANON_KEY: json.ANON_KEY ?? json.PUBLISHABLE_KEY,
  VITE_IT_SERVICE_KEY: json.SERVICE_ROLE_KEY ?? json.SECRET_KEY,
}
if (!env.VITE_IT_ANON_KEY || !env.VITE_IT_SERVICE_KEY) {
  console.error('Faltan claves locales en `supabase status`.')
  process.exit(1)
}

const run = spawnSync('npx', ['vitest', 'run', 'src/test/integration', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env,
})
process.exit(run.status ?? 1)
