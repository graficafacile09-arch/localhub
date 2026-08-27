-- =================================================================
-- LocalHub — Segnalazioni Utenti
-- =================================================================
-- Tabella per le segnalazioni inviate dagli utenti (clienti/venditori)
-- e gestite dagli amministratori.
-- =================================================================

begin;

-- 1. Tabella
create table if not exists public.segnalazioni (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Utente che ha inviato la segnalazione (può essere nullo per segnalazioni anonime)
  user_id           uuid references auth.users (id) on delete set null,
  user_email        text,

  -- Tipo di segnalazione
  tipo              text not null,
    -- negozio, prodotto, offerta, evento, contenuto, comportamento, tecnico, altro

  -- Titolo sintetico
  titolo            text not null,

  -- Descrizione dettagliata
  descrizione       text not null,

  -- Riferimento all'oggetto segnalato
  target_type       text,
    -- negozio, prodotto, offerta, evento, utente, altro
  target_id         uuid,
  target_name       text,

  -- Negozio correlato (se applicabile)
  negozio_id        uuid references public.negozi (id) on delete set null,

  -- Stato della segnalazione
  stato             text not null default 'nuova'
    check (stato in ('nuova', 'presa_in_carico', 'risolta', 'archiviata')),

  -- Priorità
  priorita          text not null default 'normale'
    check (priorita in ('bassa', 'normale', 'alta', 'urgente')),

  -- Note amministrative interne
  note_admin        text,

  -- Risoluzione
  resolved_at       timestamptz,
  resolved_by       uuid references auth.users (id) on delete set null
);

-- Indici per query comuni
create index if not exists segnalazioni_user_id_idx
  on public.segnalazioni (user_id, created_at desc);

create index if not exists segnalazioni_stato_idx
  on public.segnalazioni (stato);

create index if not exists segnalazioni_priorita_idx
  on public.segnalazioni (priorita);

create index if not exists segnalazioni_tipo_idx
  on public.segnalazioni (tipo);

create index if not exists segnalazioni_target_idx
  on public.segnalazioni (target_type, target_id);

create index if not exists segnalazioni_negozio_id_idx
  on public.segnalazioni (negozio_id, created_at desc);

create index if not exists segnalazioni_created_at_idx
  on public.segnalazioni (created_at desc);

-- 2. Trigger updated_at
create or replace function public.set_segnalazioni_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_segnalazioni_updated_at on public.segnalazioni;
create trigger trg_segnalazioni_updated_at
  before update on public.segnalazioni
  for each row execute function public.set_segnalazioni_updated_at();

-- 3. RLS
alter table public.segnalazioni enable row level security;

-- Utente autenticato può creare segnalazioni
drop policy if exists "segnalazioni insert own" on public.segnalazioni;
create policy "segnalazioni insert own"
  on public.segnalazioni for insert
  with check (user_id = auth.uid());

-- Utente vede solo le proprie segnalazioni
drop policy if exists "segnalazioni select own" on public.segnalazioni;
create policy "segnalazioni select own"
  on public.segnalazioni for select
  using (user_id = auth.uid());

-- Admin vede tutto
drop policy if exists "segnalazioni admin select all" on public.segnalazioni;
create policy "segnalazioni admin select all"
  on public.segnalazioni for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- Admin può aggiornare (stato, priorità, note, risoluzione)
drop policy if exists "segnalazioni admin update all" on public.segnalazioni;
create policy "segnalazioni admin update all"
  on public.segnalazioni for update
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- 4. Funzione helper per creazione da client
create or replace function public.crea_segnalazione(
  p_user_id uuid,
  p_user_email text,
  p_tipo text,
  p_titolo text,
  p_descrizione text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_target_name text default null,
  p_negozio_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.segnalazioni (
    user_id,
    user_email,
    tipo,
    titolo,
    descrizione,
    target_type,
    target_id,
    target_name,
    negozio_id
  ) values (
    p_user_id,
    p_user_email,
    p_tipo,
    p_titolo,
    p_descrizione,
    p_target_type,
    p_target_id,
    p_target_name,
    p_negozio_id
  )
  returning id into v_id;

  return v_id;
end $$;

notify pgrst, 'reload schema';

commit;