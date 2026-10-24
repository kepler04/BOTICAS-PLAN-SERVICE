-- pgTAP: autoregistro de boticas (register_pharmacy)
-- Ejecutar con: npx supabase test db   (requiere Docker / Supabase local)
begin;
select plan(13);

-- ---------- Fixtures (como superusuario) ----------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dueno1@test.local'),
  ('cccccccc-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dueno2@test.local'),
  ('cccccccc-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dueno3@test.local');

-- ---------- Anonimo ----------
set local role anon;
select throws_ok(
  $$select public.register_pharmacy('Botica Anon')$$,
  '42501', null,
  'anon no puede ejecutar register_pharmacy');

-- ---------- Dueno 1: alta correcta ----------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.register_pharmacy('  Botica Uno S.A.C.  ', 'Botica Uno', '20333333333')$$,
  'usuario sin botica puede registrar una');

select is((select count(*)::int from public.pharmacies), 1,
  'el dueno 1 ve exactamente su botica');
select is((select legal_name from public.pharmacies), 'Botica Uno S.A.C.',
  'el nombre se guarda sin espacios sobrantes');
select is((select status::text from public.pharmacies), 'trial',
  'la botica nace en estado trial');
select is((select count(*)::int from public.branches where is_main), 1,
  'se crea la sucursal principal');
select is((select role::text from public.get_my_memberships()), 'admin',
  'el creador queda como admin');

select throws_ok(
  $$select public.register_pharmacy('Otra Botica')$$,
  'P0001', 'already_has_pharmacy',
  'un usuario con botica no puede registrar otra');

-- ---------- Dueno 2: validaciones y aislamiento ----------
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from public.pharmacies), 0,
  'el dueno 2 no ve la botica del dueno 1');
select throws_ok(
  $$select public.register_pharmacy('Botica Dos', null, '12345')$$,
  '22023', 'invalid_ruc',
  'rechaza un RUC con formato invalido');
select throws_ok(
  $$select public.register_pharmacy('Botica Dos', null, '20333333333')$$,
  'P0001', 'ruc_taken',
  'rechaza un RUC ya registrado por otra botica');

-- ---------- Dueno 3: sin RUC ----------
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.register_pharmacy('X')$$,
  '22023', 'invalid_legal_name',
  'rechaza un nombre demasiado corto');
select lives_ok(
  $$select public.register_pharmacy('Botica Tres')$$,
  'el RUC es opcional');

select * from finish();
rollback;
