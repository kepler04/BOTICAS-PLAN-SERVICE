-- =====================================================================
-- Fase 4: reportes (ventas en el tiempo, resumen con ganancia, mas vendidos,
-- baja rotacion y valorizacion del inventario).
--
-- * SOLO el admin: los margenes usan costos de lote (informacion sensible). Se valida de forma
--   explicita ademas de RLS, para que un cajero reciba un error y no un "margen = 100 %" falso.
-- * security invoker: respetan RLS (nunca ven datos de otra botica).
-- * Los dias se calculan en hora de Lima (America/Lima, UTC-5 sin horario de verano): una venta
--   a las 23:30 de Lima pertenece a ese dia aunque en UTC ya sea el siguiente.
-- * La ganancia es BRUTA y ESTIMADA: ventas - costo de los lotes vendidos. No descuenta gastos.
-- Ver ADR 036-041.
-- =====================================================================

create function private.require_branch_admin(p_branch uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_pharmacy uuid;
begin
  select b.pharmacy_id into v_pharmacy from public.branches b where b.id = p_branch;
  if v_pharmacy is null or not private.has_role(v_pharmacy, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_branch_admin(uuid) from public, anon;
grant execute on function private.require_branch_admin(uuid) to authenticated;

-- ---------- Ventas en el tiempo ----------
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
  cash numeric,
  yape numeric,
  plin numeric,
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
           x.id as sale_id, x.total as sale_total, x.payment_method as method
    from public.sales x
    where x.branch_id = p_branch and x.status = 'completed'
      and x.created_at >= t0 and x.created_at < t1
  ),
  agg as (
    select s.pd,
           count(*) as n,
           sum(s.sale_total) as tot,
           sum(s.sale_total) filter (where s.method = 'cash') as c,
           sum(s.sale_total) filter (where s.method = 'yape') as y,
           sum(s.sale_total) filter (where s.method = 'plin') as p
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
         coalesce(agg.c, 0)::numeric(12, 2),
         coalesce(agg.y, 0)::numeric(12, 2),
         coalesce(agg.p, 0)::numeric(12, 2),
         coalesce(cst.cst_total, 0)::numeric(12, 2),
         (coalesce(agg.tot, 0) - coalesce(cst.cst_total, 0))::numeric(12, 2)
  from series
  left join agg on agg.pd = series.pd
  left join cst on cst.pd = series.pd
  order by series.pd;
end;
$$;

-- ---------- Resumen del periodo (KPI) ----------
create function public.report_sales_summary(p_branch uuid, p_from date, p_to date)
returns table (
  sales_count integer,
  total numeric,
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
    select x.id as sale_id, x.total as sale_total, x.status as st
    from public.sales x
    where x.branch_id = p_branch and x.created_at >= t0 and x.created_at < t1
  ),
  ok as (
    select count(*) as n, coalesce(sum(s.sale_total), 0) as tot
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
         cst.cst_total::numeric(12, 2),
         (ok.tot - cst.cst_total)::numeric(12, 2),
         (case when ok.n > 0 then pg_catalog.round(ok.tot / ok.n, 2) else 0 end)::numeric(12, 2),
         vd.n::integer,
         vd.tot::numeric(12, 2)
  from ok, cst, vd;
end;
$$;

-- ---------- Productos mas vendidos ----------
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
           sum(si.base_quantity) as units_sold, sum(si.line_total) as rev
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
         coalesce(c.cst_total, 0)::numeric(12, 2),
         (l.rev - coalesce(c.cst_total, 0))::numeric(12, 2),
         (case when l.rev > 0
               then pg_catalog.round((l.rev - coalesce(c.cst_total, 0)) / l.rev * 100, 1)
               else 0 end)::numeric(6, 1)
  from lines l
  left join costs c on c.pid = l.pid
  order by case p_order
             when 'units' then l.units_sold::numeric
             when 'profit' then (l.rev - coalesce(c.cst_total, 0))
             else l.rev end desc,
           l.pname
  limit p_limit;
end;
$$;

-- ---------- Baja rotacion: con stock y pocas ventas en los ultimos N dias ----------
create function public.report_slow_movers(p_branch uuid, p_days integer default 60, p_limit integer default 20)
returns table (
  product_id uuid,
  name text,
  unit_label text,
  stock_units bigint,
  stock_cost numeric,
  units_sold bigint,
  last_sale_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pharmacy uuid;
begin
  perform private.require_branch_admin(p_branch);
  if p_days is null or p_days not between 1 and 730 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;
  select b.pharmacy_id into v_pharmacy from public.branches b where b.id = p_branch;

  return query
  select p.id,
         p.name,
         p.unit_label,
         st.units::bigint,
         st.cst::numeric(12, 2),
         coalesce(sl.sold, 0)::bigint,
         ls.last_sale
  from public.products p
  join lateral (
    select sum(l.quantity) as units, sum(l.quantity * l.unit_cost) as cst
    from public.lots l
    where l.product_id = p.id and l.branch_id = p_branch and l.quantity > 0
  ) st on st.units > 0
  left join lateral (
    select sum(si.base_quantity) as sold
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where si.product_id = p.id and s.branch_id = p_branch and s.status = 'completed'
      and s.created_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)
  ) sl on true
  left join lateral (
    select max(s.created_at) as last_sale
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where si.product_id = p.id and s.branch_id = p_branch and s.status = 'completed'
  ) ls on true
  where p.active and p.pharmacy_id = v_pharmacy
  order by coalesce(sl.sold, 0) asc, st.cst desc, p.name
  limit p_limit;
end;
$$;

-- ---------- Valorizacion del inventario y dinero en riesgo por vencer ----------
create function public.report_inventory_value(p_branch uuid)
returns table (
  stock_cost numeric,
  stock_units bigint,
  products_with_stock integer,
  expired_cost numeric,
  expiring_30_cost numeric,
  expiring_60_cost numeric,
  expiring_90_cost numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (pg_catalog.now() at time zone 'America/Lima')::date;
begin
  perform private.require_branch_admin(p_branch);

  return query
  select
    coalesce(sum(l.quantity * l.unit_cost), 0)::numeric(12, 2),
    coalesce(sum(l.quantity), 0)::bigint,
    (count(distinct l.product_id))::integer,
    coalesce(sum(l.quantity * l.unit_cost) filter (where l.expiry_date < v_today), 0)::numeric(12, 2),
    coalesce(sum(l.quantity * l.unit_cost) filter (where l.expiry_date between v_today and v_today + 30), 0)::numeric(12, 2),
    coalesce(sum(l.quantity * l.unit_cost) filter (where l.expiry_date between v_today + 31 and v_today + 60), 0)::numeric(12, 2),
    coalesce(sum(l.quantity * l.unit_cost) filter (where l.expiry_date between v_today + 61 and v_today + 90), 0)::numeric(12, 2)
  from public.lots l
  join public.products p on p.id = l.product_id and p.active
  where l.branch_id = p_branch and l.quantity > 0;
end;
$$;

-- ---------- Permisos de ejecucion ----------
revoke execute on function public.report_sales_series(uuid, date, date, text) from public, anon;
revoke execute on function public.report_sales_summary(uuid, date, date) from public, anon;
revoke execute on function public.report_top_products(uuid, date, date, integer, text) from public, anon;
revoke execute on function public.report_slow_movers(uuid, integer, integer) from public, anon;
revoke execute on function public.report_inventory_value(uuid) from public, anon;
grant execute on function public.report_sales_series(uuid, date, date, text) to authenticated;
grant execute on function public.report_sales_summary(uuid, date, date) to authenticated;
grant execute on function public.report_top_products(uuid, date, date, integer, text) to authenticated;
grant execute on function public.report_slow_movers(uuid, integer, integer) to authenticated;
grant execute on function public.report_inventory_value(uuid) to authenticated;
