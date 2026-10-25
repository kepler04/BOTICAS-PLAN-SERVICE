-- pgTAP: Fase 8 — nota de crédito (07) que anula un comprobante aceptado por SUNAT.
begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('44444444-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@f8.local'),
  ('44444444-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cajero@f8.local'),
  ('44444444-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@f8.local');
insert into public.pharmacies (id, legal_name, ruc, fiscal_address, einvoice_enabled)
values ('44444444-1111-4000-8000-000000000000', 'Botica F8 SAC', '10999999902', 'Av. Siempre Viva 456', true),
       ('44444444-2222-4000-8000-000000000000', 'Botica Ajena F8', null, null, false);
insert into public.branches (id, pharmacy_id, name, is_main)
values ('44444444-aaaa-4000-8000-000000000001', '44444444-1111-4000-8000-000000000000', 'Principal', true),
       ('44444444-bbbb-4000-8000-000000000001', '44444444-2222-4000-8000-000000000000', 'Principal ajena', true);
insert into public.pharmacy_members (pharmacy_id, user_id, role)
values ('44444444-1111-4000-8000-000000000000', '44444444-0000-4000-8000-000000000001', 'admin'),
       ('44444444-1111-4000-8000-000000000000', '44444444-0000-4000-8000-000000000002', 'cashier'),
       ('44444444-2222-4000-8000-000000000000', '44444444-0000-4000-8000-000000000003', 'admin');
insert into public.products (id, pharmacy_id, name, price_unit)
values ('44444444-eeee-4000-8000-000000000001', '44444444-1111-4000-8000-000000000000', 'Producto F8', 10.00);
insert into public.lots (id, pharmacy_id, branch_id, product_id, lot_code, expiry_date, quantity, unit_cost)
values ('44444444-1077-4000-8000-000000000001', '44444444-1111-4000-8000-000000000000', '44444444-aaaa-4000-8000-000000000001',
        '44444444-eeee-4000-8000-000000000001', 'L1', current_date + 300, 100, 2);

-- ============ Cajero: cuatro ventas con su comprobante ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.open_cash_session('44444444-aaaa-4000-8000-000000000001', 0);
create temp table s on commit drop as
select public.create_sale('44444444-aaaa-4000-8000-000000000001',
         '[{"product_id":"44444444-eeee-4000-8000-000000000001","presentation":"unit","quantity":3}]', 'card') as boleta,
       public.create_sale('44444444-aaaa-4000-8000-000000000001',
         '[{"product_id":"44444444-eeee-4000-8000-000000000001","presentation":"unit","quantity":1}]', 'card',
         null, null, null, '{"doc_type":"ruc","doc_number":"20600000048","name":"Clinica SAC"}') as factura,
       public.create_sale('44444444-aaaa-4000-8000-000000000001',
         '[{"product_id":"44444444-eeee-4000-8000-000000000001","presentation":"unit","quantity":1}]', 'card') as pendiente,
       public.create_sale('44444444-aaaa-4000-8000-000000000001',
         '[{"product_id":"44444444-eeee-4000-8000-000000000001","presentation":"unit","quantity":1}]', 'card') as caja_cerrada;
select public.reserve_einvoice(boleta), public.reserve_einvoice(factura), public.reserve_einvoice(pendiente),
       public.reserve_einvoice(caja_cerrada) from s;
-- (lo que hace la Edge Function al recibir la constancia de SUNAT)
reset role;
update public.einvoices set status = 'accepted', sunat_code = '0'
where sale_id in (select boleta from s union select factura from s union select caja_cerrada from s);
set local role authenticated;

select throws_ok($$select public.reserve_credit_note((select boleta from s), 'Cliente desistio')$$, '42501', 'forbidden',
  'el cajero no emite notas de crédito (anular es del administrador)');

-- ============ Administrador ============
select set_config('request.jwt.claims', '{"sub":"44444444-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.reserve_credit_note((select boleta from s), 'no')$$, '22023', 'reason_required',
  'la nota exige un motivo (mínimo 3 letras)');
select throws_ok($$select public.reserve_credit_note((select pendiente from s), 'Cliente desistio')$$, 'P0001', 'no_accepted_einvoice',
  'sin comprobante aceptado por SUNAT no hay nada que anular con nota de crédito');
select is((select doc_type || ' ' || series || '-' || number || ' ' || status from public.reserve_credit_note((select boleta from s), 'Cliente desistio')),
  '07 BC01-1 pending', 'la nota que anula una BOLETA usa la serie BC01');
select is((select reference_id from public.einvoices where sale_id = (select boleta from s) and doc_type = '07'),
          (select id from public.einvoices where sale_id = (select boleta from s) and doc_type = '03'),
  'la nota referencia al comprobante que anula');
select is((select id from public.reserve_credit_note((select boleta from s), 'Otro motivo')),
          (select id from public.einvoices where sale_id = (select boleta from s) and doc_type = '07'),
  'reservar dos veces devuelve la misma nota (idempotente)');
select is((select series || '-' || number from public.reserve_credit_note((select factura from s), 'Error en el RUC')),
  'FC01-1', 'la nota que anula una FACTURA usa la serie FC01, con su propio correlativo');

-- La venta no se anula hasta que SUNAT acepte la nota.
select throws_ok($$select public.void_sale((select boleta from s), 'Cliente desistio')$$, 'P0001', 'einvoice_issued',
  'mientras la nota está pendiente, la venta no se anula');
reset role;
update public.einvoices set status = 'accepted', sunat_code = '0' where sale_id = (select boleta from s) and doc_type = '07';
set local role authenticated;
select lives_ok($$select public.void_sale((select boleta from s), 'Nota de credito BC01-1: Cliente desistio')$$,
  'con la nota aceptada por SUNAT, la venta se anula');
select is((select quantity from public.lots where id = '44444444-1077-4000-8000-000000000001'), 97,
  'y el stock vuelve (100 - 3 - 1 - 1 - 1 + 3)');
select is((select id from public.reserve_credit_note((select boleta from s), 'x')),
          (select id from public.einvoices where sale_id = (select boleta from s) and doc_type = '07'),
  'reintentar después de anular devuelve la misma nota (la Edge Function converge sin errores)');

-- Caja cerrada: la venta ya no se puede anular aquí, así que tampoco se emite la nota.
select set_config('request.jwt.claims', '{"sub":"44444444-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.close_cash_session((select id from public.cash_sessions where branch_id = '44444444-aaaa-4000-8000-000000000001' and status = 'open'), 0, null);
select set_config('request.jwt.claims', '{"sub":"44444444-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.reserve_credit_note((select caja_cerrada from s), 'Cliente desistio')$$, 'P0001', 'cash_session_closed',
  'con la caja de la venta cerrada no se emite la nota (no podría anularse la venta)');

-- Lectura y restricciones
select is((select count(*)::int from public.einvoices where doc_type = '07' and reason is not null), 2,
  'el administrador ve las notas y su motivo');
reset role;
select throws_ok($$insert into public.einvoices (pharmacy_id, sale_id, doc_type, series, number, reason)
  values ('44444444-1111-4000-8000-000000000000', (select pendiente from s), '07', 'BC01', 99, 'Sin referencia')$$,
  '23514', null, 'una nota de crédito sin comprobante de referencia no puede existir');
select throws_ok($$insert into public.einvoices (pharmacy_id, sale_id, doc_type, series, number, reference_id, reason)
  values ('44444444-1111-4000-8000-000000000000', (select pendiente from s), '07', 'B001', 98,
          (select id from public.einvoices where sale_id = (select pendiente from s)), 'Serie equivocada')$$,
  '23514', null, 'la serie de una nota de crédito es BC## o FC##');

-- ============ Otra botica ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.reserve_credit_note((select factura from s), 'Intruso')$$, '42501', 'forbidden',
  'otra botica no puede anular comprobantes ajenos');

select * from finish();
rollback;
