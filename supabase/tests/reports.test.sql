-- pgTAP: reportes (Fase 4). Cifras calculadas a mano; ver comentarios.
-- Ejecutar con: npx supabase test db   (requiere Docker / Supabase local)
begin;
select plan(33);

-- ---------- Fixtures (como superusuario) ----------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('99999999-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@rep.local'),
  ('99999999-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier-a@rep.local'),
  ('99999999-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@rep.local');

insert into public.pharmacies (id, legal_name)
values
  ('99999999-1111-4000-8000-000000000000', 'Botica Reportes A'),
  ('99999999-2222-4000-8000-000000000000', 'Botica Reportes B');

insert into public.branches (id, pharmacy_id, name, is_main)
values
  ('99999999-aaaa-4000-8000-000000000001', '99999999-1111-4000-8000-000000000000', 'Principal A', true),
  ('99999999-bbbb-4000-8000-000000000001', '99999999-2222-4000-8000-000000000000', 'Principal B', true);

insert into public.pharmacy_members (pharmacy_id, user_id, role)
values
  ('99999999-1111-4000-8000-000000000000', '99999999-0000-4000-8000-000000000001', 'admin'),
  ('99999999-1111-4000-8000-000000000000', '99999999-0000-4000-8000-000000000002', 'cashier'),
  ('99999999-2222-4000-8000-000000000000', '99999999-0000-4000-8000-000000000003', 'admin');

insert into public.products (id, pharmacy_id, name, price_unit)
values
  ('99999999-eeee-4000-8000-0000000000a1', '99999999-1111-4000-8000-000000000000', 'Producto P', 1.00),
  ('99999999-eeee-4000-8000-0000000000a2', '99999999-1111-4000-8000-000000000000', 'Producto Q', 12.90),
  ('99999999-eeee-4000-8000-0000000000a3', '99999999-1111-4000-8000-000000000000', 'Producto R', 1.00);

-- Inventario (hoy en hora de Lima = ref)
create temp table ref as select (now() at time zone 'America/Lima')::date as today;
grant select on ref to authenticated;

insert into public.lots (id, pharmacy_id, branch_id, product_id, lot_code, expiry_date, quantity, unit_cost)
select v.id::uuid, '99999999-1111-4000-8000-000000000000', '99999999-aaaa-4000-8000-000000000001',
       v.product::uuid, v.code, ref.today + v.days, v.qty, v.cost
from ref, (values
  ('99999999-1000-4000-8000-000000000001', '99999999-eeee-4000-8000-0000000000a1', 'P-1',  10, 100, 0.40),  -- 40.00 vence en 10 dias
  ('99999999-1000-4000-8000-000000000002', '99999999-eeee-4000-8000-0000000000a1', 'P-2',  45,  50, 0.40),  -- 20.00 vence en 45 dias
  ('99999999-1000-4000-8000-000000000003', '99999999-eeee-4000-8000-0000000000a1', 'P-3',  -3,  20, 0.50),  -- 10.00 YA vencido
  ('99999999-1000-4000-8000-000000000004', '99999999-eeee-4000-8000-0000000000a1', 'P-4',  80,  10, 1.00),  -- 10.00 vence en 80 dias
  ('99999999-1000-4000-8000-000000000005', '99999999-eeee-4000-8000-0000000000a2', 'Q-1', 400,   3, 8.00),  -- 24.00
  ('99999999-1000-4000-8000-000000000006', '99999999-eeee-4000-8000-0000000000a3', 'R-1', 400,  10, 1.00)   -- 10.00
) as v (id, product, code, days, qty, cost);

-- Caja cerrada de apoyo (las ventas exigen una)
insert into public.cash_sessions (id, pharmacy_id, branch_id, status, opening_amount, closed_at, counted_cash, difference)
values ('99999999-5555-4000-8000-000000000001', '99999999-1111-4000-8000-000000000000',
        '99999999-aaaa-4000-8000-000000000001', 'closed', 0, now(), 0, 0);

-- ---------- Ventas historicas (2020, fijas): prueban zona horaria, anuladas y costos ----------
-- S1: 10-mar 23:30 Lima (= 11-mar 04:30 UTC)  -> 10 u de P a 1.00  = 10.00 | costo 10*0.40 = 4.00   efectivo
-- S2: 11-mar 00:10 Lima                       ->  5 u de P a 1.00  =  5.00 | costo  5*0.40 = 2.00   efectivo
-- S3: 11-mar 10:00 Lima                       ->  2 u de Q a 12.90 = 25.80 | costo  2*8.00 = 16.00  Yape
-- S4: 11-mar 12:00 Lima  ANULADA              -> 100.00 (no debe contar)
insert into public.sales (id, pharmacy_id, branch_id, cash_session_id, receipt_number, status, payment_method,
                          total, amount_received, change_given, created_at, voided_at, void_reason)
values
  ('99999999-6000-4000-8000-000000000001', '99999999-1111-4000-8000-000000000000', '99999999-aaaa-4000-8000-000000000001', '99999999-5555-4000-8000-000000000001', 1, 'completed', 'cash', 10.00, 10.00, 0, timestamptz '2020-03-10 23:30:00-05', null, null),
  ('99999999-6000-4000-8000-000000000002', '99999999-1111-4000-8000-000000000000', '99999999-aaaa-4000-8000-000000000001', '99999999-5555-4000-8000-000000000001', 2, 'completed', 'cash',  5.00,  5.00, 0, timestamptz '2020-03-11 00:10:00-05', null, null),
  ('99999999-6000-4000-8000-000000000003', '99999999-1111-4000-8000-000000000000', '99999999-aaaa-4000-8000-000000000001', '99999999-5555-4000-8000-000000000001', 3, 'completed', 'yape', 25.80, 25.80, 0, timestamptz '2020-03-11 10:00:00-05', null, null),
  ('99999999-6000-4000-8000-000000000004', '99999999-1111-4000-8000-000000000000', '99999999-aaaa-4000-8000-000000000001', '99999999-5555-4000-8000-000000000001', 4, 'voided',    'cash', 100.00, 100.00, 0, timestamptz '2020-03-11 12:00:00-05', now(), 'Prueba');

insert into public.sale_items (id, pharmacy_id, sale_id, product_id, product_name, presentation, quantity, units_per_presentation, base_quantity, unit_price, line_total)
values
  ('99999999-7000-4000-8000-000000000001', '99999999-1111-4000-8000-000000000000', '99999999-6000-4000-8000-000000000001', '99999999-eeee-4000-8000-0000000000a1', 'Producto P', 'unit', 10, 1, 10, 1.00, 10.00),
  ('99999999-7000-4000-8000-000000000002', '99999999-1111-4000-8000-000000000000', '99999999-6000-4000-8000-000000000002', '99999999-eeee-4000-8000-0000000000a1', 'Producto P', 'unit',  5, 1,  5, 1.00,  5.00),
  ('99999999-7000-4000-8000-000000000003', '99999999-1111-4000-8000-000000000000', '99999999-6000-4000-8000-000000000003', '99999999-eeee-4000-8000-0000000000a2', 'Producto Q', 'unit',  2, 1,  2, 12.90, 25.80),
  ('99999999-7000-4000-8000-000000000004', '99999999-1111-4000-8000-000000000000', '99999999-6000-4000-8000-000000000004', '99999999-eeee-4000-8000-0000000000a2', 'Producto Q', 'unit',  8, 1,  8, 12.50, 100.00);

insert into public.sale_item_lots (pharmacy_id, sale_item_id, lot_id, quantity, unit_cost)
values
  ('99999999-1111-4000-8000-000000000000', '99999999-7000-4000-8000-000000000001', '99999999-1000-4000-8000-000000000001', 10, 0.40),
  ('99999999-1111-4000-8000-000000000000', '99999999-7000-4000-8000-000000000002', '99999999-1000-4000-8000-000000000001',  5, 0.40),
  ('99999999-1111-4000-8000-000000000000', '99999999-7000-4000-8000-000000000003', '99999999-1000-4000-8000-000000000005',  2, 8.00),
  ('99999999-1111-4000-8000-000000000000', '99999999-7000-4000-8000-000000000004', '99999999-1000-4000-8000-000000000005',  8, 8.00);

-- Venta RECIENTE (hace 5 dias) de 3 u de P: para la prueba de baja rotacion
insert into public.sales (id, pharmacy_id, branch_id, cash_session_id, receipt_number, status, payment_method,
                          total, amount_received, change_given, created_at)
values ('99999999-6000-4000-8000-000000000005', '99999999-1111-4000-8000-000000000000', '99999999-aaaa-4000-8000-000000000001',
        '99999999-5555-4000-8000-000000000001', 5, 'completed', 'cash', 3.00, 3.00, 0, now() - interval '5 days');
insert into public.sale_items (id, pharmacy_id, sale_id, product_id, product_name, presentation, quantity, units_per_presentation, base_quantity, unit_price, line_total)
values ('99999999-7000-4000-8000-000000000005', '99999999-1111-4000-8000-000000000000', '99999999-6000-4000-8000-000000000005',
        '99999999-eeee-4000-8000-0000000000a1', 'Producto P', 'unit', 3, 1, 3, 1.00, 3.00);

-- ============ Admin A ============
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- ---------- Serie diaria (zona horaria Lima) ----------
select is((select count(*)::int from public.report_sales_series('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12')), 3,
  'la serie diaria incluye todos los dias del rango, tambien los sin ventas');
select is((select total from public.report_sales_series('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12') where period = '2020-03-10'), 10.00::numeric,
  'una venta a las 23:30 de Lima cuenta en ESE dia (aunque en UTC ya sea el siguiente)');
select is((select sales_count from public.report_sales_series('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12') where period = '2020-03-11'), 2,
  'el dia 11 tiene 2 ventas completadas (la anulada no cuenta)');
select is((select total from public.report_sales_series('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12') where period = '2020-03-11'), 30.80::numeric,
  'total del dia 11 = 5.00 + 25.80');
select is((select yape from public.report_sales_series('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12') where period = '2020-03-11'), 25.80::numeric,
  'separa lo cobrado por Yape');
select is((select profit from public.report_sales_series('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12') where period = '2020-03-11'), 12.80::numeric,
  'ganancia del dia 11 = 30.80 - (2.00 + 16.00)');
select is((select total from public.report_sales_series('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12') where period = '2020-03-12'), 0::numeric,
  'un dia sin ventas aparece con cero');
select is((select total from public.report_sales_series('99999999-aaaa-4000-8000-000000000001', '2020-03-01', '2020-03-31', 'month')), 40.80::numeric,
  'la serie mensual agrupa todo marzo');

-- ---------- Resumen ----------
select is((select total from public.report_sales_summary('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12')), 40.80::numeric,
  'resumen: ventas totales (sin anuladas)');
select is((select profit from public.report_sales_summary('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12')), 18.80::numeric,
  'resumen: ganancia = 40.80 - 22.00');
select is((select avg_ticket from public.report_sales_summary('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12')), 13.60::numeric,
  'resumen: ticket promedio = 40.80 / 3');
select is((select voided_count from public.report_sales_summary('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12')), 1,
  'resumen: cuenta las anuladas aparte');
select is((select voided_total from public.report_sales_summary('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12')), 100.00::numeric,
  'resumen: monto anulado');
select is((select sales_count from public.report_sales_summary('99999999-aaaa-4000-8000-000000000001', '2019-01-01', '2019-01-31')), 0,
  'un periodo sin ventas devuelve ceros (no vacio)');

-- ---------- Mas vendidos ----------
select is((select name from public.report_top_products('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12', 10, 'revenue') limit 1), 'Producto Q',
  'mas vendidos por ingreso: Q (25.80) antes que P (15.00)');
select is((select name from public.report_top_products('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12', 10, 'units') limit 1), 'Producto P',
  'mas vendidos por unidades: P (15) antes que Q (2)');
select is((select margin from public.report_top_products('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12', 10, 'revenue') where name = 'Producto P'), 60.0::numeric,
  'margen de P = (15 - 6) / 15 = 60 %');
select is((select count(*)::int from public.report_top_products('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12', 1, 'revenue')), 1,
  'respeta el limite');

-- ---------- Baja rotacion ----------
select is(
  (select array_agg(name order by ord) from (
     select name, row_number() over () as ord
     from public.report_slow_movers('99999999-aaaa-4000-8000-000000000001', 30, 10)) t),
  array['Producto Q', 'Producto R', 'Producto P'],
  'baja rotacion: sin ventas recientes primero (Q tiene mas capital parado que R); P vendio hace 5 dias y va al final');
select is((select units_sold from public.report_slow_movers('99999999-aaaa-4000-8000-000000000001', 30, 10) where name = 'Producto P'), 3::bigint,
  'cuenta solo lo vendido dentro de la ventana');
select is((select stock_cost from public.report_slow_movers('99999999-aaaa-4000-8000-000000000001', 30, 10) where name = 'Producto Q'), 24.00::numeric,
  'capital inmovilizado de Q = 3 x 8.00');

-- ---------- Valorizacion ----------
select is((select stock_cost from public.report_inventory_value('99999999-aaaa-4000-8000-000000000001')), 114.00::numeric,
  'valor del inventario a costo = 40 + 20 + 10 + 10 + 24 + 10');
select is((select stock_units from public.report_inventory_value('99999999-aaaa-4000-8000-000000000001')), 193::bigint, 'unidades en stock');
select is((select products_with_stock from public.report_inventory_value('99999999-aaaa-4000-8000-000000000001')), 3, 'productos con stock');
select is((select expired_cost from public.report_inventory_value('99999999-aaaa-4000-8000-000000000001')), 10.00::numeric, 'dinero en lotes ya vencidos');
select is((select expiring_30_cost from public.report_inventory_value('99999999-aaaa-4000-8000-000000000001')), 40.00::numeric, 'dinero que vence en 0-30 dias');
select is((select expiring_60_cost from public.report_inventory_value('99999999-aaaa-4000-8000-000000000001')), 20.00::numeric, 'dinero que vence en 31-60 dias');
select is((select expiring_90_cost from public.report_inventory_value('99999999-aaaa-4000-8000-000000000001')), 10.00::numeric, 'dinero que vence en 61-90 dias');

-- ---------- Validaciones ----------
select throws_ok(
  $$select * from public.report_sales_series('99999999-aaaa-4000-8000-000000000001', '2020-03-12', '2020-03-10')$$,
  '22023', 'invalid_range', 'un rango invertido se rechaza');
select throws_ok(
  $$select * from public.report_sales_series('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12', 'week')$$,
  '22023', 'invalid_granularity', 'solo dia o mes');

-- ============ Cajero A: sin acceso a reportes ============
select set_config('request.jwt.claims',
  '{"sub":"99999999-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.report_sales_summary('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12')$$,
  '42501', 'forbidden', 'el cajero no puede ver reportes (evita margenes falsos por costos ocultos)');

-- ============ Admin B: otra botica ============
select set_config('request.jwt.claims',
  '{"sub":"99999999-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.report_inventory_value('99999999-aaaa-4000-8000-000000000001')$$,
  '42501', 'forbidden', 'otra botica no puede ver el reporte de esta sucursal');

-- ============ Anonimo ============
reset role;
set local role anon;
select throws_ok(
  $$select * from public.report_sales_summary('99999999-aaaa-4000-8000-000000000001', '2020-03-10', '2020-03-12')$$,
  '42501', null, 'un anonimo no puede ejecutar reportes');

select * from finish();
rollback;
