-- =====================================================================
-- Fase 7: facturación electrónica SUNAT (entorno BETA, de PRUEBAS).
--  * Una venta puede tener UN comprobante electrónico: FACTURA (01, serie F001) si el cliente tiene RUC;
--    si no, BOLETA (03, serie B001). Numeración propia por serie, sin huecos (reservada en una transacción).
--  * La reserva la hace la RPC `reserve_einvoice` (cualquier miembro activo); el XML, la firma y el envío a
--    SUNAT los hace la Edge Function `einvoice-emit`, que guarda el resultado con service_role.
--  * Una venta con comprobante ACEPTADO por SUNAT no se puede anular aquí: SUNAT exige una nota de crédito
--    (pendiente). Lo impone un trigger, sin reescribir void_sale.
--  * Es el entorno BETA: los comprobantes NO tienen validez legal (ver ADR 073).
-- Ver ADR 073-077.
-- =====================================================================

-- ---------- Datos del emisor ----------
alter table public.pharmacies
  add column fiscal_address text check (fiscal_address is null or char_length(btrim(fiscal_address)) between 5 and 200),
  add column ubigeo text check (ubigeo is null or ubigeo ~ '^\d{6}$'),
  add column einvoice_enabled boolean not null default false;
grant update (fiscal_address, ubigeo, einvoice_enabled) on public.pharmacies to authenticated;

create type public.einvoice_status as enum ('pending', 'accepted', 'observed', 'rejected', 'error');

-- ---------- Correlativos por serie ----------
create table public.einvoice_sequences (
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  series text not null check (series ~ '^[BF][A-Z0-9]{3}$'),
  last_number integer not null default 0 check (last_number between 0 and 99999999),
  primary key (pharmacy_id, series)
);
alter table public.einvoice_sequences enable row level security;
revoke all on public.einvoice_sequences from anon, authenticated;

-- ---------- Comprobantes electrónicos ----------
create table public.einvoices (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  sale_id uuid not null unique,
  doc_type text not null check (doc_type in ('01', '03')),
  series text not null,
  number integer not null check (number between 1 and 99999999),
  status public.einvoice_status not null default 'pending',
  environment text not null default 'beta' check (environment in ('beta', 'production')),
  sunat_code text,
  sunat_description text,
  sunat_notes text[] not null default '{}',
  -- Valor de resumen (DigestValue de la firma): va en el QR de la representación impresa.
  hash text,
  xml text,
  cdr_xml text,
  attempts integer not null default 0,
  sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, series, number),
  foreign key (pharmacy_id, sale_id) references public.sales (pharmacy_id, id) on delete restrict,
  constraint einvoices_series_type_chk check ((doc_type = '01' and series like 'F%') or (doc_type = '03' and series like 'B%'))
);
create index einvoices_pharmacy_created_idx on public.einvoices (pharmacy_id, created_at desc);
create trigger einvoices_set_updated_at before update on public.einvoices
  for each row execute function private.set_updated_at();

alter table public.einvoices enable row level security;
create policy einvoices_select on public.einvoices
  for select to authenticated using (private.is_member(pharmacy_id));
revoke all on public.einvoices from anon, authenticated;
grant select (id, pharmacy_id, sale_id, doc_type, series, number, status, environment, sunat_code,
              sunat_description, sunat_notes, hash, attempts, sent_at, created_at, updated_at)
  on public.einvoices to authenticated;
-- xml y cdr_xml no se exponen por la API general (se descargan aparte si hiciera falta).

-- ---------- RPC: reservar el comprobante de una venta ----------
-- Idempotente: si la venta ya tiene comprobante, lo devuelve. Decide tipo y serie y toma el siguiente número.
create function public.reserve_einvoice(p_sale uuid)
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
  select * into v_row from public.einvoices e where e.sale_id = p_sale;
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
revoke execute on function public.reserve_einvoice(uuid) from public, anon;
grant execute on function public.reserve_einvoice(uuid) to authenticated;

-- ---------- No anular una venta con comprobante aceptado por SUNAT ----------
create function private.block_void_with_einvoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'voided' and old.status <> 'voided' and exists (
    select 1 from public.einvoices e where e.sale_id = new.id and e.status in ('accepted', 'observed')
  ) then
    raise exception 'einvoice_issued' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.block_void_with_einvoice() from public, anon;
create trigger sales_block_void_with_einvoice before update of status on public.sales
  for each row execute function private.block_void_with_einvoice();
