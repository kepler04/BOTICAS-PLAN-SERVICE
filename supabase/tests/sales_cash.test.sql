-- pgTAP: ventas (create_sale / void_sale) y caja (Fase 3)
-- Ejecutar con: npx supabase test db   (requiere Docker / Supabase local)
begin;
select plan(57);

-- ---------- Fixtures (como superusuario) ----------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('ffffffff-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@sales.local'),
  ('ffffffff-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier-a@sales.local'),
  ('ffffffff-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@sales.local');

insert into public.pharmacies (id, legal_name)
values
  ('ffffffff-1111-4000-8000-000000000000', 'Botica Ventas A'),
  ('ffffffff-2222-4000-8000-000000000000', 'Botica Ventas B');

insert into public.branches (id, pharmacy_id, name, is_main)
values
  ('ffffffff-aaaa-4000-8000-000000000001', 'ffffffff-1111-4000-8000-000000000000', 'Principal A', true),
  ('ffffffff-bbbb-4000-8000-000000000001', 'ffffffff-2222-4000-8000-000000000000', 'Principal B', true);

insert into public.pharmacy_members (pharmacy_id, user_id, role)
values
  ('ffffffff-1111-4000-8000-000000000000', 'ffffffff-0000-4000-8000-000000000001', 'admin'),
  ('ffffffff-1111-4000-8000-000000000000', 'ffffffff-0000-4000-8000-000000000002', 'cashier'),
  ('ffffffff-2222-4000-8000-000000000000', 'ffffffff-0000-4000-8000-000000000003', 'admin');

-- P: blister x10 y caja x100 | Q: solo unidad | R: inactivo | S: solo tiene stock vencido
insert into public.products (id, pharmacy_id, name, price_unit, units_per_blister, price_blister, units_per_box, price_box, active)
values
  ('ffffffff-eeee-4000-8000-0000000000a1', 'ffffffff-1111-4000-8000-000000000000', 'Paracetamol 500 mg', 0.50, 10, 4.50, 100, 40.00, true),
  ('ffffffff-eeee-4000-8000-0000000000a2', 'ffffffff-1111-4000-8000-000000000000', 'Jarabe', 12.90, null, null, null, null, true),
  ('ffffffff-eeee-4000-8000-0000000000a3', 'ffffffff-1111-4000-8000-000000000000', 'Producto inactivo', 1.00, null, null, null, null, false),
  ('ffffffff-eeee-4000-8000-0000000000a4', 'ffffffff-1111-4000-8000-000000000000', 'Solo vencido', 2.00, null, null, null, null, true);

insert into public.lots (pharmacy_id, branch_id, product_id, lot_code, expiry_date, quantity, unit_cost)
values
  ('ffffffff-1111-4000-8000-000000000000', 'ffffffff-aaaa-4000-8000-000000000001', 'ffffffff-eeee-4000-8000-0000000000a1', 'L1', current_date + 10, 30, 0.2),
  ('ffffffff-1111-4000-8000-000000000000', 'ffffffff-aaaa-4000-8000-000000000001', 'ffffffff-eeee-4000-8000-0000000000a1', 'L2', current_date + 400, 500, 0.2),
  ('ffffffff-1111-4000-8000-000000000000', 'ffffffff-aaaa-4000-8000-000000000001', 'ffffffff-eeee-4000-8000-0000000000a1', 'L0', current_date - 5, 100, 0.2),
  ('ffffffff-1111-4000-8000-000000000000', 'ffffffff-aaaa-4000-8000-000000000001', 'ffffffff-eeee-4000-8000-0000000000a2', 'LQ', current_date + 100, 5, 8),
  ('ffffffff-1111-4000-8000-000000000000', 'ffffffff-aaaa-4000-8000-000000000001', 'ffffffff-eeee-4000-8000-0000000000a4', 'LS', current_date - 1, 10, 1);

-- ============ Cajero A ============
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ffffffff-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a2","presentation":"unit","quantity":1}]'::jsonb,
      'cash', 20)$$,
  'P0001', 'no_open_cash_session',
  'no se puede vender sin caja abierta');

select lives_ok(
  $$select public.open_cash_session('ffffffff-aaaa-4000-8000-000000000001', 100)$$,
  'el cajero puede abrir la caja');
select throws_ok(
  $$select public.open_cash_session('ffffffff-aaaa-4000-8000-000000000001', 50)$$,
  'P0001', 'session_already_open',
  'no se abre una segunda caja en la misma sucursal');

-- ---------- Venta 1: caja x1 + 5 unidades, efectivo ----------
select lives_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a1","presentation":"box","quantity":1},
        {"product_id":"ffffffff-eeee-4000-8000-0000000000a1","presentation":"unit","quantity":5}]'::jsonb,
      'cash', 100, null, 'aaaaaaaa-1111-4000-8000-000000000001')$$,
  'el cajero registra una venta con caja y unidades');

select is((select total from public.sales where receipt_number = 1), 42.50::numeric,
  'el total lo calcula el servidor con los precios de cada presentacion');
select is((select change_given from public.sales where receipt_number = 1), 57.50::numeric,
  'calcula el vuelto');
select is((select receipt_series || '-' || receipt_number from public.sales where receipt_number = 1), 'T001-1',
  'el comprobante interno es T001-1');
select is((select count(*)::int from public.sale_items), 2, 'se guardan dos lineas');
select is((select base_quantity from public.sale_items where presentation = 'box'), 100,
  'la caja descuenta 100 unidades base');

-- Se lee como superusuario: el cajero no puede ver costos de lotes.
reset role;
select is((select quantity from public.lots where lot_code = 'L1' and pharmacy_id = 'ffffffff-1111-4000-8000-000000000000'), 0,
  'FEFO: el lote que vence primero se agota primero');
select is((select quantity from public.lots where lot_code = 'L2' and pharmacy_id = 'ffffffff-1111-4000-8000-000000000000'), 425,
  'el siguiente lote cubre el resto (500 - 70 - 5)');
select is((select quantity from public.lots where lot_code = 'L0' and pharmacy_id = 'ffffffff-1111-4000-8000-000000000000'), 100,
  'el lote vencido no se toca');
select is((select count(*)::int from public.inventory_movements where type = 'sale' and pharmacy_id = 'ffffffff-1111-4000-8000-000000000000'), 3,
  'cada lote tocado deja un movimiento de venta');
select is((select count(*)::int from public.sale_item_lots where pharmacy_id = 'ffffffff-1111-4000-8000-000000000000'), 3, 'se guarda de que lotes salio cada linea');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ffffffff-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- ---------- Idempotencia ----------
select lives_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a1","presentation":"box","quantity":1},
        {"product_id":"ffffffff-eeee-4000-8000-0000000000a1","presentation":"unit","quantity":5}]'::jsonb,
      'cash', 100, null, 'aaaaaaaa-1111-4000-8000-000000000001')$$,
  'repetir la misma clave no falla');
select is((select count(*)::int from public.sales), 1, 'la misma clave no duplica la venta');

-- ---------- Rechazos (y la numeracion no se pierde) ----------
select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a2","presentation":"unit","quantity":6}]'::jsonb,
      'cash', 100)$$,
  'P0001', 'insufficient_stock',
  'no se vende mas de lo que hay');
select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a4","presentation":"unit","quantity":1}]'::jsonb,
      'cash', 100)$$,
  'P0001', 'insufficient_stock',
  'el stock vencido no se puede vender');
select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a3","presentation":"unit","quantity":1}]'::jsonb,
      'cash', 100)$$,
  'P0001', 'product_inactive',
  'no se vende un producto inactivo');
select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a2","presentation":"box","quantity":1}]'::jsonb,
      'cash', 100)$$,
  'P0001', 'presentation_unavailable',
  'no se vende en una presentacion que el producto no tiene');
select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001', '[]'::jsonb, 'cash', 100)$$,
  '22023', 'invalid_items',
  'una venta sin lineas es invalida');
select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a2","presentation":"unit","quantity":0}]'::jsonb,
      'cash', 100)$$,
  '22023', 'invalid_items',
  'la cantidad debe ser positiva');
select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"no-es-uuid","presentation":"unit","quantity":1}]'::jsonb,
      'cash', 100)$$,
  '22023', 'invalid_items',
  'un identificador mal formado se rechaza con un error controlado');
select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a2","presentation":"unit","quantity":1}]'::jsonb,
      'cash', 1)$$,
  'P0001', 'insufficient_payment',
  'en efectivo debe alcanzar para pagar');
select is((select count(*)::int from public.sales), 1,
  'ninguna venta rechazada deja registros a medias');

-- ---------- Venta 2: Yape ----------
select lives_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a2","presentation":"unit","quantity":2}]'::jsonb,
      'yape', null, 'OP-123456')$$,
  'venta pagada con Yape');
select is((select receipt_number from public.sales where payment_method = 'yape'), 2,
  'la numeracion no tiene huecos aunque hubo ventas rechazadas');
select is((select change_given from public.sales where payment_method = 'yape'), 0::numeric,
  'Yape no tiene vuelto');

-- ---------- Permisos del cajero ----------
select throws_ok(
  $$select public.void_sale((select id from public.sales where receipt_number = 1), 'Intento de cajero')$$,
  '42501', 'forbidden',
  'el cajero no puede anular ventas');
select throws_ok(
  $$insert into public.sales (pharmacy_id, branch_id, cash_session_id, payment_method, total)
    select pharmacy_id, branch_id, cash_session_id, 'cash', 1 from public.sales limit 1$$,
  '42501', null,
  'las ventas no se insertan directamente');
select throws_ok(
  $$update public.sales set total = 0$$,
  '42501', null,
  'las ventas no se editan directamente');
select is((select count(*)::int from public.sale_item_lots), 0,
  'el cajero no ve de que lotes (y a que costo) salio la venta');

-- ---------- Caja: ingresos, egresos y cierre ----------
select lives_ok(
  $$select public.add_cash_movement((select id from public.cash_sessions limit 1), 'income', 20, 'Sencillo del banco')$$,
  'registra un ingreso de caja');
select lives_ok(
  $$select public.add_cash_movement((select id from public.cash_sessions limit 1), 'expense', 5, 'Bolsas')$$,
  'registra un egreso de caja');
select throws_ok(
  $$select public.add_cash_movement((select id from public.cash_sessions limit 1), 'expense', 5, '')$$,
  '22023', 'reason_required',
  'un movimiento de caja exige motivo');

select is((select expected_cash from public.cash_session_summary limit 1), 157.50::numeric,
  'efectivo esperado = apertura + ventas en efectivo + ingresos - egresos (Yape no cuenta)');
select is((select yape_sales from public.cash_session_summary limit 1), 25.80::numeric,
  'el resumen separa las ventas por Yape');

select throws_ok(
  $$select public.close_cash_session((select id from public.cash_sessions limit 1), 150)$$,
  '22023', 'difference_note_required',
  'si hay diferencia al cerrar, se exige una nota');
select is(
  (public.close_cash_session((select id from public.cash_sessions limit 1), 157.50)) ->> 'difference',
  '0.00',
  'cierra la caja sin diferencia');
select is((select status::text from public.cash_sessions limit 1), 'closed', 'la caja queda cerrada');

select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a2","presentation":"unit","quantity":1}]'::jsonb,
      'cash', 20)$$,
  'P0001', 'no_open_cash_session',
  'con la caja cerrada ya no se vende');
select throws_ok(
  $$select public.add_cash_movement((select id from public.cash_sessions limit 1), 'income', 1, 'Tarde')$$,
  'P0001', 'cash_session_closed',
  'con la caja cerrada ya no hay movimientos');

-- ============ Admin A: anulaciones ============
select set_config('request.jwt.claims',
  '{"sub":"ffffffff-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.void_sale((select id from public.sales where receipt_number = 1), 'Fuera de turno')$$,
  'P0001', 'cash_session_closed',
  'no se anula una venta de una caja ya cerrada');

select lives_ok(
  $$select public.open_cash_session('ffffffff-aaaa-4000-8000-000000000001', 0)$$,
  'el admin abre una nueva caja');
select lives_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a2","presentation":"unit","quantity":1}]'::jsonb,
      'cash', 20)$$,
  'el admin tambien vende');
select lives_ok(
  $$select public.void_sale((select id from public.sales where receipt_number = 3), 'Error de cobro')$$,
  'el admin anula una venta de la caja abierta');
select is((select status::text from public.sales where receipt_number = 3), 'voided', 'la venta queda anulada');
select throws_ok(
  $$select public.void_sale((select id from public.sales where receipt_number = 3), 'Otra vez')$$,
  'P0001', 'already_voided',
  'no se anula dos veces');
select is((select voided_count from public.cash_session_summary where status = 'open'), 1,
  'la caja cuenta la venta anulada');
select is((select cash_sales from public.cash_session_summary where status = 'open'), 0::numeric,
  'la venta anulada no suma al efectivo');

reset role;
select is((select quantity from public.lots where lot_code = 'LQ' and pharmacy_id = 'ffffffff-1111-4000-8000-000000000000'), 3,
  'anular devuelve el stock al lote (5 - 2 vendidos en la venta 2)');
select is((select count(*)::int from public.inventory_movements where type = 'sale_void' and pharmacy_id = 'ffffffff-1111-4000-8000-000000000000'), 1,
  'la anulacion deja su movimiento');

select is(
  (select total from public.get_sales_summary('ffffffff-aaaa-4000-8000-000000000001', now() - interval '1 day', now() + interval '1 day')),
  68.30::numeric,
  'el resumen suma las ventas no anuladas (42.50 + 25.80)');
select is(
  (select voided_count from public.get_sales_summary('ffffffff-aaaa-4000-8000-000000000001', now() - interval '1 day', now() + interval '1 day')),
  1,
  'el resumen cuenta aparte las anuladas');

-- ============ Aislamiento y anonimo ============
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ffffffff-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001',
      '[{"product_id":"ffffffff-eeee-4000-8000-0000000000a2","presentation":"unit","quantity":1}]'::jsonb,
      'cash', 20)$$,
  '42501', 'forbidden',
  'otra botica no puede vender en esta sucursal');
select is((select count(*)::int from public.sales) + (select count(*)::int from public.cash_session_summary), 0,
  'otra botica no ve ventas ni cajas ajenas');

reset role;
set local role anon;
select throws_ok(
  $$select public.create_sale('ffffffff-aaaa-4000-8000-000000000001', '[]'::jsonb, 'cash', 1)$$,
  '42501', null,
  'un anonimo no puede vender');

select * from finish();
rollback;
