-- Reclami: snapshot venditore, SLA operativo e audit trail.
-- Data: 2026-09-19
create table if not exists public.ordine_reclami_eventi (
  id uuid primary key default gen_random_uuid(),
  reclamo_id uuid not null references public.ordine_reclami(id) on delete cascade,
  tipo text not null check (tipo in ('creato','stato','messaggio','nota')),
  autore_user_id uuid null references auth.users(id) on delete set null,
  stato_precedente text null,
  stato_nuovo text null,
  messaggio text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.ordine_reclami_eventi enable row level security;
create index if not exists idx_ordine_reclami_eventi_reclamo_created on public.ordine_reclami_eventi(reclamo_id,created_at);
alter table public.ordine_reclami
  add column if not exists venditore_denominazione_legale text,
  add column if not exists venditore_partita_iva text,
  add column if not exists venditore_email text,
  add column if not exists venditore_sede_legale text,
  add column if not exists prima_risposta_scadenza_at timestamptz;
-- La funzione crea_reclamo_ordine usa lo snapshot del venditore già presente sull'ordine
-- e registra l'apertura nel registro eventi. La funzione aggiorna_stato_reclamo
-- registra ogni transizione di stato.
