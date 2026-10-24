-- Fase 3 (paso 1): nuevos tipos de movimiento de inventario.
-- Va en una migracion aparte: Postgres no permite USAR un valor de enum recien agregado
-- dentro de la misma transaccion (los usa la migracion siguiente).
alter type public.movement_type add value if not exists 'sale';
alter type public.movement_type add value if not exists 'sale_void';
