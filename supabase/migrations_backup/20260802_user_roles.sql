-- ═══════════════════════════════════════════════════════════════════════
-- Sistema Ruoli — FASE 7
-- Tabella user_roles: assegna a ogni utente uno o più ruoli.
-- Ruoli iniziali: customer · merchant · admin
-- Il sistema è progettato per aggiungere nuovi ruoli (editor, moderatore,
-- supporto, …) SENZA modificare l'architettura: il valore di `role` è
-- libero (validato lato applicazione), quindi i nuovi ruoli richiedono
-- solo un INSERT, nessuna modifica alla tabella.
-- ═══════════════════════════════════════════════════════════════════════

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

-- Ogni utente può leggere i propri ruoli (l'admin client bypassa la RLS).
drop policy if exists "Utente legge i propri ruoli" on public.user_roles;
create policy "Utente legge i propri ruoli"
  on public.user_roles
  for select
  using (auth.uid() = user_id);

-- Trigger: aggiorna updated_at a ogni modifica.
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

-- ───────────────────────────────────────────────────────────────────────
-- Backfill: chi possiede almeno un negozio attivo → merchant.
-- Necessario per gli account esistenti creati prima di questo sistema.
-- ───────────────────────────────────────────────────────────────────────
insert into public.user_roles (user_id, role)
select distinct n.owner_user_id, 'merchant'
from public.negozi n
where n.owner_user_id is not null
  and n.deleted_at is null
on conflict (user_id, role) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- PRIMO AMMINISTRATORE — assegnazione MANUALE (nessun automatismo).
-- Sostituisci <UUID> con l'id dell'utente e scommenta:
--
-- insert into public.user_roles (user_id, role)
-- values ('<UUID>', 'admin');
--
-- Il pannello /amministratore/utenti gestirà in futuro gli altri ruoli.
-- ═══════════════════════════════════════════════════════════════════════
