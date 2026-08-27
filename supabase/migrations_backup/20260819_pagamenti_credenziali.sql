-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE 2 PAGAMENTI: SECRET + CONFIG NEGOZIO (credenziali sicure)
--
-- Obiettivo: consentire a ogni negozio di configurare i propri
-- metodi/provider di pagamento senza MAI esporre secret al client.
--
-- Principi:
--   1. Migration ESCLUSIVAMENTE additiva: nessuna modifica a tabelle/RPC
--      esistenti, nessun dato toccato.
--   2. La cifratura dei secret usa pgcrypto (pgp_sym_encrypt) con la chiave
--      PAYMENTS_ENCRYPTION_KEY passata come parametro dalle route
--      SERVER-SIDE (mai dal browser, mai salvata nel DB, mai nel codice).
--   3. Le RPC sono `security definer`, REVOKE da anon/authenticated e
--      GRANT ESCLUSIVO a service_role: il browser non può mai invocarle.
--   4. I secret NON vengono MAI restituiti: la lettura pubblica (route
--      GET) usa p_decifra=false e riceve solo dati pubblici + has_secret.
--      La decifratura (p_decifra=true) è riservata al backend payment
--      nelle fasi successive.
--   5. Il vincolo fondamentale resta negozio_id (1 negozio = 1 config per
--      provider); l'ownership è già garantita da canManageStore + RLS.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. pgcrypto (idempotente; su Supabase è già attivo) ─────────────────────
create extension if not exists pgcrypto;

-- ── 2. Allowlist provider configurabili (protezione anche in RPC) ───────────
--    I provider supportati: klarna, scalapay, paypal, stripe, bonifico.

-- ── 3. RPC: SALVA/AGGIORNA credenziali payment di un negozio ────────────────
--    - upsert su negozio_pagamenti (unique negozio_id + provider);
--    - i secret vengono cifrati SOLO se forniti (non-null e non vuoti):
--      se assenti, il valore già salvato resta invariato (write-only,
--      mai riletto/riscritto in chiaro dalla route);
--    - la chiave p_chiave arriva ESCLUSIVAMENTE dal server
--      (process.env.PAYMENTS_ENCRYPTION_KEY), mai dal browser.
create or replace function public.pagamenti_credenziali_salva(
  p_negozio_id uuid,
  p_provider text,
  p_attivo boolean default null,
  p_test_mode boolean default null,
  p_client_id text default null,
  p_payee_email text default null,
  p_iban text default null,
  p_secret text default null,
  p_webhook_secret text default null,
  p_chiave text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ── Validazioni difensive (barriera finale; la route già valida) ──
  if p_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Negozio non valido.');
  end if;
  if p_provider is null or p_provider not in ('klarna', 'scalapay', 'paypal', 'stripe', 'bonifico') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Provider non valido.');
  end if;
  if not exists (select 1 from public.negozi where id = p_negozio_id) then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;

  -- Il bonifico non ha secret: ignora eventuali valori e forza null.
  if p_provider = 'bonifico' then
    p_secret := null;
    p_webhook_secret := null;
  end if;

  -- La chiave è richiesta SOLO se si scrive un secret.
  if (p_secret is not null and length(btrim(p_secret)) > 0)
     or (p_webhook_secret is not null and length(btrim(p_webhook_secret)) > 0) then
    if p_chiave is null or length(btrim(p_chiave)) = 0 then
      return jsonb_build_object('ok', false, 'codice', 'CHIAVE_MANCANTE', 'messaggio', 'Chiave di cifratura non configurata.');
    end if;
  end if;

  insert into public.negozio_pagamenti (
    negozio_id, provider, attivo, test_mode, client_id,
    secret_encrypted, webhook_secret_encrypted, payee_email, iban
  ) values (
    p_negozio_id, p_provider,
    coalesce(p_attivo, false),
    coalesce(p_test_mode, true),
    p_client_id,
    case when p_secret is not null and length(btrim(p_secret)) > 0
         then pgp_sym_encrypt(btrim(p_secret), p_chiave) else null end,
    case when p_webhook_secret is not null and length(btrim(p_webhook_secret)) > 0
         then pgp_sym_encrypt(btrim(p_webhook_secret), p_chiave) else null end,
    p_payee_email, p_iban
  )
  on conflict (negozio_id, provider) do update set
    -- Campi omessi (parametri NULL) NON toccano l'esistente: l'update
    -- parziale non deve mai azzerare attivo/test_mode o i campi pubblici.
    attivo              = coalesce(p_attivo, public.negozio_pagamenti.attivo),
    test_mode           = coalesce(p_test_mode, public.negozio_pagamenti.test_mode),
    client_id           = coalesce(p_client_id, public.negozio_pagamenti.client_id),
    payee_email         = coalesce(p_payee_email, public.negozio_pagamenti.payee_email),
    iban                = coalesce(p_iban, public.negozio_pagamenti.iban),
    -- I secret si aggiornano SOLO se forniti: mai riscritti in chiaro,
    -- mai sovrascritti con NULL da una scrittura parziale.
    secret_encrypted    = case
      when excluded.secret_encrypted is not null then excluded.secret_encrypted
      else public.negozio_pagamenti.secret_encrypted end,
    webhook_secret_encrypted = case
      when excluded.webhook_secret_encrypted is not null then excluded.webhook_secret_encrypted
      else public.negozio_pagamenti.webhook_secret_encrypted end,
    updated_at          = now();

  return jsonb_build_object('ok', true, 'provider', p_provider);
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare le credenziali.');
end;
$$;

-- ── 4. RPC: LEGGI credenziali payment di un negozio ─────────────────────────
--    - p_decifra=false (default): restituisce SOLO dati pubblici +
--      has_secret — MAI il valore dei secret. Usata dalle route merchant.
--    - p_decifra=true: decifra i secret (pgp_sym_decrypt) — riservata al
--      backend payment (fasi successive), MAI esposta al browser.
--    - Chiave errata → CHIAVE_ERRATA (fail-closed, nessun dato in chiaro).
create or replace function public.pagamenti_credenziali_leggi(
  p_negozio_id uuid,
  p_provider text,
  p_decifra boolean default false,
  p_chiave text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
      v_secret := case
        when v_riga.secret_encrypted is not null then pgp_sym_decrypt(v_riga.secret_encrypted, p_chiave)
        else null end;
      v_webhook_secret := case
        when v_riga.webhook_secret_encrypted is not null then pgp_sym_decrypt(v_riga.webhook_secret_encrypted, p_chiave)
        else null end;
    exception
      when others then
        return jsonb_build_object('ok', false, 'codice', 'CHIAVE_ERRATA', 'messaggio', 'Impossibile decifrare le credenziali (chiave non valida).');
    end;
    return jsonb_build_object(
      'ok', true, 'presente', true, 'provider', p_provider,
      'attivo', v_riga.attivo, 'test_mode', v_riga.test_mode, 'client_id', v_riga.client_id,
      'payee_email', v_riga.payee_email, 'iban', v_riga.iban,
      'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null),
      'secret', v_secret, 'webhook_secret', v_webhook_secret
    );
  end if;

  -- Lettura pubblica: MAI i secret (write-only).
  return jsonb_build_object(
    'ok', true, 'presente', true, 'provider', p_provider,
    'attivo', v_riga.attivo, 'test_mode', v_riga.test_mode, 'client_id', v_riga.client_id,
    'payee_email', v_riga.payee_email, 'iban', v_riga.iban,
    'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null)
  );
end;
$$;

-- ── 5. Permessi: SOLO service_role (pattern crea_ordine) ────────────────────
revoke execute on function public.pagamenti_credenziali_salva(uuid, text, boolean, boolean, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.pagamenti_credenziali_salva(uuid, text, boolean, boolean, text, text, text, text, text, text) to service_role;

revoke execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) to service_role;

notify pgrst, 'reload schema';

commit;
