-- =================================================================
-- LocalHub — Pulizia definitiva dei negozi di test creati durante gli E2E
-- =================================================================
-- Elimina TUTTI i negozi di test creati durante gli E2E:
--   - nome che inizia con "E2E"  ("E2E …", "E2E Test …", "E2E Demo …")
--   - nome che inizia con "Duplicato" ("Duplicato …", "Duplicato di …",
--     "Duplicato - …")
--   - slug "e2e-…" / "duplicato…" (variante "Negozio Rinominato" degli E2E)
-- NON elimina: negozi demo ufficiali della piattaforma (slug "demo-…"),
-- template, negozi reali, negozi degli utenti.
-- Elimina inoltre, mantenendo l'integrità referenziale, tutti i record
-- collegati esclusivamente a questi negozi: prodotti, product_media,
-- media, preferiti e scan_log.
-- Idempotente: al secondo run non trova alcun record da eliminare.
-- =================================================================
begin;

-- 1) Negozi di test individuati (E2E / Duplicato / varianti slug).
create temp table negozi_e2e on commit drop as
  select id, nome, slug
  from public.negozi
  where nome ilike 'E2E%'
     or nome ilike 'Duplicato%'
     or slug ilike 'e2e-%'
     or slug ilike 'duplicato%';

-- 2) Prodotti appartenenti ESCLUSIVAMENTE a questi negozi.
create temp table prodotti_e2e on commit drop as
  select id, negozio_id
  from public.prodotti
  where negozio_id in (select id::text from negozi_e2e);

-- 3) Record collegati: eliminazione in ordine (integrità referenziale).
delete from public.product_media
where product_id in (select id::text from prodotti_e2e);

delete from public.preferiti
where (tipo = 'prodotto' and riferimento_id in (select id::text from prodotti_e2e))
   or (tipo = 'negozio'  and riferimento_id in (select id::text from negozi_e2e));

delete from public.prodotti
where negozio_id in (select id::text from negozi_e2e);

delete from public.media
where negozio_id in (select id from negozi_e2e);

delete from public.scan_log
where negozio_id in (select id::text from negozi_e2e);

-- 4) Negozi di test (l'eventuale FK da media ha ON DELETE CASCADE).
delete from public.negozi
where id in (select id from negozi_e2e);

-- 5) Resoconto dell'operazione.
select
  (select count(*) from negozi_e2e)   as negozi_eliminati,
  (select count(*) from prodotti_e2e) as prodotti_eliminati;

notify pgrst, 'reload schema';

commit;
