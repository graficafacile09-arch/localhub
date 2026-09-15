-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — B5: MERCHANT PAYMENTS UI STATE
--
-- La UI merchant legge la configurazione tramite
-- `pagamenti_credenziali_leggi(p_decifra = false)`. Le migration B1/B4
-- aggiungono le colonne di stato, ma la versione precedente della RPC non le
-- include ancora nel payload. Senza questa estensione la UI non potrebbe
-- mostrare lo stato reale di capability Stripe o onboarding PayPal.
--
-- La modifica è limitata alla RPC già esistente: nessuna tabella, dato,
-- gateway, secret, webhook o flusso checkout viene cambiato.
-- ═══════════════════════════════════════════════════════════════════════

begin;

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
      -- Le colonne sono TEXT con payload pgcrypto: il cast a bytea è
      -- necessario per pgp_sym_decrypt (fix già applicato in B0).
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
      'attivo', v_riga.attivo, 'test_mode', v_riga.test_mode,
      'client_id', v_riga.client_id, 'payee_email', v_riga.payee_email, 'iban', v_riga.iban,
      'account_id', v_riga.account_id, 'account_name', v_riga.account_name,
      'onboarding_status', v_riga.onboarding_status,
      'payouts_enabled', v_riga.payouts_enabled,
      'charges_enabled', v_riga.charges_enabled,
      'klarna_enabled', v_riga.klarna_enabled,
      'scalapay_enabled', v_riga.scalapay_enabled,
      'merchant_id', v_riga.merchant_id,
      'payments_receivable', v_riga.payments_receivable,
      'primary_email_confirmed', v_riga.primary_email_confirmed,
      'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null),
      'secret', v_secret, 'webhook_secret', v_webhook_secret
    );
  end if;

  -- Lettura merchant/client: nessun secret o valore cifrato nel payload.
  return jsonb_build_object(
    'ok', true, 'presente', true, 'provider', p_provider,
    'attivo', v_riga.attivo, 'test_mode', v_riga.test_mode,
    'client_id', v_riga.client_id, 'payee_email', v_riga.payee_email, 'iban', v_riga.iban,
    'account_id', v_riga.account_id, 'account_name', v_riga.account_name,
    'onboarding_status', v_riga.onboarding_status,
    'payouts_enabled', v_riga.payouts_enabled,
    'charges_enabled', v_riga.charges_enabled,
    'klarna_enabled', v_riga.klarna_enabled,
    'scalapay_enabled', v_riga.scalapay_enabled,
    'merchant_id', v_riga.merchant_id,
    'payments_receivable', v_riga.payments_receivable,
    'primary_email_confirmed', v_riga.primary_email_confirmed,
    'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null)
  );
end;
$$;

revoke execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) to service_role;

notify pgrst, 'reload schema';

commit;
