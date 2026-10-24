-- =====================================================================
-- Fase 5: IGV peruano (18 %) y pago con tarjeta en reportes.
--
-- Modelo:
--  * Los precios de venta al publico YA INCLUYEN IGV (practica comun al consumidor final).
--  * Cada producto tiene su AFECTACION: gravado (18 %), exonerado o inafecto. Los medicamentos
--    no tienen una tasa reducida general: la exoneracion/inafectacion se limita a listas oficiales
--    por decreto supremo (p. ej. oncologicos, VIH/SIDA, diabetes), asi que NO se asume nada:
--    el admin marca cada producto (con ayuda de su contador).
--  * La botica puede NO cobrar IGV (p. ej. Nuevo RUS: no desglosa IGV, solo boletas). Entonces
--    la venta no desglosa y no hay IGV.
--  * Cada linea de venta guarda una INSTANTANEA de afectacion, tasa e IGV: si manana cambia la
--    configuracion o la ley, los comprobantes ya emitidos no cambian.
--  * La ganancia se calcula sobre la venta NETA (sin IGV): el IGV cobrado es debito fiscal, no ingreso.
--  * El costo de los lotes se guarda SIN IGV (el IGV de compras es credito fiscal).
--  * Es un comprobante INTERNO: no reemplaza a la boleta electronica SUNAT.
-- Ver ADR 046-051.
-- =====================================================================

create type public.tax_affectation as enum ('gravado', 'exonerado', 'inafecto');

-- ---------- Configuracion ----------
alter table public.pharmacies add column charges_igv boolean not null default true;
alter table public.products add column tax_affectation public.tax_affectation not null default 'gravado';

grant update (charges_igv) on public.pharmacies to authenticated;
grant insert (tax_affectation), update (tax_affectation) on public.products to authenticated;

-- ---------- Datos de IGV por linea y por venta ----------
alter table public.sale_items
  add column tax_affectation public.tax_affectation not null default 'gravado',
  add column igv_rate numeric(5, 2) not null default 0 check (igv_rate between 0 and 100),
  add column igv_amount numeric(12, 2) not null default 0 check (igv_amount >= 0),
  -- Valor de venta (base imponible). Generada: base + IGV == total de la linea por construccion.
  add column taxable_amount numeric(12, 2) generated always as (line_total - igv_amount) stored,
  add constraint sale_items_igv_chk check (igv_amount <= line_total);

alter table public.sales
  add column charges_igv boolean not null default false,
  add column total_gravado numeric(12, 2) not null default 0 check (total_gravado >= 0),
  add column total_exonerado numeric(12, 2) not null default 0 check (total_exonerado >= 0),
  add column total_inafecto numeric(12, 2) not null default 0 check (total_inafecto >= 0),
  add column total_igv numeric(12, 2) not null default 0 check (total_igv >= 0),
  add constraint sales_igv_totals_chk check (
    not charges_igv or total = total_gravado + total_exonerado + total_inafecto + total_igv
  );

-- ---------- Funciones privadas ----------
-- Unica fuente de la tasa (en %). IGV 15.5 % + IPM 2.5 % = 18 % en 2026; el IPM sube hasta 4 % en 2029
-- (Ley 32387) manteniendo el total en 18 %. Si la tasa total cambiara, es el unico lugar a tocar.
create function private.igv_rate()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 18.00::numeric $$;

-- Tasa (%) que se aplica a una linea.
create function private.igv_rate_for(p_affectation public.tax_affectation, p_charges boolean)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_charges and p_affectation = 'gravado' then private.igv_rate() else 0::numeric end
$$;

-- IGV contenido en un monto con IGV incluido: igv = total - round(total / (1 + tasa), 2).
create function private.igv_of(p_gross numeric, p_affectation public.tax_affectation, p_charges boolean)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_charges and p_affectation = 'gravado'
      then p_gross - pg_catalog.round(p_gross / (1 + private.igv_rate() / 100), 2)
    else 0::numeric
  end
$$;

revoke execute on function private.igv_rate() from public, anon;
revoke execute on function private.igv_rate_for(public.tax_affectation, boolean) from public, anon;
revoke execute on function private.igv_of(numeric, public.tax_affectation, boolean) from public, anon;

-- Auditoria de la configuracion tributaria de la botica.
create function private.audit_pharmacy_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.charges_igv is distinct from old.charges_igv then
    insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
    values (new.id, (select auth.uid()), 'pharmacy.charges_igv_changed', 'pharmacies', new.id,
            pg_catalog.jsonb_build_object('from', old.charges_igv, 'to', new.charges_igv));
  end if;
  return new;
end;
$$;
revoke execute on function private.audit_pharmacy_settings() from public, anon;
create trigger pharmacies_audit_settings after update on public.pharmacies
  for each row execute function private.audit_pharmacy_settings();

-- ---------- Vista de stock: el POS necesita la afectacion para previsualizar el IGV ----------
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
  coalesce(sum(l.quantity) filter (where l.expiry_date is null or l.expiry_date >= current_date), 0)::integer as sellable_quantity,
  p.tax_affectation
from public.products p
join public.branches b on b.pharmacy_id = p.pharmacy_id and b.active
left join public.lots l on l.product_id = p.id and l.branch_id = b.id
where p.active
group by p.id, b.id;

-- ---------- create_sale: ahora calcula y guarda el IGV ----------
create or replace function public.create_sale(
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
      total_igv = v_igv_total
  where id = v_sale;

  return v_sale;
end;
$$;

-- ---------- Reportes: venta neta (sin IGV), IGV cobrado y ganancia sobre la venta neta ----------
-- Cambian las columnas devueltas: se recrean las funciones.
drop function public.report_sales_series(uuid, date, date, text);
drop function public.report_sales_summary(uuid, date, date);
drop function public.report_top_products(uuid, date, date, integer, text);

create function public.report_sales_series(
  p_branch uuid,
  p_from date,
  p_to date,
  p_granularity text default 'day'
)
returns table (
  period date,
  sales_count integer,
  total numeric,
  igv numeric,
  net numeric,
  cash numeric,
  yape numeric,
  plin numeric,
  card numeric,
  cost numeric,
  profit numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  t0 timestamptz;
  t1 timestamptz;
begin
  perform private.require_branch_admin(p_branch);
  if p_granularity not in ('day', 'month') then
    raise exception 'invalid_granularity' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  t0 := p_from::timestamp at time zone 'America/Lima';
  t1 := (p_to + 1)::timestamp at time zone 'America/Lima';

  return query
  with s as (
    select pg_catalog.date_trunc(p_granularity, x.created_at at time zone 'America/Lima')::date as pd,
           x.id as sale_id, x.total as sale_total, x.total_igv as sale_igv, x.payment_method as method
    from public.sales x
    where x.branch_id = p_branch and x.status = 'completed'
      and x.created_at >= t0 and x.created_at < t1
  ),
  agg as (
    select s.pd,
           count(*) as n,
           sum(s.sale_total) as tot,
           sum(s.sale_igv) as igv_tot,
           sum(s.sale_total) filter (where s.method = 'cash') as c,
           sum(s.sale_total) filter (where s.method = 'yape') as y,
           sum(s.sale_total) filter (where s.method = 'plin') as p,
           sum(s.sale_total) filter (where s.method = 'card') as k
    from s group by s.pd
  ),
  cst as (
    select s.pd, sum(sil.quantity * sil.unit_cost) as cst_total
    from s
    join public.sale_items si on si.sale_id = s.sale_id
    join public.sale_item_lots sil on sil.sale_item_id = si.id
    group by s.pd
  ),
  series as (
    select g::date as pd
    from pg_catalog.generate_series(
      pg_catalog.date_trunc(p_granularity, p_from::timestamp),
      pg_catalog.date_trunc(p_granularity, p_to::timestamp),
      ('1 ' || p_granularity)::interval
    ) as g
  )
  select series.pd,
         coalesce(agg.n, 0)::integer,
         coalesce(agg.tot, 0)::numeric(12, 2),
         coalesce(agg.igv_tot, 0)::numeric(12, 2),
         (coalesce(agg.tot, 0) - coalesce(agg.igv_tot, 0))::numeric(12, 2),
         coalesce(agg.c, 0)::numeric(12, 2),
         coalesce(agg.y, 0)::numeric(12, 2),
         coalesce(agg.p, 0)::numeric(12, 2),
         coalesce(agg.k, 0)::numeric(12, 2),
         coalesce(cst.cst_total, 0)::numeric(12, 2),
         (coalesce(agg.tot, 0) - coalesce(agg.igv_tot, 0) - coalesce(cst.cst_total, 0))::numeric(12, 2)
  from series
  left join agg on agg.pd = series.pd
  left join cst on cst.pd = series.pd
  order by series.pd;
end;
$$;

create function public.report_sales_summary(p_branch uuid, p_from date, p_to date)
returns table (
  sales_count integer,
  total numeric,
  igv numeric,
  net numeric,
  cost numeric,
  profit numeric,
  avg_ticket numeric,
  voided_count integer,
  voided_total numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  t0 timestamptz;
  t1 timestamptz;
begin
  perform private.require_branch_admin(p_branch);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  t0 := p_from::timestamp at time zone 'America/Lima';
  t1 := (p_to + 1)::timestamp at time zone 'America/Lima';

  return query
  with s as (
    select x.id as sale_id, x.total as sale_total, x.total_igv as sale_igv, x.status as st
    from public.sales x
    where x.branch_id = p_branch and x.created_at >= t0 and x.created_at < t1
  ),
  ok as (
    select count(*) as n, coalesce(sum(s.sale_total), 0) as tot, coalesce(sum(s.sale_igv), 0) as igv_tot
    from s where s.st = 'completed'
  ),
  cst as (
    select coalesce(sum(sil.quantity * sil.unit_cost), 0) as cst_total
    from s
    join public.sale_items si on si.sale_id = s.sale_id
    join public.sale_item_lots sil on sil.sale_item_id = si.id
    where s.st = 'completed'
  ),
  vd as (
    select count(*) as n, coalesce(sum(s.sale_total), 0) as tot from s where s.st = 'voided'
  )
  select ok.n::integer,
         ok.tot::numeric(12, 2),
         ok.igv_tot::numeric(12, 2),
         (ok.tot - ok.igv_tot)::numeric(12, 2),
         cst.cst_total::numeric(12, 2),
         (ok.tot - ok.igv_tot - cst.cst_total)::numeric(12, 2),
         (case when ok.n > 0 then pg_catalog.round(ok.tot / ok.n, 2) else 0 end)::numeric(12, 2),
         vd.n::integer,
         vd.tot::numeric(12, 2)
  from ok, cst, vd;
end;
$$;

create function public.report_top_products(
  p_branch uuid,
  p_from date,
  p_to date,
  p_limit integer default 10,
  p_order text default 'revenue'
)
returns table (
  product_id uuid,
  name text,
  units bigint,
  revenue numeric,
  net numeric,
  cost numeric,
  profit numeric,
  margin numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  t0 timestamptz;
  t1 timestamptz;
begin
  perform private.require_branch_admin(p_branch);
  if p_order not in ('revenue', 'units', 'profit') then
    raise exception 'invalid_order' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  t0 := p_from::timestamp at time zone 'America/Lima';
  t1 := (p_to + 1)::timestamp at time zone 'America/Lima';

  return query
  with lines as (
    select si.product_id as pid, max(si.product_name) as pname,
           sum(si.base_quantity) as units_sold, sum(si.line_total) as rev, sum(si.taxable_amount) as net_rev
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.branch_id = p_branch and s.status = 'completed'
      and s.created_at >= t0 and s.created_at < t1
    group by si.product_id
  ),
  costs as (
    select si.product_id as pid, sum(sil.quantity * sil.unit_cost) as cst_total
    from public.sale_item_lots sil
    join public.sale_items si on si.id = sil.sale_item_id
    join public.sales s on s.id = si.sale_id
    where s.branch_id = p_branch and s.status = 'completed'
      and s.created_at >= t0 and s.created_at < t1
    group by si.product_id
  )
  select l.pid,
         l.pname,
         l.units_sold::bigint,
         l.rev::numeric(12, 2),
         l.net_rev::numeric(12, 2),
         coalesce(c.cst_total, 0)::numeric(12, 2),
         (l.net_rev - coalesce(c.cst_total, 0))::numeric(12, 2),
         (case when l.net_rev > 0
               then pg_catalog.round((l.net_rev - coalesce(c.cst_total, 0)) / l.net_rev * 100, 1)
               else 0 end)::numeric(6, 1)
  from lines l
  left join costs c on c.pid = l.pid
  order by case p_order
             when 'units' then l.units_sold::numeric
             when 'profit' then (l.net_rev - coalesce(c.cst_total, 0))
             else l.rev end desc,
           l.pname
  limit p_limit;
end;
$$;

revoke execute on function public.report_sales_series(uuid, date, date, text) from public, anon;
revoke execute on function public.report_sales_summary(uuid, date, date) from public, anon;
revoke execute on function public.report_top_products(uuid, date, date, integer, text) from public, anon;
grant execute on function public.report_sales_series(uuid, date, date, text) to authenticated;
grant execute on function public.report_sales_summary(uuid, date, date) to authenticated;
grant execute on function public.report_top_products(uuid, date, date, integer, text) to authenticated;

-- get_sales_summary (dashboard): tambien con tarjeta no cambia (solo suma por metodo conocido);
-- se actualiza para incluir 'card' y el IGV.
drop function public.get_sales_summary(uuid, timestamptz, timestamptz);
create function public.get_sales_summary(p_branch uuid, p_from timestamptz, p_to timestamptz)
returns table (sales_count integer, total numeric, cash numeric, yape numeric, plin numeric, card numeric, voided_count integer)
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
    coalesce(sum(s.total) filter (where s.status = 'completed' and s.payment_method = 'card'), 0)::numeric(12, 2),
    (count(*) filter (where s.status = 'voided'))::integer
  from public.sales s
  where s.branch_id = p_branch and s.created_at >= p_from and s.created_at < p_to;
$$;
revoke execute on function public.get_sales_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_sales_summary(uuid, timestamptz, timestamptz) to authenticated;

-- ---------- Resumen de caja: tambien lo cobrado con tarjeta ----------
-- (el efectivo esperado NO cambia: la tarjeta no entra al cajon)
drop view public.cash_session_summary;
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
  (cs.opening_amount + coalesce(s.cash_sales, 0) + coalesce(m.income_total, 0) - coalesce(m.expense_total, 0))::numeric(12, 2) as expected_cash,
  coalesce(s.card_sales, 0)::numeric(12, 2) as card_sales
from public.cash_sessions cs
left join lateral (
  select
    sum(x.total) filter (where x.status = 'completed' and x.payment_method = 'cash') as cash_sales,
    sum(x.total) filter (where x.status = 'completed' and x.payment_method = 'yape') as yape_sales,
    sum(x.total) filter (where x.status = 'completed' and x.payment_method = 'plin') as plin_sales,
    sum(x.total) filter (where x.status = 'completed' and x.payment_method = 'card') as card_sales,
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
revoke all on public.cash_session_summary from anon, authenticated;
grant select on public.cash_session_summary to authenticated;
