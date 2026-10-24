// Genera un certificado AUTOFIRMADO para firmar comprobantes en el servicio BETA de SUNAT (pruebas) y lo guarda
// como secretos de la Edge Function en supabase/functions/.env (ignorado por git):
//   SUNAT_CERT_PEM_B64, SUNAT_KEY_PEM_B64
// En producción se usa el certificado digital real de la botica (comprado y registrado en SUNAT), nunca este.
//
//   npm run einvoice:cert                     # crea o reemplaza el certificado de pruebas
//   npx supabase secrets set --env-file supabase/functions/.env --project-ref <ref>   # subirlo al proyecto remoto
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ENV_FILE = join(process.cwd(), 'supabase', 'functions', '.env')
const dir = mkdtempSync(join(tmpdir(), 'sunat-cert-'))
try {
  const r = spawnSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '3650', '-nodes',
     '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'),
     '-subj', '/C=PE/O=Boticas ERP - PRUEBAS SUNAT BETA/CN=Certificado de pruebas'],
    { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
  )
  if (r.status !== 0) {
    console.error('No se pudo ejecutar openssl (¿está instalado?):\n' + (r.stderr || r.error?.message))
    process.exit(1)
  }
  const b64 = (f) => Buffer.from(readFileSync(join(dir, f))).toString('base64')
  const keep = existsSync(ENV_FILE)
    ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => l && !/^SUNAT_(CERT|KEY)_PEM_B64=/.test(l))
    : []
  writeFileSync(ENV_FILE, [...keep, `SUNAT_CERT_PEM_B64=${b64('cert.pem')}`, `SUNAT_KEY_PEM_B64=${b64('key.pem')}`, ''].join('\n'))
  console.log(`✔ Certificado de PRUEBAS (autofirmado, 10 años) guardado en ${ENV_FILE}`)
  console.log('  Local: reinicia Supabase (npx supabase stop && npx supabase start) para que la función lo lea.')
  console.log('  Remoto: npx supabase secrets set --env-file supabase/functions/.env --project-ref <ref>')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
