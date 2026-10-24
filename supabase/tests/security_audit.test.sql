-- pgTAP: AUDITORIA AUTOMATICA DE SEGURIDAD. Recorre TODAS las tablas, vistas y funciones del esquema
-- publico. Si manana alguien agrega una tabla sin RLS, una vista sin security_invoker o una funcion
-- security definer sin search_path fijo, esta prueba falla.
begin;
select plan(14);

-- ---------- Tablas ----------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'TODA tabla de public tiene RLS activado');

select is(
  (select count(*)::int from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee = 'anon'),
  0, 'el rol anonimo no tiene NINGUN privilegio sobre tablas ni vistas de public');

select is(
  (select count(*)::int from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  0, 'authenticated no puede TRUNCATE ni crear triggers/referencias');

-- Tablas que SOLO se escriben por RPC (security definer): authenticated no debe poder escribir directo.
select is(
  (select count(*)::int
   from unnest(array['lots', 'inventory_movements', 'sales', 'sale_items', 'sale_item_lots',
                     'receipt_sequences', 'cash_sessions', 'cash_movements', 'audit_log',
                     'einvoices', 'einvoice_sequences']) t
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) p
   where has_table_privilege('authenticated', 'public.' || t, p)),
  0, 'las tablas de dinero, stock y comprobantes solo se escriben por RPC: authenticated no puede INSERT/UPDATE/DELETE directo');

select is(
  (select count(*)::int
   from unnest(array['receipt_sequences', 'einvoice_sequences']) t
   where has_table_privilege('authenticated', 'public.' || t, 'SELECT')),
  0, 'los contadores de comprobantes no son legibles por la API');

-- ---------- Vistas ----------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  0, 'TODA vista de public es security_invoker (respeta el RLS de quien consulta)');

-- ---------- Funciones ----------
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  0, 'TODA funcion security definer fija su search_path (evita secuestro de funciones)');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  0, 'ninguna funcion de public es ejecutable por el rol anonimo');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')),
  0, 'ninguna funcion de private es ejecutable por el rol anonimo');

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'el rol anonimo no puede usar el esquema private');

-- ---------- Multi-tenant: toda tabla de negocio tiene pharmacy_id (o es una de las excepciones conocidas) ----------
select is(
  (select count(*)::int from information_schema.tables t
   where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
     and t.table_name not in ('pharmacies', 'profiles', 'receipt_sequences', 'einvoice_sequences')
     and not exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'pharmacy_id')),
  0, 'toda tabla de negocio lleva pharmacy_id (base del aislamiento entre boticas)');

-- Toda tabla con pharmacy_id y RLS tiene al menos una politica (o es deny-all a proposito: los contadores).
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('receipt_sequences', 'einvoice_sequences')
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  0, 'toda tabla (salvo los contadores, deny-all a proposito) tiene politicas RLS definidas');

-- Las politicas de lectura de tablas de negocio nunca son "true" (abiertas a cualquier autenticado).
select is(
  (select count(*)::int from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polcmd = 'r' and pg_get_expr(p.polqual, p.polrelid) = 'true'),
  0, 'ninguna politica de SELECT esta abierta (using true)');

-- Ninguna politica de escritura es "true".
select is(
  (select count(*)::int from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polcmd in ('a', 'w', 'd')
     and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') = 'true' or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') = 'true')),
  0, 'ninguna politica de escritura esta abierta (true)');

select * from finish();
rollback;
