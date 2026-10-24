-- =====================================================================
-- Fase 2: categorias, productos, lotes y movimientos de inventario.
--
-- Modelo de unidades: el stock se guarda SIEMPRE en la unidad minima
-- (tableta, capsula, frasco...). Un producto puede venderse ademas por
-- blister y/o caja si define cuantas unidades trae cada uno.
-- Escritura de stock: solo por RPC (register_stock_entry / adjust_stock),
-- ejecutables unicamente por el admin de la botica.
-- Ver ADR 021-024.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

create type public.movement_type as enum ('entry', 'adjustment', 'write_off');

-- Necesario para las claves foraneas compuestas (garantizan mismo tenant).
alter table public.branches
  add constraint branches_pharmacy_id_id_key unique (pharmacy_id, id);

-- ---------- Tablas ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, id)
);
create unique index categories_pharmacy_name_idx
  on public.categories (pharmacy_id, lower(name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  category_id uuid,
  name text not null check (char_length(btrim(name)) between 2 and 200),
  generic_name text check (generic_name is null or char_length(generic_name) <= 200),
  concentration text check (concentration is null or char_length(concentration) <= 100),
  laboratory text check (laboratory is null or char_length(laboratory) <= 120),
  barcode text check (barcode is null or char_length(barcode) between 3 and 64),
  sanitary_registry text check (sanitary_registry is null or char_length(sanitary_registry) <= 50),
  requires_prescription boolean not null default false,
  -- Nombre de la unidad minima: tableta, capsula, ml, frasco, unidad...
  unit_label text not null default 'unidad' check (char_length(btrim(unit_label)) between 1 and 30),
  units_per_blister integer check (units_per_blister >= 2),
  units_per_box integer check (units_per_box >= 2),
  price_unit numeric(12, 2) not null check (price_unit >= 0),
  price_blister numeric(12, 2) check (price_blister >= 0),
  price_box numeric(12, 2) check (price_box >= 0),
  -- En unidades minimas. 0 = sin alerta de stock bajo.
  min_stock integer not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, id),
  -- Si borran la categoria, el producto queda sin categoria (no se borra).
  foreign key (pharmacy_id, category_id)
    references public.categories (pharmacy_id, id) on delete set null (category_id),
  constraint products_blister_price_chk
    check ((units_per_blister is null) = (price_blister is null)),
  constraint products_box_price_chk
    check ((units_per_box is null) = (price_box is null)),
  -- Una caja se compone de blisters completos.
  constraint products_box_multiple_chk
    check (units_per_box is null or units_per_blister is null
           or (units_per_box >= units_per_blister and units_per_box % units_per_blister = 0))
);
create unique index products_pharmacy_barcode_idx
  on public.products (pharmacy_id, barcode) where barcode is not null;
create index products_pharmacy_category_idx on public.products (pharmacy_id, category_id);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_generic_name_trgm_idx
  on public.products using gin (generic_name extensions.gin_trgm_ops);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  branch_id uuid not null,
  product_id uuid not null,
  lot_code text not null check (char_length(btrim(lot_code)) between 1 and 60),
  -- Null = producto que no vence (accesorios, etc.).
  expiry_date date,
  -- En unidades minimas. Nunca negativo.
  quantity integer not null check (quantity >= 0),
  -- Costo por unidad minima (promedio ponderado si el lote recibe mas entradas).
  unit_cost numeric(12, 4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (pharmacy_id, branch_id)
    references public.branches (pharmacy_id, id) on delete restrict,
  foreign key (pharmacy_id, product_id)
    references public.products (pharmacy_id, id) on delete restrict,
  unique (branch_id, product_id, lot_code)
);
create index lots_pharmacy_expiry_idx on public.lots (pharmacy_id, expiry_date) where quantity > 0;
create index lots_product_idx on public.lots (product_id);

-- Libro de movimientos: solo se inserta (desde las RPC), nunca se edita ni se borra.
create table public.inventory_movements (
  id bigint generated always as identity primary key,
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  branch_id uuid not null,
  product_id uuid not null,
  lot_id uuid not null references public.lots (id) on delete restrict,
  type public.movement_type not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  quantity_after integer not null check (quantity_after >= 0),
  unit_cost numeric(12, 4),
  reason text check (reason is null or char_length(reason) <= 300),
  -- Generada en el cliente: evita duplicar una entrada por doble clic.
  idempotency_key uuid unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (pharmacy_id, branch_id)
    references public.branches (pharmacy_id, id) on delete restrict,
  foreign key (pharmacy_id, product_id)
    references public.products (pharmacy_id, id) on delete restrict,
  constraint movement_sign_chk check (
    (type = 'entry' and quantity_delta > 0)
    or (type = 'write_off' and quantity_delta < 0)
    or type = 'adjustment'
  ),
  constraint movement_reason_chk check (
    type = 'entry' or char_length(btrim(coalesce(reason, ''))) >= 3
  )
);
create index inventory_movements_pharmacy_created_idx
  on public.inventory_movements (pharmacy_id, created_at desc);
create index inventory_movements_product_idx on public.inventory_movements (product_id);
create index inventory_movements_lot_idx on public.inventory_movements (lot_id);

-- ---------- Vista de stock por producto y sucursal ----------
-- security_invoker: respeta el RLS del usuario que consulta.
create view public.product_stock with (security_invoker = true) as
select
  p.id as product_id,
  p.pharmacy_id,
  b.id as branch_id,
  p.name,
  p.generic_name,
  p.concentration,
  p.barcode,
  p.category_id,
  p.unit_label,
  p.units_per_blister,
  p.units_per_box,
  p.min_stock,
  coalesce(sum(l.quantity), 0)::integer as total_quantity,
  coalesce(sum(l.quantity) filter (where l.expiry_date < current_date), 0)::integer as expired_quantity,
  (count(l.id) filter (where l.quantity > 0))::integer as lot_count,
  min(l.expiry_date) filter (where l.quantity > 0) as next_expiry,
  (p.min_stock > 0 and coalesce(sum(l.quantity), 0) <= p.min_stock) as is_low
from public.products p
join public.branches b on b.pharmacy_id = p.pharmacy_id and b.active
left join public.lots l on l.product_id = p.id and l.branch_id = b.id
where p.active
group by p.id, b.id;

-- ---------- Funciones privadas ----------
create function private.seed_default_categories(p_pharmacy uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categories (pharmacy_id, name)
  select p_pharmacy, c.name
  from (values
    ('Analgésicos y antipiréticos'), ('Antibióticos'), ('Antiinflamatorios'),
    ('Antialérgicos'), ('Gastrointestinales'), ('Respiratorios'),
    ('Vitaminas y suplementos'), ('Cuidado personal'), ('Primeros auxilios'), ('Otros')
  ) as c (name)
  on conflict (pharmacy_id, lower(name)) do nothing;
$$;

create function private.audit_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
    values (new.pharmacy_id, (select auth.uid()), 'product.created', 'products', new.id,
            pg_catalog.jsonb_build_object('name', new.name, 'price_unit', new.price_unit));
  else
    if new.price_unit is distinct from old.price_unit
       or new.price_blister is distinct from old.price_blister
       or new.price_box is distinct from old.price_box then
      insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
      values (new.pharmacy_id, (select auth.uid()), 'product.price_changed', 'products', new.id,
              pg_catalog.jsonb_build_object(
                'name', new.name,
                'from', pg_catalog.jsonb_build_object('unit', old.price_unit, 'blister', old.price_blister, 'box', old.price_box),
                'to', pg_catalog.jsonb_build_object('unit', new.price_unit, 'blister', new.price_blister, 'box', new.price_box)));
    end if;
    if new.active is distinct from old.active then
      insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
      values (new.pharmacy_id, (select auth.uid()), 'product.active_changed', 'products', new.id,
              pg_catalog.jsonb_build_object('name', new.name, 'from', old.active, 'to', new.active));
    end if;
  end if;
  return new;
end;
$$;

-- FEFO: reparte `p_quantity` entre los lotes que vencen primero, sin tocar los vencidos.
-- La usara la RPC de venta (Fase 3). Bloquea las filas que reparte.
create function private.allocate_fefo(p_branch uuid, p_product uuid, p_quantity integer)
returns table (out_lot_id uuid, take_quantity integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining integer := p_quantity;
  r record;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  for r in
    select l.id as lot_id, l.quantity as qty
    from public.lots l
    where l.branch_id = p_branch
      and l.product_id = p_product
      and l.quantity > 0
      and (l.expiry_date is null or l.expiry_date >= current_date)
    order by l.expiry_date asc nulls last, l.created_at, l.id
    for update
  loop
    exit when v_remaining <= 0;
    out_lot_id := r.lot_id;
    take_quantity := least(r.qty, v_remaining);
    v_remaining := v_remaining - take_quantity;
    return next;
  end loop;

  if v_remaining > 0 then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function private.seed_default_categories(uuid) from public, anon;
revoke execute on function private.audit_products() from public, anon;
revoke execute on function private.allocate_fefo(uuid, uuid, integer) from public, anon;

-- ---------- Triggers ----------
create trigger categories_set_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger lots_set_updated_at before update on public.lots
  for each row execute function private.set_updated_at();
create trigger products_audit after insert or update on public.products
  for each row execute function private.audit_products();

-- ---------- RLS ----------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.lots enable row level security;
alter table public.inventory_movements enable row level security;

create policy categories_select on public.categories
  for select to authenticated using (private.is_member(pharmacy_id));
create policy categories_insert on public.categories
  for insert to authenticated with check (private.has_role(pharmacy_id, 'admin'));
create policy categories_update on public.categories
  for update to authenticated
  using (private.has_role(pharmacy_id, 'admin'))
  with check (private.has_role(pharmacy_id, 'admin'));
create policy categories_delete on public.categories
  for delete to authenticated using (private.has_role(pharmacy_id, 'admin'));

create policy products_select on public.products
  for select to authenticated using (private.is_member(pharmacy_id));
create policy products_insert on public.products
  for insert to authenticated with check (private.has_role(pharmacy_id, 'admin'));
create policy products_update on public.products
  for update to authenticated
  using (private.has_role(pharmacy_id, 'admin'))
  with check (private.has_role(pharmacy_id, 'admin'));

-- lots: lectura para miembros; sin escritura directa (solo RPC).
create policy lots_select on public.lots
  for select to authenticated using (private.is_member(pharmacy_id));

-- movimientos: solo el admin los consulta; sin escritura directa.
create policy inventory_movements_select on public.inventory_movements
  for select to authenticated using (private.has_role(pharmacy_id, 'admin'));

-- ---------- Privilegios de tabla (los defaults de Supabase otorgan todo) ----------
revoke all on public.categories, public.products, public.lots,
  public.inventory_movements, public.product_stock from anon, authenticated;

grant select on public.categories, public.products, public.lots,
  public.inventory_movements, public.product_stock to authenticated;
grant insert, delete on public.categories to authenticated;
grant update (name) on public.categories to authenticated;
grant insert (id, pharmacy_id, category_id, name, generic_name, concentration, laboratory, barcode,
              sanitary_registry, requires_prescription, unit_label, units_per_blister,
              units_per_box, price_unit, price_blister, price_box, min_stock, active)
  on public.products to authenticated;
grant update (category_id, name, generic_name, concentration, laboratory, barcode,
              sanitary_registry, requires_prescription, unit_label, units_per_blister,
              units_per_box, price_unit, price_blister, price_box, min_stock, active)
  on public.products to authenticated;

-- ---------- RPC: entrada de stock ----------
create function public.register_stock_entry(
  p_branch uuid,
  p_product uuid,
  p_lot_code text,
  p_expiry date,
  p_quantity integer,
  p_unit_cost numeric,
  p_reason text default null,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pharmacy uuid;
  v_active boolean;
  v_lot_code text := nullif(pg_catalog.btrim(p_lot_code), '');
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_existing uuid;
  v_lot public.lots%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select p.pharmacy_id, p.active into v_pharmacy, v_active
  from public.products p where p.id = p_product;
  if v_pharmacy is null or not private.has_role(v_pharmacy, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Reintento con la misma clave: devuelve el lote original sin sumar otra vez.
  if p_idempotency_key is not null then
    select m.lot_id into v_existing
    from public.inventory_movements m
    where m.idempotency_key = p_idempotency_key and m.pharmacy_id = v_pharmacy;
    if found then
      return v_existing;
    end if;
  end if;

  if not v_active then
    raise exception 'product_inactive' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = p_branch and b.pharmacy_id = v_pharmacy and b.active
  ) then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if p_unit_cost is null or p_unit_cost < 0 or p_unit_cost > 1000000 then
    raise exception 'invalid_cost' using errcode = '22023';
  end if;
  if v_lot_code is null or pg_catalog.char_length(v_lot_code) > 60 then
    raise exception 'invalid_lot_code' using errcode = '22023';
  end if;
  if p_expiry is not null and p_expiry < current_date then
    raise exception 'expired_lot' using errcode = 'P0001';
  end if;
  if p_expiry is not null and p_expiry > current_date + interval '15 years' then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;

  select * into v_lot
  from public.lots l
  where l.branch_id = p_branch and l.product_id = p_product and l.lot_code = v_lot_code
  for update;

  if found then
    if v_lot.expiry_date is distinct from p_expiry then
      raise exception 'lot_expiry_mismatch' using errcode = 'P0001';
    end if;
    update public.lots
    set unit_cost = pg_catalog.round(
          (v_lot.quantity * v_lot.unit_cost + p_quantity * p_unit_cost)
          / (v_lot.quantity + p_quantity), 4),
        quantity = v_lot.quantity + p_quantity
    where id = v_lot.id
    returning * into v_lot;
  else
    insert into public.lots (pharmacy_id, branch_id, product_id, lot_code, expiry_date, quantity, unit_cost)
    values (v_pharmacy, p_branch, p_product, v_lot_code, p_expiry, p_quantity, p_unit_cost)
    returning * into v_lot;
  end if;

  insert into public.inventory_movements
    (pharmacy_id, branch_id, product_id, lot_id, type, quantity_delta, quantity_after,
     unit_cost, reason, idempotency_key, created_by)
  values
    (v_pharmacy, p_branch, p_product, v_lot.id, 'entry', p_quantity, v_lot.quantity,
     p_unit_cost, v_reason, p_idempotency_key, v_user);

  return v_lot.id;
end;
$$;

-- ---------- RPC: ajuste / merma ----------
create function public.adjust_stock(
  p_lot uuid,
  p_delta integer,
  p_type public.movement_type,
  p_reason text,
  p_idempotency_key uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pharmacy uuid;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_existing integer;
  v_lot public.lots%rowtype;
  v_new integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select l.pharmacy_id into v_pharmacy from public.lots l where l.id = p_lot;
  if v_pharmacy is null or not private.has_role(v_pharmacy, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select m.quantity_after into v_existing
    from public.inventory_movements m
    where m.idempotency_key = p_idempotency_key and m.pharmacy_id = v_pharmacy;
    if found then
      return v_existing;
    end if;
  end if;

  if p_type not in ('adjustment', 'write_off') then
    raise exception 'invalid_type' using errcode = '22023';
  end if;
  if p_delta is null or p_delta = 0 or pg_catalog.abs(p_delta) > 1000000 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if p_type = 'write_off' and p_delta > 0 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 300 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_lot from public.lots l where l.id = p_lot for update;
  v_new := v_lot.quantity + p_delta;
  if v_new < 0 then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  update public.lots set quantity = v_new where id = v_lot.id;

  insert into public.inventory_movements
    (pharmacy_id, branch_id, product_id, lot_id, type, quantity_delta, quantity_after,
     unit_cost, reason, idempotency_key, created_by)
  values
    (v_pharmacy, v_lot.branch_id, v_lot.product_id, v_lot.id, p_type, p_delta, v_new,
     v_lot.unit_cost, v_reason, p_idempotency_key, v_user);

  return v_new;
end;
$$;

revoke execute on function public.register_stock_entry(uuid, uuid, text, date, integer, numeric, text, uuid)
  from public, anon;
grant execute on function public.register_stock_entry(uuid, uuid, text, date, integer, numeric, text, uuid)
  to authenticated;
revoke execute on function public.adjust_stock(uuid, integer, public.movement_type, text, uuid)
  from public, anon;
grant execute on function public.adjust_stock(uuid, integer, public.movement_type, text, uuid)
  to authenticated;

-- ---------- register_pharmacy: ahora tambien crea las categorias base ----------
create or replace function public.register_pharmacy(
  p_legal_name text,
  p_trade_name text default null,
  p_ruc text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_legal text := nullif(pg_catalog.btrim(p_legal_name), '');
  v_trade text := nullif(pg_catalog.btrim(p_trade_name), '');
  v_ruc text := nullif(pg_catalog.btrim(p_ruc), '');
  v_pharmacy uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.pharmacy_members m where m.user_id = v_user) then
    raise exception 'already_has_pharmacy' using errcode = 'P0001';
  end if;

  if v_legal is null or pg_catalog.char_length(v_legal) not between 2 and 200 then
    raise exception 'invalid_legal_name' using errcode = '22023';
  end if;
  if v_trade is not null and pg_catalog.char_length(v_trade) > 200 then
    raise exception 'invalid_trade_name' using errcode = '22023';
  end if;
  if v_ruc is not null and v_ruc !~ '^(10|20)\d{9}$' then
    raise exception 'invalid_ruc' using errcode = '22023';
  end if;
  if v_ruc is not null and exists (select 1 from public.pharmacies p where p.ruc = v_ruc) then
    raise exception 'ruc_taken' using errcode = 'P0001';
  end if;

  insert into public.pharmacies (legal_name, trade_name, ruc)
  values (v_legal, v_trade, v_ruc)
  returning id into v_pharmacy;

  insert into public.branches (pharmacy_id, name, is_main)
  values (v_pharmacy, 'Sucursal Principal', true);

  insert into public.pharmacy_members (pharmacy_id, user_id, role)
  values (v_pharmacy, v_user, 'admin');

  perform private.seed_default_categories(v_pharmacy);

  insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id)
  values (v_pharmacy, v_user, 'pharmacy.registered', 'pharmacies', v_pharmacy);

  return v_pharmacy;
end;
$$;

-- Boticas que ya existian: categorias base.
select private.seed_default_categories(p.id) from public.pharmacies p;
