# Guía de configuración (Supabase y Netlify)

Esta guía **no publica nada por sí sola**: cada paso lo ejecuta una persona.

## 1. Entorno local

1. Instala Node 24.
2. `npm install`
3. `cp .env.example .env.local` (en Windows PowerShell: `Copy-Item .env.example .env.local`).

## 2. Proyecto Supabase

1. Entra a <https://supabase.com/dashboard> → **New project**.
2. Plan Free, región más cercana (São Paulo, `sa-east-1`). Guarda la contraseña de la base de datos en un gestor de contraseñas.
3. Espera a que el proyecto esté listo.
4. **Project Settings → API**: copia *Project URL* y la clave *anon/publishable* a `.env.local`. No copies `service_role`.

### Aplicar la migración

Opción A, SQL Editor:
1. Dashboard → SQL Editor → New query.
2. Pega `supabase/migrations/20261021000000_init_tenancy.sql` y ejecuta.

Opción B, CLI:
```bash
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>
npx supabase db push
```

### Datos demo (opcional)

Pega `supabase/seed.sql` en el SQL Editor. Crea "Botica Demo San Martín" y "Botica Demo Los Olivos" con una sucursal principal cada una.

### Configuración de Auth

Authentication → URL Configuration:
- **Site URL**: `http://localhost:5173` en desarrollo (luego la URL de Netlify).
- **Redirect URLs**: agrega `http://localhost:5173/restablecer-contrasena` y la equivalente de producción. Sin esto el correo de recuperación no redirige a la app.

Authentication → Providers → Email: el registro público queda **habilitado** (ADR 020, autoregistro de boticas). Decide si exiges *Confirm email*: el SMTP integrado de Supabase solo envía a miembros del equipo y con límites bajos, así que para abrir el registro al público configura un SMTP propio (p. ej. Resend) o desactiva la confirmación durante la beta.

### Invitar usuarios (Edge Function)

La pantalla **Usuarios** crea cuentas con la función `invite-user`, que usa la clave `service_role` **solo en el servidor** (Supabase la inyecta; no la pongas en el frontend):

```bash
npx supabase functions deploy invite-user
npx supabase secrets set SITE_URL=https://TU-SITIO.netlify.app
```

`SITE_URL` es el respaldo cuando el navegador no envía su origen. En *Authentication → URL Configuration → Redirect URLs* debe estar `https://TU-SITIO/restablecer-contrasena`: el enlace de invitación lleva a esa pantalla para que la persona elija su contraseña. Sin SMTP propio, el administrador copia el enlace y se lo envía a mano.

### Primer administrador

1. Authentication → Users → **Add user** → *Create new user* (marca *Auto Confirm User*).
2. SQL Editor:
```sql
insert into public.pharmacy_members (pharmacy_id, user_id, role)
select '00000000-0000-4000-8000-00000000000a', u.id, 'admin'
from auth.users u where u.email = 'admin@ejemplo.com';
```
3. Inicia sesión en la app con ese correo.

## 3. Supabase local (opcional, requiere Docker)

```bash
npx supabase start       # levanta el stack local
npx supabase db reset    # aplica migraciones + seed
npx supabase test db     # ejecuta pgTAP (supabase/tests)
npm run db:types         # regenera src/types/database.types.ts
```
Las claves locales se muestran con `npx supabase status`.

Supabase local usa los puertos **55320–55329** (API 55321, BD 55322, Studio 55323). Si `supabase start` falla con "socket no permitido", Windows reservó esos puertos: revisa `netsh interface ipv4 show excludedportrange protocol=tcp` y cambia los puertos en `supabase/config.toml`.

### Si las invitaciones fallan en local

Si Docker se reinicia, el contenedor `supabase_edge_runtime_*` puede quedar detenido y la función responde 503 (en la app: "No pudimos conectar con el servidor"). Revísalo con `docker ps -a` y levántalo con `docker start supabase_edge_runtime_BOTICAS_SERVICE`, o con `npx supabase stop` y `npx supabase start`.

## 4. Despliegue en Netlify (cuando se autorice)

1. Sube el repositorio a GitHub (privado) — pendiente de autorización.
2. Netlify → Add new site → Import from Git.
3. Build command: `npm run build`; Publish directory: `dist`.
4. Site configuration → Environment variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
5. `public/_redirects` ya contiene el fallback SPA (`/*  /index.html  200`).
6. Añade la URL de Netlify a Site URL / Redirect URLs de Supabase Auth.
7. Variable opcional `NODE_VERSION=24` si Netlify usa otra versión.

## 5. Facturación electrónica (SUNAT BETA)

La función `einvoice-emit` firma y envía boletas y facturas al **servicio de pruebas (BETA)** de SUNAT. Los comprobantes no tienen validez legal (ADR 073).

1. Genera el certificado de pruebas (autofirmado): `npm run einvoice:cert`. Queda en `supabase/functions/.env`, que git ignora.
2. Local: reinicia Supabase (`npx supabase stop && npx supabase start`) para que la función lo lea. Si editas `supabase/functions/_shared/`, reinicia también el contenedor `supabase_edge_runtime_*`: guarda los módulos en caché.
3. Remoto: `npx supabase login`, luego `npx supabase secrets set --env-file supabase/functions/.env --project-ref <ref>` y `npx supabase functions deploy einvoice-emit einvoice-credit-note --project-ref <ref>`.
4. En la app: **Configuración → Comprobantes electrónicos**: RUC (con dígito verificador válido), dirección fiscal y el interruptor.

Variables opcionales de la función: `SUNAT_ENDPOINT` (por defecto el BETA), `SUNAT_SOL_USER` y `SUNAT_SOL_PASSWORD` (por defecto `MODDATOS`, las credenciales públicas del BETA).

## 5b. Despliegue en Vercel

`vercel.json` ya trae lo necesario: el comando de compilación, la carpeta `dist`, la reescritura de rutas a `index.html` (sin ella, recargar `/ventas` da 404) y las mismas cabeceras de seguridad que `public/_headers`. Una prueba (`src/test/deployHeaders.test.ts`) impide que los dos archivos se desincronicen.

1. En Vercel: *Add New → Project* e importa el repositorio de GitHub (Vercel detecta Vite).
2. *Settings → Environment Variables*: agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la clave **anon/publishable**, nunca `service_role`) para *Production* y *Preview*. Vite las incrusta **al compilar**: después de agregarlas o cambiarlas hay que volver a desplegar (*Deployments → Redeploy*). Sin ellas la app muestra "Configuración incompleta".
3. En Supabase, *Authentication → URL Configuration*: *Site URL* = la URL de Vercel y, en *Redirect URLs*, `https://TU-SITIO.vercel.app/restablecer-contrasena`.
4. El Supabase remoto debe tener **todas** las migraciones (`npx supabase db push`, primero con `--dry-run`) y la función `invite-user` desplegada (ver arriba).
