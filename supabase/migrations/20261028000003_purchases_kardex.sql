-- =====================================================================
-- Fase 6: proveedores, compras y kardex valorizado.
--  * Una compra registra el documento del proveedor (factura, boleta, guia) y crea/suma los lotes en
--    UNA transaccion: todo o nada. Cada linea deja un movimiento 'entry' ligado a la compra.
--  * El mismo documento del mismo proveedor no se puede registrar dos veces (error tipico de digitacion).
--  * Los costos se guardan SIN IGV (ADR 049); el IGV de la compra se ESTIMA por la afectacion del producto.
--  * Kardex: movimientos de un producto en un rango, con saldo en unidades y valorizado al costo de cada
--    movimiento (los lotes salen por FEFO: el costo de una salida es el de su lote).
--  * Solo el administrador ve y registra compras (como las entradas de stock).
-- Ver ADR 066-068.
-- =====================================================================

create type public.purchase_doc_type as enum ('invoice', 'receipt', 'guide', 'other');

-- ---------- Proveedores ----------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 200),
  ruc text check (ruc is null or private.valid_ruc(ruc)),
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or char_length(email) <= 254),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, id)
);
create unique index suppliers_pharmacy_ruc_idx on public.suppliers (pharmacy_id, ruc) where ruc is not null;
create unique index suppliers_pharmacy_name_idx on public.suppliers (pharmacy_id, lower(name));
create trigger suppliers_set_updated_at before update on public.suppliers
  for each row execute function private.set_updated_at();

alter table public.suppliers enable row level security;
create policy suppliers_select on public.suppliers
  for select to authenticated using (private.has_role(pharmacy_id, 'admin'));
create policy suppliers_insert on public.suppliers
  for insert to authenticated with check (private.has_role(pharmacy_id, 'admin'));
create policy suppliers_update on public.suppliers
  for update to authenticated
  using (private.has_role(pharmacy_id, 'admin'))
  with check (private.has_role(pharmacy_id, 'admin'));
revoke all on public.suppliers from anon, authenticated;
grant select on public.suppliers to authenticated;
grant insert (id, pharmacy_id, name, ruc, phone, email, active) on public.suppliers to authenticated;
grant update (name, ruc, phone, email, active) on public.suppliers to authenticated;

-- ---------- Compras ----------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  branch_id uuid not null,
  supplier_id uuid not null,
  doc_type public.purchase_doc_type not null,
  doc_number text not null check (char_length(btrim(doc_number)) between 1 and 30),
  issue_date date not null,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  igv numeric(12, 2) not null default 0 check (igv >= 0),
  total numeric(12, 2) generated always as (subtotal + igv) stored,
  note text check (note is null or char_length(note) <= 300),
  idempotency_key uuid unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (pharmacy_id, id),
  foreign key (pharmacy_id, branch_id) references public.branches (pharmacy_id, id) on delete restrict,
  foreign key (pharmacy_id, supplier_id) references public.suppliers (pharmacy_id, id) on delete restrict
);
create unique index purchases_document_key
  on public.purchases (pharmacy_id, supplier_id, doc_type, upper(doc_number));
create index purchases_pharmacy_created_idx on public.purchases (pharmacy_id, created_at desc);

create table public.purchase_items (
  id bigint generated always as identity primary key,
  pharmacy_id uuid not null,
  purchase_id uuid not null,
  product_id uuid not null,
  lot_id uuid not null references public.lots (id) on delete restrict,
  -- Instantanea: el detalle de la compra no cambia si luego editan el producto.
  product_name text not null,
  lot_code text not null,
  expiry_date date,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12, 4) not null check (unit_cost >= 0),
  line_subtotal numeric(12, 2) not null check (line_subtotal >= 0),
  igv numeric(12, 2) not null check (igv >= 0),
  foreign key (pharmacy_id, purchase_id) references public.purchases (pharmacy_id, id) on delete restrict,
  foreign key (pharmacy_id, product_id) references public.products (pharmacy_id, id) on delete restrict
);
create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_product_idx on public.purchase_items (product_id);

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
create policy purchases_select on public.purchases
  for select to authenticated using (private.has_role(pharmacy_id, 'admin'));
create policy purchase_items_select on public.purchase_items
  for select to authenticated using (private.has_role(pharmacy_id, 'admin'));
revoke all on public.purchases, public.purchase_items from anon, authenticated;
grant select on public.purchases, public.purchase_items to authenticated;

-- Movimientos de entrada ligados a la compra (para el kardex y la trazabilidad del lote).
alter table public.inventory_movements
  add column purchase_id uuid references public.purchases (id) on delete restrict;
create index inventory_movements_purchase_idx on public.inventory_movements (purchase_id) where purchase_id is not null;
create index inventory_movements_branch_product_idx on public.inventory_movements (branch_id, product_id, created_at, id);

-- ---------- RPC: registrar una compra ----------
-- p_items: [{"product_id", "lot_code", "expiry_date" ("YYYY-MM-DD" o null), "quantity" (unidad minima),
--            "unit_cost" (por unidad minima, SIN IGV)}]
create function public.register_purchase(
  p_branch uuid,
  p_supplier uuid,
  p_doc_type public.purchase_doc_type,
  p_doc_number text,
  p_issue_date date,
  p_items jsonb,
  p_note text default null,
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
  v_supplier_name text;
  v_doc text := pg_catalog.upper(pg_catalog.btrim(p_doc_number));
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_existing uuid;
  v_purchase uuid;
  v_subtotal numeric(12, 2) := 0;
  v_igv_total numeric(12, 2) := 0;
  v_line numeric(12, 2);
  v_igv numeric(12, 2);
  v_lot_code text;
  r record;
  v_prod public.products%rowtype;
  v_lot public.lots%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select b.pharmacy_id into v_pharmacy from public.branches b where b.id = p_branch and b.active;
  if v_pharmacy is null or not private.has_role(v_pharmacy, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
    select pu.id into v_existing from public.purchases pu
    where pu.idempotency_key = p_idempotency_key and pu.pharmacy_id = v_pharmacy;
    if found then
      return v_existing;
    end if;
  end if;

  select s.name into v_supplier_name from public.suppliers s
  where s.id = p_supplier and s.pharmacy_id = v_pharmacy and s.active;
  if v_supplier_name is null then
    raise exception 'invalid_supplier' using errcode = '22023';
  end if;
  if p_doc_type is null or v_doc is null or pg_catalog.char_length(v_doc) not between 1 and 30 then
    raise exception 'invalid_document' using errcode = '22023';
  end if;
  if p_issue_date is null or p_issue_date > current_date or p_issue_date < current_date - 730 then
    raise exception 'invalid_issue_date' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 300 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  -- Mismo documento del mismo proveedor: casi siempre es una factura ya digitada.
  if exists (
    select 1 from public.purchases pu
    where pu.pharmacy_id = v_pharmacy and pu.supplier_id = p_supplier
      and pu.doc_type = p_doc_type and pg_catalog.upper(pu.doc_number) = v_doc
  ) then
    raise exception 'duplicate_document' using errcode = 'P0001';
  end if;

  begin
    if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array'
       or pg_catalog.jsonb_array_length(p_items) not between 1 and 100 then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_items)
        as x (product_id uuid, lot_code text, expiry_date date, quantity integer, unit_cost numeric)
      where x.product_id is null
         or x.quantity is null or x.quantity not between 1 and 1000000
         or x.unit_cost is null or x.unit_cost < 0 or x.unit_cost > 1000000
         or nullif(pg_catalog.btrim(x.lot_code), '') is null or pg_catalog.char_length(pg_catalog.btrim(x.lot_code)) > 60
         or (x.expiry_date is not null and x.expiry_date > current_date + interval '15 years')
    ) then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
  exception
    when invalid_text_representation or numeric_value_out_of_range or datatype_mismatch
         or invalid_parameter_value or invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_items' using errcode = '22023';
  end;

  insert into public.purchases (pharmacy_id, branch_id, supplier_id, doc_type, doc_number, issue_date,
                                note, idempotency_key, created_by)
  values (v_pharmacy, p_branch, p_supplier, p_doc_type, v_doc, p_issue_date, v_note, p_idempotency_key, v_user)
  returning id into v_purchase;

  for r in
    select x.product_id, pg_catalog.btrim(x.lot_code) as lot_code, x.expiry_date, x.quantity,
           pg_catalog.round(x.unit_cost, 4) as unit_cost
    from pg_catalog.jsonb_to_recordset(p_items)
      as x (product_id uuid, lot_code text, expiry_date date, quantity integer, unit_cost numeric)
  loop
    select * into v_prod from public.products p where p.id = r.product_id and p.pharmacy_id = v_pharmacy;
    if v_prod.id is null then
      raise exception 'product_not_found' using errcode = 'P0001';
    end if;
    if not v_prod.active then
      raise exception 'product_inactive' using errcode = 'P0001', detail = v_prod.name;
    end if;
    if r.expiry_date is not null and r.expiry_date < current_date then
      raise exception 'expired_lot' using errcode = 'P0001', detail = v_prod.name;
    end if;
    v_lot_code := r.lot_code;

    -- Mismo criterio que register_stock_entry: el lote existente suma y promedia el costo.
    select * into v_lot from public.lots l
    where l.branch_id = p_branch and l.product_id = v_prod.id and l.lot_code = v_lot_code
    for update;
    if found then
      if v_lot.expiry_date is distinct from r.expiry_date then
        raise exception 'lot_expiry_mismatch' using errcode = 'P0001', detail = v_prod.name;
      end if;
      update public.lots
      set unit_cost = pg_catalog.round((v_lot.quantity * v_lot.unit_cost + r.quantity * r.unit_cost)
                                       / (v_lot.quantity + r.quantity), 4),
          quantity = v_lot.quantity + r.quantity
      where id = v_lot.id
      returning * into v_lot;
    else
      insert into public.lots (pharmacy_id, branch_id, product_id, lot_code, expiry_date, quantity, unit_cost)
      values (v_pharmacy, p_branch, v_prod.id, v_lot_code, r.expiry_date, r.quantity, r.unit_cost)
      returning * into v_lot;
    end if;

    v_line := pg_catalog.round(r.quantity * r.unit_cost, 2);
    v_igv := case when v_prod.tax_affectation = 'gravado'
                  then pg_catalog.round(v_line * private.igv_rate() / 100, 2) else 0 end;

    insert into public.purchase_items (pharmacy_id, purchase_id, product_id, lot_id, product_name, lot_code,
                                       expiry_date, quantity, unit_cost, line_subtotal, igv)
    values (v_pharmacy, v_purchase, v_prod.id, v_lot.id, v_prod.name, v_lot_code,
            r.expiry_date, r.quantity, r.unit_cost, v_line, v_igv);

    insert into public.inventory_movements
      (pharmacy_id, branch_id, product_id, lot_id, type, quantity_delta, quantity_after,
       unit_cost, reason, purchase_id, created_by)
    values
      (v_pharmacy, p_branch, v_prod.id, v_lot.id, 'entry', r.quantity, v_lot.quantity,
       r.unit_cost, pg_catalog.left('Compra ' || v_doc || ' · ' || v_supplier_name, 300), v_purchase, v_user);

    v_subtotal := v_subtotal + v_line;
    v_igv_total := v_igv_total + v_igv;
  end loop;

  update public.purchases set subtotal = v_subtotal, igv = v_igv_total where id = v_purchase;

  insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
  values (v_pharmacy, v_user, 'purchase.registered', 'purchases', v_purchase,
          pg_catalog.jsonb_build_object('supplier', v_supplier_name, 'document', v_doc,
                                        'total', v_subtotal + v_igv_total));
  return v_purchase;
end;
$$;
revoke execute on function public.register_purchase(uuid, uuid, public.purchase_doc_type, text, date, jsonb, text, uuid)
  from public, anon;
grant execute on function public.register_purchase(uuid, uuid, public.purchase_doc_type, text, date, jsonb, text, uuid)
  to authenticated;

-- ---------- Kardex valorizado de un producto ----------
-- Primera fila: saldo inicial (kind = 'opening'). Luego cada movimiento del rango, en orden, con su saldo.
create function public.report_kardex(p_branch uuid, p_product uuid, p_from date, p_to date)
returns table (
  moved_at timestamptz,
  kind text,
  document text,
  lot_code text,
  quantity_in integer,
  quantity_out integer,
  unit_cost numeric,
  value_delta numeric,
  balance_quantity integer,
  balance_value numeric,
  created_by_name text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  t0 timestamptz;
  t1 timestamptz;
  v_open_qty integer;
  v_open_value numeric;
begin
  perform private.require_branch_admin(p_branch);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  t0 := p_from::timestamp at time zone 'America/Lima';
  t1 := (p_to + 1)::timestamp at time zone 'America/Lima';

  select coalesce(sum(m.quantity_delta), 0)::integer,
         coalesce(sum(m.quantity_delta * coalesce(m.unit_cost, 0)), 0)
    into v_open_qty, v_open_value
  from public.inventory_movements m
  where m.branch_id = p_branch and m.product_id = p_product and m.created_at < t0;

  return query
  select q.moved_at, q.kind, q.document, q.lot_code, q.quantity_in, q.quantity_out, q.unit_cost,
         q.value_delta, q.balance_quantity, q.balance_value, q.created_by_name
  from (
  select 0 as ord, 0::bigint as mid, t0 as moved_at, 'opening'::text as kind, 'Saldo inicial'::text as document,
         null::text as lot_code, null::integer as quantity_in, null::integer as quantity_out,
         null::numeric as unit_cost, null::numeric as value_delta, v_open_qty as balance_quantity,
         pg_catalog.round(v_open_value, 2) as balance_value, null::text as created_by_name
  union all
  select 1, x.id, x.created_at, x.type::text, x.doc, x.lot_code,
         case when x.quantity_delta > 0 then x.quantity_delta end,
         case when x.quantity_delta < 0 then -x.quantity_delta end,
         x.unit_cost,
         pg_catalog.round(x.vd, 2),
         (v_open_qty + sum(x.quantity_delta) over w)::integer,
         pg_catalog.round(v_open_value + sum(x.vd) over w, 2),
         x.who
  from (
    select m.id, m.created_at, m.type, m.quantity_delta, m.unit_cost, l.lot_code,
           m.quantity_delta * coalesce(m.unit_cost, 0) as vd,
           case
             when m.sale_id is not null then s.receipt_series || '-' || pg_catalog.lpad(s.receipt_number::text, 6, '0')
             when m.purchase_id is not null then
               (case pu.doc_type when 'invoice' then 'Factura' when 'receipt' then 'Boleta'
                                 when 'guide' then 'Guía' else 'Documento' end)
               || ' ' || pu.doc_number || ' · ' || su.name
             else m.reason
           end as doc,
           pr.full_name as who
    from public.inventory_movements m
    join public.lots l on l.id = m.lot_id
    left join public.sales s on s.id = m.sale_id
    left join public.purchases pu on pu.id = m.purchase_id
    left join public.suppliers su on su.id = pu.supplier_id
    left join public.profiles pr on pr.id = m.created_by
    where m.branch_id = p_branch and m.product_id = p_product
      and m.created_at >= t0 and m.created_at < t1
  ) x
  window w as (order by x.created_at, x.id rows between unbounded preceding and current row)
  ) q
  order by q.ord, q.moved_at, q.mid;
end;
$$;
revoke execute on function public.report_kardex(uuid, uuid, date, date) from public, anon;
grant execute on function public.report_kardex(uuid, uuid, date, date) to authenticated;
