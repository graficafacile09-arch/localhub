-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — STRIPE CONNECT EXPRESS (onboarding account link)
--
-- Obiettivo: tracciare lo stato dell'ONBOARDING del venditore oltre al solo
-- collegamento. Il flusso diventa:
--   1. la piattaforma crea un account Stripe EXPRESS via API
--      (stripe.accounts.create({ type: 'express' }));
--   2. genera un ACCOUNT LINK (stripe.accountLinks.create, tipo
--      'account_onboarding') e reindirizza il venditore sul portale hosted
--      Stripe (creazione/collegamento account + KYC/IBAN senza inserire
--      credenziali in LocalHub);
--   3. Stripe notifica i progressi con il webhook `account.updated`
--      (/api/pagamenti/connect/webhook) → la RPC
--      `pagamenti_stripe_connect_stato_salva` aggiorna onboarding_status,
--      payouts_enabled e charges_enabled su Supabase.
--
-- NOTA su `stripe_connect_account_id`: il campo richiesto esiste già come
-- `negozio_pagamenti.account_id` (migration 20260827) — è l'ID account
-- Stripe Connect (acct_…). Qui NON duplichiamo la colonna: aggiungiamo solo
-- i campi di STATO mancanti, mantenendo UNA fonte di verità.
--
-- Principi:
--   1. Migration additiva e backward-compatible (ADD COLUMN IF NOT EXISTS).
--   2. RPC security definer, service-role only (pattern esistente).
--   3. `pagamenti_credenziali_leggi` viene ricreata SOLO per esporre i tre
--      nuovi campi pubblici, SENZA regredire il fix bytea 20260825 né lo
--      search_path (copia fedele della versione 20260827).
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Colonne di stato onboarding (per provider, usate da Stripe) ────────
alter table public.negozio_pagamenti
  add column if not exists onboarding_status text not null default 'not_started',
  add column if not exists payouts_enabled boolean not null default false,
  add column if not exists charges_enabled boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'negozio_pagamenti_onboarding_status_check'
  ) then
    alter table public.negozio_pagamenti
      add constraint negozio_pagamenti_onboarding_status_check
      check (onboarding_status in ('not_started', 'pending', 'complete', 'restricted'));
  end if;
end $$;

-- ── 2. RPC: crea/aggiorna il collegamento Express (account appena creato o
--    riaggancio: stato = pending finché Stripe non conferma via webhook) ───
create or replace function public.pagamenti_stripe_connect_crea(
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
    negozio_id, provider, attivo, test_mode, account_id, account_name,
    onboarding_status, payouts_enabled, charges_enabled
  ) values (
    p_negozio_id, 'stripe', true, coalesce(p_test_mode, false), btrim(p_account_id), p_account_name,
    'pending', false, false
  )
  on conflict (negozio_id, provider) do update set
    attivo            = true,
    test_mode         = coalesce(p_test_mode, public.negozio_pagamenti.test_mode),
    account_id        = excluded.account_id,
    account_name      = coalesce(excluded.account_name, public.negozio_pagamenti.account_name),
    onboarding_status = 'pending',
    payouts_enabled   = false,
    charges_enabled   = false,
    updated_at        = now();

  return jsonb_build_object('ok', true, 'provider', 'stripe', 'onboarding_status', 'pending');
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il collegamento Stripe.');
end;
$$;

-- ── 2-bis. RPC: scollega account (ricreata per azzerare anche lo stato
--    onboarding Express: nessun dato segreto, solo collegamento + stato) ────
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
  set attivo            = false,
      account_id        = null,
      account_name      = null,
      onboarding_status = 'not_started',
      payouts_enabled   = false,
      charges_enabled   = false,
      updated_at        = now()
  where negozio_id = p_negozio_id and provider = 'stripe';
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 3. RPC: aggiorna lo stato onboarding da webhook (per account_id) ───────
create or replace function public.pagamenti_stripe_connect_stato_salva(
  p_account_id text,
  p_onboarding_status text,
  p_payouts_enabled boolean,
  p_charges_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aggiornate integer;
begin
  if p_account_id is null or length(btrim(p_account_id)) = 0 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Account Stripe non valido.');
  end if;
  if p_onboarding_status is null
     or p_onboarding_status not in ('not_started', 'pending', 'complete', 'restricted') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato onboarding non valido.');
  end if;

  update public.negozio_pagamenti
  set onboarding_status = p_onboarding_status,
      payouts_enabled   = coalesce(p_payouts_enabled, false),
      charges_enabled   = coalesce(p_charges_enabled, false),
      updated_at        = now()
  where provider = 'stripe'
    and account_id = btrim(p_account_id);

  get diagnostics v_aggiornate = row_count;
  return jsonb_build_object('ok', true, 'aggiornate', v_aggiornate);
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare lo stato onboarding.');
end;
$$;

-- ── 4. RPC leggi: espone onboarding_status / payouts_enabled / charges_enabled
--    Ricreata per aggiungere i tre campi SENZA regredire il fix bytea 20260825.
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
      'onboarding_status', v_riga.onboarding_status,
      'payouts_enabled', v_riga.payouts_enabled,
      'charges_enabled', v_riga.charges_enabled,
      'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null),
      'secret', v_secret, 'webhook_secret', v_webhook_secret
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'presente', true, 'provider', p_provider,
    'attivo', v_riga.attivo, 'test_mode', v_riga.test_mode, 'client_id', v_riga.client_id,
    'payee_email', v_riga.payee_email, 'iban', v_riga.iban,
    'account_id', v_riga.account_id, 'account_name', v_riga.account_name,
    'onboarding_status', v_riga.onboarding_status,
    'payouts_enabled', v_riga.payouts_enabled,
    'charges_enabled', v_riga.charges_enabled,
    'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null)
  );
end;
$$;

-- ── 5. Permessi: SOLO service_role ─────────────────────────────────────────
revoke execute on function public.pagamenti_stripe_connect_crea(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.pagamenti_stripe_connect_crea(uuid, text, text, boolean) to service_role;

revoke execute on function public.pagamenti_stripe_connect_stato_salva(text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.pagamenti_stripe_connect_stato_salva(text, text, boolean, boolean) to service_role;

revoke execute on function public.pagamenti_stripe_connect_disconnetti(uuid) from public, anon, authenticated;
grant execute on function public.pagamenti_stripe_connect_disconnetti(uuid) to service_role;

revoke execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) to service_role;

notify pgrst, 'reload schema';

commit;
