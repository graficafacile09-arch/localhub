-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — B1: STRIPE CONNECT CAPABILITY COMPLETENESS (additive-only)
--
-- Obiettivo B1: Stripe Connect = Carte + Klarna + Scalapay.
--   1. negozio_pagamenti guadagna le colonne di STATO capability:
--        klarna_enabled    (capability klarna_payments attiva)
--        scalapay_enabled  (capability scalapay_payments attiva)
--      "enabled" = capability effettivamente ACTIVE presso Stripe
--      (fail-closed: requested/pending/inactive/restricted → false).
--   2. La RPC esistente pagamenti_stripe_connect_stato_salva viene
--      RICREATA (estesa) con DUE parametri OPZIONALI:
--        p_klarna_enabled boolean default null
--        p_scalapay_enabled boolean default null
--      compatibile con tutti i caller esistenti (4 call-site che passano
--      4 argomenti): null = non modificare il flag (comportamento
--      identico a prima per i caller non aggiornati).
--   3. La RPC esistente pagamenti_stripe_connect_crea viene ricreata per
--      azzerare i flag alla creazione/riaggancio dell'onboarding (stato
--      noto = false finché Stripe non conferma la capability attiva).
--
-- NON tocca: migration storiche, altre tabelle, RLS, ordini, checkout,
-- PayPal, gateways, webhook. Nessun backfill (default false, coerente
-- con il fail-closed). Nessuna colonna legacy rimossa.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Colonne di stato capability (additive, idempotente) ─────────────
alter table public.negozio_pagamenti
  add column if not exists klarna_enabled boolean not null default false,
  add column if not exists scalapay_enabled boolean not null default false;

-- ── 2. RPC stato_salva: UNA SOLA funzione a 6 parametri ───────────────────
--    NOTA su PostgREST: tenere ANCHE la firma vecchia a 4 arg creerebbe
--    DUE candidate per una chiamata con 4 argomenti nominati
--    ("Could not choose the best candidate function") e romperebbe i 3
--    caller legacy (webhook account.updated, /api/pagamenti/connect/webhook,
--    /ritorno-stripe). La firma vecchia viene quindi DROPPATA: con una
--    sola funzione, PostgREST risolve le chiamate a 4 arg omettendo
--    p_klarna_enabled / p_scalapay_enabled, che SQL riempie con i default
--    NULL → i flag NON cambiano (coalesce sul valore esistente).
--    Comportamento identico al passato per i caller esistenti.
drop function if exists public.pagamenti_stripe_connect_stato_salva(text, text, boolean, boolean);

create or replace function public.pagamenti_stripe_connect_stato_salva(
  p_account_id text,
  p_onboarding_status text,
  p_payouts_enabled boolean,
  p_charges_enabled boolean,
  p_klarna_enabled boolean default null,
  p_scalapay_enabled boolean default null
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
      -- null = parametro non fornito → flag invariato (fail-closed:
      -- nessun caller vecchio può attivare una capability per errore).
      klarna_enabled    = coalesce(p_klarna_enabled, public.negozio_pagamenti.klarna_enabled),
      scalapay_enabled  = coalesce(p_scalapay_enabled, public.negozio_pagamenti.scalapay_enabled),
      updated_at        = now()
  where provider = 'stripe'
    and account_id = btrim(p_account_id);

  get diagnostics v_aggiornate = row_count;
  return jsonb_build_object(
    'ok', true,
    'aggiornate', v_aggiornate,
    'klarna_enabled', coalesce(p_klarna_enabled, false),
    'scalapay_enabled', coalesce(p_scalapay_enabled, false)
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare lo stato onboarding.');
end;
$$;

-- ── 3. RPC crea: ricreata identica + azzeramento flag capability ───────
--    Alla creazione/riaggancio dell'onboarding lo stato è noto: nessuna
--    capability è ancora attiva (Stripe la conferma dopo il KYC).
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
    onboarding_status, payouts_enabled, charges_enabled,
    klarna_enabled, scalapay_enabled
  ) values (
    p_negozio_id, 'stripe', true, coalesce(p_test_mode, false), btrim(p_account_id), p_account_name,
    'pending', false, false,
    false, false
  )
  on conflict (negozio_id, provider) do update set
    attivo            = true,
    test_mode         = coalesce(p_test_mode, public.negozio_pagamenti.test_mode),
    account_id        = excluded.account_id,
    account_name      = coalesce(excluded.account_name, public.negozio_pagamenti.account_name),
    onboarding_status = 'pending',
    payouts_enabled   = false,
    charges_enabled   = false,
    klarna_enabled    = false,
    scalapay_enabled  = false,
    updated_at        = now();

  return jsonb_build_object('ok', true, 'provider', 'stripe', 'onboarding_status', 'pending');
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il collegamento Stripe.');
end;
$$;

-- ── 4. Permessi: identici al modello esistente (SOLO service_role) ─────
revoke execute on function public.pagamenti_stripe_connect_stato_salva(text, text, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.pagamenti_stripe_connect_stato_salva(text, text, boolean, boolean, boolean, boolean) to service_role;
revoke execute on function public.pagamenti_stripe_connect_crea(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.pagamenti_stripe_connect_crea(uuid, text, text, boolean) to service_role;

notify pgrst, 'reload schema';

commit;
