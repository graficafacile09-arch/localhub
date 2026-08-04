-- ═══════════════════════════════════════════════════════════════════════
-- Area Clienti — FASE 3: Sistema Preferiti
-- Tabella preferiti: negozi e prodotti salvati dal cliente.
-- Progettata come componente strutturale della piattaforma:
--   - snapshot denormalizzati (slug, nome, immagine_url, categoria) per
--     elencare i preferiti senza join e senza N+1;
--   - riferimento_id + tipo per collegare il preferito alla fonte reale
--     (negozi.id uuid oppure prodotti.id bigint, entrambi come testo);
--   - indici predisposti per filtri, ordinamento, paginazione, ricerca e
--     per le evoluzioni future: notifiche, offerte personalizzate,
--     statistiche e raccomandazioni AI (reverse index su tipo+riferimento).
-- RLS: ogni utente gestisce ESCLUSIVAMENTE i propri preferiti.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.preferiti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('negozio', 'prodotto')),
  riferimento_id text not null,
  -- Snapshot per il rendering della lista senza join.
  slug text not null,
  nome text not null,
  immagine_url text,
  categoria text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un utente non può salvare due volte lo stesso elemento.
  constraint preferiti_user_tipo_rif_unq unique (user_id, tipo, riferimento_id)
);

-- Indici di lettura: lista per utente (ordinamento per data), filtro per
-- tipo, e reverse index (tipo, riferimento) per statistiche/raccomandazioni.
create index if not exists preferiti_user_created_idx
  on public.preferiti (user_id, created_at desc);

create index if not exists preferiti_user_tipo_idx
  on public.preferiti (user_id, tipo);

create index if not exists preferiti_rif_idx
  on public.preferiti (tipo, riferimento_id);

alter table public.preferiti enable row level security;

-- Ogni utente gestisce esclusivamente i propri preferiti.
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

-- Trigger: aggiorna updated_at a ogni modifica (funzione già esistente).
drop trigger if exists preferiti_set_updated_at on public.preferiti;
create trigger preferiti_set_updated_at
  before update on public.preferiti
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
