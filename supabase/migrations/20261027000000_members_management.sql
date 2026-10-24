-- =====================================================================
-- Fase 5: gestion de usuarios (invitar cajeros, cambiar rol, activar/desactivar).
--  * El correo se copia al perfil (los admins lo ven en la lista de su equipo; RLS ya limita
--    profiles a quienes comparten botica).
--  * Una botica NUNCA puede quedarse sin un administrador activo (ni por cambios simultaneos).
-- La creacion de usuarios requiere service_role: la hace la Edge Function `invite-user`.
-- Ver ADR 054-056 (invitar usuarios, nunca sin administrador, correo en el perfil).
-- =====================================================================

alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;

-- Si el usuario cambia su correo en Auth, el perfil lo sigue.
create function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
revoke execute on function private.sync_profile_email() from public, anon;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_profile_email();

-- ---------- Nunca sin administrador ----------
create function private.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.active
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.active) then
    -- Serializa los cambios de administradores de la misma botica (evita que dos admins se quiten el rol a la vez).
    perform 1 from public.pharmacies p where p.id = old.pharmacy_id for update;
    if not exists (
      select 1 from public.pharmacy_members m
      where m.pharmacy_id = old.pharmacy_id and m.id <> old.id and m.role = 'admin' and m.active
    ) then
      raise exception 'last_admin' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke execute on function private.protect_last_admin() from public, anon;
create trigger pharmacy_members_protect_last_admin before update or delete on public.pharmacy_members
  for each row execute function private.protect_last_admin();
