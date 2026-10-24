-- =====================================================================
-- Fase 6: cliente en la venta.
--  * SUNAT exige nombre y documento del adquirente en boletas de MAS de S/ 700 (RS 007-99/SUNAT y
--    modificatorias; ver docs/COMPARATIVA.md). Por debajo es opcional (el cliente puede pedirlo).
--  * Documentos: DNI (8 digitos), RUC (11 digitos con digito verificador), carne de extranjeria, pasaporte.
--  * Los clientes se guardan por botica para autocompletar; la venta guarda una INSTANTANEA del cliente.
--  * Solo se escriben a traves de create_sale (sin escritura directa desde la API).
-- Ver ADR 061-062.
-- =====================================================================

create type public.customer_doc_type as enum ('dni', 'ruc', 'ce', 'passport');

-- RUC: 11 digitos, prefijo valido y digito verificador (modulo 11, factores 5,4,3,2,7,6,5,4,3,2).
create function private.valid_ruc(p_ruc text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  w integer[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  s integer := 0;
  d integer;
begin
  if p_ruc is null or p_ruc !~ '^(10|15|16|17|20)\d{9}$' then
    return false;
  end if;
  for i in 1..10 loop
    s := s + pg_catalog.substr(p_ruc, i, 1)::integer * w[i];
  end loop;
  d := 11 - (s % 11);
  if d = 10 then d := 0; elsif d = 11 then d := 1; end if;
  return d = pg_catalog.substr(p_ruc, 11, 1)::integer;
end;
$$;

create function private.valid_customer_doc(p_type text, p_number text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'dni' then coalesce(p_number ~ '^\d{8}$', false)
    when 'ruc' then private.valid_ruc(p_number)
    when 'ce' then coalesce(p_number ~ '^[A-Z0-9]{8,12}$', false)
    when 'passport' then coalesce(p_number ~ '^[A-Z0-9]{6,12}$', false)
    else false
  end;
$$;

-- Monto (S/) a partir del cual la boleta debe identificar al cliente. Unico lugar del valor.
create function private.customer_id_threshold()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 700.00::numeric $$;

revoke execute on function private.valid_ruc(text) from public, anon;
revoke execute on function private.valid_customer_doc(text, text) from public, anon;
revoke execute on function private.customer_id_threshold() from public, anon;
grant execute on function private.valid_ruc(text) to authenticated;
grant execute on function private.valid_customer_doc(text, text) to authenticated;
grant execute on function private.customer_id_threshold() to authenticated;

-- ---------- Clientes ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  doc_type public.customer_doc_type not null,
  doc_number text not null,
  name text not null check (char_length(btrim(name)) between 2 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, id),
  unique (pharmacy_id, doc_type, doc_number),
  constraint customers_doc_chk check (private.valid_customer_doc(doc_type::text, doc_number))
);
create trigger customers_set_updated_at before update on public.customers
  for each row execute function private.set_updated_at();

alter table public.customers enable row level security;
-- Lectura para todo miembro (el cajero busca al cliente por documento). Sin escritura directa.
create policy customers_select on public.customers
  for select to authenticated using (private.is_member(pharmacy_id));
revoke all on public.customers from anon, authenticated;
grant select on public.customers to authenticated;

-- ---------- Instantanea del cliente en la venta ----------
alter table public.sales
  add column customer_id uuid,
  add column customer_doc_type public.customer_doc_type,
  add column customer_doc_number text,
  add column customer_name text check (customer_name is null or char_length(customer_name) <= 200),
  add constraint sales_customer_fkey foreign key (pharmacy_id, customer_id)
    references public.customers (pharmacy_id, id) on delete restrict,
  add constraint sales_customer_snapshot_chk check (
    (customer_id is null and customer_doc_type is null and customer_doc_number is null and customer_name is null)
    or (customer_id is not null and customer_doc_type is not null and customer_doc_number is not null and customer_name is not null)
  );
create index sales_customer_idx on public.sales (customer_id) where customer_id is not null;

-- ---------- create_sale: cliente opcional, obligatorio sobre S/ 700 ----------
-- Se agrega un parametro: se borra la version anterior para no dejar dos sobrecargas ambiguas.
drop function public.create_sale(uuid, jsonb, public.payment_method, numeric, text, uuid);

create function public.create_sale(
  p_branch uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_amount_received numeric default null,
  p_payment_reference text default null,
  p_idempotency_key uuid default null,
  p_customer jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pharmacy uuid;
  v_charges boolean;
  v_session uuid;
  v_existing uuid;
  v_sale uuid;
  v_series text;
  v_number integer;
  v_total numeric(12, 2) := 0;
  v_gravado numeric(12, 2) := 0;
  v_exonerado numeric(12, 2) := 0;
  v_inafecto numeric(12, 2) := 0;
  v_igv_total numeric(12, 2) := 0;
  v_received numeric(12, 2);
  v_change numeric(12, 2);
  v_ref text := nullif(pg_catalog.btrim(p_payment_reference), '');
  r record;
  a record;
  v_prod public.products%rowtype;
  v_units integer;
  v_price numeric(12, 2);
  v_line numeric(12, 2);
  v_igv numeric(12, 2);
  v_rate numeric(5, 2);
  v_item uuid;
  v_after integer;
  v_cost numeric(12, 4);
  v_doc_type text;
  v_doc_number text;
  v_cust_name text;
  v_customer uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select b.pharmacy_id into v_pharmacy from public.branches b where b.id = p_branch and b.active;
  if v_pharmacy is null or not private.is_member(v_pharmacy) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select ph.charges_igv into v_charges from public.pharmacies ph where ph.id = v_pharmacy;

  -- Reintento con la misma clave: devuelve la venta original sin repetirla.
  -- El bloqueo serializa peticiones simultaneas con la MISMA clave: la segunda espera a que la primera
  -- confirme y entonces ve la venta existente (sin esto fallaria con un error de clave duplicada).
  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
    select s.id into v_existing
    from public.sales s where s.idempotency_key = p_idempotency_key and s.pharmacy_id = v_pharmacy;
    if found then
      return v_existing;
    end if;
  end if;

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

  -- Cliente (opcional): {"doc_type": "dni"|"ruc"|"ce"|"passport", "doc_number": "...", "name": "..."}
  if p_customer is not null and p_customer <> 'null'::jsonb then
    if pg_catalog.jsonb_typeof(p_customer) <> 'object' then
      raise exception 'invalid_customer_doc' using errcode = '22023';
    end if;
    v_doc_type := p_customer ->> 'doc_type';
    v_doc_number := pg_catalog.upper(pg_catalog.btrim(p_customer ->> 'doc_number'));
    v_cust_name := nullif(pg_catalog.btrim(p_customer ->> 'name'), '');
    if not private.valid_customer_doc(v_doc_type, v_doc_number) then
      raise exception 'invalid_customer_doc' using errcode = '22023';
    end if;
    if v_cust_name is null or pg_catalog.char_length(v_cust_name) not between 2 and 200 then
      raise exception 'invalid_customer_name' using errcode = '22023';
    end if;
  end if;

  -- FOR SHARE: impide que el cierre de caja (FOR UPDATE) confirme entre que leemos la caja y registramos la
  -- venta. Si el cierre gana, la fila ya no esta 'open' y la venta falla limpiamente (no_open_cash_session).
  select c.id into v_session
  from public.cash_sessions c where c.branch_id = p_branch and c.status = 'open'
  for share;
  if v_session is null then
    raise exception 'no_open_cash_session' using errcode = 'P0001';
  end if;

  insert into public.receipt_sequences (branch_id, pharmacy_id, last_number)
  values (p_branch, v_pharmacy, 1)
  on conflict (branch_id) do update set last_number = public.receipt_sequences.last_number + 1
  returning series, last_number into v_series, v_number;

  insert into public.sales (pharmacy_id, branch_id, cash_session_id, receipt_series, receipt_number,
                            payment_method, payment_reference, idempotency_key, created_by, charges_igv)
  values (v_pharmacy, p_branch, v_session, v_series, v_number,
          p_payment_method, v_ref, p_idempotency_key, v_user, v_charges)
  returning id into v_sale;

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
    v_igv := private.igv_of(v_line, v_prod.tax_affectation, v_charges);
    v_rate := private.igv_rate_for(v_prod.tax_affectation, v_charges);

    insert into public.sale_items (pharmacy_id, sale_id, product_id, product_name, presentation,
                                   quantity, units_per_presentation, base_quantity, unit_price, line_total,
                                   tax_affectation, igv_rate, igv_amount)
    values (v_pharmacy, v_sale, v_prod.id, v_prod.name, r.presentation::public.sale_presentation,
            r.quantity, v_units, r.quantity * v_units, v_price, v_line,
            v_prod.tax_affectation, v_rate, v_igv)
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
      if sqlerrm = 'insufficient_stock' then
        raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_prod.name;
      end if;
      raise;
    end;

    v_total := v_total + v_line;
    if v_charges then
      v_igv_total := v_igv_total + v_igv;
      if v_prod.tax_affectation = 'gravado' then
        v_gravado := v_gravado + (v_line - v_igv);
      elsif v_prod.tax_affectation = 'exonerado' then
        v_exonerado := v_exonerado + v_line;
      else
        v_inafecto := v_inafecto + v_line;
      end if;
    end if;
  end loop;

  if v_total > 10000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- SUNAT: una boleta de mas de S/ 700 debe identificar al cliente (nombre y documento).
  if v_total > private.customer_id_threshold() and v_doc_number is null then
    raise exception 'customer_required' using errcode = 'P0001';
  end if;
  if v_doc_number is not null then
    insert into public.customers (pharmacy_id, doc_type, doc_number, name)
    values (v_pharmacy, v_doc_type::public.customer_doc_type, v_doc_number, v_cust_name)
    on conflict (pharmacy_id, doc_type, doc_number) do update set name = excluded.name
    returning id into v_customer;
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

  update public.sales
  set total = v_total, amount_received = v_received, change_given = v_change,
      total_gravado = v_gravado, total_exonerado = v_exonerado, total_inafecto = v_inafecto,
      total_igv = v_igv_total,
      customer_id = v_customer, customer_doc_type = v_doc_type::public.customer_doc_type,
      customer_doc_number = v_doc_number, customer_name = v_cust_name
  where id = v_sale;

  return v_sale;
end;
$$;

revoke execute on function public.create_sale(uuid, jsonb, public.payment_method, numeric, text, uuid, jsonb)
  from public, anon;
grant execute on function public.create_sale(uuid, jsonb, public.payment_method, numeric, text, uuid, jsonb)
  to authenticated;
