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

-- ═══════════════════════════════════════════════════════════════════
-- 9. 20260730_store_servizi_colori.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

alter table if exists public.negozi
  add column if not exists servizi text[] not null default '{}',
  add column if not exists colori jsonb not null default '{"primary": "#2563eb", "secondary": "#f8fafc", "accent": "#f59e0b"}'::jsonb,
  add column if not exists parole_chiave text[] not null default '{}';

notify pgrst, 'reload schema';

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 10. 20260730_seed_demo_stores.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

create unique index if not exists negozi_slug_unique_idx on public.negozi (slug)
where slug is not null;

update public.negozi
set owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where owner_user_id is null
  and slug like 'demo-%';

notify pgrst, 'reload schema';

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 11. 20260731_cms_foundation.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

create table if not exists public.categorie (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text not null unique,
  descrizione text,
  icona       text,
  immagine    text,
  sinonimi    text[] not null default '{}',
  ordine      integer not null default 0,
  attivo      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.categorie (nome, slug, sinonimi, ordine) values
  ('Panificio', 'panificio',           ARRAY['panificio','forno','pane','pasticceria','bakery','panetteria','pasticcere'], 1),
  ('Beauty', 'beauty',                 ARRAY['beauty','bellezza','parrucchiere','estetista','barbiere','skincare','makeup','make-up','trucco','capelli','benessere'], 2),
  ('Casa', 'casa',                     ARRAY['casa','arredo','arredamento','mobili','interior','decorazioni','illuminazione','cucina'], 3),
  ('Auto', 'auto',                     ARRAY['auto','officina','meccanico','gomme','pneumatici','carrozzeria','tagliando','concessionaria','macchina'], 4),
  ('Salute', 'salute',                 ARRAY['salute','farmacia','parafarmacia','medicinali','integratori','benessere','sanitaria'], 5),
  ('Tech & Elettronica', 'tech-elettronica', ARRAY['tech','tecnologia','elettronica','telefonia','computer','smartphone','cellulari','tablet','informatica'], 6),
  ('Bimbi & Giocattoli', 'bimbi-giocattoli', ARRAY['bimbi','bambini','giocattoli','giocattolo','infanzia','scuola','cartoleria','neonati','zaino','pannolini'], 7),
  ('Sport & Fitness', 'sport-fitness',   ARRAY['sport','fitness','palestra','running','yoga','training','pilates','workout','allenamento','abbigliamento sportivo'], 8),
  ('Pet Shop & Animali', 'pet-animali', ARRAY['pet','animali','cane','gatto','cani','gatti','veterinario','toelettatura','crocchette','mangime','cucciolo'], 9),
  ('Ristorante', 'ristorante',          ARRAY['ristorante','trattoria','osteria','cucina','tavola calda'] ,10),
  ('Bar', 'bar',                        ARRAY['bar','caffetteria','cafe','caffe','colazione','caffè'], 11),
  ('Pizzeria', 'pizzeria',              ARRAY['pizzeria','pizza','forno','pizzeria al taglio','focaccia'], 12),
  ('Abbigliamento', 'abbigliamento',    ARRAY['abbigliamento','moda','boutique','fashion','vestiti','vestito','elegante','outfit'], 13),
  ('Calzature', 'calzature',            ARRAY['calzature','scarpe','shoe','footwear','sneakers','sandali','stivali'], 14),
  ('Farmacia', 'farmacia',              ARRAY['farmacia','parafarmacia','pharmacy','farmacista','medicinale'], 15),
  ('Cartoleria', 'cartoleria',          ARRAY['cartoleria','cancelleria','scuola','ufficio','forniture'], 16),
  ('Fioraio', 'fioraio',                ARRAY['fioraio','fiori','florist','flower','piante','giardino','composizioni'], 17),
  ('Gioielleria', 'gioielleria',        ARRAY['gioielleria','gioielli','orologeria','oro','argento','pietre preziose','bigiotteria'], 18),
  ('Elettricista', 'elettricista',      ARRAY['elettricista','elettricita','impianti','elettrico','luci','quadro elettrico'], 19),
  ('Idraulico', 'idraulico',            ARRAY['idraulico','idraulica','caldaia','termoidraulica','acqua','tubi','riscaldamento'], 20),
  ('Falegname', 'falegname',            ARRAY['falegname','falegnameria','carpenteria','legno','mobilio','infissi'], 21),
  ('Altro', 'altro',                    ARRAY['altro','generico','varie','servizi'], 99)
on conflict (slug) do nothing;

create table if not exists public.moduli_registry (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  nome        text not null,
  descrizione text,
  icona       text,
  ordinamento integer not null default 0,
  attivo      boolean not null default true,
  default_in_template boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.moduli_registry (slug, nome, descrizione, icona, ordinamento) values
  ('informazioni', 'Informazioni', 'Nome, categoria e descrizione del negozio', 'Building2', 1),
  ('immagini', 'Immagini', 'Logo, copertina e galleria foto', 'Image', 2),
  ('prodotti', 'Prodotti', 'Catalogo prodotti e servizi', 'Package', 3),
  ('servizi', 'Servizi', 'Servizi offerti dal negozio', 'Sparkles', 4),
  ('offerte', 'Offerte', 'Offerte e promozioni attive', 'Tag', 5),
  ('eventi', 'Eventi', 'Eventi in programma', 'Calendar', 6),
  ('contatti', 'Contatti', 'Telefono, email, sito web e WhatsApp', 'Phone', 7),
  ('posizione', 'Posizione', 'Indirizzo, città, mappa e coordinate', 'MapPin', 8),
  ('orari', 'Orari', 'Orari di apertura', 'Clock', 9),
  ('social', 'Social', 'Link a profili social', 'MessageCircle', 10),
  ('seo', 'SEO', 'Meta tag e keywords per motori di ricerca', 'Search', 11),
  ('ai', 'AI', 'Dati per l''assistente AI del negozio', 'Bot', 12),
  ('impostazioni', 'Impostazioni', 'Visibilità, preferenze e colori brand', 'Settings', 13)
on conflict (slug) do nothing;

alter table if exists public.negozi
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table if exists public.negozi
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists seo_keywords text[] not null default '{}';

alter table if exists public.negozi
  add column if not exists moduli_attivi jsonb not null default '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists version integer not null default 1;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'negozi' and column_name = 'immagine'
  ) then
    alter table public.negozi rename column immagine to logo_url;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'negozi' and column_name = 'copertina'
  ) then
    alter table public.negozi rename column copertina to copertina_url;
  end if;
end;
$$;

create index if not exists negozi_attivi_no_deleted_idx
  on public.negozi (attivo, deleted_at)
  where deleted_at is null;

create index if not exists negozi_categoria_idx
  on public.negozi (categoria);

create index if not exists negozi_fts_idx
  on public.negozi
  using gin (
    to_tsvector('italian',
      coalesce(nome, '') || ' ' ||
      coalesce(categoria, '') || ' ' ||
      coalesce(descrizione, '') || ' ' ||
      coalesce(citta, '')
    )
  );

alter table public.categorie enable row level security;
alter table public.moduli_registry enable row level security;

create policy if not exists "categorie public read"
  on public.categorie for select using (true);

create policy if not exists "moduli_registry public read"
  on public.moduli_registry for select using (true);

drop policy if exists "negozi public read" on public.negozi;
create policy "negozi public read"
  on public.negozi for select
  using (attivo = true and deleted_at is null);

drop policy if exists "merchant own store select" on public.negozi;
create policy "merchant own store select"
  on public.negozi for select
  using (owner_user_id = auth.uid());

drop policy if exists "public active products read" on public.prodotti;
create policy "public active products read"
  on public.prodotti for select
  using (
    attivo = true
    and exists (
      select 1 from public.negozi
      where negozi.id = prodotti.negozio_id::uuid
        and negozi.deleted_at is null
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- 12. 20260731_media_manager.sql
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  negozio_id uuid not null references public.negozi(id) on delete cascade,
  file_path text not null,
  public_url text not null,
  nome text not null,
  alt_text text default '',
  mime_type text,
  file_size integer,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_media_negozio_id on public.media(negozio_id);

alter table public.media enable row level security;

drop policy if exists "media merchant select" on public.media;
create policy "media merchant select"
  on public.media for select
  using (exists (select 1 from public.negozi where negozi.id = media.negozio_id and negozi.owner_user_id = auth.uid()));

drop policy if exists "media merchant insert" on public.media;
create policy "media merchant insert"
  on public.media for insert
  with check (exists (select 1 from public.negozi where negozi.id = media.negozio_id and negozi.owner_user_id = auth.uid()));

drop policy if exists "media merchant update" on public.media;
create policy "media merchant update"
  on public.media for update
  using (exists (select 1 from public.negozi where negozi.id = media.negozio_id and negozi.owner_user_id = auth.uid()));

drop policy if exists "media merchant delete" on public.media;
create policy "media merchant delete"
  on public.media for delete
  using (exists (select 1 from public.negozi where negozi.id = media.negozio_id and negozi.owner_user_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════
-- 13. 20260731_template_negozi.sql
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.template_negozi (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  descrizione text default '',
  categoria text,
  is_system boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_template_negozi_owner on public.template_negozi(owner_user_id);
create index if not exists idx_template_negozi_categoria on public.template_negozi(categoria);

alter table public.template_negozi enable row level security;

drop policy if exists "template view own" on public.template_negozi;
create policy "template view own"
  on public.template_negozi for select
  using (owner_user_id = auth.uid() or is_system = true);

drop policy if exists "template insert own" on public.template_negozi;
create policy "template insert own"
  on public.template_negozi for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "template update own" on public.template_negozi;
create policy "template update own"
  on public.template_negozi for update
  using (owner_user_id = auth.uid());

drop policy if exists "template delete own" on public.template_negozi;
create policy "template delete own"
  on public.template_negozi for delete
  using (owner_user_id = auth.uid());

notify pgrst, 'reload schema';

commit;

-- -------------------------------------------------------------------
-- 12. 20260731_fix_negozi_array_columns.sql
-- -------------------------------------------------------------------
begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'negozi' and column_name = 'servizi' and data_type = 'text'
  ) then
    alter table public.negozi add column servizi_new text[] default '{}';
    update public.negozi set servizi_new = case
      when servizi like '[%' then
        (select coalesce(array_agg(elem order by ord), '{}'::text[])
         from jsonb_array_elements_text(servizi::jsonb) with ordinality as t(elem, ord))
      else
        (select coalesce(array_agg(trim(x) order by ord), '{}'::text[])
         from unnest(string_to_array(servizi, ',')) with ordinality as t(x, ord))
    end;
    alter table public.negozi drop column servizi;
    alter table public.negozi rename column servizi_new to servizi;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'negozi' and column_name = 'parole_chiave' and data_type = 'text'
  ) then
    alter table public.negozi add column parole_chiave_new text[] default '{}';
    update public.negozi set parole_chiave_new = case
      when parole_chiave like '[%' then
        (select coalesce(array_agg(elem order by ord), '{}'::text[])
         from jsonb_array_elements_text(parole_chiave::jsonb) with ordinality as t(elem, ord))
      else
        (select coalesce(array_agg(trim(x) order by ord), '{}'::text[])
         from unnest(string_to_array(parole_chiave, ',')) with ordinality as t(x, ord))
    end;
    alter table public.negozi drop column parole_chiave;
    alter table public.negozi rename column parole_chiave_new to parole_chiave;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;


-- ═══════════════════════════════════════════════════════════════════
-- 13. 20260801_trash_cestino.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

alter table if exists public.negozi
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists negozi_deleted_at_idx
  on public.negozi (deleted_at)
  where deleted_at is not null;

notify pgrst, 'reload schema';

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 14. 20260802_user_roles.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists idx_user_roles_user_id on public.user_roles (user_id);
create index if not exists idx_user_roles_role on public.user_roles (role);

alter table public.user_roles enable row level security;

drop policy if exists "Utente legge i propri ruoli" on public.user_roles;
create policy "Utente legge i propri ruoli"
  on public.user_roles
  for select
  using (auth.uid() = user_id);

create or replace function public.set_user_roles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_user_roles_updated_at on public.user_roles;
create trigger trg_user_roles_updated_at
  before update on public.user_roles
  for each row execute function public.set_user_roles_updated_at();

insert into public.user_roles (user_id, role)
select distinct n.owner_user_id, 'merchant'
from public.negozi n
where n.owner_user_id is not null
  and n.deleted_at is null
on conflict (user_id, role) do nothing;

-- PRIMO AMMINISTRATORE — assegnazione MANUALE (nessun automatismo).
-- insert into public.user_roles (user_id, role) values ('<UUID>', 'admin');

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 15. 20260803_cliente_profili.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

create table if not exists public.cliente_profili (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nome text not null default '',
  cognome text not null default '',
  telefono text,
  avatar_url text,
  indirizzo text,
  citta text,
  cap text,
  provincia text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists idx_cliente_profili_user_id
  on public.cliente_profili (user_id);

alter table public.cliente_profili enable row level security;

drop policy if exists "cliente profilo self select" on public.cliente_profili;
create policy "cliente profilo self select"
  on public.cliente_profili
  for select
  using (auth.uid() = user_id);

drop policy if exists "cliente profilo self insert" on public.cliente_profili;
create policy "cliente profilo self insert"
  on public.cliente_profili
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "cliente profilo self update" on public.cliente_profili;
create policy "cliente profilo self update"
  on public.cliente_profili
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists cliente_profili_set_updated_at on public.cliente_profili;
create trigger cliente_profili_set_updated_at
  before update on public.cliente_profili
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 16. 20260804_preferiti.sql
-- ═══════════════════════════════════════════════════════════════════
begin;

create table if not exists public.preferiti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('negozio', 'prodotto')),
  riferimento_id text not null,
  slug text not null,
  nome text not null,
  immagine_url text,
  categoria text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint preferiti_user_tipo_rif_unq unique (user_id, tipo, riferimento_id)
);

create index if not exists preferiti_user_created_idx
  on public.preferiti (user_id, created_at desc);

create index if not exists preferiti_user_tipo_idx
  on public.preferiti (user_id, tipo);

create index if not exists preferiti_rif_idx
  on public.preferiti (tipo, riferimento_id);

alter table public.preferiti enable row level security;

drop policy if exists "preferiti self select" on public.preferiti;
create policy "preferiti self select"
  on public.preferiti
  for select
  using (auth.uid() = user_id);

drop policy if exists "preferiti self insert" on public.preferiti;
create policy "preferiti self insert"
  on public.preferiti
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "preferiti self update" on public.preferiti;
create policy "preferiti self update"
  on public.preferiti
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "preferiti self delete" on public.preferiti;
create policy "preferiti self delete"
  on public.preferiti
  for delete
  using (auth.uid() = user_id);

drop trigger if exists preferiti_set_updated_at on public.preferiti;
create trigger preferiti_set_updated_at
  before update on public.preferiti
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';

commit;

-- ═══════════════════════════════════════════════════════════════════
-- 17. 20260806_negozi_is_demo.sql
-- ═══════════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════════
-- 18. 20260806_1300_pulizia_negozi_e2e_duplicato.sql
-- ═══════════════════════════════════════════════════════════════════
-- Pulizia definitiva dei negozi di test creati durante gli E2E:
-- nome che inizia con "E2E" o "Duplicato" (varianti coperte da ILIKE),
-- più slug "e2e-…" / "duplicato…" (variante "Negozio Rinominato" E2E).
-- NON tocca: demo ufficiali (slug "demo-…"), template, negozi reali.
-- Elimina anche i record collegati (prodotti, product_media, media,
-- preferiti, scan_log) mantenendo l'integrità referenziale.
begin;

create temp table negozi_e2e on commit drop as
  select id, nome, slug
  from public.negozi
  where nome ilike 'E2E%'
     or nome ilike 'Duplicato%'
     or slug ilike 'e2e-%'
     or slug ilike 'duplicato%';

create temp table prodotti_e2e on commit drop as
  select id, negozio_id
  from public.prodotti
  where negozio_id in (select id::text from negozi_e2e);

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

delete from public.negozi
where id in (select id from negozi_e2e);

select
  (select count(*) from negozi_e2e)   as negozi_eliminati,
  (select count(*) from prodotti_e2e) as prodotti_eliminati;

notify pgrst, 'reload schema';

commit;
