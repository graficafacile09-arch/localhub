-- ══════════════════════════════════════════════════════════════════════
-- InCittà — B4: PAYPAL MULTIPARTY / SELLER ONBOARDING (additive-only)
--
-- Obiettivo B4: consentire ai venditori di collegare il proprio account PayPal
-- tramite PayPal Partner Referrals / OAuth. La piattaforma usa SOLO credenziali
-- platform-level (env). NESSUN secret del seller viene salvato o esposto.
--
-- 1. negozio_pagamenti guadagna colonne per il collegamento PayPal seller:
--      merchant_id           (PayPal merchant ID / payer_id del seller)
--      onboarding_status     (not_started / pending / complete / restricted)
--      payments_receivable   (bool: seller può ricevere pagamenti)
--      primary_email_confirmed (bool: email primaria confermata)
--    Compatibili con flusso Partner Referrals V2 (PayPal Marketplaces).
-- 2. RPC pagamenti_paypal_seller_crea: crea/aggiorna il collegamento
--    (chiamata dal callback OAuth dopo autorizzazione seller).
-- 3. RPC pagamenti_paypal_seller_stato_salva: aggiorna stato onboarding
--    (chiamata da webhook PayPal merchant.onboarding.completed ecc.).
-- 4. RPC pagamenti_paypal_seller_disconnetti: scollega account seller.
--
-- NON tocca: colonne Stripe, Klarna, Scalapay, bonifico, ordini, checkout,
-- gateway, webhook esistenti. Nessun backfill (default false/pending coerente
-- con fail-closed). Nessuna colonna legacy rimossa.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Colonne seller PayPal (additive, idempotente) ───────────────────────
alter table public.negozio_pagamenti
  add column if not exists merchant_id text,
  add column if not exists onboarding_status text not null default 'not_started',
  add column if not exists payments_receivable boolean not null default false,
  add column if not exists primary_email_confirmed boolean not null default false;

-- Check constraint per onboarding_status (compatibile con Stripe)
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

-- ── 2. RPC: crea/aggiorna collegamento PayPal seller ───────────────────────
--    Chiamata dal callback OAuth PayPal (route merchant) dopo che il seller
--    ha autorizzato la piattaforma. Riceve merchant_id (payer_id) e stato.
create or replace function public.pagamenti_paypal_seller_crea(
  p_negozio_id uuid,
  p_merchant_id text,
  p_onboarding_status text default 'pending',
  p_payments_receivable boolean default false,
  p_primary_email_confirmed boolean default false,
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
  if p_merchant_id is null or length(btrim(p_merchant_id)) = 0 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'PayPal merchant ID non valido.');
  end if;
  if p_onboarding_status is null
     or p_onboarding_status not in ('not_started', 'pending', 'complete', 'restricted') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato onboarding non valido.');
  end if;
  if not exists (select 1 from public.negozi where id = p_negozio_id) then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;

  insert into public.negozio_pagamenti (
    negozio_id, provider, attivo, test_mode, merchant_id, account_name,
    onboarding_status, payments_receivable, primary_email_confirmed
  ) values (
    p_negozio_id, 'paypal', true, coalesce(p_test_mode, false), btrim(p_merchant_id), p_account_name,
    p_onboarding_status, coalesce(p_payments_receivable, false), coalesce(p_primary_email_confirmed, false)
  )
  on conflict (negozio_id, provider) do update set
    attivo                      = true,
    test_mode                   = coalesce(p_test_mode, public.negozio_pagamenti.test_mode),
    merchant_id                 = excluded.merchant_id,
    account_name                = coalesce(excluded.account_name, public.negozio_pagamenti.account_name),
    onboarding_status           = excluded.onboarding_status,
    payments_receivable         = excluded.payments_receivable,
    primary_email_confirmed     = excluded.primary_email_confirmed,
    updated_at                  = now();

  return jsonb_build_object('ok', true, 'provider', 'paypal', 'merchant_id', btrim(p_merchant_id), 'onboarding_status', p_onboarding_status);
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il collegamento PayPal seller.');
end;
$$;

-- ── 3. RPC: aggiorna stato onboarding PayPal seller (da webhook) ───────────
--    Chiamata dal webhook PayPal (merchant.onboarding.completed, ecc.)
--    per aggiornare lo stato in tempo reale.
create or replace function public.pagamenti_paypal_seller_stato_salva(
  p_merchant_id text,
  p_onboarding_status text,
  p_payments_receivable boolean,
  p_primary_email_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aggiornate integer;
begin
  if p_merchant_id is null or length(btrim(p_merchant_id)) = 0 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'PayPal merchant ID non valido.');
  end if;
  if p_onboarding_status is null
     or p_onboarding_status not in ('not_started', 'pending', 'complete', 'restricted') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato onboarding non valido.');
  end if;

  update public.negozio_pagamenti
  set onboarding_status       = p_onboarding_status,
      payments_receivable     = coalesce(p_payments_receivable, false),
      primary_email_confirmed = coalesce(p_primary_email_confirmed, false),
      updated_at              = now()
  where provider = 'paypal'
    and merchant_id = btrim(p_merchant_id);

  get diagnostics v_aggiornate = row_count;
  return jsonb_build_object('ok', true, 'aggiornate', v_aggiornate);
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare lo stato onboarding PayPal seller.');
end;
$$;

-- ── 4. RPC: scollega account PayPal seller ─────────────────────────────────
create or replace function public.pagamenti_paypal_seller_disconnetti(
  p_negozio_id uuid
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

  update public.negozio_pagamenti
  set attivo                      = false,
      merchant_id                 = null,
      account_name                = null,
      onboarding_status           = 'not_started',
      payments_receivable         = false,
      primary_email_confirmed     = false,
      updated_at                  = now()
  where negozio_id = p_negozio_id and provider = 'paypal';

  return jsonb_build_object('ok', true);
end;
$$;

-- ── 5. Permessi: SOLO service_role (pattern identico a Stripe Connect) ─────
revoke execute on function public.pagamenti_paypal_seller_crea(uuid, text, text, boolean, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.pagamenti_paypal_seller_crea(uuid, text, text, boolean, boolean, text, boolean) to service_role;

revoke execute on function public.pagamenti_paypal_seller_stato_salva(text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.pagamenti_paypal_seller_stato_salva(text, text, boolean, boolean) to service_role;

revoke execute on function public.pagamenti_paypal_seller_disconnetti(uuid) from public, anon, authenticated;
grant execute on function public.pagamenti_paypal_seller_disconnetti(uuid) to service_role;

notify pgrst, 'reload schema';

commit;