-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — P1 PAYMENT-FIRST: RPC CHECKOUT_INTENTO_ANNULLA
--
-- Annulla un INTENTO di checkout (pagamenti_sessioni con ordine_id = NULL)
-- rilasciando la RISERVA di stock (quantita_riservata) e portando la
-- sessione a status = 'expired'. Usata dal livello checkout quando la
-- creazione della sessione PROVIDER fallisce DOPO la riserva (regola P1:
-- mai riserve fantasma, mai ordini) e, in fasi successive, dalla sweep.
--
-- Idempotente e fail-safe:
--   - intento inesistente → ok (nulla da annullare);
--   - sessione con ordine_id valorizzato (non è un intento) → rifiuta;
--   - status non più attivo (già paid/expired/failed) → ok senza riscritture
--     (la riserva è già stata gestita altrove);
--   - rilascio stock: quantita_riservata − quantita, mai sotto zero
--     (greatest(…, 0)); nessuna modifica a quantita_disponibile;
--   - lock della sessione (SELECT … FOR UPDATE) prima del rilascio:
--     nessuna corsa con una eventuale conferma webhook.
--
-- SECURITY DEFINER + solo service_role (pattern checkout_intento_crea).
-- Migration ADDITIVA: non tocca crea_ordine/crea_ordine_carrello,
-- checkout_intento_crea né alcun flusso esistente.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create or replace function public.checkout_intento_annulla(p_checkout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessione  record;
  v_riga      jsonb;
  v_prodotto_id bigint;
  v_variante_id uuid;
  v_quantita  integer;
  v_rilasciato boolean := false;
begin
  if p_checkout_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Checkout non valido.');
  end if;

  select * into v_sessione
  from public.pagamenti_sessioni
  where id = p_checkout_id
  for update;

  if v_sessione.id is null then
    -- Intento inesistente: nulla da annullare (idempotente).
    return jsonb_build_object('ok', true, 'annullato', false);
  end if;

  -- Solo intenti (ordine_id NULL) attivi sono annullabili da qui.
  if v_sessione.ordine_id is not null then
    return jsonb_build_object('ok', false, 'codice', 'CHECKOUT_NON_ANNULLABILE',
      'messaggio', 'Questo checkout non è annullabile: appartiene a un ordine.');
  end if;
  if v_sessione.status not in ('created', 'pending') then
    -- Già concluso (paid/expired/failed): riserva già gestita altrove.
    return jsonb_build_object('ok', true, 'annullato', false);
  end if;

  -- ── Rilascio atomico della riserva (mai sotto zero) ───────────────────
  if v_sessione.checkout_payload is not null
     and jsonb_typeof(v_sessione.checkout_payload -> 'righe') = 'array' then
    for v_riga in
      select value from jsonb_array_elements(v_sessione.checkout_payload -> 'righe')
    loop
      v_prodotto_id := (v_riga ->> 'prodottoId')::bigint;
      v_quantita    := (v_riga ->> 'quantita')::integer;
      begin
        v_variante_id := nullif(v_riga ->> 'varianteId', '')::uuid;
      exception
        when invalid_text_representation then
          v_variante_id := null;
      end;

      if v_variante_id is not null then
        update public.prodotto_varianti
        set quantita_riservata = greatest(quantita_riservata - v_quantita, 0),
            updated_at = now()
        where id = v_variante_id;
      else
        update public.prodotti
        set quantita_riservata = greatest(quantita_riservata - v_quantita, 0),
            updated_at = now()
        where id = v_prodotto_id;
      end if;
      v_rilasciato := true;
    end loop;
  end if;

  update public.pagamenti_sessioni
  set status = 'expired', updated_at = now()
  where id = p_checkout_id;

  return jsonb_build_object('ok', true, 'annullato', true, 'stockRilasciato', v_rilasciato);
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED',
      'messaggio', 'Impossibile annullare il checkout.');
end;
$$;

revoke execute on function public.checkout_intento_annulla(uuid) from public, anon, authenticated;
grant execute on function public.checkout_intento_annulla(uuid) to service_role;

notify pgrst, 'reload schema';

commit;