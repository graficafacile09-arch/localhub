-- =================================================================
-- CMS Foundation — Categorie, Moduli, Soft Delete, Estensioni
-- =================================================================
begin;

-- ═══════════════════════════════════════════════════════════════════
-- 1. Tabella categorie
-- ═══════════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════════
-- 2. Tabella moduli_registry
-- ═══════════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════════
-- 3. Estensione tabella negozi — nuovi campi CMS
-- ═══════════════════════════════════════════════════════════════════

-- Soft delete
alter table if exists public.negozi
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- SEO
alter table if exists public.negozi
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists seo_keywords text[] not null default '{}';

-- Estensione modulare
alter table if exists public.negozi
  add column if not exists moduli_attivi jsonb not null default '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists version integer not null default 1;

-- Colonna categoria → FK a categorie (solo se la colonna esiste già come text)
-- Non la droppiamo, manteniamo backward compatibility con i dati esistenti

-- ═══════════════════════════════════════════════════════════════════
-- 4. Rinomina colonne per consistenza
-- ═══════════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'negozi' and column_name = 'immagine'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'negozi' and column_name = 'logo_url'
  ) then
    alter table public.negozi rename column immagine to logo_url;
  else
    -- logo_url already exists; migrate data then drop the legacy column
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'negozi' and column_name = 'immagine') then
      update public.negozi set logo_url = immagine where logo_url is null and immagine is not null;
      alter table public.negozi drop column if exists immagine;
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'negozi' and column_name = 'copertina'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'negozi' and column_name = 'copertina_url'
  ) then
    alter table public.negozi rename column copertina to copertina_url;
  else
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'negozi' and column_name = 'copertina') then
      update public.negozi set copertina_url = copertina where copertina_url is null and copertina is not null;
      alter table public.negozi drop column if exists copertina;
    end if;
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 5. Indici per performance
-- ═══════════════════════════════════════════════════════════════════

-- Indice per soft delete (esclude negozi eliminati)
create index if not exists negozi_attivi_no_deleted_idx
  on public.negozi (attivo, deleted_at)
  where deleted_at is null;

-- Indice per categoria
create index if not exists negozi_categoria_idx
  on public.negozi (categoria);

-- Indice per ricerca full-text su negozi
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

-- ═══════════════════════════════════════════════════════════════════
-- 6. RLS policies per le nuove tabelle
-- ═══════════════════════════════════════════════════════════════════
alter table public.categorie enable row level security;
alter table public.moduli_registry enable row level security;

drop policy if exists "categorie public read" on public.categorie;
create policy "categorie public read"
  on public.categorie for select
  using (true);

drop policy if exists "moduli_registry public read" on public.moduli_registry;
create policy "moduli_registry public read"
  on public.moduli_registry for select
  using (true);

-- ── Aggiornamento RLS negozi per soft delete ─────────────────────
-- I negozi eliminati non sono visibili al pubblico
drop policy if exists "negozi public read" on public.negozi;
create policy "negozi public read"
  on public.negozi for select
  using (attivo = true and deleted_at is null);

-- I merchant vedono anche i loro negozi eliminati (per il cestino)
drop policy if exists "merchant own store select" on public.negozi;
create policy "merchant own store select"
  on public.negozi for select
  using (owner_user_id = auth.uid());

-- Aggiornamento RLS prodotti: escludi negozi eliminati
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

notify pgrst, 'reload schema';

commit;
