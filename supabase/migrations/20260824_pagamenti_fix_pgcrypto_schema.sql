-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE F1.1: FIX pgcrypto schema per le RPC credenziali
--
-- Causa: su questo progetto Supabase, pgcrypto è installata nello schema
-- `extensions` (non `public`). Le RPC `pagamenti_credenziali_salva` e
-- `pagamenti_credenziali_leggi` erano state create con
-- `set search_path = public` → all'interno della funzione le funzioni
-- pgp_sym_encrypt / pgp_sym_decrypt non risultavano risolvibili e ogni
-- salvataggio/lettura con decifratura falliva con SAVE_FAILED/CHIAVE_ERRATA.
--
-- Fix additivo e backward-compatible: estende il search_path con
-- `extensions` (preservando public). Nessun dato viene toccato.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── pagamenti_credenziali_salva: search_path = public, extensions ───────
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
set search_path = public, extensions
as $$
begin
  if p_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Negozio non valido.');
  end if;
  if p_provider is null or p_provider not in ('klarna', 'scalapay', 'paypal', 'stripe', 'bonifico') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Provider non valido.');
  end if;
  if not exists (select 1 from public.negozi where id = p_negozio_id) then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;

  if p_provider = 'bonifico' then
    p_secret := null;
    p_webhook_secret := null;
  end if;

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
    attivo              = coalesce(p_attivo, public.negozio_pagamenti.attivo),
    test_mode           = coalesce(p_test_mode, public.negozio_pagamenti.test_mode),
    client_id           = coalesce(p_client_id, public.negozio_pagamenti.client_id),
    payee_email         = coalesce(p_payee_email, public.negozio_pagamenti.payee_email),
    iban                = coalesce(p_iban, public.negozio_pagamenti.iban),
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

-- ── pagamenti_credenziali_leggi: search_path = public, extensions ────────
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

  return jsonb_build_object(
    'ok', true, 'presente', true, 'provider', p_provider,
    'attivo', v_riga.attivo, 'test_mode', v_riga.test_mode, 'client_id', v_riga.client_id,
    'payee_email', v_riga.payee_email, 'iban', v_riga.iban,
    'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null)
  );
end;
$$;

-- ── Permessi invariati: SOLO service_role ────────────────────────────────
revoke execute on function public.pagamenti_credenziali_salva(uuid, text, boolean, boolean, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.pagamenti_credenziali_salva(uuid, text, boolean, boolean, text, text, text, text, text, text) to service_role;

revoke execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) to service_role;

notify pgrst, 'reload schema';

commit;
