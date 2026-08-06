-- ═══════════════════════════════════════════════════════════════════════
-- Password recovery — token monouso, sistema 100% backend.
--
-- Sostituisce il flusso PKCE di GoTrue (resetPasswordForEmail + callback) con:
--   1. token casuale da 32 byte (256 bit), inviato per email
--   2. nel DB viene salvato SOLO l'hASH SHA-256 del token (mai il raw)
--   3. validità 30 minuti; monouso (consumo atomico); i token precedenti
--      dello stesso utente muoiono al momento della nuova richiesta (R1)
--   4. nessuna policy RLS: i client (anon/autenticato) non vedono nulla,
--      accede solo il service_role (lato server)
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists idx_reset_tokens_user_id on public.reset_tokens (user_id);
create index if not exists idx_reset_tokens_expires_at on public.reset_tokens (expires_at);

alter table public.reset_tokens enable row level security;

-- ───────────────────────────────────────────────────────────────────────
-- Ricerca utente per EMAIL esatta (auth.users NON è esposto via Data API).
-- security definer: legge da auth.users solo nel contesto dell'owner
-- (postgres); ai client esterni resta non invocabile (revoke qui sotto).
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- Consumo ATOMICO del token (R2): un unico UPDATE = unica transazione.
-- Marca used_at e restituisce la userId solo se:
--   • il token esiste (token_hash match),
--   • non è già stato usato (used_at is null),
--   • non è scaduto (expires_at > now()).
-- Qualsiasi altro caso → NULL (link inesistente/usato/scaduto).
-- Il single UPDATE rende impossibile il riuso anche in concorrenza.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.consume_reset_token(p_token_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  update public.reset_tokens
     set used_at = now()
   where token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
  returning user_id into v_user_id;

  -- Pulizia: i token consumati/scaduti più vecchi di 7 giorni via via pl.
  delete from public.reset_tokens
   where created_at < now() - interval '7 days';

  return v_user_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- Solo service_role può invocare le funzioni (server-side).
-- ───────────────────────────────────────────────────────────────────────
revoke all on function public.get_user_id_by_email(text) from public;
revoke all on function public.get_user_id_by_email(text) from anon;
revoke all on function public.get_user_id_by_email(text) from authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

revoke all on function public.consume_reset_token(text) from public;
revoke all on function public.consume_reset_token(text) from anon;
revoke all on function public.consume_reset_token(text) from authenticated;
grant execute on function public.consume_reset_token(text) to service_role;