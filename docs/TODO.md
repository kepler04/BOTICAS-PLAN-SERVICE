# Pendientes

> **Alcance:** proyecto de aprendizaje y portafolio (ADR 043). Lo marcado como comercial (SUNAT, Supabase Pro, SMTP propio…) son ideas de evolución, no pendientes reales.

## Portafolio (prioridad)
- [x] Datos de demostración reproducibles (`npm run demo:seed`), con reset.
- [x] README con capturas, arquitectura, pruebas y límites; LICENSE (MIT); CI de GitHub Actions.
- [ ] Rotar la contraseña de la BD del proyecto Supabase remoto (se compartió en una conversación) antes de publicar.
- [x] Repositorio en GitHub: https://github.com/kepler04/BOTICAS-PLAN-SERVICE
- [x] Demo en línea en Vercel (https://servicefarma.vercel.app) con usuarios de demo. Pendiente decidir: cerrar el registro público o dejarlo abierto.
- [x] Insignia del CI y enlace a la demo en el README.
- [ ] Completar el nombre del titular en `LICENSE`.

## Verificación de Fase 1 (necesita acción humana)
- [x] Proyecto Supabase creado y migración + seed aplicados (2026-10-22).
- [ ] Probar login, recuperación de contraseña y dashboard contra un Supabase real.
- [x] Docker + `supabase start`, `db reset` y `supabase test db`: 17/17 pgTAP OK (2026-10-22).
- [x] Regenerar `src/types/database.types.ts` desde la BD remota (2026-10-22). `AppRole` vive en `src/types/app.ts`.
- [ ] Configurar Site URL y Redirect URLs en Supabase Auth.
- [x] Registro público: ahora es deliberado (ADR 020). Falta decidir confirmación de correo y SMTP (ver abajo).

## Técnicos (heredados del arquitecto)
- [x] Edge Function `invite-user` para crear cajeros desde la app (requiere `service_role`) — Fase 5, ADR 054.
- [ ] Asignación de usuarios a sucursales (`member_branches`) antes de la Fase 3.
- [x] TanStack Query para caché de datos (ADR 024).
- [ ] Estrategia de backups `pg_dump` antes del piloto.
- [ ] Tablas de suscripciones/pagos (post-beta).
- [x] PWA (Fase 5, ADR 058).

## Revisión del arquitecto (Fase 1)
- [x] `pharmacies.status` ya no es editable por el admin (grant por columnas).
- [ ] Toda migración nueva debe hacer `grant` explícito por tabla/columna: la migración inicial revoca los privilegios por defecto de `anon`/`authenticated`.
- [ ] Bloquear acceso cuando `pharmacies.status` sea `suspended`/`cancelled` (en `private.is_member`), al diseñar suscripciones.
- [x] Pantalla de Usuarios (invitar, cambiar rol, activar/desactivar) — Fase 5.

## Autoregistro (ADR 020)
- [ ] **Confirmación de correo:** el proyecto Supabase la exige (`mailer_autoconfirm: false`) y el SMTP integrado solo envía a miembros del equipo y con límite muy bajo. Elegir: desactivar *Confirm email* durante la beta, o configurar SMTP propio (p. ej. Resend) antes de abrir el registro.
- [ ] Anti-abuso: captcha (Turnstile/hCaptcha) en `/registro` antes de abrir al público.
- [ ] Validar el RUC contra SUNAT; hoy solo se valida formato y unicidad (alguien podría registrar un RUC ajeno).
- [x] Usuario invitado por un admin: `invite-user` crea la cuenta **y** la membresía a la vez, así que ya no ve "Registra tu botica".

## Fase 2 (productos e inventario): pendientes
- [ ] **Importación masiva** del catálogo desde CSV/Excel (una botica real tiene cientos o miles de productos).
- [ ] Precio de compra en el producto (hoy el costo vive en cada lote) y margen estimado (Fase 4).
- [ ] Código de barras por presentación (caja y blíster suelen tener códigos distintos); hoy hay uno por producto.
- [x] Compras a proveedores (entradas ligadas a proveedor y factura) — Fase 6, ADR 066.
- [ ] Mostrar y editar `member_branches` cuando haya más de una sucursal (`useMainBranch` es el único punto de cambio).
- [ ] Aviso de lotes que vencen en el dashboard con enlace directo al filtro correspondiente.

## Fase 3 (ventas y caja): pendientes
- [ ] **Facturación electrónica SUNAT** (boleta/factura) vía proveedor autorizado y con un contador. El IGV, la afectación por producto, la serie y el número ya están (Fase 5); faltan documento del cliente, códigos SUNAT y firma vía PSE.
- [ ] Pagos mixtos (parte efectivo, parte Yape) y descuentos.
- [ ] Devoluciones después del cierre de caja (hoy solo se anula con la caja abierta).
- [x] Cliente en la venta (DNI/RUC y nombre), obligatorio sobre S/ 700 — Fase 6, ADR 061.
- [ ] Control de venta bajo receta / medicamentos controlados: hoy solo se muestra la advertencia "Receta". Consultar la normativa DIGEMID aplicable.
- [ ] Código de barras por presentación: el lector agrega 1 unidad aunque sea el código de la caja.
- [ ] Impresión térmica directa (ESC/POS) y apertura de cajón; hoy se usa el diálogo de impresión del navegador.
- [ ] Atajos de teclado en el POS. (La PWA es instalable, pero no se vende sin conexión: ADR 058.)
- [ ] Privacidad: el cajero ve el historial de ventas de toda la sucursal; evaluar limitarlo a las propias.
- [ ] Varias sucursales: `member_branches` y selector (la UI usa la sucursal principal).

## Fase 4 (dashboard y reportes): pendientes
- [ ] Horas pico y ventas por día de la semana (para organizar turnos).
- [ ] Utilidad **neta**: registrar gastos (alquiler, sueldos, servicios) y descontarlos de la ganancia bruta.
- [ ] Reportes por categoría y análisis ABC de productos; días de inventario (rotación).
- [ ] Exportar a PDF, además del CSV.
- [ ] Zona horaria configurable por botica (hoy es Lima fija en la BD).
- [ ] Alertas de stock y vencimientos por correo o WhatsApp.
- [ ] Reportes consolidados cuando haya varias sucursales (`member_branches`).
- [ ] Botón de tema claro/oscuro: los gráficos ya tienen colores para ambos modos, pero la app aún no tiene el interruptor.

## Fase 5 (IGV, tarjeta, PWA, usuarios, alternativas): pendientes
Comparación con otros sistemas y brechas en [COMPARATIVA.md](COMPARATIVA.md).
- [ ] **Enviar la invitación por correo** (hoy el admin copia el enlace): requiere SMTP propio.
- [ ] Reenviar o revocar una invitación pendiente y mostrarla como "pendiente" en la lista de usuarios.
- [ ] Lista **oficial** de medicamentos inafectos/exonerados: hoy la define el administrador con su contador (ADR 047).
- [x] Datos del cliente (DNI/RUC) en la venta y umbral de boleta con identificación (Fase 6).
- [x] Compras y proveedores y **kardex valorizado** por producto (Fase 6). El sugerido de compra sigue pendiente (abajo).
- [ ] Libros de estupefacientes/psicotrópicos y receta especial (con asesoría de un químico farmacéutico); catálogo y reportes DIGEMID.
- [ ] Varias sucursales: `member_branches`, precios por sucursal y traslados.
- [ ] Toma de inventario guiada (conteo físico), descuentos/promociones, etiquetas de código de barras.
- [ ] Alternativas también para productos **con** stock (p. ej. ofrecer el genérico más barato).
- [x] Migraciones de las Fases 5 y 6 aplicadas al Supabase remoto (2026-10-24). Pendiente: desplegar `invite-user` (requiere `supabase login` del dueño) y configurar *Site URL* / *Redirect URLs*.

## Fase 6 (cliente, temperatura, DIGEMID, compras, kardex): pendientes
- [ ] **Sugerido de compra** por rotación y stock mínimo; órdenes de compra y cuentas por pagar.
- [ ] Anular o corregir una compra (hoy se corrige con un ajuste de stock con motivo, ADR 067).
- [ ] Rangos de temperatura configurables por botica (hoy son de referencia, ADR 064) y alerta si se repiten lecturas fuera de rango.
- [ ] Verificar el formato vigente del reporte de precios de DIGEMID y, si es estable, generar el archivo exacto (ADR 065).
- [ ] Política de datos personales de clientes (Ley 29733): quién los ve, cuánto se guardan, cómo se borran.
- [ ] Buscar al cliente por nombre en el POS (hoy por documento) e historial de compras por cliente.
- [x] Migraciones `20261028000000` a `20261029000000` aplicadas al Supabase remoto (2026-10-24).

## Calidad (refactor del 2026-10-24)
- [x] Lógica de lotes en un solo lugar (`private.receive_lot`, ADR 069).
- [x] Formularios de Compras y Temperatura con react-hook-form + zod (ADR 070).
- [x] Auditoría de accesibilidad automática y correcciones de contraste y semántica (ADR 071).
- [x] Scripts de navegador multiplataforma y job `browser` en el CI (ADR 072). **Pendiente:** verlo correr en GitHub tras el primer push.
- [ ] `create_sale` está escrita completa en 3 migraciones (Fases 3, 5 y 6). Es historia de migraciones y no se reescribe; si vuelve a cambiar, extraer partes a funciones privadas como `receive_lot`.
- [ ] Recharts se carga bajo demanda, pero su chunk se llama `dateRange-*.js` (nombre que elige el empaquetador): ponerle nombre propio si se configura `codeSplitting`.
- [ ] Probar con teclado y lector de pantalla (NVDA) los flujos de venta y compra: axe no lo cubre todo.

## Mejoras detectadas
- [ ] Selector de botica si un usuario tiene más de una membresía (hoy se usa la primera activa).
- [x] Prueba E2E de humo con navegador real: `npm run test:e2e` (registro → botica → producto → stock → dashboard). Falta ampliarla al login/recuperación de contraseña y al rol cajero.
- [ ] Code-splitting adicional del chunk principal si crece.
