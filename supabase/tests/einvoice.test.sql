-- pgTAP: Fase 7 — facturación electrónica (reserva de comprobante, series, numeración, permisos y anulación).
begin;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('55555555-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@f7.local'),
  ('55555555-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cajero@f7.local'),
  ('55555555-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@f7.local');

insert into public.pharmacies (id, legal_name, ruc, fiscal_address, ubigeo, einvoice_enabled)
values ('55555555-1111-4000-8000-000000000000', 'Botica F7 SAC', '10999999901', 'Av. Siempre Viva 123', '150122', true),
       ('55555555-2222-4000-8000-000000000000', 'Botica Ajena F7', null, null, null, false);
insert into public.branches (id, pharmacy_id, name, is_main)
values ('55555555-aaaa-4000-8000-000000000001', '55555555-1111-4000-8000-000000000000', 'Principal', true),
       ('55555555-bbbb-4000-8000-000000000001', '55555555-2222-4000-8000-000000000000', 'Principal ajena', true);
insert into public.pharmacy_members (pharmacy_id, user_id, role)
values ('55555555-1111-4000-8000-000000000000', '55555555-0000-4000-8000-000000000001', 'admin'),
       ('55555555-1111-4000-8000-000000000000', '55555555-0000-4000-8000-000000000002', 'cashier'),
       ('55555555-2222-4000-8000-000000000000', '55555555-0000-4000-8000-000000000003', 'admin');
insert into public.products (id, pharmacy_id, name, price_unit)
values ('55555555-eeee-4000-8000-000000000001', '55555555-1111-4000-8000-000000000000', 'Producto F7', 10.00);
insert into public.lots (pharmacy_id, branch_id, product_id, lot_code, expiry_date, quantity, unit_cost)
values ('55555555-1111-4000-8000-000000000000', '55555555-aaaa-4000-8000-000000000001',
        '55555555-eeee-4000-8000-000000000001', 'L1', current_date + 300, 100, 2);

-- ============ Cajero: ventas ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.open_cash_session('55555555-aaaa-4000-8000-000000000001', 0);
create temp table s on commit drop as
select public.create_sale('55555555-aaaa-4000-8000-000000000001',
         '[{"product_id":"55555555-eeee-4000-8000-000000000001","presentation":"unit","quantity":1}]', 'card') as sin_cliente,
       public.create_sale('55555555-aaaa-4000-8000-000000000001',
         '[{"product_id":"55555555-eeee-4000-8000-000000000001","presentation":"unit","quantity":2}]', 'card',
         null, null, null, '{"doc_type":"ruc","doc_number":"20600000048","name":"Clinica SAC"}') as con_ruc,
       public.create_sale('55555555-aaaa-4000-8000-000000000001',
         '[{"product_id":"55555555-eeee-4000-8000-000000000001","presentation":"unit","quantity":3}]', 'card',
         null, null, null, '{"doc_type":"dni","doc_number":"40123456","name":"Rosa Quispe"}') as con_dni,
       public.create_sale('55555555-aaaa-4000-8000-000000000001',
         '[{"product_id":"55555555-eeee-4000-8000-000000000001","presentation":"unit","quantity":1}]', 'cash', 10) as para_anular;

select is((select doc_type || ' ' || series || '-' || number || ' ' || status from public.reserve_einvoice((select sin_cliente from s))),
  '03 B001-1 pending', 'venta sin cliente -> BOLETA B001-1, pendiente de envío');
select is((select id from public.reserve_einvoice((select sin_cliente from s))),
          (select id from public.einvoices where sale_id = (select sin_cliente from s)),
  'reservar dos veces la misma venta devuelve el mismo comprobante (idempotente)');
select is((select count(*)::int from public.einvoices where pharmacy_id = '55555555-1111-4000-8000-000000000000'), 1,
  'y no crea un segundo comprobante');
select is((select doc_type || ' ' || series || '-' || number from public.reserve_einvoice((select con_ruc from s))),
  '01 F001-1', 'cliente con RUC -> FACTURA, con su propia serie y correlativo');
select is((select series || '-' || number from public.reserve_einvoice((select con_dni from s))),
  'B001-2', 'cliente con DNI -> BOLETA; el correlativo de B001 sigue sin huecos');

-- El cajero lee los comprobantes de su botica, pero no el XML firmado ni escribe directamente.
select is((select count(*)::int from public.einvoices), 3, 'el cajero ve los comprobantes de su botica');
select throws_ok($$select xml from public.einvoices$$, '42501', null, 'el XML firmado no se expone por la API general');
select throws_ok($$update public.einvoices set status = 'accepted'$$, '42501', null, 'nadie cambia el estado desde la API (solo la Edge Function)');
select throws_ok($$insert into public.einvoice_sequences (pharmacy_id, series) values ('55555555-1111-4000-8000-000000000000', 'B999')$$,
  '42501', null, 'el correlativo no se toca desde la API');

-- ============ Anulación ============
select is((select series || '-' || number from public.reserve_einvoice((select para_anular from s))), 'B001-3', 'boleta para la venta a anular');
-- Anular es solo para el administrador.
select set_config('request.jwt.claims', '{"sub":"55555555-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.void_sale((select para_anular from s), 'Error de cobro')$$ ,
  'una venta con comprobante solo PENDIENTE (no aceptado) se puede anular');
-- (lo que hace la Edge Function al recibir la constancia de SUNAT)
reset role;
update public.einvoices set status = 'accepted', sunat_code = '0' where sale_id = (select con_dni from s);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.void_sale((select con_dni from s), 'Cliente se arrepintio')$$,
  'P0001', 'einvoice_issued', 'una venta con comprobante ACEPTADO por SUNAT no se anula (requiere nota de crédito)');
select throws_ok($$select public.reserve_einvoice((select para_anular from s))$$, 'P0001', 'sale_voided',
  'una venta anulada ya no se envía a SUNAT, aunque tuviera su comprobante reservado');

-- ============ Reglas del emisor ============
reset role;
update public.pharmacies set fiscal_address = null where id = '55555555-1111-4000-8000-000000000000';
insert into public.sales (id, pharmacy_id, branch_id, cash_session_id, receipt_number, payment_method, total, charges_igv)
select '55555555-5a1e-4000-8000-000000000001', pharmacy_id, branch_id, id, 999, 'card', 0, true
from public.cash_sessions where branch_id = '55555555-aaaa-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.reserve_einvoice('55555555-5a1e-4000-8000-000000000001')$$, 'P0001', 'issuer_incomplete',
  'sin dirección fiscal (o sin RUC) no se emite');
reset role;
update public.pharmacies set fiscal_address = 'Av. Siempre Viva 123', einvoice_enabled = false where id = '55555555-1111-4000-8000-000000000000';
set local role authenticated;
select throws_ok($$select public.reserve_einvoice('55555555-5a1e-4000-8000-000000000001')$$, 'P0001', 'einvoice_disabled',
  'con la facturación electrónica desactivada no se emite');
reset role;
update public.pharmacies set einvoice_enabled = true where id = '55555555-1111-4000-8000-000000000000';
update public.sales set charges_igv = false where id = '55555555-5a1e-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.reserve_einvoice('55555555-5a1e-4000-8000-000000000001')$$, 'P0001', 'igv_required',
  'una venta sin IGV (p. ej. Nuevo RUS) no se emite en esta versión');

-- ============ Otra botica ============
select set_config('request.jwt.claims', '{"sub":"55555555-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.reserve_einvoice((select sin_cliente from s))$$, '42501', 'forbidden',
  'otra botica no puede emitir comprobantes de ventas ajenas');
select is((select count(*)::int from public.einvoices), 0, 'ni ver los comprobantes de esta botica');

select * from finish();
rollback;
