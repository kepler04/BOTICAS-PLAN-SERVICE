-- =====================================================================
-- Fase 8: nota de crédito (07) para anular un comprobante ACEPTADO por SUNAT.
--  * Hoy solo la anulación total de la operación (código 01 del catálogo 09): mismas líneas y totales.
--  * Serie BC01 si anula una boleta, FC01 si anula una factura; correlativo propio sin huecos.
--  * La reserva (`reserve_credit_note`) exige lo mismo que anular la venta: administrador, venta vigente y caja
--    abierta. Así, si SUNAT acepta la nota, la anulación de la venta no puede fallar por esas reglas.
--  * La venta se anula (stock y caja) SOLO cuando SUNAT acepta la nota: el trigger de bloqueo ahora la permite
--    si existe una nota de crédito aceptada. La Edge Function `einvoice-credit-note` hace el envío y la anulación.
-- Ver ADR 078-080.
-- =====================================================================

-- ---------- La venta puede tener su comprobante (01/03) y, además, su nota de crédito (07) ----------
alter table public.einvoices drop constraint einvoices_sale_id_key;
create unique index einvoices_sale_document_idx on public.einvoices (sale_id) where doc_type in ('01', '03');
create unique index einvoices_sale_credit_note_idx on public.einvoices (sale_id) where doc_type = '07';

alter table public.einvoices
  add column reference_id uuid references public.einvoices (id) on delete restrict,
  add column reason text check (reason is null or char_length(btrim(reason)) between 3 and 250);

alter table public.einvoices drop constraint einvoices_doc_type_check;
alter table public.einvoices add constraint einvoices_doc_type_check check (doc_type in ('01', '03', '07'));
alter table public.einvoices drop constraint einvoices_series_type_chk;
alter table public.einvoices add constraint einvoices_series_type_chk check (
  (doc_type = '01' and series like 'F%') or (doc_type = '03' and series like 'B%')
  or (doc_type = '07' and series ~ '^[BF]C\d{2}$')
);
-- Una nota de crédito siempre referencia al comprobante que anula y explica el motivo.
alter table public.einvoices add constraint einvoices_credit_note_chk check (
  (doc_type = '07') = (reference_id is not null) and (doc_type <> '07' or reason is not null)
);
alter table public.einvoice_sequences drop constraint einvoice_sequences_series_check;
alter table public.einvoice_sequences add constraint einvoice_sequences_series_check check (series ~ '^[BF][A-Z0-9]{3}$');

grant select (reference_id, reason) on public.einvoices to authenticated;

-- ---------- reserve_einvoice: busca solo el comprobante (01/03), no la nota de crédito ----------
create or replace function public.reserve_einvoice(p_sale uuid)
returns public.einvoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_sale public.sales%rowtype;
  v_ph public.pharmacies%rowtype;
  v_doc text;
  v_series text;
  v_number integer;
  v_row public.einvoices%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_sale from public.sales s where s.id = p_sale;
  if v_sale.id is null or not private.is_member(v_sale.pharmacy_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Una venta anulada no se envía a SUNAT, ni siquiera si ya tenía un comprobante reservado (pendiente).
  if v_sale.status <> 'completed' then
    raise exception 'sale_voided' using errcode = 'P0001';
  end if;

  -- Serializa reservas de la misma venta (dos pestañas o un reintento simultaneo).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('einvoice:' || p_sale::text, 0));
  select * into v_row from public.einvoices e where e.sale_id = p_sale and e.doc_type in ('01', '03');
  if found then
    return v_row;
  end if;

  select * into v_ph from public.pharmacies p where p.id = v_sale.pharmacy_id;
  if not v_ph.einvoice_enabled then
    raise exception 'einvoice_disabled' using errcode = 'P0001';
  end if;
  if v_ph.ruc is null or v_ph.fiscal_address is null then
    raise exception 'issuer_incomplete' using errcode = 'P0001';
  end if;
  if not v_sale.charges_igv then
    raise exception 'igv_required' using errcode = 'P0001';
  end if;

  if v_sale.customer_doc_type = 'ruc' then
    v_doc := '01'; v_series := 'F001';
  else
    v_doc := '03'; v_series := 'B001';
  end if;

  insert into public.einvoice_sequences (pharmacy_id, series, last_number)
  values (v_sale.pharmacy_id, v_series, 1)
  on conflict (pharmacy_id, series) do update set last_number = public.einvoice_sequences.last_number + 1
  returning last_number into v_number;

  insert into public.einvoices (pharmacy_id, sale_id, doc_type, series, number, created_by)
  values (v_sale.pharmacy_id, p_sale, v_doc, v_series, v_number, v_user)
  returning * into v_row;

  insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
  values (v_sale.pharmacy_id, v_user, 'einvoice.reserved', 'einvoices', v_row.id,
          pg_catalog.jsonb_build_object('document', v_series || '-' || v_number, 'sale_id', p_sale));
  return v_row;
end;
$$;

-- ---------- RPC: reservar la nota de crédito que anula el comprobante de una venta ----------
create function public.reserve_credit_note(p_sale uuid, p_reason text)
returns public.einvoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_sale public.sales%rowtype;
  v_original public.einvoices%rowtype;
  v_series text;
  v_number integer;
  v_row public.einvoices%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_sale from public.sales s where s.id = p_sale;
  -- Anular es del administrador (igual que void_sale).
  if v_sale.id is null or not private.has_role(v_sale.pharmacy_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('einvoice-nc:' || p_sale::text, 0));
  select * into v_row from public.einvoices e where e.sale_id = p_sale and e.doc_type = '07';
  if found then
    return v_row; -- idempotente: reintentar devuelve la misma nota
  end if;

  if v_reason is null or pg_catalog.char_length(v_reason) not between 3 and 250 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if v_sale.status <> 'completed' then
    raise exception 'sale_voided' using errcode = 'P0001';
  end if;
  select * into v_original from public.einvoices e
  where e.sale_id = p_sale and e.doc_type in ('01', '03') and e.status in ('accepted', 'observed');
  if v_original.id is null then
    raise exception 'no_accepted_einvoice' using errcode = 'P0001';
  end if;
  -- Misma regla que void_sale: si la caja de la venta ya se cerró, no se puede anular aquí.
  if not exists (select 1 from public.cash_sessions c where c.id = v_sale.cash_session_id and c.status = 'open') then
    raise exception 'cash_session_closed' using errcode = 'P0001';
  end if;

  v_series := case when v_original.doc_type = '03' then 'BC01' else 'FC01' end;
  insert into public.einvoice_sequences (pharmacy_id, series, last_number)
  values (v_sale.pharmacy_id, v_series, 1)
  on conflict (pharmacy_id, series) do update set last_number = public.einvoice_sequences.last_number + 1
  returning last_number into v_number;

  insert into public.einvoices (pharmacy_id, sale_id, doc_type, series, number, reference_id, reason, created_by)
  values (v_sale.pharmacy_id, p_sale, '07', v_series, v_number, v_original.id, v_reason, v_user)
  returning * into v_row;

  insert into public.audit_log (pharmacy_id, actor_id, action, entity, entity_id, details)
  values (v_sale.pharmacy_id, v_user, 'einvoice.credit_note_reserved', 'einvoices', v_row.id,
          pg_catalog.jsonb_build_object('document', v_series || '-' || v_number,
                                        'cancels', v_original.series || '-' || v_original.number, 'reason', v_reason));
  return v_row;
end;
$$;
revoke execute on function public.reserve_credit_note(uuid, text) from public, anon;
grant execute on function public.reserve_credit_note(uuid, text) to authenticated;

-- ---------- Anular: permitido si SUNAT ya aceptó la nota de crédito ----------
create or replace function private.block_void_with_einvoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'voided' and old.status <> 'voided'
     and exists (select 1 from public.einvoices e
                 where e.sale_id = new.id and e.doc_type in ('01', '03') and e.status in ('accepted', 'observed'))
     and not exists (select 1 from public.einvoices e
                     where e.sale_id = new.id and e.doc_type = '07' and e.status in ('accepted', 'observed')) then
    raise exception 'einvoice_issued' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
