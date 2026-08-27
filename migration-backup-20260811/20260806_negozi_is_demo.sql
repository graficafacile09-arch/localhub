-- =================================================================
-- LocalHub — negozi.is_demo: filtro DEFINITIVO dei dati demo
-- =================================================================
-- I negozi demo/seed non devono MAI comparire nell'Area Amministratore.
-- Prima: filtro per nome in TypeScript (fragile: i seed usano nomi
-- realistici come "Panificio Rossi"). Ora: colonna is_demo valorizzata
-- in backfill per i dati esistenti. Il codice legge la colonna quando
-- disponibile (con fallback per nome/slug per i DB non migrati).
-- =================================================================
begin;

alter table public.negozi
  add column if not exists is_demo boolean not null default false;

-- Backfill: i negozi seed (slug "demo-…"), i negozi dei test E2E
-- (nomi "E2E …" / "Negozio Rinominato …") e i residui dei benchmark di
-- visione artificiale (slug "test-store-vision-…") diventano is_demo.
update public.negozi
set is_demo = true
where is_demo = false
  and (
    slug like 'demo-%'
    or slug like 'test-store-vision-%'
    or nome ~ '^(E2E|Negozio Rinominato)[[:space:]]'
  );

create index if not exists negozi_is_demo_idx
  on public.negozi (is_demo)
  where is_demo = true;

notify pgrst, 'reload schema';

commit;
