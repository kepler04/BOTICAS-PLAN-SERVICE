-- pgTAP: gestion de miembros (correo en el perfil, "nunca sin administrador").
begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('77777777-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin1@members.local'),
  ('77777777-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin2@members.local'),
  ('77777777-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cajero@members.local');

insert into public.pharmacies (id, legal_name) values ('77777777-1111-4000-8000-000000000000', 'Botica Miembros');

select is((select email from public.profiles where id = '77777777-0000-4000-8000-000000000001'), 'admin1@members.local',
  'el trigger copia el correo al perfil');

update auth.users set email = 'nuevo-admin1@members.local' where id = '77777777-0000-4000-8000-000000000001';
select is((select email from public.profiles where id = '77777777-0000-4000-8000-000000000001'), 'nuevo-admin1@members.local',
  'si cambia el correo en Auth, el perfil lo sigue');

insert into public.pharmacy_members (id, pharmacy_id, user_id, role)
values
  ('77777777-aaaa-4000-8000-000000000001', '77777777-1111-4000-8000-000000000000', '77777777-0000-4000-8000-000000000001', 'admin'),
  ('77777777-aaaa-4000-8000-000000000003', '77777777-1111-4000-8000-000000000000', '77777777-0000-4000-8000-000000000003', 'cashier');

-- Con UN solo admin activo
select throws_ok(
  $$update public.pharmacy_members set role = 'cashier' where id = '77777777-aaaa-4000-8000-000000000001'$$,
  'P0001', 'last_admin', 'no se puede quitar el rol al ultimo administrador');
select throws_ok(
  $$update public.pharmacy_members set active = false where id = '77777777-aaaa-4000-8000-000000000001'$$,
  'P0001', 'last_admin', 'no se puede desactivar al ultimo administrador');
select throws_ok(
  $$delete from public.pharmacy_members where id = '77777777-aaaa-4000-8000-000000000001'$$,
  'P0001', 'last_admin', 'no se puede eliminar al ultimo administrador');

-- Cambiar a un cajero siempre se puede
select lives_ok(
  $$update public.pharmacy_members set active = false where id = '77777777-aaaa-4000-8000-000000000003'$$,
  'desactivar a un cajero es libre');
select lives_ok(
  $$update public.pharmacy_members set role = 'admin', active = true where id = '77777777-aaaa-4000-8000-000000000003'$$,
  'promover a un cajero a admin es libre');

-- Con DOS admins, uno puede dejar de serlo
select lives_ok(
  $$update public.pharmacy_members set role = 'cashier' where id = '77777777-aaaa-4000-8000-000000000001'$$,
  'con dos administradores, uno puede pasar a cajero');

-- ...pero entonces el que queda es el ultimo
select throws_ok(
  $$update public.pharmacy_members set role = 'cashier' where id = '77777777-aaaa-4000-8000-000000000003'$$,
  'P0001', 'last_admin', 'y el que queda ya no puede dejar de serlo');

-- Un admin inactivo no cuenta como administrador de respaldo
update public.pharmacy_members set role = 'admin', active = false where id = '77777777-aaaa-4000-8000-000000000001';
select throws_ok(
  $$update public.pharmacy_members set role = 'cashier' where id = '77777777-aaaa-4000-8000-000000000003'$$,
  'P0001', 'last_admin', 'un administrador inactivo no cuenta como respaldo');

-- Los cambios quedan auditados
select ok((select count(*) from public.audit_log where pharmacy_id = '77777777-1111-4000-8000-000000000000'
           and action in ('member.role_changed', 'member.active_changed')) >= 3,
  'los cambios de rol y estado quedan en la auditoria');

select * from finish();
rollback;
