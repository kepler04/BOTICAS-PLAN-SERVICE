-- =====================================================================
-- Fase 3: ventas (POS), caja, comprobantes internos.
--
-- * La venta es UNA RPC atomica (create_sale): el servidor calcula precios y total,
--   descuenta stock por FEFO y registra todo, o no registra nada. El cliente solo
--   envia producto + presentacion + cantidad (nunca precios).
-- * Idempotente: la clave generada en el cliente evita duplicar por doble clic.
-- * Para vender debe haber una caja abierta en la sucursal.
-- * Comprobante INTERNO de prueba (no es boleta SUNAT). Numeracion correlativa sin huecos.
-- * Ninguna de estas tablas acepta escritura directa desde la API: solo las RPC.
-- Ver ADR 028-034.
-- =====================================================================

create type public.payment_method as enum ('cash', 'yape', 'plin');
create type public.sale_status as enum ('completed', 'voided');
create type public.sale_presentation as enum ('unit', 'blister', 'box');
create type public.cash_session_status as enum ('open', 'closed');
create type public.cash_movement_type as enum ('income', 'expense');

-- ---------- Caja ----------
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  branch_id uuid not null,
  status public.cash_session_status not null default 'open',
  opening_amount numeric(12, 2) not null check (opening_amount >= 0),
  opened_by uuid references public.profiles (id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  -- Efectivo contado al cerrar y diferencia contra lo esperado (contado - esperado).
  counted_cash numeric(12, 2) check (counted_cash >= 0),
  difference numeric(12, 2),
  notes text check (notes is null or char_length(notes) <= 300),
  unique (pharmacy_id, id),
  foreign key (pharmacy_id, branch_id)
    references public.branches (pharmacy_id, id) on delete restrict,
  constraint cash_sessions_closed_chk check (
    (status = 'open' and closed_at is null and counted_cash is null and difference is null)
    or (status = 'closed' and closed_at is not null and counted_cash is not null and difference is not null)
  )
);
-- Una sola caja abierta por sucursal.
create unique index cash_sessions_one_open_per_branch_idx
  on public.cash_sessions (branch_id) where status = 'open';
create index cash_sessions_pharmacy_opened_idx on public.cash_sessions (pharmacy_id, opened_at desc);

-- ---------- Ventas ----------
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  branch_id uuid not null,
  cash_session_id uuid not null references public.cash_sessions (id) on delete restrict,
  -- Comprobante interno de prueba: serie + correlativo. NO es una boleta electronica.
  receipt_series text not null default 'T001',
  receipt_number integer not null check (receipt_number > 0),
  status public.sale_status not null default 'completed',
  payment_method public.payment_method not null,
  payment_reference text check (payment_reference is null or char_length(payment_reference) <= 60),
  total numeric(12, 2) not null default 0 check (total >= 0),
  amount_received numeric(12, 2) not null default 0 check (amount_received >= 0),
  change_given numeric(12, 2) not null default 0 check (change_given >= 0),
  -- Generada en el cliente: una venta por intento de cobro.
  idempotency_key uuid unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(void_reason) <= 300),
  unique (pharmacy_id, id),
  unique (branch_id, receipt_series, receipt_number),
  foreign key (pharmacy_id, branch_id)
    references public.branches (pharmacy_id, id) on delete restrict,
  constraint sales_void_chk check (
    (status = 'completed' and voided_at is null)
    or (status = 'voided' and voided_at is not null and char_length(btrim(coalesce(void_reason, ''))) >= 3)
  )
);
create index sales_pharmacy_created_idx on public.sales (pharmacy_id, created_at desc);
create index sales_cash_session_idx on public.sales (cash_session_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  sale_id uuid not null,
  product_id uuid not null,
  -- Instantanea: el comprobante no cambia si luego editan el producto.
  product_name text not null,
  presentation public.sale_presentation not null,
  quantity integer not null check (quantity > 0),
  units_per_presentation integer not null check (units_per_presentation > 0),
  base_quantity integer not null check (base_quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  foreign key (pharmacy_id, sale_id) references public.sales (pharmacy_id, id) on delete restrict,
  foreign key (pharmacy_id, product_id) references public.products (pharmacy_id, id) on delete restrict
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

-- De que lotes salio cada linea (para anular y para calcular margen en la Fase 4).
create table public.sale_item_lots (
  id bigint generated always as identity primary key,
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  sale_item_id uuid not null references public.sale_items (id) on delete restrict,
  lot_id uuid not null references public.lots (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12, 4) not null check (unit_cost >= 0)
);
create index sale_item_lots_item_idx on public.sale_item_lots (sale_item_id);

-- Contador de comprobantes por sucursal (nadie lo edita desde la API).
create table public.receipt_sequences (
  branch_id uuid primary key references public.branches (id) on delete restrict,
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  series text not null default 'T001',
  last_number integer not null default 0 check (last_number >= 0)
);

create table public.cash_movements (
  id bigint generated always as identity primary key,
  pharmacy_id uuid not null,
  branch_id uuid not null,
  cash_session_id uuid not null references public.cash_sessions (id) on delete restrict,
  type public.cash_movement_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (pharmacy_id, branch_id)
    references public.branches (pharmacy_id, id) on delete restrict
);
create index cash_movements_session_idx on public.cash_movements (cash_session_id);

-- ---------- Inventario: movimientos de venta ----------
alter table public.inventory_movements
  add column sale_id uuid references public.sales (id) on delete restrict;
create index inventory_movements_sale_idx on public.inventory_movements (sale_id) where sale_id is not null;

alter table public.inventory_movements drop constraint movement_sign_chk;
alter table public.inventory_movements add constraint movement_sign_chk check (
  (type = 'entry' and quantity_delta > 0)
  or (type = 'write_off' and quantity_delta < 0)
  or (type = 'sale' and quantity_delta < 0)
  or (type = 'sale_void' and quantity_delta > 0)
  or type = 'adjustment'
);
-- Entradas y ventas no exigen motivo; ajustes, mermas y anulaciones si.
alter table public.inventory_movements drop constraint movement_reason_chk;
alter table public.inventory_movements add constraint movement_reason_chk check (
  type in ('entry', 'sale') or char_length(btrim(coalesce(reason, ''))) >= 3
);

-- ---------- Vistas ----------
-- Stock por producto y sucursal. Ahora tambien con precios y stock VENDIBLE (sin lotes vencidos),
-- que es lo que usa el POS. is_low se mide contra el stock vendible.
create or replace view public.product_stock with (security_invoker = true) as
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
  (p.min_stock > 0 and coalesce(sum(l.quantity) filter (where l.expiry_date is null or l.expiry_date >= current_date), 0) <= p.min_stock) as is_low,
  p.price_unit,
  p.price_blister,
  p.price_box,
  p.requires_prescription,
  coalesce(sum(l.quantity) filter (where l.expiry_date is null or l.expiry_date >= current_date), 0)::integer as sellable_quantity
from public.products p
join public.branches b on b.pharmacy_id = p.pharmacy_id and b.active
left join public.lots l on l.product_id = p.id and l.branch_id = b.id
where p.active
group by p.id, b.id;

-- Resumen de cada caja: ventas por medio de pago, ingresos/egresos y efectivo esperado.
create view public.cash_session_summary with (security_invoker = true) as
select
  cs.id,
  cs.pharmacy_id,
  cs.branch_id,
  cs.status,
  cs.opened_at,
  cs.opened_by,
  cs.closed_at,
  cs.closed_by,
  cs.opening_amount,
  cs.counted_cash,
  cs.difference,
  cs.notes,
  (select pr.full_name from public.profiles pr where pr.id = cs.opened_by) as opened_by_name,
  (select pr.full_name from public.profiles pr where pr.id = cs.closed_by) as closed_by_name,
  coalesce(s.cash_sales, 0)::numeric(12, 2) as cash_sales,
  coalesce(s.yape_sales, 0)::numeric(12, 2) as yape_sales,
  coalesce(s.plin_sales, 0)::numeric(12, 2) as plin_sales,
  coalesce(s.sales_count, 0)::integer as sales_count,
  coalesce(s.voided_count, 0)::integer as voided_count,
  coalesce(m.income_total, 0)::numeric(12, 2) as income_total,
  coalesce(m.expense_total, 0)::numeric(12, 2) as expense_total,
  (cs.opening_amount + coalesce(s.cash_sales, 0) + coalesce(m.income_total, 0) - coalesce(m.expense_total, 0))::numeric(12, 2) as expected_cash
from public.cash_sessions cs
left join lateral (
  select
    sum(x.total) filter (where x.status = 'completed' and x.payment_method = 'cash') as cash_sales,
    sum(x.total) filter (where x.status = 'completed' and x.payment_method = 'yape') as yape_sales,
    sum(x.total) filter (where x.status = 'completed' and x.payment_method = 'plin') as plin_sales,
    count(*) filter (where x.status = 'completed') as sales_count,
    count(*) filter (where x.status = 'voided') as voided_count
  from public.sales x where x.cash_session_id = cs.id
) s on true
left join lateral (
  select
    sum(c.amount) filter (where c.type = 'income') as income_total,
    sum(c.amount) filter (where c.type = 'expense') as expense_total
  from public.cash_movements c where c.cash_session_id = cs.id
) m on true;

-- ---------- RLS ----------
alter table public.cash_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_item_lots enable row level security;
alter table public.receipt_sequences enable row level security;
alter table public.cash_movements enable row level security;

create policy cash_sessions_select on public.cash_sessions
  for select to authenticated using (private.is_member(pharmacy_id));
create policy sales_select on public.sales
  for select to authenticated using (private.is_member(pharmacy_id));
create policy sale_items_select on public.sale_items
  for select to authenticated using (private.is_member(pharmacy_id));
create policy cash_movements_select on public.cash_movements
  for select to authenticated using (private.is_member(pharmacy_id));
-- El costo de los lotes es informacion de margen: solo el admin.
create policy sale_item_lots_select on public.sale_item_lots
  for select to authenticated using (private.has_role(pharmacy_id, 'admin'));
-- receipt_sequences: sin politicas (nadie via API).

-- ---------- Privilegios: solo lectura; toda escritura es por RPC ----------
revoke all on public.cash_sessions, public.sales, public.sale_items, public.sale_item_lots,
  public.receipt_sequences, public.cash_movements, public.cash_session_summary
  from anon, authenticated;
grant select on public.cash_sessions, public.sales, public.sale_items, public.sale_item_lots,
  public.cash_movements, public.cash_session_summary to authenticated;

-- ---------- RPC: abrir caja ----------
create function public.open_cash_session(p_branch uuid, p_opening_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pharmacy uuid;
  v_session uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select b.pharmacy_id into v_pharmacy from public.branches b where b.id = p_branch and b.active;
  if v_pharmacy is null or not private.is_member(v_pharmacy) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_opening_amount is null or p_opening_amount < 0 or p_opening_amount > 1000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if exists (select 1 from public.cash_sessions c where c.branch_id = p_branch and c.status = 'open') then
    raise exception 'session_already_open' using errcode = 'P0001';
  end if;

  begin
    insert into public.cash_sessions (pharmacy_id, branch_id, opening_amount, opened_by)
    values (v_pharmacy, p_branch, pg_catalog.round(p_opening_amount, 2), v_user)
    returning id into v_session;
  exception when unique_violation then
    -- Dos aperturas simultaneas: gana la primera.
    raise exception 'session_already_open' using errcode = 'P0001';
  end;

  insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
  values (v_pharmacy, v_user, 'cash.opened', 'cash_sessions', v_session,
          pg_catalog.jsonb_build_object('opening_amount', pg_catalog.round(p_opening_amount, 2)));
  return v_session;
end;
$$;

-- ---------- RPC: ingreso / egreso de caja ----------
create function public.add_cash_movement(
  p_session uuid,
  p_type public.cash_movement_type,
  p_amount numeric,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.cash_sessions%rowtype;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_id bigint;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_session from public.cash_sessions c where c.id = p_session;
  if v_session.id is null or not private.is_member(v_session.pharmacy_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_session.status <> 'open' then
    raise exception 'cash_session_closed' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 300 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  insert into public.cash_movements (pharmacy_id, branch_id, cash_session_id, type, amount, reason, created_by)
  values (v_session.pharmacy_id, v_session.branch_id, v_session.id, p_type,
          pg_catalog.round(p_amount, 2), v_reason, v_user)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- RPC: cerrar caja ----------
create function public.close_cash_session(p_session uuid, p_counted_cash numeric, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.cash_sessions%rowtype;
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');
  v_expected numeric(12, 2);
  v_diff numeric(12, 2);
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  -- Bloquea la caja: ninguna venta/movimiento nuevo puede colarse mientras se cierra.
  select * into v_session from public.cash_sessions c where c.id = p_session for update;
  if v_session.id is null or not private.is_member(v_session.pharmacy_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_session.status <> 'open' then
    raise exception 'cash_session_closed' using errcode = 'P0001';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 or p_counted_cash > 10000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select s.expected_cash into v_expected from public.cash_session_summary s where s.id = v_session.id;
  v_diff := pg_catalog.round(p_counted_cash, 2) - v_expected;
  if v_diff <> 0 and (v_notes is null or pg_catalog.char_length(v_notes) < 3) then
    raise exception 'difference_note_required' using errcode = '22023';
  end if;

  update public.cash_sessions
  set status = 'closed', closed_at = pg_catalog.now(), closed_by = v_user,
      counted_cash = pg_catalog.round(p_counted_cash, 2), difference = v_diff, notes = v_notes
  where id = v_session.id;

  insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
  values (v_session.pharmacy_id, v_user, 'cash.closed', 'cash_sessions', v_session.id,
          pg_catalog.jsonb_build_object('expected', v_expected, 'counted', pg_catalog.round(p_counted_cash, 2), 'difference', v_diff));

  return pg_catalog.jsonb_build_object(
    'expected', v_expected, 'counted', pg_catalog.round(p_counted_cash, 2), 'difference', v_diff);
end;
$$;

-- ---------- RPC: crear venta (atomica) ----------
-- p_items: [{"product_id": "...", "presentation": "unit|blister|box", "quantity": 2}, ...]
create function public.create_sale(
  p_branch uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_amount_received numeric default null,
  p_payment_reference text default null,
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
  v_session uuid;
  v_existing uuid;
  v_sale uuid;
  v_series text;
  v_number integer;
  v_total numeric(12, 2) := 0;
  v_received numeric(12, 2);
  v_change numeric(12, 2);
  v_ref text := nullif(pg_catalog.btrim(p_payment_reference), '');
  r record;
  a record;
  v_prod public.products%rowtype;
  v_units integer;
  v_price numeric(12, 2);
  v_line numeric(12, 2);
  v_item uuid;
  v_after integer;
  v_cost numeric(12, 4);
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select b.pharmacy_id into v_pharmacy from public.branches b where b.id = p_branch and b.active;
  if v_pharmacy is null or not private.is_member(v_pharmacy) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Reintento con la misma clave: devuelve la venta original sin repetirla.
  if p_idempotency_key is not null then
    select s.id into v_existing
    from public.sales s where s.idempotency_key = p_idempotency_key and s.pharmacy_id = v_pharmacy;
    if found then
      return v_existing;
    end if;
  end if;

  -- Validacion del arreglo de items (un valor mal formado no debe filtrar errores internos).
  begin
    if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array'
       or pg_catalog.jsonb_array_length(p_items) not between 1 and 100 then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_items) as x (product_id uuid, presentation text, quantity integer)
      where x.product_id is null
         or x.presentation is null or x.presentation not in ('unit', 'blister', 'box')
         or x.quantity is null or x.quantity not between 1 and 10000
    ) then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
  exception
    when invalid_text_representation or numeric_value_out_of_range or datatype_mismatch
         or invalid_parameter_value then
      raise exception 'invalid_items' using errcode = '22023';
  end;

  select c.id into v_session
  from public.cash_sessions c where c.branch_id = p_branch and c.status = 'open';
  if v_session is null then
    raise exception 'no_open_cash_session' using errcode = 'P0001';
  end if;

  -- Numero de comprobante correlativo, atomico y sin huecos (si la venta falla, se revierte).
  insert into public.receipt_sequences (branch_id, pharmacy_id, last_number)
  values (p_branch, v_pharmacy, 1)
  on conflict (branch_id) do update set last_number = public.receipt_sequences.last_number + 1
  returning series, last_number into v_series, v_number;

  insert into public.sales (pharmacy_id, branch_id, cash_session_id, receipt_series, receipt_number,
                            payment_method, payment_reference, idempotency_key, created_by)
  values (v_pharmacy, p_branch, v_session, v_series, v_number,
          p_payment_method, v_ref, p_idempotency_key, v_user)
  returning id into v_sale;

  -- Orden fijo por producto: evita bloqueos cruzados entre ventas simultaneas.
  for r in
    select x.product_id, x.presentation, x.quantity
    from pg_catalog.jsonb_to_recordset(p_items) as x (product_id uuid, presentation text, quantity integer)
    order by x.product_id, x.presentation
  loop
    select * into v_prod
    from public.products p where p.id = r.product_id and p.pharmacy_id = v_pharmacy;
    if v_prod.id is null then
      raise exception 'product_not_found' using errcode = 'P0001';
    end if;
    if not v_prod.active then
      raise exception 'product_inactive' using errcode = 'P0001', detail = v_prod.name;
    end if;

    if r.presentation = 'unit' then
      v_units := 1;
      v_price := v_prod.price_unit;
    elsif r.presentation = 'blister' then
      v_units := v_prod.units_per_blister;
      v_price := v_prod.price_blister;
    else
      v_units := v_prod.units_per_box;
      v_price := v_prod.price_box;
    end if;
    if v_units is null or v_price is null then
      raise exception 'presentation_unavailable' using errcode = 'P0001', detail = v_prod.name;
    end if;

    v_line := pg_catalog.round(v_price * r.quantity, 2);
    insert into public.sale_items (pharmacy_id, sale_id, product_id, product_name, presentation,
                                   quantity, units_per_presentation, base_quantity, unit_price, line_total)
    values (v_pharmacy, v_sale, v_prod.id, v_prod.name, r.presentation::public.sale_presentation,
            r.quantity, v_units, r.quantity * v_units, v_price, v_line)
    returning id into v_item;

    begin
      for a in select * from private.allocate_fefo(p_branch, v_prod.id, r.quantity * v_units) loop
        update public.lots set quantity = quantity - a.take_quantity
        where id = a.out_lot_id
        returning quantity, unit_cost into v_after, v_cost;

        insert into public.sale_item_lots (pharmacy_id, sale_item_id, lot_id, quantity, unit_cost)
        values (v_pharmacy, v_item, a.out_lot_id, a.take_quantity, v_cost);

        insert into public.inventory_movements
          (pharmacy_id, branch_id, product_id, lot_id, type, quantity_delta, quantity_after,
           unit_cost, sale_id, created_by)
        values
          (v_pharmacy, p_branch, v_prod.id, a.out_lot_id, 'sale', -a.take_quantity, v_after,
           v_cost, v_sale, v_user);
      end loop;
    exception when raise_exception then
      -- Adjunta el nombre del producto para que la pantalla diga cual falta.
      if sqlerrm = 'insufficient_stock' then
        raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_prod.name;
      end if;
      raise;
    end;

    v_total := v_total + v_line;
  end loop;

  if v_total > 10000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  if p_payment_method = 'cash' then
    if p_amount_received is null or p_amount_received < v_total or p_amount_received > 10000000 then
      raise exception 'insufficient_payment' using errcode = 'P0001';
    end if;
    v_received := pg_catalog.round(p_amount_received, 2);
    v_change := v_received - v_total;
  else
    v_received := v_total;
    v_change := 0;
  end if;

  update public.sales set total = v_total, amount_received = v_received, change_given = v_change
  where id = v_sale;

  return v_sale;
end;
$$;

-- ---------- RPC: anular venta (solo admin, solo con la caja de esa venta abierta) ----------
create function public.void_sale(p_sale uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_sale public.sales%rowtype;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_status public.cash_session_status;
  a record;
  v_lot public.lots%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_sale from public.sales s where s.id = p_sale for update;
  if v_sale.id is null or not private.has_role(v_sale.pharmacy_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sale.status <> 'completed' then
    raise exception 'already_voided' using errcode = 'P0001';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 300 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select c.status into v_status from public.cash_sessions c where c.id = v_sale.cash_session_id;
  if v_status <> 'open' then
    raise exception 'cash_session_closed' using errcode = 'P0001';
  end if;

  for a in
    select sil.lot_id, sum(sil.quantity)::integer as qty
    from public.sale_item_lots sil
    join public.sale_items si on si.id = sil.sale_item_id
    where si.sale_id = v_sale.id
    group by sil.lot_id
    order by sil.lot_id
  loop
    select * into v_lot from public.lots l where l.id = a.lot_id for update;
    update public.lots set quantity = v_lot.quantity + a.qty where id = v_lot.id;

    insert into public.inventory_movements
      (pharmacy_id, branch_id, product_id, lot_id, type, quantity_delta, quantity_after,
       unit_cost, reason, sale_id, created_by)
    values
      (v_sale.pharmacy_id, v_lot.branch_id, v_lot.product_id, v_lot.id, 'sale_void', a.qty,
       v_lot.quantity + a.qty, v_lot.unit_cost, v_reason, v_sale.id, v_user);
  end loop;

  update public.sales
  set status = 'voided', voided_by = v_user, voided_at = pg_catalog.now(), void_reason = v_reason
  where id = v_sale.id;

  insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
  values (v_sale.pharmacy_id, v_user, 'sale.voided', 'sales', v_sale.id,
          pg_catalog.jsonb_build_object('receipt', v_sale.receipt_series || '-' || v_sale.receipt_number,
                                        'total', v_sale.total, 'reason', v_reason));
end;
$$;

-- ---------- Resumen de ventas de un rango (dashboard y, mas adelante, reportes) ----------
-- security invoker: respeta el RLS de quien consulta (solo ve ventas de su botica).
create function public.get_sales_summary(p_branch uuid, p_from timestamptz, p_to timestamptz)
returns table (sales_count integer, total numeric, cash numeric, yape numeric, plin numeric, voided_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (count(*) filter (where s.status = 'completed'))::integer,
    coalesce(sum(s.total) filter (where s.status = 'completed'), 0)::numeric(12, 2),
    coalesce(sum(s.total) filter (where s.status = 'completed' and s.payment_method = 'cash'), 0)::numeric(12, 2),
    coalesce(sum(s.total) filter (where s.status = 'completed' and s.payment_method = 'yape'), 0)::numeric(12, 2),
    coalesce(sum(s.total) filter (where s.status = 'completed' and s.payment_method = 'plin'), 0)::numeric(12, 2),
    (count(*) filter (where s.status = 'voided'))::integer
  from public.sales s
  where s.branch_id = p_branch and s.created_at >= p_from and s.created_at < p_to;
$$;

-- ---------- Permisos de ejecucion ----------
revoke execute on function public.open_cash_session(uuid, numeric) from public, anon;
revoke execute on function public.add_cash_movement(uuid, public.cash_movement_type, numeric, text) from public, anon;
revoke execute on function public.close_cash_session(uuid, numeric, text) from public, anon;
revoke execute on function public.create_sale(uuid, jsonb, public.payment_method, numeric, text, uuid) from public, anon;
revoke execute on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.open_cash_session(uuid, numeric) to authenticated;
grant execute on function public.add_cash_movement(uuid, public.cash_movement_type, numeric, text) to authenticated;
grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;
grant execute on function public.create_sale(uuid, jsonb, public.payment_method, numeric, text, uuid) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;
revoke execute on function public.get_sales_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_sales_summary(uuid, timestamptz, timestamptz) to authenticated;
