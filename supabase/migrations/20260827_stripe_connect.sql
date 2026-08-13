-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — STRIPE CONNECT (Fase 1): collegamento account per negozio
--
-- Obiettivo: il venditore collega il proprio account Stripe via Connect
-- (OAuth) SENZA inserire secret/webhook secret. La piattaforma conserva
-- SOLO l'id account (stripe_user_id) e un nome business non sensibile per
-- la UI. Nessun token OAuth viene salvato (la piattaforma usa la propria
-- secret key + header Stripe-Account per ogni richiesta).
--
-- Principi:
--   1. Migration additiva e backward-compatible (ADD COLUMN IF NOT EXISTS).
--   2. Nuove RPC security definer, service-role only (pattern esistente).
--   3. `pagamenti_credenziali_leggi` viene ricreata SOLO per esporre i due
--      nuovi campi pubblici (account_id/account_name), SENZA regredire il
--      fix bytea 20260825 (pgp_sym_decrypt(::bytea)) né lo search_path.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Colonne collegamento account (per provider, ma usate da Stripe) ────
alter table public.negozio_pagamenti
  add column if not exists account_id text,
  add column if not exists account_name text;

create index if not exists negozio_pagamenti_account_idx
  on public.negozio_pagamenti (provider, account_id)
  where account_id is not null;

-- ── 2. RPC: collega account Stripe Connect al negozio ──────────────────────
create or replace function public.pagamenti_stripe_connect_salva(
  p_negozio_id uuid,
  p_account_id text,
  p_account_name text default null,
  p_test_mode boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Negozio non valido.');
  end if;
  if p_account_id is null or length(btrim(p_account_id)) = 0 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Account Stripe non valido.');
  end if;
  if not exists (select 1 from public.negozi where id = p_negozio_id) then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;

  insert into public.negozio_pagamenti (
    negozio_id, provider, attivo, test_mode, account_id, account_name
  ) values (
    p_negozio_id, 'stripe', true, coalesce(p_test_mode, false), btrim(p_account_id), p_account_name
  )
  on conflict (negozio_id, provider) do update set
    attivo       = true,
    test_mode    = coalesce(p_test_mode, public.negozio_pagamenti.test_mode),
    account_id   = excluded.account_id,
    account_name = coalesce(excluded.account_name, public.negozio_pagamenti.account_name),
    updated_at   = now();

  return jsonb_build_object('ok', true, 'provider', 'stripe');
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il collegamento Stripe.');
end;
$$;

-- ── 3. RPC: scollega account Stripe Connect (nessun dato segreto da pulire,
--    azzera solo il collegamento e disattiva il provider) ───────────────────
create or replace function public.pagamenti_stripe_connect_disconnetti(
  p_negozio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.negozio_pagamenti
  set attivo = false, account_id = null, account_name = null, updated_at = now()
  where negozio_id = p_negozio_id and provider = 'stripe';
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 4. RPC leggi: espone account_id/account_name (campi pubblici) ──────────
--    Ricreata per aggiungere i due campi SENZA regredire il fix bytea 20260825.
create or replace function public.pagamenti_credenziali_leggi(
  p_negozio_id uuid,
  p_provider text,
  p_decifra boolean default false,
  p_chiave text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_riga public.negozio_pagamenti%rowtype;
  v_secret text;
  v_webhook_secret text;
begin
  if p_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Negozio non valido.');
  end if;
  if p_provider is null or p_provider not in ('klarna', 'scalapay', 'paypal', 'stripe', 'bonifico') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Provider non valido.');
  end if;

  select * into v_riga
  from public.negozio_pagamenti
  where negozio_id = p_negozio_id and provider = p_provider
  limit 1;

  if v_riga.id is null then
    return jsonb_build_object('ok', true, 'presente', false, 'provider', p_provider);
  end if;

  if p_decifra then
    if p_chiave is null or length(btrim(p_chiave)) = 0 then
      return jsonb_build_object('ok', false, 'codice', 'CHIAVE_MANCANTE', 'messaggio', 'Chiave di cifratura non configurata.');
    end if;
    begin
      -- NOTA: la colonna è TEXT; pgp_sym_decrypt richiede bytea → cast
      -- esplicito ::bytea (senza, 42883 "function does not exist").
      v_secret := case
        when v_riga.secret_encrypted is not null then pgp_sym_decrypt(v_riga.secret_encrypted::bytea, p_chiave)
        else null end;
      v_webhook_secret := case
        when v_riga.webhook_secret_encrypted is not null then pgp_sym_decrypt(v_riga.webhook_secret_encrypted::bytea, p_chiave)
        else null end;
    exception
      when others then
        return jsonb_build_object('ok', false, 'codice', 'CHIAVE_ERRATA', 'messaggio', 'Impossibile decifrare le credenziali (chiave non valida).');
    end;
    return jsonb_build_object(
      'ok', true, 'presente', true, 'provider', p_provider,
      'attivo', v_riga.attivo, 'test_mode', v_riga.test_mode, 'client_id', v_riga.client_id,
      'payee_email', v_riga.payee_email, 'iban', v_riga.iban,
      'account_id', v_riga.account_id, 'account_name', v_riga.account_name,
      'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null),
      'secret', v_secret, 'webhook_secret', v_webhook_secret
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'presente', true, 'provider', p_provider,
    'attivo', v_riga.attivo, 'test_mode', v_riga.test_mode, 'client_id', v_riga.client_id,
    'payee_email', v_riga.payee_email, 'iban', v_riga.iban,
    'account_id', v_riga.account_id, 'account_name', v_riga.account_name,
    'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null)
  );
end;
$$;

-- ── 5. Permessi: SOLO service_role ─────────────────────────────────────────
revoke execute on function public.pagamenti_stripe_connect_salva(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.pagamenti_stripe_connect_salva(uuid, text, text, boolean) to service_role;

revoke execute on function public.pagamenti_stripe_connect_disconnetti(uuid) from public, anon, authenticated;
grant execute on function public.pagamenti_stripe_connect_disconnetti(uuid) to service_role;

revoke execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) to service_role;

notify pgrst, 'reload schema';

commit;
