# Comparativa con otros sistemas y qué le falta a Boticas ERP

> Proyecto de **aprendizaje y portafolio** (ADR 043). Esta comparación sirve para decidir qué construir y para ser honesto sobre los límites, no para competir con productos comerciales.

## Cómo se hizo y qué tan confiable es

Búsqueda web (octubre de 2026) y lectura de las páginas oficiales de SUNAT que se pudieron abrir. **Casi todo lo que se sabe de los sistemas comerciales viene de sus propias páginas de venta o de directorios** (no hay comparativas independientes ni reseñas verificadas de usuarios), así que son *afirmaciones de proveedor*: no probé ninguno. Lo normativo (IGV, DIGEMID) se contrastó con fuentes oficiales o secundarias citadas abajo; **ninguna reemplaza el consejo de un contador o de un químico farmacéutico**.

## Sistemas de referencia en el mercado peruano

| Sistema | Qué dicen de sí mismos | Fuente |
|---|---|---|
| **Sysfarma** | Software en la nube para farmacias y boticas: facturación electrónica ante SUNAT, punto de venta, inventario **FEFO** por lotes y vencimiento, **kardex valorizado**, alertas de vencimiento, **reportes para DIGEMID**, catálogo DIGEMID, **varias sucursales con precios por sucursal y traslados entre almacenes**. Planes desde S/ 69 al mes (según el proveedor). | [comparasoftware](https://www.comparasoftware.com/sysfarma) |
| **NEOPharm** | Gestión integral para boticas, farmacias y droguerías con comprobantes electrónicos; se presenta como PSE (Proveedor de Servicios Electrónicos) autorizado por SUNAT. | [comparasoftware](https://www.comparasoftware.com/neopharm) |
| **LOLFAR** | Gestión farmacéutica con módulo de productos vencidos e inventarios (folleto comercial). | [folleto](https://www.lolimsa.com.pe/wp-content/uploads/Brochure%20LOLFAR.pdf) |
| **Andape**, **Farmasis** | Mencionados en directorios; inventario, vencimientos y cumplimiento SUNAT/DIGEMID. | (directorios) |

## Matriz de funcionalidades

✅ hecho · 🟡 parcial · ⬜ no hecho · ➖ fuera de alcance a propósito

| Funcionalidad | Mercado | Boticas ERP | Comentario |
|---|---|---|---|
| Punto de venta con carrito, vuelto y comprobante | ✅ | ✅ | Ventas atómicas e idempotentes; dinero en centavos. |
| Lotes, vencimientos y salida **FEFO** | ✅ | ✅ | Sin vender lotes vencidos; stock nunca negativo. |
| Alertas de stock bajo y por vencer | ✅ | ✅ | Dashboard e inventario. |
| Presentaciones unidad / blíster / caja | ✅ | ✅ | Stock en unidad mínima. |
| Caja por turno con diferencias | ✅ | ✅ | Apertura, ingresos/egresos, cierre con nota si hay diferencia. |
| Reportes de ventas, ganancia, rotación, valor de inventario | ✅ | ✅ | Con gráficos, tabla equivalente y CSV. |
| **IGV 18 % desglosado en el comprobante** | ✅ | ✅ *(Fase 5)* | Ver abajo. Por producto: gravado / exonerado / inafecto; la botica puede no cobrar IGV. |
| **Pago con tarjeta** | ✅ | ✅ *(Fase 5)* | Además de efectivo, Yape y Plin. |
| Instalable en el celular (PWA) | 🟡 | ✅ *(Fase 5)* | Instalable; sin conexión solo muestra una página clara (no se vende sin internet). |
| **Sustitutos por principio activo** en el POS | ✅ | ✅ *(Fase 5)* | "Alternativas" para un producto agotado, con aviso de confirmar concentración y forma (ADR 057). |
| **Gestión de usuarios** (invitar cajeros, activar/desactivar, rol) | ✅ | ✅ *(Fase 5)* | Edge Function con `service_role` (ADR 054); el enlace de invitación se comparte a mano (sin SMTP). La botica nunca se queda sin administrador (ADR 055). |
| Roles y permisos aplicados en la base de datos | 🟡 | ✅ | RLS + validación en cada RPC. |
| Multi-tenant seguro (varias boticas) | ✅ | ✅ | RLS en todas las tablas + auditoría automática. |
| **Facturación electrónica SUNAT** (boleta/factura) | ✅ | ➖ | Requiere proveedor autorizado y contador. **Prerrequisitos ya listos**: serie/correlativo, desglose por línea, afectación por producto. Falta: documento del cliente, códigos SUNAT, firma vía PSE. |
| Datos del cliente (DNI/RUC) en la venta | ✅ | ✅ *(Fase 6)* | Opcional, y **obligatorio en boletas de más de S/ 700** ([SUNAT](https://orientacion.sunat.gob.pe/03-boleta-de-venta), RS 303-2018). RUC con dígito verificador; sin consulta a RENIEC/SUNAT (ADR 061–062). |
| **Reporte mensual de precios al Observatorio de DIGEMID** | 🟡 | 🟡 *(Fase 6)* | Obligatorio (DS 014-2011-SA art. 30, RM 040-2010/MINSA; [DIGEMID](https://www.digemid.minsa.gob.pe/Archivos/Comunicados/2023/COM_016-2023.pdf)). Hay código DIGEMID por producto y exportación de precios a CSV; el envío en la plataforma es manual (ADR 065). |
| **Registro diario de temperatura y humedad** | 🟡 | ✅ *(Fase 6)* | Inmutable, con el día fijado por el servidor y nota obligatoria fuera de rango; aviso en el dashboard si falta el de hoy; CSV para la inspección ([GERESA Lambayeque](https://cdn.www.gob.pe/uploads/document/file/7798233/6583027-000111-2025-gr-lamb-geresa-demid.pdf); ADR 063–064). |
| Notas de crédito / devoluciones | ✅ | ⬜ | Hoy solo se anula con la caja abierta. |
| **Libros oficiales de estupefacientes y psicotrópicos** y receta especial | ✅ | ⬜ | Obligación legal de farmacias y boticas que dispensan sustancias fiscalizadas ([CMS](https://cms.law/en/per/publication/decreto-supremo-que-modifica-el-reglamento-de-estupefacientes-psicotropicos-y-otras-sustancias-sujetas-a-fiscalizacion-sanitaria)); en fiscalizaciones se sanciona tener psicotrópicos en anaquel sin el libro (misma resolución de GERESA). Hoy solo hay el aviso "Receta". |
| Catálogo y reportes DIGEMID | ✅ | 🟡 | Código DIGEMID y registro sanitario por producto; sin catálogo oficial precargado. |
| Compras, proveedores y cuentas por pagar | ✅ | 🟡 *(Fase 6)* | Proveedores (RUC validado) y compras con el documento del proveedor, en una sola transacción y sin facturas duplicadas (ADR 066–067). Faltan cuentas por pagar y órdenes de compra. |
| Kardex valorizado por producto | ✅ | ✅ *(Fase 6)* | Saldo inicial, cada movimiento con su documento y saldo en unidades y soles al costo de cada lote; CSV (ADR 068). |
| Varias sucursales: precios por sucursal y traslados | ✅ | ⬜ | El modelo ya guarda stock por sucursal; falta `member_branches`, selector y traslados. |
| Descuentos y promociones | ✅ | ⬜ | |
| Crédito a clientes / cuentas por cobrar | 🟡 | ⬜ | |
| Toma de inventario (conteo físico guiado) | ✅ | 🟡 | Hay ajustes y mermas con motivo; falta el flujo de conteo. |
| Sugerido de compra por rotación | ✅ | ⬜ | Los datos existen (rotación y stock mínimo). |
| Facturación electrónica offline / venta sin internet | 🟡 | ➖ | Sería otro proyecto (cola, conflictos, idempotencia). |
| Etiquetas e impresión de códigos de barras | ✅ | ⬜ | |
| Libro de reclamaciones | 🟡 | ⬜ | Requisito general de establecimientos; suele ser un formulario aparte. |

## IGV peruano: qué se verificó y cómo se modeló

**Hechos verificados**
- La tasa aplicable es **18 %** sobre la operación gravada; en 2026 se compone de **IGV 15.5 % + IPM 2.5 %**, y por la **Ley 32387** el IPM sube gradualmente hasta 4 % en 2029 (IGV 14 %), **manteniendo el total en 18 %** ([SUNAT](https://orientacion.sunat.gob.pe/node/1737)). Por eso la tasa vive en **un solo lugar** (`private.igv_rate()`).
- Los **medicamentos no tienen una tasa reducida general**. La exoneración o inafectación se limita a **listas oficiales aprobadas por decreto supremo** (p. ej. tratamientos oncológicos, VIH/SIDA y diabetes) que deben actualizarse periódicamente ([informe SUNAT 160-2016](https://www.sunat.gob.pe/legislacion/oficiosAd/2016/informes/2016-INF-160-5D1000.pdf), [DS 023-2016-SA](https://sni.org.pe/aprueban-relacion-actualizada-de-medicamentos-e-insumos-para-el-tratamiento-de-enfermedades-oncologicas-y-del-vih-sida-para-efecto-de-la-inafectacion-del-igv-y-derechos-arancelarios/)). No pude confirmar la lista vigente en 2026.
- Los comprobantes electrónicos informan por separado los valores de venta **gravados, inafectos y exonerados**, y la representación impresa puede rotular "Op. gravada / Op. inafecta / Op. exonerada" ([anexos SUNAT](https://www.sunat.gob.pe/legislacion/superin/2022/anexo-123-2022.pdf)).
- Un negocio en el **Nuevo RUS** no cobra IGV por separado y solo emite boletas y tickets; en el **RER** y el **Régimen MYPE Tributario** sí se aplica 18 % ([Trámites Perú](https://tramitesperu.com/sunat/nuevo-rus/); fuente secundaria, confirmar en SUNAT).

**Decisiones de diseño** (ADR 046–051)
1. **No se asume nada sobre los medicamentos**: cada producto tiene su *afectación* y la define el administrador con su contador. El sistema no trae una lista oficial.
2. **Los precios al público incluyen IGV** (práctica común). El IGV se *extrae*: `base = redondeo(total ÷ 1.18)`, `IGV = total − base`. La misma regla en SQL y en el frontend, con los mismos vectores de prueba.
3. **Instantánea por línea** (afectación, tasa e IGV): cambiar un producto o la ley no altera comprobantes ya emitidos.
4. **La botica puede no cobrar IGV** (p. ej. Nuevo RUS): entonces la venta no desglosa y no hay IGV.
5. **La ganancia se calcula sobre la venta neta**, porque el IGV cobrado es un impuesto y no un ingreso. Antes de este cambio, la ganancia estaba sobrestimada para una botica que cobra IGV.
6. **El costo de los lotes se guarda sin IGV** (el IGV de las compras es crédito fiscal). La pantalla de entrada ofrece "el costo que ingresé incluye IGV" para quitárselo.
7. **Sigue siendo un comprobante interno de prueba.** El desglose es un paso previo a la facturación electrónica, no un reemplazo.

## Lo que sigue (si se quisiera crecer)

1. **Sugerido de compra** por rotación y stock mínimo (los datos ya existen) y cuentas por pagar.
2. Varias sucursales (`member_branches`, precios por sucursal, traslados).
3. Cumplimiento DIGEMID: libros de estupefacientes/psicotrópicos y receta especial (con asesoría de un químico farmacéutico); verificar el formato vigente del reporte de precios.
4. Facturación electrónica vía un PSE (con un contador): los datos del cliente y el desglose del IGV ya están.
5. Política de datos personales de los clientes (Ley 29733).

## Fuentes

- SUNAT — IGV, tasa e IPM: <https://orientacion.sunat.gob.pe/node/1737>
- SUNAT — Informe 160-2016 (inafectación de medicamentos): <https://www.sunat.gob.pe/legislacion/oficiosAd/2016/informes/2016-INF-160-5D1000.pdf>
- DS 023-2016-SA (lista oncológicos y VIH/SIDA): <https://sni.org.pe/aprueban-relacion-actualizada-de-medicamentos-e-insumos-para-el-tratamiento-de-enfermedades-oncologicas-y-del-vih-sida-para-efecto-de-la-inafectacion-del-igv-y-derechos-arancelarios/>
- SUNAT — Anexo 123-2022 (campos del comprobante): <https://www.sunat.gob.pe/legislacion/superin/2022/anexo-123-2022.pdf>
- CMS — libros oficiales de estupefacientes y psicotrópicos: <https://cms.law/en/per/publication/decreto-supremo-que-modifica-el-reglamento-de-estupefacientes-psicotropicos-y-otras-sustancias-sujetas-a-fiscalizacion-sanitaria>
- SUNAT — Boleta de venta (identificación del adquirente sobre S/ 700): <https://orientacion.sunat.gob.pe/03-boleta-de-venta>
- DIGEMID — Comunicado 016-2023 (reporte de precios al Observatorio): <https://www.digemid.minsa.gob.pe/Archivos/Comunicados/2023/COM_016-2023.pdf>
- GERESA Lambayeque — Resolución 000111-2025 (temperatura, libro de psicotrópicos): <https://cdn.www.gob.pe/uploads/document/file/7798233/6583027-000111-2025-gr-lamb-geresa-demid.pdf>
- Trámites Perú — Nuevo RUS: <https://tramitesperu.com/sunat/nuevo-rus/>
- Sysfarma: <https://www.comparasoftware.com/sysfarma> · NEOPharm: <https://www.comparasoftware.com/neopharm> · LOLFAR: <https://www.lolimsa.com.pe/wp-content/uploads/Brochure%20LOLFAR.pdf>
