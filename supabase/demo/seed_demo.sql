-- =====================================================================
-- DATOS DE DEMOSTRACION (ficticios). NO usar datos reales aqui.
--
-- Crea una botica ficticia con ~45 dias de historia. No inserta ventas "a mano": el script
-- ACTUA como el cajero y el admin y llama a las funciones reales (register_pharmacy,
-- register_stock_entry, register_purchase, open_cash_session, create_sale, void_sale,
-- close_cash_session, record_environment_reading...),
-- y despues fecha los registros hacia atras. Asi los datos son coherentes por construccion.
--
-- Fase 6: proveedores y compras, clientes en algunas ventas (DNI/RUC FICTICIOS: los RUC solo cumplen el
-- digito verificador), 30 dias de temperatura y codigos DIGEMID FICTICIOS en parte del catalogo.
--
-- Usuarios (contrasenas publicas, solo para la demo):
--   admin  : demo@boticas-erp.demo    / DemoBotica2026
--   cajero : cajero@boticas-erp.demo  / DemoBotica2026
--
-- Ejecutar con:  npm run demo:seed     (restablecer: npm run demo:reset)
-- Es UNA sola sentencia DO (el CLI de Supabase no acepta varias sentencias por archivo).
-- Es repetible: si la demo ya existe, se niega (primero demo:reset).
-- =====================================================================
do $seed$
declare
  v_admin   uuid := 'd3300000-0000-4000-8000-000000000001';
  v_cashier uuid := 'd3300000-0000-4000-8000-000000000002';
  v_today   date := (now() at time zone 'America/Lima')::date;
  v_pharmacy uuid;
  v_branch   uuid;
  r record;
  v_ids  uuid[] := '{}';
  v_upb  integer[] := '{}';
  v_upx  integer[] := '{}';
  v_count integer;
  v_qty integer;
  v_left integer;
  v_take integer;
  lot record;
  v_cat uuid;
  v_pid uuid;
  v_ts timestamptz;
  d integer;
  k integer;
  l integer;
  v_day date;
  v_dow integer;
  v_actor uuid;
  v_session uuid;
  v_n integer;
  v_cnt integer;
  v_lines integer;
  v_idx integer;
  v_r numeric;
  v_pres text;
  v_q integer;
  v_items jsonb;
  v_method text;
  v_sale uuid;
  v_sales uuid[];
  v_expected numeric;
  v_counted numeric;
  v_open_ts timestamptz;
  v_reasons_out text[] := array['Bolsas y papel para despacho', 'Pago de delivery', 'Limpieza del local', 'Fotocopias', 'Almuerzo del personal'];
  v_sup_andina uuid;
  v_sup_sur uuid;
  v_sup_lab uuid;
  v_purchase uuid;
  v_customer jsonb;
  -- Clientes FICTICIOS (DNI inventados).
  v_customers jsonb := '[
    {"doc_type":"dni","doc_number":"40123456","name":"Rosa Quispe Mamani"},
    {"doc_type":"dni","doc_number":"41234567","name":"Juan Pérez Huamán"},
    {"doc_type":"dni","doc_number":"42345678","name":"Lucía Flores Rojas"},
    {"doc_type":"dni","doc_number":"43456789","name":"Carlos Mendoza Ríos"},
    {"doc_type":"ce","doc_number":"001234567","name":"Andrea González Pérez"}
  ]'::jsonb;
  v_reading bigint;
  v_temp numeric;
begin
  if exists (select 1 from auth.users where email = 'demo@boticas-erp.demo') then
    raise exception 'La demo ya existe. Ejecuta primero: npm run demo:reset';
  end if;

  perform setseed(0.42); -- demo reproducible

  -- ---------------------------------------------------------------- Usuarios
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@boticas-erp.demo',
     extensions.crypt('DemoBotica2026', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Demo"}', now(), now(), '', '', '', ''),
    (v_cashier, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cajero@boticas-erp.demo',
     extensions.crypt('DemoBotica2026', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Cajero Demo"}', now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', u.id::text, now(), now(), now()
  from auth.users u where u.id in (v_admin, v_cashier);

  -- ---------------------------------------------------------------- Botica (como admin)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_pharmacy := public.register_pharmacy('Botica Demo Salud y Vida S.A.C.', 'Botica Demo Salud y Vida', null);
  select b.id into v_branch from public.branches b where b.pharmacy_id = v_pharmacy and b.is_main;

  -- El cajero se agrega como miembro (en la app lo hara la Edge Function invite-user).
  reset role;
  insert into public.pharmacy_members (pharmacy_id, user_id, role) values (v_pharmacy, v_cashier, 'cashier');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ---------------------------------------------------------------- Proveedores (FICTICIOS)
  insert into public.suppliers (pharmacy_id, name, ruc, phone, email)
  values (v_pharmacy, 'Droguería Andina SAC', '20600000013', '01 555 0101', 'pedidos@andina.demo')
  returning id into v_sup_andina;
  insert into public.suppliers (pharmacy_id, name, ruc, phone)
  values (v_pharmacy, 'Distribuidora Farma Sur EIRL', '20600000021', '054 555 0202')
  returning id into v_sup_sur;
  insert into public.suppliers (pharmacy_id, name, ruc)
  values (v_pharmacy, 'Laboratorios Unidos del Perú SA', '20600000030')
  returning id into v_sup_lab;

  -- ---------------------------------------------------------------- Catalogo + stock inicial
  -- (nombre, generico, concentracion, categoria, unidad, u/blister, u/caja, precio unidad, precio blister, precio caja,
  --  stock minimo, receta, costo por unidad, stock inicial, vence lote A (dias), vence lote B (dias))
  for r in
    select row_number() over () as n, * from (values
      ('Paracetamol 500 mg','Paracetamol','500 mg','Analgésicos y antipiréticos','tableta',10,100,0.30,2.80,25.00,200,false,0.12,900,120,400),
      ('Ibuprofeno 400 mg','Ibuprofeno','400 mg','Antiinflamatorios','tableta',10,100,0.50,4.50,40.00,150,false,0.22,700,90,380),
      ('Naproxeno 550 mg','Naproxeno','550 mg','Antiinflamatorios','tableta',10,100,0.80,7.50,70.00,100,false,0.35,400,200,420),
      ('Diclofenaco 50 mg','Diclofenaco sódico','50 mg','Antiinflamatorios','tableta',10,100,0.40,3.80,34.00,100,false,0.15,500,150,450),
      ('Amoxicilina 500 mg','Amoxicilina','500 mg','Antibióticos','cápsula',10,100,1.00,9.00,80.00,100,true,0.40,400,100,360),
      ('Azitromicina 500 mg','Azitromicina','500 mg','Antibióticos','tableta',3,30,4.50,12.00,110.00,30,true,1.80,90,12,300),
      ('Ciprofloxacino 500 mg','Ciprofloxacino','500 mg','Antibióticos','tableta',10,100,1.20,11.00,100.00,60,true,0.50,200,70,300),
      ('Loratadina 10 mg','Loratadina','10 mg','Antialérgicos','tableta',10,100,0.40,3.50,30.00,80,false,0.14,450,140,400),
      ('Cetirizina 10 mg','Cetirizina','10 mg','Antialérgicos','tableta',10,100,0.45,4.00,36.00,80,false,0.16,380,160,400),
      ('Omeprazol 20 mg','Omeprazol','20 mg','Gastrointestinales','cápsula',14,98,0.70,9.00,60.00,100,false,0.25,500,110,390),
      ('Sales de rehidratación oral','Sales de rehidratación','27.9 g','Gastrointestinales','sobre',null,null,1.80,null,null,40,false,0.90,120,80,300),
      ('Vitamina C 1 g efervescente','Ácido ascórbico','1 g','Vitaminas y suplementos','tableta',10,100,0.90,8.00,70.00,60,false,0.40,300,300,420),
      ('Complejo B','Vitaminas del complejo B',null,'Vitaminas y suplementos','tableta',10,100,0.60,5.50,48.00,50,false,0.25,250,250,420),
      ('Jarabe para la tos 120 ml','Dextrometorfano','15 mg/5 ml','Respiratorios','frasco',null,null,14.90,null,null,15,false,8.00,60,30,300),
      ('Ambroxol jarabe 120 ml','Ambroxol','15 mg/5 ml','Respiratorios','frasco',null,null,12.50,null,null,8,false,6.50,24,200,350),
      ('Alcohol medicinal 70° 250 ml','Alcohol etílico','70°','Primeros auxilios','frasco',null,null,5.50,null,null,12,false,3.00,48,300,600),
      ('Agua oxigenada 120 ml','Peróxido de hidrógeno','3 %','Primeros auxilios','frasco',null,null,3.50,null,null,10,false,1.80,36,300,500),
      ('Gasas estériles 10×10','Gasa estéril',null,'Primeros auxilios','sobre',null,50,0.60,null,25.00,100,false,0.30,250,400,700),
      ('Curitas (apósitos)','Apósito adhesivo',null,'Primeros auxilios','unidad',null,100,0.30,null,25.00,150,false,0.12,300,600,800),
      ('Mascarilla quirúrgica','Mascarilla de 3 capas',null,'Cuidado personal','unidad',null,50,0.50,null,20.00,100,false,0.20,300,500,700),
      ('Toallitas húmedas','Toallitas húmedas',null,'Cuidado personal','paquete',null,null,6.50,null,null,10,false,3.50,40,400,700),
      ('Protector solar FPS 50','Protector solar','FPS 50','Cuidado personal','tubo',null,null,38.00,null,null,5,false,22.00,40,300,600),
      ('Diclofenaco gel 1 %','Diclofenaco','1 %','Antiinflamatorios','tubo',null,null,11.90,null,null,8,false,6.00,40,200,400),
      ('Salbutamol inhalador','Salbutamol','100 mcg','Respiratorios','frasco',null,null,18.00,null,null,6,true,10.00,20,150,400),
      ('Metformina 850 mg','Metformina','850 mg','Otros','tableta',10,100,0.35,3.20,28.00,100,true,0.12,300,200,420),
      ('Losartán 50 mg','Losartán','50 mg','Otros','tableta',10,100,0.45,4.00,36.00,100,true,0.14,300,180,420),
      ('Clotrimazol crema 20 g','Clotrimazol','1 %','Otros','tubo',null,null,9.50,null,null,8,false,4.80,30,20,350),
      -- Va al FINAL para no mover los indices de arriba. Es la ALTERNATIVA de 'Diclofenaco 50 mg' (agotado al final):
      -- mismo principio activo, otra concentracion (el POS avisa que hay que confirmarlo).
      ('Diclofenaco 75 mg','Diclofenaco sódico','75 mg','Antiinflamatorios','ampolla',null,10,2.50,null,20.00,20,true,1.00,60,150,420)
    ) as t (name, gen, conc, cat, unit, upb, upx, p_unit, p_blister, p_box, min_stock, rx, cost, qty, exp_a, exp_b)
  loop
    select c.id into v_cat from public.categories c where c.pharmacy_id = v_pharmacy and c.name = r.cat;
    v_pid := gen_random_uuid();
    insert into public.products (id, pharmacy_id, category_id, name, generic_name, concentration, barcode,
                                 requires_prescription, unit_label, units_per_blister, units_per_box,
                                 price_unit, price_blister, price_box, min_stock)
    values (v_pid, v_pharmacy, v_cat, r.name, r.gen, r.conc, '7750' || lpad(r.n::text, 9, '0'),
            r.rx, r.unit, r.upb, r.upx, r.p_unit, r.p_blister, r.p_box, r.min_stock);

    -- Dos lotes: el A vence antes (FEFO lo vende primero) y recibe ~40 % del stock.
    v_qty := (r.qty * case when r.upb is null then 3 else 2 end)::int;
    perform public.register_stock_entry(v_branch, v_pid, 'L' || lpad(r.n::text, 3, '0') || '-A',
                                        current_date + r.exp_a, (v_qty * 0.4)::int, r.cost);
    perform public.register_stock_entry(v_branch, v_pid, 'L' || lpad(r.n::text, 3, '0') || '-B',
                                        current_date + r.exp_b, v_qty - (v_qty * 0.4)::int, r.cost);
    v_ids := v_ids || v_pid;
    v_upb := v_upb || coalesce(r.upb, 0);
    v_upx := v_upx || coalesce(r.upx, 0);
  end loop;
  v_count := array_length(v_ids, 1);

  -- Accesorio sin vencimiento (termometro): el producto no vence.
  v_pid := gen_random_uuid();
  insert into public.products (id, pharmacy_id, category_id, name, barcode, unit_label, price_unit, min_stock)
  values (v_pid, v_pharmacy, (select c.id from public.categories c where c.pharmacy_id = v_pharmacy and c.name = 'Cuidado personal'),
          'Termómetro digital', '7750' || lpad((v_count + 1)::text, 9, '0'), 'unidad', 22.00, 4);
  perform public.register_stock_entry(v_branch, v_pid, 'T-001', null, 12, 12.00);

  -- Un lote YA VENCIDO (para mostrar la alerta): se crea con fecha futura y luego se corrige.
  perform public.register_stock_entry(v_branch, v_ids[13], 'L013-OLD', current_date + 30, 20, 0.25);

  -- Fechar la carga inicial hace 55 dias (como superusuario).
  reset role;
  v_ts := ((v_today - 55)::timestamp + time '09:00') at time zone 'America/Lima';
  update public.inventory_movements set created_at = v_ts where pharmacy_id = v_pharmacy and type = 'entry';
  update public.lots set created_at = v_ts where pharmacy_id = v_pharmacy;
  update public.lots set expiry_date = current_date - 12 where pharmacy_id = v_pharmacy and lot_code = 'L013-OLD';
  update public.pharmacies set created_at = now() - interval '60 days' where id = v_pharmacy;
  -- Ejemplo FICTICIO de producto inafecto al IGV (la lista oficial la define el MINSA por decreto supremo).
  -- El resto de productos queda gravado (18 %). Los costos de los lotes son SIN IGV.
  update public.products set tax_affectation = 'inafecto' where pharmacy_id = v_pharmacy and name = 'Metformina 850 mg';

  -- ---------------------------------------------------------------- 45 dias de operacion
  for d in reverse 45..0 loop
    v_day := v_today - d;
    v_dow := extract(dow from v_day)::int;

    -- Algunos domingos la botica no abre.
    if d > 0 and v_dow = 0 and random() < 0.5 then
      continue;
    end if;

    -- Reposicion a mitad del periodo (admin): COMPRA a la drogueria; los 8 productos mas vendidos reciben un lote nuevo.
    if d = 20 then
      perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      set local role authenticated;
      v_items := '[]'::jsonb;
      for l in 1..8 loop
        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'product_id', v_ids[l], 'lot_code', 'REP' || lpad(l::text, 3, '0'),
          'expiry_date', current_date + 365, 'quantity', 300, 'unit_cost', 0.20 + l * 0.02));
      end loop;
      v_purchase := public.register_purchase(v_branch, v_sup_andina, 'invoice', 'F001-004512', v_day, v_items,
                                             'Reposición quincenal');
      reset role;
      v_ts := ((v_day)::timestamp + time '10:00') at time zone 'America/Lima';
      update public.inventory_movements set created_at = v_ts
        where pharmacy_id = v_pharmacy and type = 'entry' and created_at > now() - interval '5 minutes';
      update public.lots set created_at = v_ts where pharmacy_id = v_pharmacy and lot_code like 'REP%';
      update public.purchases set created_at = v_ts where id = v_purchase;
      update public.audit_log set created_at = v_ts where entity_id = v_purchase;
    end if;

    -- Abre caja (70 % el cajero, 30 % el admin).
    v_actor := case when random() < 0.7 then v_cashier else v_admin end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_session := public.open_cash_session(v_branch, (array[50, 100, 100, 150, 200])[1 + floor(random() * 5)::int]);

    v_n := case when d = 0 then 7 else 6 + floor(random() * 9)::int + case when v_dow in (5, 6) then 4 else 0 end end;
    v_sales := '{}';

    for k in 1..v_n loop
      v_items := '[]'::jsonb;
      v_lines := 1 + floor(random() * 3)::int;
      for l in 1..v_lines loop
        -- Los primeros productos del catalogo son los mas vendidos (sesgo hacia indices bajos).
        v_idx := 1 + floor(power(random(), 1.6) * v_count)::int;
        v_r := random();
        if v_upx[v_idx] > 0 and v_r > 0.97 then
          v_pres := 'box'; v_q := 1;
        elsif v_upb[v_idx] > 0 and v_r > 0.78 then
          v_pres := 'blister'; v_q := 1 + floor(random() * 2)::int;
        else
          v_pres := 'unit'; v_q := 1 + floor(random() * 3)::int;
        end if;
        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'product_id', v_ids[v_idx], 'presentation', v_pres, 'quantity', v_q));
      end loop;

      v_r := random();
      v_method := case when v_r < 0.50 then 'cash' when v_r < 0.75 then 'yape' when v_r < 0.88 then 'plin' else 'card' end;
      -- Algunos clientes piden boleta con su DNI (opcional por debajo de S/ 700).
      v_customer := case when random() < 0.12 then v_customers -> floor(random() * 5)::int else null end;
      begin
        v_sale := public.create_sale(
          v_branch, v_items, v_method::public.payment_method,
          case when v_method = 'cash' then 1000 else null end,
          case when v_method <> 'cash' then 'OP-' || lpad((100000 + floor(random() * 900000))::int::text, 6, '0') else null end,
          null, v_customer);
        v_sales := v_sales || v_sale;
      exception when others then
        null; -- sin stock suficiente: esa venta no se hace
      end;
    end loop;

    -- Un ingreso/egreso de caja ocasional.
    if random() < 0.4 then
      perform public.add_cash_movement(v_session, 'expense', (3 + floor(random() * 18))::numeric,
                                       v_reasons_out[1 + floor(random() * 5)::int]);
    end if;
    if random() < 0.15 then
      perform public.add_cash_movement(v_session, 'income', 20, 'Sencillo del banco');
    end if;

    -- Cada tanto el admin anula una venta del turno.
    if array_length(v_sales, 1) > 0 and random() < 0.15 then
      perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      perform public.void_sale(v_sales[1 + floor(random() * array_length(v_sales, 1))::int], 'Error de cobro');
      perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
    end if;

    -- Cierra la caja (salvo la de hoy, que queda abierta). A veces hay una pequena diferencia.
    if d > 0 then
      select s.expected_cash into v_expected from public.cash_session_summary s where s.id = v_session;
      v_counted := v_expected + case when random() < 0.15 then (array[-2, -1, 0.5, 1, -5])[1 + floor(random() * 5)::int] else 0 end;
      perform public.close_cash_session(v_session, v_counted,
                                        case when v_counted <> v_expected then 'Diferencia al contar: vuelto mal dado' end);
    end if;

    -- Fechar el turno (como superusuario).
    reset role;
    select count(*) into v_cnt from public.sales where cash_session_id = v_session;
    if d > 0 then
      v_open_ts := ((v_day)::timestamp + time '08:00') at time zone 'America/Lima';
      update public.cash_sessions
        set opened_at = v_open_ts, closed_at = ((v_day)::timestamp + time '21:00') at time zone 'America/Lima'
        where id = v_session;
      update public.sales s
        set created_at = v_open_ts + (x.rk * (interval '12 hours 30 minutes' / (v_cnt + 1)))
        from (select id, row_number() over (order by receipt_number) as rk
              from public.sales where cash_session_id = v_session) x
        where s.id = x.id;
    else
      update public.sales s
        set created_at = now() - ((v_cnt - x.rk + 1) * interval '19 minutes')
        from (select id, row_number() over (order by receipt_number) as rk
              from public.sales where cash_session_id = v_session) x
        where s.id = x.id;
      update public.cash_sessions
        set opened_at = now() - ((v_cnt + 1) * interval '19 minutes') - interval '12 minutes'
        where id = v_session;
    end if;
    update public.sales set voided_at = created_at + interval '6 minutes'
      where cash_session_id = v_session and status = 'voided';
    -- Efectivo realista: se recibe el siguiente multiplo de S/ 10 (no S/ 1000).
    update public.sales
      set amount_received = ceil(total / 10.0) * 10, change_given = ceil(total / 10.0) * 10 - total
      where cash_session_id = v_session and payment_method = 'cash';
    update public.inventory_movements m
      set created_at = case when m.type = 'sale_void' then s.voided_at else s.created_at end
      from public.sales s
      where m.sale_id = s.id and s.cash_session_id = v_session;
    update public.cash_movements c
      set created_at = (select cs.opened_at from public.cash_sessions cs where cs.id = v_session) + interval '2 hours' + (c.id % 4) * interval '45 minutes'
      where c.cash_session_id = v_session;
  end loop;

  -- ---------------------------------------------------------------- Puesta en escena (como el admin)
  -- Mermas por conteo fisico: dejan unos pocos productos con stock bajo y algunos agotados (Diclofenaco 50 mg tiene alternativa).
  -- Entradas recientes de lotes que vencen pronto. Todo fechado hace 1-2 dias.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for r in select * from (values (14, 6), (16, 0), (22, 3), (25, 60), (21, 0), (4, 0)) as t (idx, keep) loop
    select coalesce(sum(l.quantity), 0)::int into v_left from public.lots l where l.product_id = v_ids[r.idx] and l.quantity > 0;
    v_left := v_left - r.keep; -- unidades a dar de baja
    for lot in select l.id, l.quantity from public.lots l where l.product_id = v_ids[r.idx] and l.quantity > 0 order by l.expiry_date loop
      exit when v_left <= 0;
      v_take := least(lot.quantity, v_left);
      perform public.adjust_stock(lot.id, -v_take, 'write_off', 'Merma: conteo fisico del inventario');
      v_left := v_left - v_take;
    end loop;
  end loop;
  -- Compra reciente (ayer) a otro proveedor: lotes que vencen pronto (alimentan las alertas).
  v_purchase := public.register_purchase(v_branch, v_sup_sur, 'invoice', 'E001-000873', v_today - 1,
    jsonb_build_array(
      jsonb_build_object('product_id', v_ids[6], 'lot_code', 'PX-AZI', 'expiry_date', current_date + 12, 'quantity', 24, 'unit_cost', 1.80),
      jsonb_build_object('product_id', v_ids[27], 'lot_code', 'PX-CLO', 'expiry_date', current_date + 20, 'quantity', 10, 'unit_cost', 4.80),
      jsonb_build_object('product_id', v_ids[8], 'lot_code', 'PX-LOR', 'expiry_date', current_date + 25, 'quantity', 80, 'unit_cost', 0.14)));
  reset role;
  update public.purchases set created_at = ((v_today - 1)::timestamp + time '11:00') at time zone 'America/Lima'
    where id = v_purchase;
  update public.inventory_movements
    set created_at = ((v_today - 1)::timestamp + time '11:00') at time zone 'America/Lima'
    where pharmacy_id = v_pharmacy and created_at > now() - interval '5 minutes';
  update public.lots set created_at = ((v_today - 1)::timestamp + time '11:00') at time zone 'America/Lima'
    where pharmacy_id = v_pharmacy and lot_code like 'PX-%';

  -- ---------------------------------------------------------------- Venta grande a una empresa (hoy)
  -- Supera S/ 700: SUNAT exige identificar al cliente (RUC FICTICIO, solo cumple el digito verificador).
  perform set_config('request.jwt.claims', json_build_object('sub', v_cashier, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.create_sale(v_branch,
      jsonb_build_array(
        jsonb_build_object('product_id', v_ids[1], 'presentation', 'box', 'quantity', 10),
        jsonb_build_object('product_id', v_ids[3], 'presentation', 'box', 'quantity', 2),
        jsonb_build_object('product_id', v_ids[2], 'presentation', 'box', 'quantity', 5),
        jsonb_build_object('product_id', v_ids[10], 'presentation', 'box', 'quantity', 3)),
      'card', null, 'OP-778812', null,
      '{"doc_type":"ruc","doc_number":"20600000048","name":"Clínica San Gabriel SAC"}'::jsonb);
  exception when others then
    raise notice 'No se pudo crear la venta grande de la demo: %', sqlerrm;
  end;
  reset role;

  -- ---------------------------------------------------------------- Temperatura: 30 dias
  -- Mañana y tarde (ambiente) y una lectura de la refrigeradora. Dos dias SIN registro (lo que observaria una
  -- inspeccion) y una tarde calurosa fuera de rango con su nota. Se registra con la RPC y luego se fecha.
  for d in reverse 29..0 loop
    continue when d in (9, 17);
    for k in 1..3 loop
      continue when d = 0 and k > 1; -- hoy solo la lectura de la mañana
      v_actor := case when random() < 0.7 then v_cashier else v_admin end;
      perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
      set local role authenticated;
      if k = 3 then
        v_temp := round((3 + random() * 4)::numeric, 1);
        v_reading := public.record_environment_reading(v_branch, 'fridge', v_temp);
      elsif d = 12 and k = 2 then
        v_reading := public.record_environment_reading(v_branch, 'room', 31.2, 58,
          'Se encendió el aire acondicionado y se volvió a medir en 1 hora (26.0 °C)');
      else
        v_temp := round((case when k = 1 then 20 else 23 end + random() * 4)::numeric, 1);
        v_reading := public.record_environment_reading(v_branch, 'room', v_temp, round((48 + random() * 17)::numeric, 1));
      end if;
      reset role;
      update public.environment_readings
        set recorded_on = v_today - d,
            recorded_at = ((v_today - d)::timestamp + case k when 1 then time '08:30' when 2 then time '15:30' else time '08:40' end)
                          at time zone 'America/Lima'
        where id = v_reading;
    end loop;
  end loop;

  -- Codigos DIGEMID FICTICIOS para los primeros 20 productos (el resto queda sin codigo: la exportacion lo avisa).
  update public.products p set digemid_code = (40000 + x.n)::text
  from (select id, row_number() over (order by created_at, id) as n from public.products where pharmacy_id = v_pharmacy) x
  where p.id = x.id and x.n <= 20;

  raise notice 'Demo lista: % productos, usuarios demo@boticas-erp.demo y cajero@boticas-erp.demo.', v_count + 1;
end
$seed$;
