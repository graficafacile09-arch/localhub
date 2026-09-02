-- ═══════════════════════════════════════════════════════════════════════
-- AGGREGATORE NOTIZIE CV — 20260903
--
-- Sezione pubblica /notizie: raccolta automatica di notizie pertinenti a
-- Castrovillari da fonti istituzionali/pubbliche (V1).
--
-- - notizie_fonti: configurazione delle fonti (RSS/HTML), categoria di
--   default, frequenza di import in minuti, stato attiva.
-- - notizie: singola notizia normalizzata. NON è una copia dell'articolo:
--   solo titolo, excerpt breve (quando disponibile), fonte, data e link
--   all'originale. image_url resta NULL salvo immagini chiaramente
--   riutilizzabili (V1: sempre NULL, deciso dal job).
-- - Dedup: unique (fonte_id, external_id) + unique dedup_hash (SHA-256 del
--   titolo normalizzato) → niente duplicati nemmeno tra fonti diverse.
-- - RLS attiva SENZA policy client: letture pubbliche SOLO server-side via
--   service role (lib/notizie-pubbliche.ts), scritture SOLO dal job
--   (app/api/cron/notizie). Nessun accesso diretto dal browser.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.notizie_fonti (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('rss', 'html')),
  url_feed text,
  url_lista text,
  url_base text not null,
  categoria_default text not null default 'Istituzioni',
  attiva boolean not null default true,
  frequenza_minuti integer not null default 720,
  -- Ultima esecuzione del job per questa fonte: usata dal cron per
  -- rispettare frequenza_minuti (nessun import se non è scaduto il tempo).
  ultima_esecuzione timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notizie (
  id uuid primary key default gen_random_uuid(),
  fonte_id uuid not null references public.notizie_fonti (id) on delete cascade,
  source_name text not null,
  title text not null,
  excerpt text,
  original_url text not null,
  external_id text,
  published_at timestamptz,
  imported_at timestamptz not null default now(),
  category text not null default 'Istituzioni',
  image_url text,
  dedup_hash text not null,
  stato text not null default 'published'
    check (stato in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  unique (fonte_id, external_id),
  unique (dedup_hash)
);

-- Indici: ordinamento temporale e lettura pubblica per stato.
create index if not exists idx_notizie_published_at
  on public.notizie (published_at desc);

create index if not exists idx_notizie_stato_published
  on public.notizie (stato, published_at desc)
  where stato = 'published';

create index if not exists idx_notizie_fonte
  on public.notizie (fonte_id);

-- RLS attiva SENZA policy: nessun accesso client diretto alla tabella.
-- Tutte le letture/scritture passano dal server (service role).
alter table public.notizie_fonti enable row level security;
alter table public.notizie enable row level security;

-- ═══════════════════════════════════════════════════════════════════════
-- FONTI V1 — seed iniziale (attive, frequenze dall'analisi)
-- ═══════════════════════════════════════════════════════════════════════
insert into public.notizie_fonti
  (id, nome, tipo, url_feed, url_lista, url_base, categoria_default, attiva, frequenza_minuti)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'Comune di Castrovillari',
    'html',
    null,
    'https://comune.castrovillari.cs.it/novita',
    'https://comune.castrovillari.cs.it',
    'Comune',
    true,
    720
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    'Provincia di Cosenza',
    'rss',
    'https://www.provincia.cs.it/portale/rss2.0.xml',
    'https://www.provincia.cs.it/portale/informazione/notizie/',
    'https://www.provincia.cs.it',
    'Istituzioni',
    true,
    360
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    'Regione Calabria',
    'rss',
    'https://www.regione.calabria.it/feed/',
    null,
    'https://www.regione.calabria.it',
    'Istituzioni',
    true,
    60
  ),
  (
    'a0000000-0000-4000-8000-000000000004',
    'Parco Nazionale del Pollino',
    'rss',
    'https://parconazionalepollino.it/notizie-e-iniziative/notizie-dall-ente?format=feed&type=rss',
    null,
    'https://parconazionalepollino.it',
    'Territorio',
    true,
    720
  ),
  (
    'a0000000-0000-4000-8000-000000000005',
    'Protezione Civile Calabria',
    'rss',
    'https://www.protezionecivilecalabria.it/?feed=rss2',
    null,
    'https://www.protezionecivilecalabria.it',
    'Protezione civile',
    true,
    720
  )
on conflict (id) do nothing;

notify pgrst, 'reload schema';