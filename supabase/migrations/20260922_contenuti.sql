-- ═══════════════════════════════════════════════════════════════════════
-- CONTENUTI EDITORIALI — 20260922
--
-- Modulo del pannello Amministratore (/amministratore/contenuti): area
-- editoriale per articoli e contenuti del portale. Tabella NUOVA (non
-- esisteva alcun modello di contenuto nel progetto).
--
-- - stato: 'bozza' | 'pubblicato' | 'archiviato' (workflow editoriale);
-- - pubblicato_il: valorizzato alla prima pubblicazione; azzerato se il
--   contenuto torna in bozza; conservato in archiviazione;
-- - slug UNIQUE: generato dal titolo lato server (nessun contenuto
--   pubblicato con slug duplicato);
-- - RLS: nessuna policy per i client — letture/scritture SOLO via service
--   role (API /api/amministratore/contenuti, requireApiArea("admin") +
--   audit in admin_activity_log). Nessun contenuto esposto al browser
--   direttamente.
-- - updated_at gestito dal trigger condiviso public.set_updated_at()
--   (già usato da merchant_profiles, ordini, prenotazioni, …).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.contenuti (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  slug text not null unique,
  riassunto text,
  corpo text not null,
  immagine_url text,
  autore text,
  stato text not null default 'bozza'
    check (stato in ('bozza', 'pubblicato', 'archiviato')),
  pubblicato_il timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Indici utili: navigazione per stato + data pubblicazione e ordinamento
-- temporale della lista.
create index if not exists idx_contenuti_stato_pubblicato
  on public.contenuti (stato, pubblicato_il desc);

create index if not exists idx_contenuti_created_at
  on public.contenuti (created_at desc);

create index if not exists idx_contenuti_pubblicati
  on public.contenuti (pubblicato_il desc)
  where stato = 'pubblicato';

-- RLS attiva SENZA policy: nessun accesso client diretto alla tabella.
-- Tutte le letture/scritture passano dalle API server-side (service role).
alter table public.contenuti enable row level security;

-- Trigger: aggiorna updated_at (usa l'helper condiviso già esistente).
drop trigger if exists contenuti_set_updated_at on public.contenuti;
create trigger contenuti_set_updated_at
  before update on public.contenuti
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';