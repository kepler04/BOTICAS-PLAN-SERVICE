-- =====================================================================
-- Fase 6: codigo del producto en el catalogo de DIGEMID.
-- Lo necesita el reporte mensual de precios al Observatorio de Productos Farmaceuticos (obligatorio para
-- establecimientos que venden medicamentos: DS 014-2011-SA art. 30, RM 040-2010/MINSA). El sistema
-- exporta la lista de precios con este codigo; el envio se hace en la plataforma de DIGEMID.
-- Ver ADR 065.
-- =====================================================================

alter table public.products
  add column digemid_code text check (digemid_code is null or digemid_code ~ '^\d{1,10}$');

grant insert (digemid_code), update (digemid_code) on public.products to authenticated;
