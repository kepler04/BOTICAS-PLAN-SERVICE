-- pgTAP: aislamiento multi-tenant y anti-escalamiento (Fase 1)
-- Ejecutar con: npx supabase test db   (requiere Docker / Supabase local)
begin;
select plan(17);

-- ---------- Fixtures (como superusuario, RLS no aplica) ----------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier-a@test.local'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nuevo@test.local');

insert into public.pharmacies (id, legal_name, ruc)
values
  ('aaaaaaaa-1111-4000-8000-000000000000', 'Botica Test A', '20111111111'),
  ('bbbbbbbb-1111-4000-8000-000000000000', 'Botica Test B', '20222222222');

insert into public.branches (pharmacy_id, name, is_main)
values
  ('aaaaaaaa-1111-4000-8000-000000000000', 'Principal A', true),
  ('bbbbbbbb-1111-4000-8000-000000000000', 'Principal B', true);

insert into public.pharmacy_members (pharmacy_id, user_id, role)
values
  ('aaaaaaaa-1111-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'admin'),
  ('aaaaaaaa-1111-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000002', 'cashier'),
  ('bbbbbbbb-1111-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000001', 'admin');

-- ---------- Admin de A ----------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from public.pharmacies), 1,
  'admin A ve solo 1 botica');
select is((select legal_name from public.pharmacies), 'Botica Test A',
  'admin A ve su propia botica');
select is((select count(*)::int from public.branches where pharmacy_id = 'bbbbbbbb-1111-4000-8000-000000000000'), 0,
  'admin A no ve sucursales de B');
select is((select count(*)::int from public.pharmacy_members where pharmacy_id = 'bbbbbbbb-1111-4000-8000-000000000000'), 0,
  'admin A no ve membresias de B');
select is((select count(*)::int from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 0,
  'admin A no ve el perfil del admin de B');

select throws_ok(
  $$insert into public.pharmacy_members (pharmacy_id, user_id, role)
    values ('bbbbbbbb-1111-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000003', 'admin')$$,
  '42501', null,
  'admin A no puede insertar miembros en la botica B');

select lives_ok(
  $$insert into public.pharmacy_members (pharmacy_id, user_id, role)
    values ('aaaaaaaa-1111-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000003', 'cashier')$$,
  'admin A si puede agregar miembros a su botica');

update public.pharmacy_members set role = 'cashier'
where pharmacy_id = 'aaaaaaaa-1111-4000-8000-000000000000'
  and user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is(
  (select role::text from public.pharmacy_members
   where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'admin',
  'admin A no puede modificar su propia membresia (sigue siendo admin)');

delete from public.pharmacy_members
where pharmacy_id = 'aaaaaaaa-1111-4000-8000-000000000000'
  and user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.pharmacy_members
   where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1,
  'admin A no puede borrar su propia membresia');

select throws_ok(
  $$update public.pharmacy_members
    set pharmacy_id = 'bbbbbbbb-1111-4000-8000-000000000000'
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000002'$$,
  null, null,
  'no se puede mover una membresia a otra botica (trigger o RLS)');

select ok(
  (select count(*) from public.audit_log) >= 1,
  'admin A ve el audit_log de su botica');

-- ---------- Cajero de A ----------
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from public.branches), 1,
  'cajero A ve la sucursal de su botica');

select throws_ok(
  $$insert into public.pharmacy_members (pharmacy_id, user_id, role)
    values ('aaaaaaaa-1111-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000001', 'admin')$$,
  '42501', null,
  'cajero no puede insertar en pharmacy_members');

update public.pharmacy_members set role = 'admin'
where user_id = 'aaaaaaaa-0000-4000-8000-000000000002';
select is(
  (select role::text from public.pharmacy_members
   where user_id = 'aaaaaaaa-0000-4000-8000-000000000002'), 'cashier',
  'cajero no puede auto-promoverse (update de pharmacy_members)');

select is((select count(*)::int from public.audit_log), 0,
  'cajero no ve el audit_log');

-- ---------- Admin de B no ve nada de A ----------
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from public.pharmacy_members where pharmacy_id = 'aaaaaaaa-1111-4000-8000-000000000000'), 0,
  'admin B no ve membresias de A');

-- ---------- Anonimo ----------
set local role anon;
select throws_ok(
  $$select count(*) from public.pharmacies$$,
  '42501', null,
  'anon no tiene acceso a pharmacies');

select * from finish();
rollback;
