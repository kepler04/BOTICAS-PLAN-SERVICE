-- =====================================================================
-- Fase 6: registro diario de temperatura y humedad (control sanitario).
--  * Las fiscalizaciones sancionan a boticas sin registro diario de temperatura (DS 014-2011-SA, art. 36;
--    ver docs/COMPARATIVA.md). Un registro computarizado vale si esta al dia.
--  * Dos areas: ambiente (almacen y anaqueles) y refrigeracion (cadena de frio).
--  * Las lecturas son INMUTABLES: no se editan ni se borran. Una correccion es otra lectura con nota.
--  * Fuera de rango exige una nota (que se hizo al respecto), igual que una diferencia de caja.
--  * Los rangos son valores de REFERENCIA (ambiente 15-30 °C y humedad hasta 70 %; refrigeracion 2-8 °C):
--    la botica debe confirmarlos con su quimico farmaceutico segun lo que indique cada producto.
-- Ver ADR 063-064.
-- =====================================================================

create type public.environment_area as enum ('room', 'fridge');

create table public.environment_readings (
  id bigint generated always as identity primary key,
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  branch_id uuid not null,
  area public.environment_area not null,
  temperature numeric(4, 1) not null check (temperature between -30 and 60),
  humidity numeric(4, 1) check (humidity between 0 and 100),
  out_of_range boolean not null,
  note text check (note is null or char_length(note) <= 300),
  -- Dia en hora de Lima (lo fija la RPC; el cliente no lo elige: no se puede registrar "ayer").
  recorded_on date not null,
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now(),
  idempotency_key uuid unique,
  foreign key (pharmacy_id, branch_id)
    references public.branches (pharmacy_id, id) on delete restrict,
  constraint environment_humidity_area_chk check (area = 'room' or humidity is null),
  constraint environment_note_chk check (not out_of_range or char_length(btrim(coalesce(note, ''))) >= 3)
);
create index environment_readings_branch_day_idx
  on public.environment_readings (branch_id, recorded_on desc, recorded_at desc);

alter table public.environment_readings enable row level security;
create policy environment_readings_select on public.environment_readings
  for select to authenticated using (private.is_member(pharmacy_id));
revoke all on public.environment_readings from anon, authenticated;
grant select on public.environment_readings to authenticated;

-- Rangos de referencia: unico lugar de los valores (el front los lee de aqui).
create function public.environment_limits()
returns table (area public.environment_area, temp_min numeric, temp_max numeric, humidity_max numeric)
language sql
immutable
set search_path = ''
as $$
  values ('room'::public.environment_area, 15.0, 30.0, 70.0),
         ('fridge'::public.environment_area, 2.0, 8.0, null::numeric)
$$;
revoke execute on function public.environment_limits() from public, anon;
grant execute on function public.environment_limits() to authenticated;

-- ---------- RPC: registrar una lectura (cualquier miembro activo) ----------
create function public.record_environment_reading(
  p_branch uuid,
  p_area public.environment_area,
  p_temperature numeric,
  p_humidity numeric default null,
  p_note text default null,
  p_idempotency_key uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pharmacy uuid;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_out boolean;
  v_lim record;
  v_id bigint;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select b.pharmacy_id into v_pharmacy from public.branches b where b.id = p_branch and b.active;
  if v_pharmacy is null or not private.is_member(v_pharmacy) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
    select e.id into v_id from public.environment_readings e
    where e.idempotency_key = p_idempotency_key and e.pharmacy_id = v_pharmacy;
    if found then
      return v_id;
    end if;
  end if;

  if p_area is null or p_temperature is null or p_temperature not between -30 and 60
     or p_temperature <> pg_catalog.round(p_temperature, 1) then
    raise exception 'invalid_temperature' using errcode = '22023';
  end if;
  if p_area = 'fridge' and p_humidity is not null then
    raise exception 'invalid_humidity' using errcode = '22023';
  end if;
  if p_humidity is not null and (p_humidity not between 0 and 100 or p_humidity <> pg_catalog.round(p_humidity, 1)) then
    raise exception 'invalid_humidity' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 300 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  select * into v_lim from public.environment_limits() l where l.area = p_area;
  v_out := p_temperature < v_lim.temp_min or p_temperature > v_lim.temp_max
           or (v_lim.humidity_max is not null and p_humidity is not null and p_humidity > v_lim.humidity_max);
  if v_out and (v_note is null or pg_catalog.char_length(v_note) < 3) then
    raise exception 'note_required' using errcode = 'P0001';
  end if;

  insert into public.environment_readings
    (pharmacy_id, branch_id, area, temperature, humidity, out_of_range, note, recorded_on,
     recorded_by, idempotency_key)
  values
    (v_pharmacy, p_branch, p_area, p_temperature, p_humidity, v_out, v_note,
     (now() at time zone 'America/Lima')::date, v_user, p_idempotency_key)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.record_environment_reading(uuid, public.environment_area, numeric, numeric, text, uuid)
  from public, anon;
grant execute on function public.record_environment_reading(uuid, public.environment_area, numeric, numeric, text, uuid)
  to authenticated;
