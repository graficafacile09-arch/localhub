-- =================================================================
-- LocalHub — Colonne aggiuntive per i campi AI arricchiti
-- =================================================================
-- Aggiunge colonne per descrizione_completa, caratteristiche,
-- peso_volume, filtri_catalogo, seo_title, seo_description,
-- alt_text_immagine.
--
-- Esegui nel Supabase Dashboard SQL Editor:
--   https://supabase.com/dashboard/project/favrminotoawoxhehshh/sql/new
-- =================================================================

begin;

-- Descrizione completa (scheda prodotto dettagliata)
alter table if exists public.prodotti
  add column if not exists descrizione_completa text;

-- Caratteristiche principali (array di stringhe)
alter table if exists public.prodotti
  add column if not exists caratteristiche text[];

-- Peso o volume leggibile dall'etichetta
alter table if exists public.prodotti
  add column if not exists peso_volume text;

-- Attributi filtro catalogo (JSONB per flessibilità)
alter table if exists public.prodotti
  add column if not exists filtri_catalogo jsonb;

-- SEO title (max 60 caratteri)
alter table if exists public.prodotti
  add column if not exists seo_title text;

-- Meta description SEO (max 160 caratteri)
alter table if exists public.prodotti
  add column if not exists seo_description text;

-- Testo alternativo immagine per accessibilità
alter table if exists public.prodotti
  add column if not exists alt_text_immagine text;

commit;
