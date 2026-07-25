-- =================================================================
-- LocalHub — Scan Log per monitoraggio e rate limiting
-- =================================================================
-- Registra ogni scansione AI per:
--   1. Rate limiting per utente
--   2. Dashboard amministrativa
--   3. Monitoraggio consumi AI
-- =================================================================

begin;

create table if not exists public.scan_log (
  id uuid primary key default gen_random_uuid(),

  -- Utente che ha eseguito la scansione
  user_id text not null,

  -- Negozio su cui è stata eseguita la scansione
  negozio_id text,

  -- Timestamp della scansione
  created_at timestamptz not null default now(),

  -- Provider utilizzato: "gemini", "cache", "cloudflare", ecc.
  provider text not null,

  -- Tempo di risposta totale in millisecondi
  response_time_ms integer not null default 0,

  -- Confidenza del riconoscimento (0-100), null se errore
  confidence integer,

  -- Cache hit o miss
  cache_hit boolean not null default false,

  -- Codice errore (null se successo)
  error_code text,

  -- Messaggio errore (null se successo)
  error_message text,

  -- Hash dell'immagine per deduplicazione
  image_hash text,

  -- Modello AI utilizzato (es. "gemini-2.0-flash")
  model_used text,

  -- Token utilizzati (se forniti dal provider)
  total_tokens integer,

  -- Esito della scansione
  status text not null default 'success'
    check (status in ('success', 'error', 'rate_limited'))
);

-- Indice per rate limiting: query veloci per utente + intervallo temporale
create index if not exists scan_log_user_time_idx
  on public.scan_log (user_id, created_at desc);

-- Indice per dashboard: statistiche giornaliere
create index if not exists scan_log_created_at_idx
  on public.scan_log (created_at desc);

-- Indice per conteggio provider
create index if not exists scan_log_provider_idx
  on public.scan_log (provider);

-- RLS: solo il proprietario può vedere i propri log
alter table public.scan_log enable row level security;

create policy if not exists "scan_log insert own"
  on public.scan_log for insert
  with check (user_id = auth.uid()::text);

create policy if not exists "scan_log select own"
  on public.scan_log for select
  using (user_id = auth.uid()::text);

-- Policy per admin (lettura globale)
create policy if not exists "scan_log admin select all"
  on public.scan_log for select
  using (true);

notify pgrst, 'reload schema';

commit;
