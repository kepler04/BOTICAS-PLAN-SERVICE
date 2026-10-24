-- pgTAP: Fase 6 — cliente en la venta (regla de S/ 700), registro de temperatura, codigo DIGEMID,
-- proveedores, compras y kardex valorizado. Cifras calculadas a mano; ver comentarios.
begin;
select plan(58);

-- ---------- Fixtures (como superusuario) ----------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('66666666-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@f6.local'),
  ('66666666-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cajero@f6.local'),
  ('66666666-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@f6.local');

insert into public.pharmacies (id, legal_name)
values ('66666666-1111-4000-8000-000000000000', 'Botica F6'),
       ('66666666-2222-4000-8000-000000000000', 'Botica Ajena F6');
insert into public.branches (id, pharmacy_id, name, is_main)
values ('66666666-aaaa-4000-8000-000000000001', '66666666-1111-4000-8000-000000000000', 'Principal', true),
       ('66666666-bbbb-4000-8000-000000000001', '66666666-2222-4000-8000-000000000000', 'Principal ajena', true);
insert into public.pharmacy_members (pharmacy_id, user_id, role)
values ('66666666-1111-4000-8000-000000000000', '66666666-0000-4000-8000-000000000001', 'admin'),
       ('66666666-1111-4000-8000-000000000000', '66666666-0000-4000-8000-000000000002', 'cashier'),
       ('66666666-2222-4000-8000-000000000000', '66666666-0000-4000-8000-000000000003', 'admin');

-- C caro (375.00, para cruzar S/ 700) | G gravado | E exonerado
insert into public.products (id, pharmacy_id, name, price_unit, tax_affectation)
values ('66666666-eeee-4000-8000-0000000000c1', '66666666-1111-4000-8000-000000000000', 'Caro C', 375.00, 'gravado'),
       ('66666666-eeee-4000-8000-0000000000a1', '66666666-1111-4000-8000-000000000000', 'Gravado G', 1.00, 'gravado'),
       ('66666666-eeee-4000-8000-0000000000a2', '66666666-1111-4000-8000-000000000000', 'Exonerado E', 3.00, 'exonerado');
insert into public.lots (pharmacy_id, branch_id, product_id, lot_code, expiry_date, quantity, unit_cost)
values ('66666666-1111-4000-8000-000000000000', '66666666-aaaa-4000-8000-000000000001',
        '66666666-eeee-4000-8000-0000000000c1', 'L-C', current_date + 300, 50, 100);

-- ---------- Recepcion de lotes: un solo lugar, no invocable desde la API ----------
select ok(not has_function_privilege('authenticated',
  'private.receive_lot(uuid, uuid, uuid, text, text, date, integer, numeric, uuid, text, uuid, uuid)', 'execute'),
  'private.receive_lot no se puede llamar como usuario autenticado');
select ok(not has_function_privilege('anon',
  'private.receive_lot(uuid, uuid, uuid, text, text, date, integer, numeric, uuid, text, uuid, uuid)', 'execute'),
  'ni como anonimo');

-- ---------- Validacion de documentos (paridad con src/lib/peruDocs.test.ts) ----------
select ok(private.valid_ruc('20131312955'), 'RUC valido (digito verificador correcto)');
select ok(not private.valid_ruc('20131312954'), 'RUC con digito verificador incorrecto');
select ok(not private.valid_ruc('30131312955'), 'RUC con prefijo invalido');
select ok(private.valid_ruc('10467793549'), 'RUC de persona natural (10) valido');
select ok(private.valid_customer_doc('dni', '12345678') and not private.valid_customer_doc('dni', '1234567'),
  'DNI: exactamente 8 digitos');
select ok(private.valid_customer_doc('ce', 'ABC12345') and not private.valid_customer_doc('ce', 'ab-1'),
  'carne de extranjeria: 8 a 12 letras o digitos');
select is(private.customer_id_threshold(), 700.00::numeric, 'el umbral para identificar al cliente es S/ 700');

-- ============ Cajero: ventas con y sin cliente ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.open_cash_session('66666666-aaaa-4000-8000-000000000001', 0);

select throws_ok(
  $$select public.create_sale('66666666-aaaa-4000-8000-000000000001',
      '[{"product_id":"66666666-eeee-4000-8000-0000000000c1","presentation":"unit","quantity":2}]'::jsonb, 'card')$$,
  'P0001', 'customer_required', 'una venta de S/ 750 sin cliente se rechaza');
select lives_ok(
  $$select public.create_sale('66666666-aaaa-4000-8000-000000000001',
      '[{"product_id":"66666666-eeee-4000-8000-0000000000c1","presentation":"unit","quantity":1}]'::jsonb, 'card')$$,
  'una venta de S/ 375 no exige cliente');
select lives_ok(
  $$select public.create_sale('66666666-aaaa-4000-8000-000000000001',
      '[{"product_id":"66666666-eeee-4000-8000-0000000000c1","presentation":"unit","quantity":2}]'::jsonb, 'card',
      null, null, null, '{"doc_type":"dni","doc_number":"45678912","name":"  Rosa Quispe  "}'::jsonb)$$,
  'la venta de S/ 750 con DNI y nombre se registra');
select is((select customer_name || '|' || customer_doc_type || '|' || customer_doc_number from public.sales
           where pharmacy_id = '66666666-1111-4000-8000-000000000000' and total = 750),
  'Rosa Quispe|dni|45678912', 'la venta guarda la instantanea del cliente (nombre recortado)');
select is((select count(*)::int from public.customers where pharmacy_id = '66666666-1111-4000-8000-000000000000'), 1,
  'el cliente queda guardado para la proxima venta');

select lives_ok(
  $$select public.create_sale('66666666-aaaa-4000-8000-000000000001',
      '[{"product_id":"66666666-eeee-4000-8000-0000000000c1","presentation":"unit","quantity":1}]'::jsonb, 'yape',
      null, null, null, '{"doc_type":"dni","doc_number":"45678912","name":"Rosa Quispe Mamani"}'::jsonb)$$,
  'el cliente es opcional en una venta pequena');
select is((select string_agg(name, ',') from public.customers where pharmacy_id = '66666666-1111-4000-8000-000000000000'),
  'Rosa Quispe Mamani', 'el mismo DNI no duplica al cliente: actualiza su nombre');
select is((select customer_name from public.sales where pharmacy_id = '66666666-1111-4000-8000-000000000000' and total = 750),
  'Rosa Quispe', 'la venta anterior conserva el nombre con que se emitio');

select throws_ok(
  $$select public.create_sale('66666666-aaaa-4000-8000-000000000001',
      '[{"product_id":"66666666-eeee-4000-8000-0000000000c1","presentation":"unit","quantity":1}]'::jsonb, 'card',
      null, null, null, '{"doc_type":"dni","doc_number":"4567891","name":"Ana"}'::jsonb)$$,
  '22023', 'invalid_customer_doc', 'DNI de 7 digitos se rechaza');
select throws_ok(
  $$select public.create_sale('66666666-aaaa-4000-8000-000000000001',
      '[{"product_id":"66666666-eeee-4000-8000-0000000000c1","presentation":"unit","quantity":1}]'::jsonb, 'card',
      null, null, null, '{"doc_type":"ruc","doc_number":"20131312954","name":"Empresa SAC"}'::jsonb)$$,
  '22023', 'invalid_customer_doc', 'RUC con digito verificador incorrecto se rechaza');
select throws_ok(
  $$select public.create_sale('66666666-aaaa-4000-8000-000000000001',
      '[{"product_id":"66666666-eeee-4000-8000-0000000000c1","presentation":"unit","quantity":1}]'::jsonb, 'card',
      null, null, null, '{"doc_type":"dni","doc_number":"45678912","name":" "}'::jsonb)$$,
  '22023', 'invalid_customer_name', 'el documento sin nombre se rechaza');
select throws_ok(
  $$insert into public.customers (pharmacy_id, doc_type, doc_number, name)
    values ('66666666-1111-4000-8000-000000000000', 'dni', '11111111', 'Directo')$$,
  '42501', null, 'nadie escribe clientes directamente (solo via create_sale)');

-- ============ Cajero: registro de temperatura ============
select lives_ok(
  $$select public.record_environment_reading('66666666-aaaa-4000-8000-000000000001', 'room', 22.5, 55)$$,
  'el cajero registra la temperatura del ambiente');
select is((select recorded_on from public.environment_readings where pharmacy_id = '66666666-1111-4000-8000-000000000000' and temperature = 22.5),
  (now() at time zone 'America/Lima')::date, 'el dia se fija en hora de Lima');
select is((select out_of_range from public.environment_readings where pharmacy_id = '66666666-1111-4000-8000-000000000000' and temperature = 22.5),
  false, '22.5 °C y 55 % estan dentro del rango');
select throws_ok(
  $$select public.record_environment_reading('66666666-aaaa-4000-8000-000000000001', 'room', 31.0, 50)$$,
  'P0001', 'note_required', 'fuera de rango (31 °C) exige una nota');
select throws_ok(
  $$select public.record_environment_reading('66666666-aaaa-4000-8000-000000000001', 'room', 24.0, 75)$$,
  'P0001', 'note_required', 'humedad de 75 % tambien esta fuera de rango');
select lives_ok(
  $$select public.record_environment_reading('66666666-aaaa-4000-8000-000000000001', 'room', 31.0, 50, 'Se encendio el ventilador')$$,
  'fuera de rango con nota se registra');
select is((select out_of_range from public.environment_readings where pharmacy_id = '66666666-1111-4000-8000-000000000000' and temperature = 31.0),
  true, 'y queda marcada como fuera de rango');
select throws_ok(
  $$select public.record_environment_reading('66666666-aaaa-4000-8000-000000000001', 'fridge', 5.0, 40)$$,
  '22023', 'invalid_humidity', 'la refrigeradora no registra humedad');
select throws_ok(
  $$select public.record_environment_reading('66666666-aaaa-4000-8000-000000000001', 'fridge', 9.0)$$,
  'P0001', 'note_required', 'refrigeracion a 9 °C (fuera de 2-8) exige nota');
select throws_ok(
  $$select public.record_environment_reading('66666666-aaaa-4000-8000-000000000001', 'room', 22.55)$$,
  '22023', 'invalid_temperature', 'la temperatura se registra con un decimal');
select is(
  public.record_environment_reading('66666666-aaaa-4000-8000-000000000001', 'fridge', 4.0, null, null, '66666666-9999-4000-8000-000000000001'),
  public.record_environment_reading('66666666-aaaa-4000-8000-000000000001', 'fridge', 4.0, null, null, '66666666-9999-4000-8000-000000000001'),
  'idempotente: la misma clave no duplica la lectura');
select throws_ok(
  $$update public.environment_readings set temperature = 20 where pharmacy_id = '66666666-1111-4000-8000-000000000000'$$,
  '42501', null, 'las lecturas no se pueden editar');
select throws_ok(
  $$delete from public.environment_readings where pharmacy_id = '66666666-1111-4000-8000-000000000000'$$,
  '42501', null, 'ni borrar');

-- Compras y kardex: solo administrador
select throws_ok(
  $$select public.register_purchase('66666666-aaaa-4000-8000-000000000001', gen_random_uuid(), 'invoice', 'F001-1',
      current_date, '[]'::jsonb)$$,
  '42501', 'forbidden', 'el cajero no registra compras');
select throws_ok(
  $$select * from public.report_kardex('66666666-aaaa-4000-8000-000000000001', '66666666-eeee-4000-8000-0000000000a1', current_date, current_date)$$,
  '42501', 'forbidden', 'el cajero no ve el kardex (tiene costos)');

-- ============ Administrador: DIGEMID, proveedores, compras ============
select set_config('request.jwt.claims', '{"sub":"66666666-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$update public.products set digemid_code = '12345' where id = '66666666-eeee-4000-8000-0000000000a1'$$,
  'el admin registra el codigo DIGEMID');
select throws_ok(
  $$update public.products set digemid_code = 'ABC' where id = '66666666-eeee-4000-8000-0000000000a1'$$,
  '23514', null, 'el codigo DIGEMID es numerico');

select throws_ok(
  $$insert into public.suppliers (pharmacy_id, name, ruc) values ('66666666-1111-4000-8000-000000000000', 'Mala SAC', '20131312954')$$,
  '23514', null, 'proveedor con RUC invalido se rechaza');
insert into public.suppliers (id, pharmacy_id, name, ruc)
values ('66666666-5555-4000-8000-000000000001', '66666666-1111-4000-8000-000000000000', 'Droguería Andina SAC', '20131312955'),
       ('66666666-5555-4000-8000-000000000002', '66666666-1111-4000-8000-000000000000', 'Proveedor Inactivo', null);
update public.suppliers set active = false where id = '66666666-5555-4000-8000-000000000002';

-- Stock inicial de G: 100 u. a 0.40 (entrada normal, deja movimiento).
select public.register_stock_entry('66666666-aaaa-4000-8000-000000000001', '66666666-eeee-4000-8000-0000000000a1',
                                   'L-G', current_date + 200, 100, 0.40);

-- Compra: G 100 u. a 0.60 al MISMO lote (promedia a 0.50) + E 10 u. a 2.00 en lote nuevo.
-- Subtotal 60.00 + 20.00 = 80.00 | IGV estimado: G gravado 60.00 x 18 % = 10.80; E exonerado 0 | total 90.80
select lives_ok(
  $$select public.register_purchase('66666666-aaaa-4000-8000-000000000001', '66666666-5555-4000-8000-000000000001',
      'invoice', ' f001-000123 ', current_date - 1,
      ('[{"product_id":"66666666-eeee-4000-8000-0000000000a1","lot_code":"L-G","expiry_date":"' || (current_date + 200) || '","quantity":100,"unit_cost":0.60},
        {"product_id":"66666666-eeee-4000-8000-0000000000a2","lot_code":"L-E","expiry_date":null,"quantity":10,"unit_cost":2.00}]')::jsonb,
      'Pedido semanal', '66666666-9999-4000-8000-000000000002')$$,
  'el admin registra una compra con dos productos');
select is((select subtotal || '|' || igv || '|' || total || '|' || doc_number from public.purchases
           where pharmacy_id = '66666666-1111-4000-8000-000000000000'),
  '80.00|10.80|90.80|F001-000123', 'subtotal, IGV estimado, total y documento normalizado');
select is((select quantity || '|' || unit_cost from public.lots
           where product_id = '66666666-eeee-4000-8000-0000000000a1' and lot_code = 'L-G'),
  '200|0.5000', 'el lote existente suma 100 u. y promedia el costo a 0.50');
select is((select count(*)::int from public.inventory_movements m join public.purchases p on p.id = m.purchase_id
           where p.pharmacy_id = '66666666-1111-4000-8000-000000000000'), 2,
  'cada linea deja un movimiento de entrada ligado a la compra');
select is(
  public.register_purchase('66666666-aaaa-4000-8000-000000000001', '66666666-5555-4000-8000-000000000001',
      'invoice', 'OTRO', current_date, '[]'::jsonb, null, '66666666-9999-4000-8000-000000000002'),
  (select id from public.purchases where pharmacy_id = '66666666-1111-4000-8000-000000000000'),
  'reintento con la misma clave devuelve la misma compra');

select throws_ok(
  $$select public.register_purchase('66666666-aaaa-4000-8000-000000000001', '66666666-5555-4000-8000-000000000001',
      'invoice', 'F001-000123', current_date,
      '[{"product_id":"66666666-eeee-4000-8000-0000000000a2","lot_code":"X","quantity":1,"unit_cost":1}]')$$,
  'P0001', 'duplicate_document', 'la misma factura del mismo proveedor no se registra dos veces');
select throws_ok(
  $$select public.register_purchase('66666666-aaaa-4000-8000-000000000001', '66666666-5555-4000-8000-000000000002',
      'invoice', 'F9-1', current_date,
      '[{"product_id":"66666666-eeee-4000-8000-0000000000a2","lot_code":"X","quantity":1,"unit_cost":1}]')$$,
  '22023', 'invalid_supplier', 'no se compra a un proveedor inactivo');
select throws_ok(
  $$select public.register_purchase('66666666-aaaa-4000-8000-000000000001', '66666666-5555-4000-8000-000000000001',
      'invoice', 'F9-2', current_date + 1,
      '[{"product_id":"66666666-eeee-4000-8000-0000000000a2","lot_code":"X","quantity":1,"unit_cost":1}]')$$,
  '22023', 'invalid_issue_date', 'la fecha del documento no puede ser futura');
select throws_ok(
  $$select public.register_purchase('66666666-aaaa-4000-8000-000000000001', '66666666-5555-4000-8000-000000000001',
      'invoice', 'F9-3', current_date,
      ('[{"product_id":"66666666-eeee-4000-8000-0000000000a1","lot_code":"L-G","expiry_date":"' || (current_date + 99) || '","quantity":1,"unit_cost":1}]')::jsonb)$$,
  'P0001', 'lot_expiry_mismatch', 'mismo lote con otra fecha de vencimiento se rechaza');
-- Todo o nada: la primera linea es valida, la segunda tiene un lote vencido.
select throws_ok(
  $$select public.register_purchase('66666666-aaaa-4000-8000-000000000001', '66666666-5555-4000-8000-000000000001',
      'invoice', 'F9-4', current_date,
      ('[{"product_id":"66666666-eeee-4000-8000-0000000000a2","lot_code":"L-E","expiry_date":null,"quantity":5,"unit_cost":2},
        {"product_id":"66666666-eeee-4000-8000-0000000000a1","lot_code":"VENCIDO","expiry_date":"' || (current_date - 1) || '","quantity":1,"unit_cost":1}]')::jsonb)$$,
  'P0001', 'expired_lot', 'una linea con lote vencido rechaza la compra');
select is((select quantity from public.lots where product_id = '66666666-eeee-4000-8000-0000000000a2' and lot_code = 'L-E'), 10,
  'y la primera linea no sumo nada (todo o nada)');

-- ============ Kardex de G ============
-- Cajero vende 30 u. de G (sale por FEFO del unico lote, costo 0.50).
select set_config('request.jwt.claims', '{"sub":"66666666-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.create_sale('66666666-aaaa-4000-8000-000000000001',
  '[{"product_id":"66666666-eeee-4000-8000-0000000000a1","presentation":"unit","quantity":30}]'::jsonb, 'card');
select set_config('request.jwt.claims', '{"sub":"66666666-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Hoy: saldo inicial 0 | +100 x 0.40 = 40.00 | +100 x 0.60 = 60.00 | -30 x 0.50 = -15.00 -> 170 u., S/ 85.00
select is((select count(*)::int from public.report_kardex('66666666-aaaa-4000-8000-000000000001',
            '66666666-eeee-4000-8000-0000000000a1', current_date, current_date)), 4,
  'kardex: saldo inicial + 3 movimientos');
select is((select kind || '|' || balance_quantity || '|' || balance_value from public.report_kardex('66666666-aaaa-4000-8000-000000000001',
            '66666666-eeee-4000-8000-0000000000a1', current_date, current_date) limit 1),
  'opening|0|0.00', 'la primera fila es el saldo inicial');
select is((select string_agg(coalesce(quantity_in, -quantity_out) || '@' || value_delta || '=' || balance_quantity || '/' || balance_value, ' ; ')
           from public.report_kardex('66666666-aaaa-4000-8000-000000000001', '66666666-eeee-4000-8000-0000000000a1',
                                     current_date, current_date) where kind <> 'opening'),
  '100@40.00=100/40.00 ; 100@60.00=200/100.00 ; -30@-15.00=170/85.00',
  'entradas y salida valorizadas con saldo acumulado');
select is((select k.balance_value from public.report_kardex('66666666-aaaa-4000-8000-000000000001',
            '66666666-eeee-4000-8000-0000000000a1', current_date, current_date) with ordinality k order by k.ordinality desc limit 1),
  (select round(sum(quantity * unit_cost), 2) from public.lots where product_id = '66666666-eeee-4000-8000-0000000000a1'),
  'el saldo valorizado coincide con el valor de los lotes');
select ok((select bool_or(document like 'Factura F001-000123 · Droguería Andina SAC') and bool_or(document like 'T001-%')
           from public.report_kardex('66666666-aaaa-4000-8000-000000000001', '66666666-eeee-4000-8000-0000000000a1',
                                     current_date, current_date)),
  'cada movimiento muestra su documento (factura del proveedor o comprobante de venta)');
select is((select balance_quantity || '|' || balance_value from public.report_kardex('66666666-aaaa-4000-8000-000000000001',
            '66666666-eeee-4000-8000-0000000000a1', current_date + 1, current_date + 1)),
  '170|85.00', 'el dia siguiente arranca con el saldo de hoy');

-- ============ Otra botica ============
select set_config('request.jwt.claims', '{"sub":"66666666-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.customers c join public.environment_readings e on e.pharmacy_id = c.pharmacy_id), 0,
  'otra botica no ve clientes ni lecturas de temperatura');
select is((select count(*)::int from public.suppliers) + (select count(*)::int from public.purchases where pharmacy_id = '66666666-1111-4000-8000-000000000000'), 0,
  'otra botica no ve proveedores ni compras');

select * from finish();
rollback;
