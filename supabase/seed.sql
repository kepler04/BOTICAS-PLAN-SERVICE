-- =====================================================================
-- Datos DEMO ficticios. NO usar datos reales de clientes aqui.
-- Se ejecuta con `supabase db reset` (local). En un proyecto remoto,
-- pega este archivo en el SQL Editor si quieres las boticas de prueba.
-- =====================================================================

insert into public.pharmacies (id, legal_name, trade_name, ruc, status)
values
  ('00000000-0000-4000-8000-00000000000a',
   'Botica Demo San Martin S.A.C.', 'Botica Demo San Martín', '20123456789', 'trial'),
  ('00000000-0000-4000-8000-00000000000b',
   'Botica Demo Los Olivos S.A.C.', 'Botica Demo Los Olivos', '20987654321', 'trial')
on conflict (id) do nothing;

insert into public.branches (id, pharmacy_id, name, address, phone, is_main)
values
  ('00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-00000000000a',
   'Sucursal Principal', 'Av. Ficticia 123, San Martín de Porres, Lima', null, true),
  ('00000000-0000-4000-8000-0000000000b1',
   '00000000-0000-4000-8000-00000000000b',
   'Sucursal Principal', 'Jr. Ficticio 456, Los Olivos, Lima', null, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- COMO CONVERTIR UN USUARIO EN ADMIN DE UNA BOTICA DEMO
--
-- 1. Crea el usuario en Supabase Dashboard -> Authentication -> Users
--    -> "Add user" -> "Create new user" (marca "Auto Confirm User").
--    El trigger private.handle_new_user crea su fila en public.profiles.
-- 2. Ejecuta lo siguiente en el SQL Editor (cambia el correo):
--
--    insert into public.pharmacy_members (pharmacy_id, user_id, role)
--    select '00000000-0000-4000-8000-00000000000a', u.id, 'admin'
--    from auth.users u
--    where u.email = 'admin@ejemplo.com';
--
--    -- Opcional: ponle nombre
--    update public.profiles set full_name = 'Administrador Demo'
--    where id = (select id from auth.users where email = 'admin@ejemplo.com');
--
-- Para un cajero usa 'cashier' en lugar de 'admin'.
-- Para la segunda botica usa el id ...00000000000b.
-- ---------------------------------------------------------------------
