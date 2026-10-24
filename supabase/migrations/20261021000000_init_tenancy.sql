-- =====================================================================
-- Fase 1: tenancy (boticas, sucursales, perfiles, membresias, auditoria)
-- Ver docs: "Esquema de base de datos - Fase 1" y "Multi-tenancy y RLS".
-- =====================================================================

-- ---------- Tipos ----------
create type public.app_role as enum ('admin', 'cashier');
create type public.pharmacy_status as enum ('trial', 'active', 'suspended', 'cancelled');

-- ---------- Schema privado (no expuesto por la API) ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- authenticated necesita usage para que las politicas RLS puedan evaluar las funciones.
grant usage on schema private to authenticated;

-- ---------- Tablas ----------
create table public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  trade_name text,
  ruc text unique check (ruc ~ '^(10|20)\d{9}$'),
  status public.pharmacy_status not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200),
  address text,
  phone text,
  is_main boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, name)
);
create index branches_pharmacy_id_idx on public.branches (pharmacy_id);
create unique index branches_one_main_per_pharmacy_idx
  on public.branches (pharmacy_id) where is_main;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pharmacy_members (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, user_id)
);
create index pharmacy_members_pharmacy_id_idx on public.pharmacy_members (pharmacy_id);
create index pharmacy_members_user_id_idx on public.pharmacy_members (user_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  pharmacy_id uuid references public.pharmacies (id) on delete restrict,
  actor_id uuid,
  action text not null,
  entity text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_pharmacy_id_idx on public.audit_log (pharmacy_id);

-- ---------- Funciones privadas ----------
create function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create function private.is_member(p_pharmacy uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pharmacy_members m
    where m.pharmacy_id = p_pharmacy
      and m.user_id = (select auth.uid())
      and m.active
  );
$$;

create function private.has_role(p_pharmacy uuid, p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pharmacy_members m
    where m.pharmacy_id = p_pharmacy
      and m.user_id = (select auth.uid())
      and m.active
      and m.role = p_role
  );
$$;

-- Verdadero si el usuario actual comparte alguna botica (activa) con p_user.
create function private.shares_pharmacy_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pharmacy_members mine
    join public.pharmacy_members theirs on theirs.pharmacy_id = mine.pharmacy_id
    where mine.user_id = (select auth.uid())
      and mine.active
      and theirs.user_id = p_user
  );
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create function private.prevent_member_key_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pharmacy_id is distinct from old.pharmacy_id
     or new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar pharmacy_id ni user_id de una membresia'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create function private.audit_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
    values (new.pharmacy_id, (select auth.uid()), 'member.added', 'pharmacy_members', new.id,
            pg_catalog.jsonb_build_object('user_id', new.user_id, 'role', new.role, 'active', new.active));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
      values (new.pharmacy_id, (select auth.uid()), 'member.role_changed', 'pharmacy_members', new.id,
              pg_catalog.jsonb_build_object('user_id', new.user_id, 'from', old.role, 'to', new.role));
    end if;
    if new.active is distinct from old.active then
      insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
      values (new.pharmacy_id, (select auth.uid()), 'member.active_changed', 'pharmacy_members', new.id,
              pg_catalog.jsonb_build_object('user_id', new.user_id, 'from', old.active, 'to', new.active));
    end if;
    return new;
  else
    insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
    values (old.pharmacy_id, (select auth.uid()), 'member.removed', 'pharmacy_members', old.id,
            pg_catalog.jsonb_build_object('user_id', old.user_id, 'role', old.role));
    return old;
  end if;
end;
$$;

create function private.audit_branches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
    values (new.pharmacy_id, (select auth.uid()), 'branch.created', 'branches', new.id,
            pg_catalog.jsonb_build_object('name', new.name, 'is_main', new.is_main));
  else
    insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
    values (new.pharmacy_id, (select auth.uid()),
            case when new.active is distinct from old.active then 'branch.active_changed'
                 else 'branch.updated' end,
            'branches', new.id,
            pg_catalog.jsonb_build_object('name', new.name, 'is_main', new.is_main, 'active', new.active));
  end if;
  return new;
end;
$$;

-- Solo se ejecutan desde policies/triggers; nunca por PUBLIC/anon.
revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.app_role) to authenticated;
grant execute on function private.shares_pharmacy_with(uuid) to authenticated;

-- ---------- Triggers ----------
create trigger pharmacies_set_updated_at before update on public.pharmacies
  for each row execute function private.set_updated_at();
create trigger branches_set_updated_at before update on public.branches
  for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger pharmacy_members_set_updated_at before update on public.pharmacy_members
  for each row execute function private.set_updated_at();

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger pharmacy_members_prevent_key_change before update on public.pharmacy_members
  for each row execute function private.prevent_member_key_change();

create trigger pharmacy_members_audit after insert or update or delete on public.pharmacy_members
  for each row execute function private.audit_members();
create trigger branches_audit after insert or update on public.branches
  for each row execute function private.audit_branches();

-- ---------- RLS ----------
alter table public.pharmacies enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.pharmacy_members enable row level security;
alter table public.audit_log enable row level security;

-- pharmacies: SELECT miembro; UPDATE admin; sin INSERT/DELETE desde la API
create policy pharmacies_select on public.pharmacies
  for select to authenticated using (private.is_member(id));
create policy pharmacies_update on public.pharmacies
  for update to authenticated
  using (private.has_role(id, 'admin'))
  with check (private.has_role(id, 'admin'));

-- branches: SELECT miembro; INSERT/UPDATE admin; sin DELETE
create policy branches_select on public.branches
  for select to authenticated using (private.is_member(pharmacy_id));
create policy branches_insert on public.branches
  for insert to authenticated with check (private.has_role(pharmacy_id, 'admin'));
create policy branches_update on public.branches
  for update to authenticated
  using (private.has_role(pharmacy_id, 'admin'))
  with check (private.has_role(pharmacy_id, 'admin'));

-- profiles: SELECT uno mismo o miembros de la misma botica; UPDATE uno mismo
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_pharmacy_with(id));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- pharmacy_members: SELECT miembros; escritura solo admin y nunca su propia fila
create policy pharmacy_members_select on public.pharmacy_members
  for select to authenticated using (private.is_member(pharmacy_id));
create policy pharmacy_members_insert on public.pharmacy_members
  for insert to authenticated
  with check (private.has_role(pharmacy_id, 'admin') and user_id <> (select auth.uid()));
create policy pharmacy_members_update on public.pharmacy_members
  for update to authenticated
  using (private.has_role(pharmacy_id, 'admin') and user_id <> (select auth.uid()))
  with check (private.has_role(pharmacy_id, 'admin') and user_id <> (select auth.uid()));
create policy pharmacy_members_delete on public.pharmacy_members
  for delete to authenticated
  using (private.has_role(pharmacy_id, 'admin') and user_id <> (select auth.uid()));

-- audit_log: SELECT admin; sin escritura desde la API
create policy audit_log_select on public.audit_log
  for select to authenticated using (private.has_role(pharmacy_id, 'admin'));

-- ---------- Privilegios de tabla ----------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.pharmacies, public.branches, public.profiles,
  public.pharmacy_members, public.audit_log to authenticated;
-- pharmacies: el admin edita sus datos, pero NO `status` (lo controla la plataforma/suscripcion)
grant update (legal_name, trade_name, ruc) on public.pharmacies to authenticated;
grant insert, update on public.branches to authenticated;
grant insert, update, delete on public.pharmacy_members to authenticated;
-- profiles: solo se puede actualizar full_name
grant update (full_name) on public.profiles to authenticated;

-- ---------- RPC ----------
create function public.get_my_memberships()
returns table (pharmacy_id uuid, pharmacy_name text, role public.app_role)
language sql
stable
security definer
set search_path = ''
as $$
  select m.pharmacy_id,
         coalesce(p.trade_name, p.legal_name) as pharmacy_name,
         m.role
  from public.pharmacy_members m
  join public.pharmacies p on p.id = m.pharmacy_id
  where m.user_id = (select auth.uid())
    and m.active
  order by m.created_at;
$$;
revoke execute on function public.get_my_memberships() from public, anon;
grant execute on function public.get_my_memberships() to authenticated;
