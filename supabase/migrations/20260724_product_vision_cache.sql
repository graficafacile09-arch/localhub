-- =================================================================
-- LocalHub — Cache intelligente per riconoscimento prodotti AI
-- =================================================================
-- Quando un prodotto viene riconosciuto dall'AI, il risultato viene
-- salvato in questa tabella usando un perceptual hash dell'immagine.
-- La volta successiva, il sistema controlla prima la cache,
-- evitando di chiamare l'AI per la stessa immagine.
--
-- Esegui nel Supabase Dashboard SQL Editor:
--   https://supabase.com/dashboard/project/favrminotoawoxhehshh/sql/new
-- =================================================================

begin;

create table if not exists public.product_vision_cache (
  id uuid primary key default gen_random_uuid(),

  -- Perceptual hash dell'immagine (64-bit, hex encoded)
  image_hash text not null,

  -- Campi principali per query rapide
  product_name text not null,
  brand text,
  category text,

  -- EAN se riconosciuto dal modello
  ean text,

  -- Altri dati della risposta
  suggested_price numeric,
  description text,
  confidence integer not null default 0,

  -- Metadati
  model_used text not null,
  hit_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  full_suggestion jsonb
);

-- Indice unico sul perceptual hash (match esatto)
create unique index if not exists product_vision_cache_hash_idx
  on public.product_vision_cache (image_hash);

-- Indice per ricerca per nome prodotto (futuro: fuzzy matching)
create index if not exists product_vision_cache_name_idx
  on public.product_vision_cache (product_name text_pattern_ops);

-- Indice per ricerca per brand
create index if not exists product_vision_cache_brand_idx
  on public.product_vision_cache (brand);

-- Indice per EAN
create index if not exists product_vision_cache_ean_idx
  on public.product_vision_cache (ean);

-- Trigger per updated_at
drop trigger if exists product_vision_cache_set_updated_at on public.product_vision_cache;
create trigger product_vision_cache_set_updated_at
  before update on public.product_vision_cache
  for each row execute function public.set_updated_at();

-- RLS: lettura pubblica (tutti possono leggere la cache)
alter table public.product_vision_cache enable row level security;

create policy if not exists "vision cache public read"
  on public.product_vision_cache for select
  using (true);

create policy if not exists "vision cache public insert"
  on public.product_vision_cache for insert
  with check (true);

create policy if not exists "vision cache public update"
  on public.product_vision_cache for update
  using (true) with check (true);

notify pgrst, 'reload schema';

commit;
