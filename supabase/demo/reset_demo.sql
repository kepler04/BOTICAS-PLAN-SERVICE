-- Borra por completo la botica de DEMOSTRACION y sus dos usuarios (demo@ y cajero@boticas-erp.demo).
-- No toca ninguna otra botica ni usuario. Se ejecuta con:  npm run demo:reset
-- (Una sola sentencia DO, igual que seed_demo.sql.)
do $reset$
declare
  v_admin uuid;
  v_cashier uuid;
  v_ph uuid;
begin
  select u.id into v_admin from auth.users u where u.email = 'demo@boticas-erp.demo';
  select u.id into v_cashier from auth.users u where u.email = 'cajero@boticas-erp.demo';

  select m.pharmacy_id into v_ph
  from public.pharmacy_members m
  where m.user_id = v_admin
  limit 1;

  if v_ph is not null then
    -- Orden por dependencias. Borrar membresias genera filas de auditoria, por eso audit_log va despues.
    delete from public.inventory_movements where pharmacy_id = v_ph;
    delete from public.sale_item_lots where pharmacy_id = v_ph;
    delete from public.sale_items where pharmacy_id = v_ph;
    delete from public.sales where pharmacy_id = v_ph;
    delete from public.cash_movements where pharmacy_id = v_ph;
    delete from public.cash_sessions where pharmacy_id = v_ph;
    delete from public.receipt_sequences where pharmacy_id = v_ph;
    delete from public.customers where pharmacy_id = v_ph;
    delete from public.purchase_items where pharmacy_id = v_ph;
    delete from public.purchases where pharmacy_id = v_ph;
    delete from public.suppliers where pharmacy_id = v_ph;
    delete from public.environment_readings where pharmacy_id = v_ph;
    delete from public.lots where pharmacy_id = v_ph;
    delete from public.products where pharmacy_id = v_ph;
    delete from public.categories where pharmacy_id = v_ph;
    -- La regla "nunca sin administrador" protege la API; este borrado total es mantenimiento, no una operacion de la app.
    alter table public.pharmacy_members disable trigger pharmacy_members_protect_last_admin;
    delete from public.pharmacy_members where pharmacy_id = v_ph;
    alter table public.pharmacy_members enable trigger pharmacy_members_protect_last_admin;
    delete from public.audit_log where pharmacy_id = v_ph;
    delete from public.branches where pharmacy_id = v_ph;
    delete from public.pharmacies where id = v_ph;
  end if;

  delete from auth.users where id in (coalesce(v_admin, '00000000-0000-0000-0000-000000000000'),
                                      coalesce(v_cashier, '00000000-0000-0000-0000-000000000000'));
end
$reset$;
