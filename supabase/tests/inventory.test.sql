-- pgTAP: productos, lotes, movimientos y stock (Fase 2)
-- Ejecutar con: npx supabase test db   (requiere Docker / Supabase local)
begin;
select plan(44);

-- ---------- Fixtures (como superusuario) ----------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@inv.local'),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier-a@inv.local'),
  ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@inv.local');

insert into public.pharmacies (id, legal_name)
values
  ('dddddddd-1111-4000-8000-000000000000', 'Botica Inv A'),
  ('dddddddd-2222-4000-8000-000000000000', 'Botica Inv B');

insert into public.branches (id, pharmacy_id, name, is_main)
values
  ('dddddddd-aaaa-4000-8000-000000000001', 'dddddddd-1111-4000-8000-000000000000', 'Principal A', true),
  ('dddddddd-bbbb-4000-8000-000000000001', 'dddddddd-2222-4000-8000-000000000000', 'Principal B', true);

insert into public.pharmacy_members (pharmacy_id, user_id, role)
values
  ('dddddddd-1111-4000-8000-000000000000', 'dddddddd-0000-4000-8000-000000000001', 'admin'),
  ('dddddddd-1111-4000-8000-000000000000', 'dddddddd-0000-4000-8000-000000000002', 'cashier'),
  ('dddddddd-2222-4000-8000-000000000000', 'dddddddd-0000-4000-8000-000000000003', 'admin');

select private.seed_default_categories('dddddddd-1111-4000-8000-000000000000');
select private.seed_default_categories('dddddddd-2222-4000-8000-000000000000');

insert into public.categories (id, pharmacy_id, name)
values ('dddddddd-cccc-4000-8000-000000000002', 'dddddddd-2222-4000-8000-000000000000', 'Categoria solo de B');

-- Producto de B, para probar aislamiento.
insert into public.products (id, pharmacy_id, name, price_unit)
values ('dddddddd-eeee-4000-8000-00000000000b', 'dddddddd-2222-4000-8000-000000000000', 'Producto de B', 1.00);

-- ---------- Categorias base ----------
select ok(
  (select count(*) from public.categories where pharmacy_id = 'dddddddd-1111-4000-8000-000000000000') >= 10,
  'seed_default_categories crea las categorias base');

-- ---------- Cajero A ----------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.products (pharmacy_id, name, price_unit)
    values ('dddddddd-1111-4000-8000-000000000000', 'Intento de cajero', 1)$$,
  '42501', null,
  'el cajero no puede crear productos');
select throws_ok(
  $$insert into public.categories (pharmacy_id, name)
    values ('dddddddd-1111-4000-8000-000000000000', 'Intento de cajero')$$,
  '42501', null,
  'el cajero no puede crear categorias');
select ok((select count(*) from public.categories) >= 10,
  'el cajero ve las categorias de su botica');

-- ---------- Admin A: productos ----------
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.products (id, pharmacy_id, name, barcode, units_per_blister, units_per_box,
                                 price_unit, price_blister, price_box, min_stock, unit_label)
    values ('dddddddd-eeee-4000-8000-00000000000a', 'dddddddd-1111-4000-8000-000000000000',
            'Paracetamol 500 mg', '7750001', 10, 100, 0.50, 4.50, 40.00, 50, 'tableta')$$,
  'el admin puede crear un producto con blister y caja');

select throws_ok(
  $$insert into public.products (pharmacy_id, name, price_unit)
    values ('dddddddd-2222-4000-8000-000000000000', 'Intruso', 1)$$,
  '42501', null,
  'el admin A no puede crear productos en la botica B');

select throws_ok(
  $$insert into public.products (pharmacy_id, name, price_unit, units_per_blister)
    values ('dddddddd-1111-4000-8000-000000000000', 'Sin precio de blister', 1, 10)$$,
  '23514', null,
  'si hay unidades por blister debe haber precio de blister');

select throws_ok(
  $$insert into public.products (pharmacy_id, name, price_unit, units_per_blister, price_blister,
                                 units_per_box, price_box)
    values ('dddddddd-1111-4000-8000-000000000000', 'Caja rota', 1, 10, 5, 25, 20)$$,
  '23514', null,
  'la caja debe componerse de blisters completos');

select throws_ok(
  $$insert into public.products (pharmacy_id, name, barcode, price_unit)
    values ('dddddddd-1111-4000-8000-000000000000', 'Duplicado', '7750001', 1)$$,
  '23505', null,
  'no se repite el codigo de barras dentro de una botica');

select throws_ok(
  $$insert into public.products (pharmacy_id, category_id, name, price_unit)
    values ('dddddddd-1111-4000-8000-000000000000', 'dddddddd-cccc-4000-8000-000000000002', 'Cat ajena', 1)$$,
  '23503', null,
  'no se puede usar una categoria de otra botica');

select throws_ok(
  $$update public.products set pharmacy_id = 'dddddddd-2222-4000-8000-000000000000'
    where id = 'dddddddd-eeee-4000-8000-00000000000a'$$,
  '42501', null,
  'no se puede mover un producto a otra botica (sin permiso de columna)');

-- Auditoria de precios
update public.products set price_unit = 0.60 where id = 'dddddddd-eeee-4000-8000-00000000000a';
select is(
  (select count(*)::int from public.audit_log where action = 'product.price_changed'
   and pharmacy_id = 'dddddddd-1111-4000-8000-000000000000'), 1,
  'el cambio de precio queda en la auditoria');

-- ---------- Admin A: entradas de stock ----------
select lives_ok(
  $$select public.register_stock_entry('dddddddd-aaaa-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 'L-001', current_date + 400, 100, 0.20,
      null, 'eeeeeeee-0000-4000-8000-000000000001')$$,
  'el admin registra una entrada de stock');

select is((select quantity from public.lots where lot_code = 'L-001'), 100,
  'el lote queda con la cantidad ingresada');
select is((select quantity_after from public.inventory_movements
           where idempotency_key = 'eeeeeeee-0000-4000-8000-000000000001'), 100,
  'el movimiento de entrada registra el saldo');

select lives_ok(
  $$select public.register_stock_entry('dddddddd-aaaa-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 'L-001', current_date + 400, 100, 0.30)$$,
  'una segunda entrada al mismo lote suma');
select is((select quantity from public.lots where lot_code = 'L-001'), 200,
  'la cantidad del lote se acumula');
select is((select unit_cost from public.lots where lot_code = 'L-001'), 0.2500::numeric,
  'el costo del lote es el promedio ponderado');

select lives_ok(
  $$select public.register_stock_entry('dddddddd-aaaa-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 'L-001', current_date + 400, 100, 0.20,
      null, 'eeeeeeee-0000-4000-8000-000000000001')$$,
  'repetir la misma clave de idempotencia no falla');
select is((select quantity from public.lots where lot_code = 'L-001'), 200,
  'la clave de idempotencia evita sumar dos veces');

select throws_ok(
  $$select public.register_stock_entry('dddddddd-aaaa-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 'L-001', current_date + 500, 10, 0.20)$$,
  'P0001', 'lot_expiry_mismatch',
  'el mismo lote no puede cambiar de vencimiento');
select throws_ok(
  $$select public.register_stock_entry('dddddddd-aaaa-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 'L-OLD', current_date - 1, 10, 0.20)$$,
  'P0001', 'expired_lot',
  'no se pueden ingresar lotes ya vencidos');
select throws_ok(
  $$select public.register_stock_entry('dddddddd-aaaa-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 'L-NEG', current_date + 30, 0, 0.20)$$,
  '22023', 'invalid_quantity',
  'la cantidad debe ser positiva');
select throws_ok(
  $$select public.register_stock_entry('dddddddd-bbbb-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 'L-X', current_date + 30, 5, 0.20)$$,
  '22023', 'invalid_branch',
  'no se puede usar una sucursal de otra botica');

-- Lote que vence antes (para FEFO) y uno ya vencido
select lives_ok(
  $$select public.register_stock_entry('dddddddd-aaaa-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 'L-002', current_date + 60, 30, 0.20)$$,
  'segundo lote con vencimiento mas cercano');

-- ---------- Ajustes ----------
select throws_ok(
  $$select public.adjust_stock((select id from public.lots where lot_code = 'L-002'),
      -31, 'adjustment', 'Conteo fisico')$$,
  'P0001', 'insufficient_stock',
  'un ajuste no puede dejar el stock negativo');
select throws_ok(
  $$select public.adjust_stock((select id from public.lots where lot_code = 'L-002'),
      -1, 'adjustment', '')$$,
  '22023', 'reason_required',
  'un ajuste exige motivo');
select throws_ok(
  $$select public.adjust_stock((select id from public.lots where lot_code = 'L-002'),
      5, 'write_off', 'Merma')$$,
  '22023', 'invalid_quantity',
  'una merma debe restar stock');
select is(
  public.adjust_stock((select id from public.lots where lot_code = 'L-002'), -5, 'write_off', 'Frasco roto'),
  25,
  'una merma valida devuelve el nuevo saldo');

-- ---------- Stock y escritura directa ----------
select is((select total_quantity from public.product_stock
           where product_id = 'dddddddd-eeee-4000-8000-00000000000a'), 225,
  'product_stock suma los lotes');
select is((select is_low from public.product_stock
           where product_id = 'dddddddd-eeee-4000-8000-00000000000a'), false,
  'sin alerta de stock bajo cuando supera el minimo');

select throws_ok(
  $$update public.lots set quantity = 999999$$,
  '42501', null,
  'el admin no puede editar cantidades directamente (solo por RPC)');
select throws_ok(
  $$insert into public.inventory_movements (pharmacy_id, branch_id, product_id, lot_id, type, quantity_delta, quantity_after)
    select pharmacy_id, branch_id, product_id, id, 'entry', 1, 1 from public.lots limit 1$$,
  '42501', null,
  'los movimientos no se insertan directamente');
select throws_ok(
  $$delete from public.inventory_movements$$,
  '42501', null,
  'los movimientos no se pueden borrar');

-- ---------- Cajero: consulta, no mueve stock ----------
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.register_stock_entry('dddddddd-aaaa-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 'L-C', current_date + 30, 5, 0.20)$$,
  '42501', 'forbidden',
  'el cajero no puede registrar entradas');
select throws_ok(
  $$select public.adjust_stock((select id from public.lots where lot_code = 'L-001'),
      -1, 'adjustment', 'Intento de cajero')$$,
  '42501', 'forbidden',
  'el cajero no puede ajustar stock');
select is((select count(*)::int from public.inventory_movements), 0,
  'el cajero no ve el historial de movimientos');
select ok((select count(*) from public.product_stock) >= 1,
  'el cajero si consulta el stock');

-- ---------- Admin B: aislamiento ----------
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is((select count(*)::int from public.products where pharmacy_id = 'dddddddd-1111-4000-8000-000000000000'), 0,
  'el admin B no ve productos de A');
select is((select count(*)::int from public.lots), 0,
  'el admin B no ve lotes de A');
select throws_ok(
  $$select public.register_stock_entry('dddddddd-bbbb-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 'L-B', current_date + 30, 5, 0.20)$$,
  '42501', 'forbidden',
  'el admin B no puede registrar stock sobre un producto de A');

-- ---------- FEFO (funcion privada: se prueba como superusuario) ----------
reset role;

insert into public.lots (pharmacy_id, branch_id, product_id, lot_code, expiry_date, quantity, unit_cost)
values ('dddddddd-1111-4000-8000-000000000000', 'dddddddd-aaaa-4000-8000-000000000001',
        'dddddddd-eeee-4000-8000-00000000000a', 'L-VENCIDO', current_date - 10, 500, 0.10);

select is(
  (select array_agg(l.lot_code order by a.n)
   from private.allocate_fefo('dddddddd-aaaa-4000-8000-000000000001',
        'dddddddd-eeee-4000-8000-00000000000a', 40) with ordinality as a (out_lot_id, take_quantity, n)
   join public.lots l on l.id = a.out_lot_id),
  array['L-002', 'L-001'],
  'FEFO reparte primero el lote que vence antes y salta el vencido');
select is(
  (select take_quantity from private.allocate_fefo('dddddddd-aaaa-4000-8000-000000000001',
        'dddddddd-eeee-4000-8000-00000000000a', 40) a
   join public.lots l on l.id = a.out_lot_id where l.lot_code = 'L-002'),
  25,
  'FEFO toma todo el lote mas cercano antes de pasar al siguiente');
select throws_ok(
  $$select * from private.allocate_fefo('dddddddd-aaaa-4000-8000-000000000001',
      'dddddddd-eeee-4000-8000-00000000000a', 1000)$$,
  'P0001', 'insufficient_stock',
  'FEFO falla si solo alcanza con lotes vencidos o no alcanza');

select * from finish();
rollback;
