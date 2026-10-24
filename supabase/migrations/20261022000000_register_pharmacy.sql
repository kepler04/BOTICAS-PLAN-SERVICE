-- =====================================================================
-- Autoregistro de boticas (ADR 020, reemplaza el alta solo por SQL del ADR 008).
-- Un usuario autenticado SIN membresias crea su botica en una sola transaccion:
--   botica (trial) + sucursal principal + membresia admin.
-- Es la unica via de alta desde la API: pharmacies/branches/pharmacy_members
-- siguen sin permitir INSERT directo a clientes (ver grants de la migracion inicial).
-- =====================================================================

create function public.register_pharmacy(
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

  -- Un usuario sin botica puede crear UNA. Evita que una cuenta fabrique boticas en serie.
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

  insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id)
  values (v_pharmacy, v_user, 'pharmacy.registered', 'pharmacies', v_pharmacy);

  return v_pharmacy;
end;
$$;

revoke execute on function public.register_pharmacy(text, text, text) from public, anon;
grant execute on function public.register_pharmacy(text, text, text) to authenticated;
