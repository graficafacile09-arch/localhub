-- ═══════════════════════════════════════════════════════════════════════
-- STATO ACCOUNT (sospeso/bannato) — 20260918
--
-- Il MECCANISMO di blocco reale resta quello unico di GoTrue/Supabase:
-- auth.users.banned_until (impostato dall'Auth Admin API con ban_duration).
-- Questa tabella NON aggiunge un secondo meccanismo di blocco: registra
-- SOLO la SEMANTICA amministrativa (sospensione temporanea vs ban
-- permanente) con motivo, inizio e fine, per la UI del modulo
-- /amministratore/utenti e per l'audit.
--
-- - una riga per utente (PK user_id);
-- - stato: 'sospeso' (ha una fine) o 'bannato' (fine ≈ 100 anni);
-- - fino_al riflette banned_until della riga auth.users (fonte autorevole);
-- - scritture SOLO via service role (admin client): nessuna policy di
--   scrittura per utenti autenticati;
-- - l'utente può leggere SOLO la propria riga (come user_roles).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.user_account_stati (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stato text not null check (stato in ('sospeso', 'bannato')),
  motivo text,
  iniziato_il timestamptz not null default now(),
  fino_al timestamptz,
  aggiornato_da uuid references auth.users (id) on delete set null,
  aggiornato_il timestamptz not null default now(),
  -- updated_at è gestita dal trigger condiviso (come user_roles).
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_account_stati_stato
  on public.user_account_stati (stato);

alter table public.user_account_stati enable row level security;

drop policy if exists "user account stati self select" on public.user_account_stati;
create policy "user account stati self select"
  on public.user_account_stati
  for select
  using (auth.uid() = user_id);

-- Trigger: aggiorna updated_at (usa l'helper già esistente se presente).
drop trigger if exists user_account_stati_set_updated_at on public.user_account_stati;
create trigger user_account_stati_set_updated_at
  before update on public.user_account_stati
  for each row execute function public.set_user_roles_updated_at();

notify pgrst, 'reload schema';
