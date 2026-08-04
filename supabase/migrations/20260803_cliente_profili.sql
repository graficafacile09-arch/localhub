-- ═══════════════════════════════════════════════════════════════════════
-- Area Clienti — FASE 2: Modulo Profilo
-- Tabella cliente_profili: dati anagrafici e indirizzo principale dell'utente.
-- L'email NON è salvata qui: è sempre letta da auth.users (sola lettura).
-- RLS: ogni utente può leggere/creare/aggiornare SOLO il proprio profilo.
-- ═══════════════════════════════════════════════════════════════════════

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

-- Ogni utente gestisce esclusivamente il proprio profilo.
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

-- Trigger: aggiorna updated_at a ogni modifica (funzione già esistente).
drop trigger if exists cliente_profili_set_updated_at on public.cliente_profili;
create trigger cliente_profili_set_updated_at
  before update on public.cliente_profili
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
