-- =================================================================
-- LocalHub — Migration completa
-- Esegui tutto questo SQL nel Supabase Dashboard SQL Editor:
--   https://supabase.com/dashboard/project/favrminotoawoxhehshh/sql/new
-- =================================================================

-- ═══════════════════════════════════════════════════════════════════
-- 1. 20260720_merchant_foundation.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

create table if not exists public.merchant_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.negozi
  add column if not exists slug text,
  add column if not exists owner_user_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.prodotti
  add column if not exists immagine_principale text,
  add column if not exists quantita_disponibile integer,
  add column if not exists attivo boolean not null default true,
  add column if not exists origine_pubblicazione text not null default 'manuale',
  add column if not exists marca text,
  add column if not exists colore text,
  add column if not exists materiale text,
  add column if not exists parole_chiave text[],
  add column if not exists prezzo_suggerito numeric,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.prodotti set attivo = true where attivo is null;

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  storage_bucket text,
  storage_path text,
  public_url text,
  role text not null default 'primary' check (role in ('primary', 'gallery', 'detail')),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists prodotti_negozio_id_idx on public.prodotti(negozio_id);
create index if not exists product_media_product_id_idx on public.product_media(product_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists merchant_profiles_set_updated_at on public.merchant_profiles;
create trigger merchant_profiles_set_updated_at
before update on public.merchant_profiles
for each row execute function public.set_updated_at();

drop trigger if exists negozi_set_updated_at on public.negozi;
create trigger negozi_set_updated_at
before update on public.negozi
for each row execute function public.set_updated_at();

drop trigger if exists prodotti_set_updated_at on public.prodotti;
create trigger prodotti_set_updated_at
before update on public.prodotti
for each row execute function public.set_updated_at();

alter table public.merchant_profiles enable row level security;
alter table public.prodotti enable row level security;
alter table public.product_media enable row level security;

create policy if not exists "merchant profiles self select"
on public.merchant_profiles for select
using (auth.uid() = id);

create policy if not exists "merchant profiles self update"
on public.merchant_profiles for update
using (auth.uid() = id) with check (auth.uid() = id);

create policy if not exists "public active products read"
on public.prodotti for select
using (attivo = true);

create policy if not exists "public product media read"
on public.product_media for select
using (true);

create policy if not exists "merchant product media write"
on public.product_media for all
using (true) with check (true);

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 2. 20260721_prodotti_ai_fields.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

alter table if exists public.prodotti
  add column if not exists sottocategoria text;

alter table if exists public.prodotti
  add column if not exists stato_condizione text
    check (stato_condizione in ('nuovo', 'usato', 'ricondizionato'));

alter table if exists public.prodotti
  alter column quantita_disponibile set default 1;

update public.prodotti
set quantita_disponibile = 1
where quantita_disponibile is null;

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 3. 20260723_owner_user_id.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

alter table if exists public.negozi
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

create index if not exists negozi_owner_user_id_idx on public.negozi(owner_user_id);

create or replace function public.is_merchant_for_store(target_store_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.negozi
    where negozi.id = target_store_id::uuid
      and negozi.owner_user_id = auth.uid()
  );
$$;

alter table public.negozi enable row level security;

create policy if not exists "merchant own store select"
on public.negozi for select
using (owner_user_id = auth.uid());

create policy if not exists "merchant own store update"
on public.negozi for update
using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "merchant own products read" on public.prodotti;
drop policy if exists "merchant own products insert" on public.prodotti;
drop policy if exists "merchant own products update" on public.prodotti;

create policy if not exists "merchant own products read"
on public.prodotti for select
using (public.is_merchant_for_store(negozio_id::text));

create policy if not exists "merchant own products insert"
on public.prodotti for insert
with check (public.is_merchant_for_store(negozio_id::text));

create policy if not exists "merchant own products update"
on public.prodotti for update
using (public.is_merchant_for_store(negozio_id::text))
with check (public.is_merchant_for_store(negozio_id::text));

notify pgrst, 'reload schema';

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 4. 20260723_products_fts.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

create index if not exists prodotti_fts_idx
  on public.prodotti
  using gin (
    to_tsvector('italian',
      coalesce(nome, '') || ' ' ||
      coalesce(descrizione, '') || ' ' ||
      coalesce(categoria, '') || ' ' ||
      coalesce(sottocategoria, '') || ' ' ||
      coalesce(marca, '')
    )
  );

create index if not exists prodotti_nome_ilike_idx
  on public.prodotti (nome text_pattern_ops);

create index if not exists prodotti_categoria_idx
  on public.prodotti (categoria);

create index if not exists prodotti_negozio_attivo_idx
  on public.prodotti (negozio_id, attivo);

create index if not exists prodotti_created_at_idx
  on public.prodotti (created_at desc);

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 5. assign_store_owners.sql
-- ═══════════════════════════════════════════════════════════════════
-- Associa i negozi esistenti al proprietario

update public.negozi
set owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where id = '1f90b145-3acd-4cc1-b365-dfaac944da6d'
  and owner_user_id is null;

update public.negozi
set owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where id = 'e92a474a-b5bf-4ffe-bda2-d4b9bdf650fa'
  and owner_user_id is null;

update public.negozi
set owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where id = 'f3a82af7-dd47-482f-8a49-ea58e692238c'
  and owner_user_id is null;

-- ═══════════════════════════════════════════════════════════════════
-- 6. 20260725_prodotti_ai_enriched_fields.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

alter table if exists public.prodotti
  add column if not exists descrizione_completa text;

alter table if exists public.prodotti
  add column if not exists caratteristiche text[];

alter table if exists public.prodotti
  add column if not exists peso_volume text;

alter table if exists public.prodotti
  add column if not exists filtri_catalogo jsonb;

alter table if exists public.prodotti
  add column if not exists seo_title text;

alter table if exists public.prodotti
  add column if not exists seo_description text;

alter table if exists public.prodotti
  add column if not exists alt_text_immagine text;

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 7. 20260724_product_vision_cache.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

create table if not exists public.product_vision_cache (
  id uuid primary key default gen_random_uuid(),
  image_hash text not null,
  product_name text not null,
  brand text,
  category text,
  ean text,
  suggested_price numeric,
  description text,
  confidence integer not null default 0,
  model_used text not null,
  hit_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_suggestion jsonb
);

create unique index if not exists product_vision_cache_hash_idx
  on public.product_vision_cache (image_hash);

create index if not exists product_vision_cache_name_idx
  on public.product_vision_cache (product_name text_pattern_ops);

create index if not exists product_vision_cache_brand_idx
  on public.product_vision_cache (brand);

create index if not exists product_vision_cache_ean_idx
  on public.product_vision_cache (ean);

drop trigger if exists product_vision_cache_set_updated_at on public.product_vision_cache;
create trigger product_vision_cache_set_updated_at
  before update on public.product_vision_cache
  for each row execute function public.set_updated_at();

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

-- ═══════════════════════════════════════════════════════════════════
-- 8. 20260725_scan_log.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

create table if not exists public.scan_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  negozio_id text,
  created_at timestamptz not null default now(),
  provider text not null,
  response_time_ms integer not null default 0,
  confidence integer,
  cache_hit boolean not null default false,
  error_code text,
  error_message text,
  image_hash text,
  model_used text,
  total_tokens integer,
  status text not null default 'success'
    check (status in ('success', 'error', 'rate_limited'))
);

create index if not exists scan_log_user_time_idx
  on public.scan_log (user_id, created_at desc);

create index if not exists scan_log_created_at_idx
  on public.scan_log (created_at desc);

create index if not exists scan_log_provider_idx
  on public.scan_log (provider);

alter table public.scan_log enable row level security;

create policy if not exists "scan_log insert own"
  on public.scan_log for insert
  with check (user_id = auth.uid()::text);

create policy if not exists "scan_log select own"
  on public.scan_log for select
  using (user_id = auth.uid()::text);

create policy if not exists "scan_log admin select all"
  on public.scan_log for select
  using (true);

notify pgrst, 'reload schema';

commit;
