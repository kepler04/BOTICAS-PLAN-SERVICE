-- pgTAP: IGV peruano (18 %), afectaciones, instantanea por linea, pago con tarjeta y reportes netos.
-- Cifras calculadas a mano; ver comentarios.
begin;
select plan(36);

-- ---------- Fixtures (como superusuario) ----------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('88888888-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@igv.local'),
  ('88888888-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier-a@igv.local'),
  ('88888888-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-n@igv.local');

-- A cobra IGV (por defecto). N NO cobra IGV (p. ej. Nuevo RUS).
insert into public.pharmacies (id, legal_name, charges_igv)
values
  ('88888888-1111-4000-8000-000000000000', 'Botica IGV A', true),
  ('88888888-2222-4000-8000-000000000000', 'Botica sin IGV N', false);

insert into public.branches (id, pharmacy_id, name, is_main)
values
  ('88888888-aaaa-4000-8000-000000000001', '88888888-1111-4000-8000-000000000000', 'Principal A', true),
  ('88888888-bbbb-4000-8000-000000000001', '88888888-2222-4000-8000-000000000000', 'Principal N', true);

insert into public.pharmacy_members (pharmacy_id, user_id, role)
values
  ('88888888-1111-4000-8000-000000000000', '88888888-0000-4000-8000-000000000001', 'admin'),
  ('88888888-1111-4000-8000-000000000000', '88888888-0000-4000-8000-000000000002', 'cashier'),
  ('88888888-2222-4000-8000-000000000000', '88888888-0000-4000-8000-000000000003', 'admin');

-- G gravado 11.80 | E exonerado 5.00 | I inafecto 3.00 | H gravado 0.50 | PN (botica N) 11.80
insert into public.products (id, pharmacy_id, name, price_unit, tax_affectation)
values
  ('88888888-eeee-4000-8000-0000000000a1', '88888888-1111-4000-8000-000000000000', 'Gravado G',   11.80, 'gravado'),
  ('88888888-eeee-4000-8000-0000000000a2', '88888888-1111-4000-8000-000000000000', 'Exonerado E',   5.00, 'exonerado'),
  ('88888888-eeee-4000-8000-0000000000a3', '88888888-1111-4000-8000-000000000000', 'Inafecto I',    3.00, 'inafecto'),
  ('88888888-eeee-4000-8000-0000000000a4', '88888888-1111-4000-8000-000000000000', 'Gravado H',     0.50, 'gravado'),
  ('88888888-eeee-4000-8000-0000000000b1', '88888888-2222-4000-8000-000000000000', 'Producto PN',  11.80, 'gravado');

-- Costo 0.50 por unidad (SIN IGV) en todos.
insert into public.lots (pharmacy_id, branch_id, product_id, lot_code, expiry_date, quantity, unit_cost)
select p.pharmacy_id, b.id, p.id, 'L-' || right(p.id::text, 2), current_date + 300, 1000, 0.50
from public.products p join public.branches b on b.pharmacy_id = p.pharmacy_id;

-- ---------- Vectores de la funcion de IGV (paridad con el front: src/features/sales/lib/igv.test.ts) ----------
select is(private.igv_of(118.00, 'gravado', true), 18.00::numeric, 'IGV de 118.00 con IGV incluido = 18.00 (base 100.00)');
select is(private.igv_of(1.50, 'gravado', true), 0.23::numeric, 'redondeo: 1.50 -> base 1.27, IGV 0.23');
select is(private.igv_of(3.00, 'gravado', true), 0.46::numeric, 'redondeo: 3.00 -> base 2.54, IGV 0.46');
select is(private.igv_of(100.00, 'exonerado', true), 0::numeric, 'exonerado: sin IGV');
select is(private.igv_of(100.00, 'inafecto', true), 0::numeric, 'inafecto: sin IGV');
select is(private.igv_of(118.00, 'gravado', false), 0::numeric, 'si la botica no cobra IGV, no hay IGV');
select is(private.igv_rate(), 18.00::numeric, 'la tasa total vigente es 18 %');

-- ============ Cajero A ============
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"88888888-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.open_cash_session('88888888-aaaa-4000-8000-000000000001', 100);

-- Venta 1 (efectivo): G x1 = 11.80 | E x1 = 5.00 | I x2 = 6.00  -> total 22.80
select lives_ok(
  $$select public.create_sale('88888888-aaaa-4000-8000-000000000001',
      '[{"product_id":"88888888-eeee-4000-8000-0000000000a1","presentation":"unit","quantity":1},
        {"product_id":"88888888-eeee-4000-8000-0000000000a2","presentation":"unit","quantity":1},
        {"product_id":"88888888-eeee-4000-8000-0000000000a3","presentation":"unit","quantity":2}]'::jsonb,
      'cash', 50)$$,
  'venta con productos gravado, exonerado e inafecto');

select is((select total from public.sales where receipt_number = 1), 22.80::numeric, 'total cobrado = 22.80');
select is((select total_igv from public.sales where receipt_number = 1), 1.80::numeric, 'IGV de la venta = 1.80');
select is((select total_gravado from public.sales where receipt_number = 1), 10.00::numeric, 'operacion gravada (base) = 10.00');
select is((select total_exonerado from public.sales where receipt_number = 1), 5.00::numeric, 'operacion exonerada = 5.00');
select is((select total_inafecto from public.sales where receipt_number = 1), 6.00::numeric, 'operacion inafecta = 6.00');
select ok((select total = total_gravado + total_exonerado + total_inafecto + total_igv from public.sales where receipt_number = 1),
  'total = gravado + exonerado + inafecto + IGV');
select is((select igv_amount from public.sale_items where product_name = 'Gravado G' and pharmacy_id = '88888888-1111-4000-8000-000000000000'), 1.80::numeric, 'la linea gravada guarda su IGV');
select is((select taxable_amount from public.sale_items where product_name = 'Gravado G' and pharmacy_id = '88888888-1111-4000-8000-000000000000'), 10.00::numeric, 'valor de venta de la linea = 10.00 (generado)');
select is((select igv_rate from public.sale_items where product_name = 'Gravado G' and pharmacy_id = '88888888-1111-4000-8000-000000000000'), 18.00::numeric, 'la linea guarda la tasa aplicada');
select is((select igv_amount from public.sale_items where product_name = 'Exonerado E' and pharmacy_id = '88888888-1111-4000-8000-000000000000'), 0::numeric, 'la linea exonerada no lleva IGV');

-- Venta 2 (tarjeta): H x3 = 1.50 -> base 1.27, IGV 0.23
select lives_ok(
  $$select public.create_sale('88888888-aaaa-4000-8000-000000000001',
      '[{"product_id":"88888888-eeee-4000-8000-0000000000a4","presentation":"unit","quantity":3}]'::jsonb,
      'card')$$,
  'venta pagada con tarjeta');
select is((select total_igv from public.sales where receipt_number = 2), 0.23::numeric, 'redondeo del IGV: 0.23');
select is((select change_given from public.sales where receipt_number = 2), 0::numeric, 'la tarjeta no tiene vuelto');

-- ---------- Instantanea ----------
reset role;
update public.products set tax_affectation = 'exonerado' where id = '88888888-eeee-4000-8000-0000000000a1';
select is((select igv_amount from public.sale_items where product_name = 'Gravado G' and pharmacy_id = '88888888-1111-4000-8000-000000000000'), 1.80::numeric,
  'cambiar la afectacion del producto NO altera comprobantes ya emitidos');
update public.products set tax_affectation = 'gravado' where id = '88888888-eeee-4000-8000-0000000000a1';

-- ============ Permisos ============
-- Un UPDATE bloqueado por RLS no lanza error: simplemente no toca ninguna fila. Se verifica que NO cambio.
set local role authenticated;
select lives_ok(
  $$update public.products set tax_affectation = 'inafecto' where id = '88888888-eeee-4000-8000-0000000000a1'$$,
  'el cajero intenta cambiar la afectacion tributaria de un producto');
select lives_ok(
  $$update public.pharmacies set charges_igv = false where id = '88888888-1111-4000-8000-000000000000'$$,
  'el cajero intenta cambiar si la botica cobra IGV');
reset role;
select is((select tax_affectation::text from public.products where id = '88888888-eeee-4000-8000-0000000000a1'), 'gravado',
  'la afectacion tributaria NO cambio (RLS la protege)');
select is((select charges_igv from public.pharmacies where id = '88888888-1111-4000-8000-000000000000'), true,
  'charges_igv NO cambio (RLS lo protege)');
set local role authenticated;

-- ============ Admin A: configuracion y reportes ============
select set_config('request.jwt.claims',
  '{"sub":"88888888-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Reporte con IGV (antes de desactivarlo): hoy en hora de Lima.
select is(
  (select igv from public.report_sales_summary('88888888-aaaa-4000-8000-000000000001',
     (now() at time zone 'America/Lima')::date, (now() at time zone 'America/Lima')::date)),
  2.03::numeric, 'reporte: IGV cobrado = 1.80 + 0.23');
select is(
  (select net from public.report_sales_summary('88888888-aaaa-4000-8000-000000000001',
     (now() at time zone 'America/Lima')::date, (now() at time zone 'America/Lima')::date)),
  22.27::numeric, 'reporte: venta neta = (22.80 + 1.50) - 2.03');
-- Costo: 7 unidades x 0.50 = 3.50 (G1 + E1 + I2 + H3).  Ganancia sobre la venta NETA: 22.27 - 3.50 = 18.77
select is(
  (select profit from public.report_sales_summary('88888888-aaaa-4000-8000-000000000001',
     (now() at time zone 'America/Lima')::date, (now() at time zone 'America/Lima')::date)),
  18.77::numeric, 'reporte: ganancia = venta neta - costo (el IGV no es ingreso)');
select is(
  (select card from public.report_sales_series('88888888-aaaa-4000-8000-000000000001',
     (now() at time zone 'America/Lima')::date, (now() at time zone 'America/Lima')::date) limit 1),
  1.50::numeric, 'la serie separa lo cobrado con tarjeta');

-- La tarjeta no entra al cajon: efectivo esperado = apertura 100 + venta 1 en efectivo 22.80
select is((select expected_cash from public.cash_session_summary limit 1), 122.80::numeric,
  'el efectivo esperado no incluye lo cobrado con tarjeta');
select is((select card_sales from public.cash_session_summary limit 1), 1.50::numeric, 'el resumen de caja muestra lo cobrado con tarjeta');

-- El admin SI puede configurar.
select lives_ok(
  $$update public.pharmacies set charges_igv = false where id = '88888888-1111-4000-8000-000000000000'$$,
  'el admin puede indicar que la botica no cobra IGV');
reset role;
select is((select count(*)::int from public.audit_log where action = 'pharmacy.charges_igv_changed'
           and pharmacy_id = '88888888-1111-4000-8000-000000000000'), 1,
  'el cambio de configuracion tributaria queda en la auditoria');

-- ============ Botica que NO cobra IGV ============
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"88888888-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.open_cash_session('88888888-bbbb-4000-8000-000000000001', 0);
select public.create_sale('88888888-bbbb-4000-8000-000000000001',
  '[{"product_id":"88888888-eeee-4000-8000-0000000000b1","presentation":"unit","quantity":1}]'::jsonb, 'yape');
select is((select charges_igv from public.sales), false, 'la venta recuerda que la botica no cobraba IGV');
select is((select total_igv + total_gravado from public.sales), 0::numeric, 'sin desglose de IGV: totales de impuesto en cero');

select * from finish();
rollback;
