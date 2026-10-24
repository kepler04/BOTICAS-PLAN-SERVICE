-- Fase 5 (paso 1): pago con tarjeta (POS Visa/Mastercard), muy comun en boticas.
-- Va en una migracion aparte: Postgres no permite USAR un valor de enum recien agregado
-- dentro de la misma transaccion.
alter type public.payment_method add value if not exists 'card';
