-- =====================================================================
-- Refactor: la recepcion de un lote vivia COPIADA en register_stock_entry y register_purchase
-- (validar, buscar el lote con bloqueo, sumar con costo promedio o crearlo, y dejar el movimiento).
-- Ahora vive en un solo lugar: private.receive_lot. El comportamiento no cambia (lo prueban pgTAP,
-- integracion y E2E); los errores de lote ahora siempre traen el nombre del producto en `detail`.
-- Ver ADR 069.
-- =====================================================================

-- Recibe `p_quantity` unidades minimas de un lote: lo crea o, si ya existe con la MISMA fecha de
-- vencimiento, suma y promedia el costo. Deja el movimiento 'entry'. Quien llama ya valido permisos.
create function private.receive_lot(
  p_pharmacy uuid,
  p_branch uuid,
  p_product uuid,
  p_product_name text,
  p_lot_code text,
  p_expiry date,
  p_quantity integer,
  p_unit_cost numeric,
  p_user uuid,
  p_reason text,
  p_idempotency_key uuid,
  p_purchase uuid
)
returns public.lots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_code text := nullif(pg_catalog.btrim(p_lot_code), '');
  v_lot public.lots%rowtype;
begin
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
    raise exception 'expired_lot' using errcode = 'P0001', detail = p_product_name;
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
      raise exception 'lot_expiry_mismatch' using errcode = 'P0001', detail = p_product_name;
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
    values (p_pharmacy, p_branch, p_product, v_lot_code, p_expiry, p_quantity, p_unit_cost)
    returning * into v_lot;
  end if;

  insert into public.inventory_movements
    (pharmacy_id, branch_id, product_id, lot_id, type, quantity_delta, quantity_after,
     unit_cost, reason, idempotency_key, purchase_id, created_by)
  values
    (p_pharmacy, p_branch, p_product, v_lot.id, 'entry', p_quantity, v_lot.quantity,
     p_unit_cost, p_reason, p_idempotency_key, p_purchase, p_user);

  return v_lot;
end;
$$;
revoke execute on function private.receive_lot(uuid, uuid, uuid, text, text, date, integer, numeric, uuid, text, uuid, uuid)
  from public, anon, authenticated;

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
  v_name text;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_existing uuid;
  v_lot public.lots%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select p.pharmacy_id, p.active, p.name into v_pharmacy, v_active, v_name
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
  v_lot := private.receive_lot(v_pharmacy, p_branch, p_product, v_name, p_lot_code, p_expiry, p_quantity,
                               p_unit_cost, v_user, v_reason, p_idempotency_key, null);

  return v_lot.id;
end;
$$;

create or replace function public.register_purchase(
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
    v_lot := private.receive_lot(v_pharmacy, p_branch, v_prod.id, v_prod.name, r.lot_code, r.expiry_date,
                                 r.quantity, r.unit_cost, v_user,
                                 pg_catalog.left('Compra ' || v_doc || ' · ' || v_supplier_name, 300), null, v_purchase);

    v_line := pg_catalog.round(r.quantity * r.unit_cost, 2);
    v_igv := case when v_prod.tax_affectation = 'gravado'
                  then pg_catalog.round(v_line * private.igv_rate() / 100, 2) else 0 end;

    insert into public.purchase_items (pharmacy_id, purchase_id, product_id, lot_id, product_name, lot_code,
                                       expiry_date, quantity, unit_cost, line_subtotal, igv)
    values (v_pharmacy, v_purchase, v_prod.id, v_lot.id, v_prod.name, v_lot.lot_code,
            r.expiry_date, r.quantity, r.unit_cost, v_line, v_igv);

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
