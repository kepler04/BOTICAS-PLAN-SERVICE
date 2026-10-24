# Boticas ERP

[![CI](https://github.com/kepler04/BOTICAS-PLAN-SERVICE/actions/workflows/ci.yml/badge.svg)](https://github.com/kepler04/BOTICAS-PLAN-SERVICE/actions/workflows/ci.yml) · **Demo en vivo:** [servicefarma.vercel.app](https://servicefarma.vercel.app) — entra como administrador con `demo@boticas-erp.demo` o como cajero con `cajero@boticas-erp.demo` (contraseña `DemoBotica2026`; datos ficticios).

ERP SaaS **multi-tenant** para boticas pequeñas del Perú: punto de venta, inventario con lotes y vencimientos, control de caja y reportes de ganancia. Funciona desde el celular o la computadora.

> **Proyecto de aprendizaje y portafolio.** Los datos de la demo son ficticios y los comprobantes son **internos de prueba: no son boletas ni facturas electrónicas SUNAT**.
>
> *English: a multi-tenant pharmacy ERP built to learn and to showcase full‑stack engineering — React + TypeScript + Supabase (Postgres with Row Level Security and transactional RPCs), with 283 database tests, automated accessibility audits (axe, WCAG 2.1 AA), integration tests, a real-browser E2E suite, Peruvian IGV (VAT) handling and local compliance features (customer ID above S/ 700, daily temperature log, purchases with a valued stock ledger). See [What this project demonstrates](#qué-demuestra-este-proyecto).*

![Dashboard](docs/screenshots/02-dashboard.png)

## Qué demuestra este proyecto

| Tema | Cómo se resolvió |
|---|---|
| **Multi-tenancy seguro** | Una base compartida con `pharmacy_id` y **RLS en cada tabla**; claves foráneas compuestas `(pharmacy_id, …)` para que un registro jamás apunte a datos de otra botica, aunque falle una política. Hay pruebas de aislamiento entre boticas. |
| **Lógica crítica en la base de datos** | Las ventas, entradas de stock, ajustes, anulaciones y cierres de caja son **funciones RPC transaccionales**: todo o nada. El navegador nunca envía precios ni toca el stock directamente. |
| **Integridad del dinero y del stock** | Ventas **atómicas e idempotentes** (el doble clic no duplica), stock **nunca negativo**, salida por **FEFO** (primero el lote que vence antes), numeración de comprobantes **sin huecos**, dinero en centavos enteros en el front. |
| **Roles con defensa en profundidad** | Administrador y cajero. Los permisos se imponen en Postgres (RLS + validación en cada RPC), no solo ocultando botones. Los reportes los valida de forma explícita: un cajero vería márgenes falsos por costos ocultos. |
| **Concurrencia probada** | Peticiones realmente simultáneas contra Postgres: 8 ventas por la última unidad (gana una), la misma clave de idempotencia 6 veces (una sola venta), ventas en efectivo contra el cierre de caja, dos administradores quitándose el rol a la vez. Cada prueba se **verificó por mutación**: sin el bloqueo correspondiente, falla. |
| **Impuesto peruano (IGV 18 %)** | Precios con IGV incluido, afectación (gravado / exonerado / inafecto) por producto, desglose en el comprobante, ganancia sobre venta neta. La misma regla de redondeo en SQL y en TypeScript con los mismos vectores de prueba. Qué se verificó y qué no: [COMPARATIVA](docs/COMPARATIVA.md). |
| **Seguridad del navegador** | CSP estricta (`script-src 'self'`) comprobada con la app real y un control negativo; PWA que nunca cachea la API. |
| **Pruebas por capas** | pgTAP sobre la base real (incluye una auditoría que falla si una tabla nueva queda sin RLS), integración de los servicios contra PostgREST y un recorrido E2E en navegador real. Detalle abajo. |
| **Decisiones documentadas** | [72 decisiones de arquitectura](docs/DECISIONS.md) con su motivo, y un registro de los errores que las propias pruebas encontraron. |
| **UX pensada para personal no técnico** | Todo en español, lector de código de barras, vuelto automático, vista móvil, tabla equivalente de cada gráfico, descarga a CSV y accesibilidad (encabezados reales, contraste verificado). |

## Funcionalidades

- **Productos** con categorías, código de barras, receta médica y **tres presentaciones** (unidad, blíster y caja) sobre un mismo stock en unidad mínima.
- **Inventario** por lotes con vencimiento: entradas, ajustes y mermas con motivo, alertas de stock bajo y por vencer, e historial de movimientos con responsable.
- **Ventas (POS)**: carrito, efectivo con vuelto, Yape, Plin y tarjeta, **IGV 18 % desglosado** en el comprobante interno imprimible (80 mm), historial y anulaciones. Si un producto está agotado, ofrece **alternativas con el mismo principio activo**.
- **Caja**: apertura y cierre por turno, ingresos y egresos, efectivo esperado y diferencias.
- **Reportes** (solo administrador): ventas por día o mes con variación contra el periodo anterior, ganancia estimada, más vendidos, **baja rotación**, valor del inventario y dinero en riesgo por vencimiento. Cada gráfico tiene su tabla y su CSV.
- **Cliente en la venta**: DNI, RUC (con dígito verificador), carné de extranjería o pasaporte. Opcional, y **obligatorio cuando la venta supera S/ 700** (regla de SUNAT); un DNI ya registrado completa el nombre.
- **Compras** (administrador): proveedores y registro de la factura del proveedor; el stock entra con lote, vencimiento y costo sin IGV, en una sola transacción y sin facturas duplicadas. **Kardex valorizado** por producto.
- **Temperatura y humedad**: registro diario del local y de la refrigeradora para la inspección sanitaria; fuera de rango exige anotar qué se hizo; el dashboard avisa si falta el de hoy.
- **Precios DIGEMID**: código DIGEMID por producto y exportación de la lista de precios para el reporte mensual al Observatorio.
- **Usuarios** (administrador): invitar cajeros con un enlace de un solo uso, cambiar el rol y activar/desactivar. La botica nunca se queda sin administrador.
- **Configuración**: datos de la botica y si **cobra IGV** (p. ej. Nuevo RUS no lo desglosa).
- **PWA**: instalable en el celular; sin internet muestra una página clara (no se vende sin conexión a propósito).
- **Autoregistro** de boticas y roles `admin` / `cashier`.

| | |
|---|---|
| ![Punto de venta](docs/screenshots/03-punto-de-venta.png) | ![Comprobante](docs/screenshots/04-comprobante.png) |
| ![Alertas de inventario](docs/screenshots/07-alertas-inventario.png) | ![Reportes](docs/screenshots/09-reportes-resumen.png) |
| ![Caja](docs/screenshots/08-caja.png) | ![Productos más vendidos y baja rotación](docs/screenshots/10-reportes-productos.png) |
| ![Alternativas por principio activo](docs/screenshots/18-alternativas.png) | ![Usuarios](docs/screenshots/17-usuarios.png) |
| ![Cliente obligatorio sobre S/ 700](docs/screenshots/19-cliente-en-venta.png) | ![Registro de temperatura](docs/screenshots/20-temperatura.png) |
| ![Compra a un proveedor](docs/screenshots/21-compra.png) | ![Kardex valorizado](docs/screenshots/22-kardex.png) |
| ![Configuración e IGV](docs/screenshots/15-configuracion.png) | |

<details>
<summary>Vista móvil</summary>

<img src="docs/screenshots/12-movil-punto-de-venta.png" width="240" alt="POS móvil"> <img src="docs/screenshots/13-movil-dashboard.png" width="240" alt="Dashboard móvil"> <img src="docs/screenshots/14-movil-reportes.png" width="240" alt="Reportes móvil">

</details>

## Stack

React 19 + TypeScript estricto + Vite · Tailwind CSS 4 + shadcn/ui (Base UI) · React Router · TanStack Query · react-hook-form + zod · Recharts · **Supabase** (Auth + PostgreSQL con RLS) · Vitest + Testing Library · pgTAP · Playwright (E2E).

```mermaid
flowchart LR
  UI["React SPA<br/>componentes → hooks → servicios"] -->|supabase-js| API["PostgREST + Auth"]
  API --> DB[("PostgreSQL")]
  DB --- RLS["RLS por botica (pharmacy_id)"]
  DB --- RPC["RPC transaccionales: create_sale, void_sale,<br/>register_stock_entry, sesiones de caja, report_*"]
```

Regla del proyecto: los componentes no llaman a Supabase; van por **hooks → servicios**, y la lógica crítica vive en PostgreSQL.

## Probarlo en tu máquina (con datos de demostración)

Requisitos: **Node 24**, **Docker Desktop** (para Supabase local).

```bash
npm install
npx supabase start        # levanta Postgres + Auth + API locales en Docker
npm run demo:seed         # botica ficticia con ~45 días de historia
npm run env:local         # crea .env.local apuntando al Supabase local
npm run dev               # http://localhost:5173
```

Usuarios de demostración (contraseñas públicas, solo para la demo):

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `demo@boticas-erp.demo` | `DemoBotica2026` |
| Cajero | `cajero@boticas-erp.demo` | `DemoBotica2026` |

Entra primero como **administrador** (ve reportes) y luego como **cajero** (no ve reportes ni costos: recibe 403). `npm run demo:reset` borra solo la demo; `npm run demo:reseed` la regenera.

> La demo no inserta datos "a mano": el script actúa como el cajero y el administrador y llama a las funciones reales (`create_sale`, `open_cash_session`…), y luego fecha los registros hacia atrás. Por eso los datos son coherentes por construcción: el stock de cada lote coincide con la suma de sus movimientos, sin negativos y sin huecos en la numeración.

## Pruebas

| Comando | Qué cubre |
|---|---|
| `npm test` | 159 pruebas unitarias y de componentes (dinero, **IGV**, **RUC y DNI**, compras, temperatura, carrito, presentaciones, esquemas, CSV, rangos de fechas…) |
| `npx supabase test db` | **283 aserciones pgTAP** sobre Postgres real: aislamiento entre boticas, permisos por rol, stock negativo, FEFO, idempotencia, caja, anulaciones, reportes, zona horaria de Lima, **IGV**, **nunca sin administrador**, regla de S/ 700, registro de temperatura, compras, kardex y una **auditoría de seguridad** (RLS en toda tabla, `anon` sin privilegios, funciones con `search_path` fijo) |
| `npm run test:integration` | 75 pruebas de los **servicios reales** contra PostgREST y la Edge Function (filtros, vistas, RPC, rol de cajero, IGV, **concurrencia**, invitación de usuarios, alternativas, cliente en la venta, temperatura, compras y kardex) |
| `npm run test:e2e` | Recorrido de **45 pasos en un navegador real**: registro → producto → stock → caja → venta con IGV y tarjeta → anulación → reportes → configuración → invitar a un cajero y que entre → temperatura → compra y factura duplicada → kardex → venta de más de S/ 700 con DNI → código DIGEMID → vista móvil |
| `npm run test:pwa` | 9 comprobaciones de la PWA en el navegador (manifest, íconos, service worker, página sin conexión, sin cachear la API) |
| `npm run test:a11y` | **Auditoría de accesibilidad** (axe-core, WCAG 2.1 A/AA) en 20 pantallas reales, como administrador y como cajero: 0 infracciones |
| `npm run test:csp` | Sirve la compilación con las cabeceras reales y verifica que la app **no viola su propia CSP**; control negativo: un script inyectado se bloquea |
| `npm run lint` · `npm run typecheck` · `npm run build` | Calidad estática y build de producción |

El CI de GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) tiene tres jobs: lint, tipos, pruebas unitarias y build; Supabase local con pgTAP e integración; y un navegador real (Chrome) con el E2E, la auditoría de accesibilidad, la PWA y la CSP. *(El job de navegador aún no se ha ejecutado en GitHub: el repositorio no se ha publicado.)*

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `preview` | Desarrollo, build de producción y vista previa |
| `npm run db:types` | Regenera `src/types/database.types.ts` desde la base local |
| `npm run demo:seed` · `demo:reset` · `demo:reseed` | Datos de demostración |
| `npm run screenshots` | Regenera las capturas de este README a partir de la demo |
| `npm run icons` | Regenera los íconos de la PWA a partir del logo |
| `npm run env:local` | Crea `.env.local` para el Supabase local |

## Estructura

```
docs/                  DECISIONS.md (ADR), SETUP.md, TODO.md, screenshots/
supabase/              migrations/ (esquema, RLS, RPC), tests/ (pgTAP), demo/ (datos de demostración)
scripts/               demo, capturas, E2E, pruebas de integración
src/app/               providers, router
src/components/        ui/ (shadcn), layout/, common/
src/features/          auth · onboarding · branches · products · inventory · sales · cash · reports · dashboard · settings · users · sanitary · purchases
supabase/functions/    invite-user (Edge Function)
src/lib/               formato de dinero y fechas, CSV, errores de BD, cliente Supabase
```

## Usarlo con tu propio proyecto Supabase

Guía paso a paso en [docs/SETUP.md](docs/SETUP.md): crear el proyecto, aplicar las migraciones (`npx supabase db push`), configurar Auth y copiar la URL y la clave **anon/publishable** a `.env.local`. **Nunca** pongas la clave `service_role` en el frontend.

## Seguridad

- RLS activo en todas las tablas; los privilegios de tabla se revocan y se otorgan de forma mínima (por columna donde corresponde). Un visitante anónimo recibe 401 en tablas, vistas y funciones.
- Ninguna tabla de negocio acepta escritura directa de ventas, stock o caja desde la API: solo las RPC (`security definer`, con `search_path` fijo y validación de rol).
- `npm audit --omit=dev` → **0 vulnerabilidades** en lo que se envía al navegador. Las 7 que aparecen en `npm audit` completo pertenecen al CLI de `shadcn` (herramienta de desarrollo que solo aporta un `@import` de CSS en la compilación y no llega al bundle).
- Ningún secreto se versiona: `.env.local` está en `.gitignore` y las claves de `supabase start` son las de demostración locales.

## Límites conocidos y siguientes pasos

Es un proyecto de aprendizaje, así que quedan fuera a propósito: facturación electrónica SUNAT (requiere un proveedor autorizado y un contador; el desglose del IGV ya es el paso previo), libros de estupefacientes y el envío del reporte de precios a DIGEMID (se exporta, no se sube), cuentas por pagar y sugerido de compra, consulta de DNI/RUC en RENIEC/SUNAT, varias sucursales por usuario, pagos mixtos, devoluciones tras el cierre de caja, impresión térmica directa, envío de invitaciones por correo (hoy se comparte el enlace) y venta sin conexión. El IGV de cada medicamento (gravado, exonerado o inafecto) **lo define el administrador con su contador**: el sistema no trae una lista oficial. La comparación con sistemas del mercado y el detalle de lo verificado están en [docs/COMPARATIVA.md](docs/COMPARATIVA.md); la lista completa de pendientes, en [docs/TODO.md](docs/TODO.md).

## Licencia

[MIT](LICENSE).
