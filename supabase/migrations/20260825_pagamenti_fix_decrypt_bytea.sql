-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE F1.1: FIX pgp_sym_decrypt su colonne text
--
-- Causa (verificata): `secret_encrypted` / `webhook_secret_encrypted` sono
-- colonne TEXT. `pgp_sym_encrypt` (usata in pagamenti_credenziali_salva)
-- restituisce `bytea`, che viene salvato con un cast IMPLICITO bytea→text
-- (in formato hex con prefisso \x, bytea_output=hex).
--
-- In `pagamenti_credenziali_leggi` il valore veniva letto come text e
-- passato a `pgp_sym_decrypt(text, text)`: NON esiste alcun overload con
-- primo argomento text → errore 42883 (function does not exist), catturato
-- dal blocco exception → ogni lettura con p_decifra=true falliva con
-- CHIAVE_ERRATA, anche con la chiave corretta.
--
-- Fix: cast esplicito `::bytea` sul valore letto prima della decifratura.
-- Additivo e backward-compatible: nessun dato viene modificato.
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

revoke execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.pagamenti_credenziali_leggi(uuid, text, boolean, text) to service_role;

notify pgrst, 'reload schema';

commit;
