-- =====================================================================
-- Fase 5: concurrencia. Cierra dos carreras reales encontradas al razonar sobre peticiones simultaneas:
--  1) Misma clave de idempotencia en paralelo (p. ej. un reintento de red casi simultaneo): las dos
--     comprobaban "ya existe?" y las dos intentaban insertar; la segunda fallaba con "clave duplicada"
--     aunque la operacion SI se habia hecho. Ahora un bloqueo asesor por clave las serializa.
--  2) Operar sobre una caja mientras se cierra: leer la caja abierta sin bloquearla permitia que una
--     venta, un movimiento o una anulacion se registraran DESPUES del cierre, descuadrando el efectivo.
--     Ahora se bloquea la fila de la caja en modo compartido (FOR SHARE) y el cierre (FOR UPDATE) espera.
-- (create_sale recibe las mismas dos correcciones en la migracion del IGV.)
-- Las funciones son las MISMAS de sus migraciones originales; solo se agregan las lineas de bloqueo.
-- Ver ADR 052-053.
-- =====================================================================

create or replace function public.register_stock_entry(
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
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
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

create or replace function public.adjust_stock(
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
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
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

create or replace function public.add_cash_movement(
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
  select * into v_session from public.cash_sessions c where c.id = p_session
  for share; -- el cierre de caja no puede confirmar mientras se registra este movimiento
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

create or replace function public.void_sale(p_sale uuid, p_reason text)
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

  select c.status into v_status from public.cash_sessions c where c.id = v_sale.cash_session_id
  for share; -- el cierre de caja no puede confirmar mientras se anula la venta
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
