-- InCittà — RESTRINGE LA LETTURA DI product_vision_cache
--
-- La cache delle scansioni prodotto conteneva dati di lavoro dei negozianti
-- (nome, brand, EAN, descrizione e suggerimento completo generato dall'AI) ed
-- era leggibile con la chiave anon, che è pubblica nel bundle client.
--
-- Tutti gli accessi applicativi passano dal client service-role
-- (lib/product-assistant/vision-cache.ts e le query admin), che bypassa la
-- RLS: rimuovere la policy pubblica non cambia il comportamento del sito.
--
-- Idempotente: si può rieseguire senza errori.

begin;

alter table public.product_vision_cache enable row level security;

drop policy if exists "vision cache public read" on public.product_vision_cache;

-- Difesa in profondità: nessun grant di lettura ai ruoli pubblici, anche se in
-- futuro venisse ricreata una policy permissiva.
revoke select on table public.product_vision_cache from anon, authenticated;

notify pgrst, 'reload schema';

commit;
