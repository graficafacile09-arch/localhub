-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — P2 PAYMENT-FIRST: RPC CHECKOUT_INTENTO_CONFERMA
--
-- Converte un INTENTO di checkout (pagamenti_sessioni con ordine_id = NULL,
-- creato dalla P1) in ORDINE COMMERCIALE DEFINITIVO, ma SOLO quando il
-- pagamento è stato realmente confermato dal webhook del provider.
--
-- Tutto nella STESSA transazione atomica (nessuna finestra non-atomica):
--   1. LOCK della sessione (SELECT … FOR UPDATE): serializza le conferme
--      concorrenti della stessa sessione (T10);
--   2. idempotenza: sessione già collegata a un ordine → restituisce
--      l'ordine ESISTENTE, nessun secondo insert, nessuna seconda modifica
--      stock (T7 / webhook duplicato);
--   3. solo intenti ATTIVI (status in 'created','pending'): una sessione
--      chiusa/scaduta NON genera ordine (P2 §12; late-payment = P3);
--   4. legge ESCLUSIVAMENTE checkout_payload (snapshot canonico P1): mai
--      dati mutabili dal catalogo, mai input dal client;
--   5. verifica importo/valuta del pagamento confermato vs snapshot;
--   6. INSERT ordini (payment_status='paid', payment_provider/transaction
--      dalla conferma, commissione e spedizione dagli snapshot) + righe;
--   7. CONVERSIONE RISERVA → VENDITA: quantita_disponibile −= q E
--      quantita_riservata −= q (prodotti e varianti, guardie mai-negative);
--   8. UPDATE sessione: ordine_id = nuovo ordine, status = 'paid'.
--   Qualunque errore → ROLLBACK TOTALE: nessun ordine parziale, nessuna
--   riga parziale, nessuna riserva persa, sessione MAI falsamente paid.
--
-- Idempotenza a due livelli (senza duplicare strategie):
--   - a monte il webhook registra pagamenti_eventi.event_id UNIQUE;
--   - qui il lock + il check ordine_id rendono la conferma idempotente.
--
-- SECURITY DEFINER + solo service_role (pattern checkout_intento_crea).
-- Migration ADDITIVA: non tocca crea_ordine/crea_ordine_carrello né i
-- flussi bonifico/ritiro.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create or replace function public.checkout_intento_conferma(
  p_sessione_id   uuid,
  p_payment_id    text,
  p_transaction_id text,
  p_importo       numeric,
  p_valuta        text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessione        record;
  v_payload         jsonb;
  v_righe           jsonb;
  v_riga            jsonb;
  v_ordine_id       uuid;
  v_totale          numeric;
  v_costo_sped      numeric;
  v_negozio_id      uuid;
  v_negozio_nome    text;
  v_provider        text;
  v_metodo_pag      text;
  v_commissione_pct numeric;
  v_commissione     numeric;
  v_prodotto_id     bigint;
  v_variante_id     uuid;
  v_quantita        integer;
  v_fatt_diversa    boolean;
begin
  if p_sessione_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Sessione non valida.');
  end if;

  -- ── 1. LOCK sessione (conferme concorrenti serializzate) ───────────────
  select * into v_sessione
  from public.pagamenti_sessioni
  where id = p_sessione_id
  for update;

  if v_sessione.id is null then
    return jsonb_build_object('ok', false, 'codice', 'CHECKOUT_NON_TROVATO', 'messaggio', 'Checkout non trovato.');
  end if;

  -- ── 2. IDEMPOTENZA: ordine già creato → restituisci quello esistente ──
  if v_sessione.ordine_id is not null then
    return jsonb_build_object(
      'ok', true, 'giaEsistente', true,
      'ordine', public.ordine_to_json(v_sessione.ordine_id)
    );
  end if;

  -- ── 3. Solo intenti ATTIVI (sessione chiusa/scaduta → nessun ordine) ──
  if v_sessione.status not in ('created', 'pending') then
    return jsonb_build_object('ok', false, 'codice', 'CHECKOUT_NON_DISPONIBILE',
      'messaggio', 'Questo checkout non è più confermabile.');
  end if;

  -- ── 4. Payload snapshot canonico (mai rileggere dati mutabili) ────────
  v_payload := v_sessione.checkout_payload;
  if v_payload is null or coalesce((v_payload ->> 'version')::int, 0) <> 1 then
    return jsonb_build_object('ok', false, 'codice', 'PAYLOAD_NON_VALIDO',
      'messaggio', 'Payload del checkout non valido.');
  end if;
  v_righe := v_payload -> 'righe';
  if jsonb_typeof(v_righe) <> 'array' or jsonb_array_length(v_righe) < 1 then
    return jsonb_build_object('ok', false, 'codice', 'CHECKOUT_SENZA_RIGHE',
      'messaggio', 'Il checkout non ha prodotti.');
  end if;

  v_totale          := (v_payload ->> 'totale')::numeric;
  v_costo_sped      := coalesce((v_payload ->> 'costoSpedizione')::numeric, 0);
  v_negozio_id      := (v_payload ->> 'negozioId')::uuid;
  v_negozio_nome    := v_payload ->> 'negozioNome';
  v_provider        := v_sessione.provider;
  v_commissione_pct := (v_payload ->> 'commissionePercentuale')::numeric;
  v_commissione     := coalesce((v_payload ->> 'commissioneImporto')::numeric, 0);
  v_fatt_diversa    := coalesce((v_payload -> 'fatturazione' ->> 'diversa')::boolean, false);

  if v_totale is null or v_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'PAYLOAD_NON_VALIDO',
      'messaggio', 'Payload del checkout incompleto.');
  end if;

  -- ── 5. Importo/valuta: il pagamento confermato DEVE coincidere ─────────
  if p_importo is null or round(p_importo::numeric, 2) <> round(v_totale, 2) then
    return jsonb_build_object('ok', false, 'codice', 'IMPORTO_NON_COERENTE',
      'messaggio', 'Importo del pagamento non coerente con il checkout.');
  end if;
  if coalesce(upper(p_valuta), '') <> 'EUR' then
    return jsonb_build_object('ok', false, 'codice', 'VALUTA_NON_VALIDA',
      'messaggio', 'Valuta non valida.');
  end if;

  -- metodo_pagamento (vincolo ordini: carta|paypal|bonifico): gli altri
  -- provider online salvano 'carta' e usano payment_provider come marcatore
  -- (stessa convenzione di crea_ordine/crea_ordine_carrello).
  v_metodo_pag := case when v_provider = 'paypal' then 'paypal' else 'carta' end;

  -- ── 6. INSERT ordine (numero da sequenza; idempotency_key = sessione) ─
  insert into public.ordini (
    idempotency_key, modalita, totale, negozio_id, negozio_nome,
    cliente_user_id, cliente_nome, cliente_cognome, cliente_telefono, cliente_email, cliente_ip,
    ritiro_data, ritiro_fascia,
    spedizione_indirizzo, spedizione_cap, spedizione_citta, spedizione_provincia, spedizione_note,
    metodo_spedizione, spedizione_carrier, spedizione_servizio,
    spedizione_tariffa_versione, spedizione_peso_grammi,
    costo_spedizione, commissione_percentuale, commissione_importo,
    metodo_pagamento, note,
    fatturazione_diversa, fatturazione_nome, fatturazione_cognome,
    fatturazione_indirizzo, fatturazione_numero_civico, fatturazione_cap,
    fatturazione_comune, fatturazione_provincia, fatturazione_nazione,
    payment_status, payment_provider, payment_id, payment_transaction_id,
    payment_amount, payment_currency, payment_paid_at
  )
  values (
    v_sessione.id::text, 'spedizione', v_totale, v_negozio_id, v_negozio_nome,
    nullif(v_payload -> 'cliente' ->> 'userId', '')::uuid,
    v_payload -> 'cliente' ->> 'nome',
    v_payload -> 'cliente' ->> 'cognome',
    v_payload -> 'cliente' ->> 'telefono',
    v_payload -> 'cliente' ->> 'email',
    v_payload ->> 'clienteIp',
    null, null,
    v_payload -> 'spedizione' ->> 'indirizzo',
    v_payload -> 'spedizione' ->> 'cap',
    v_payload -> 'spedizione' ->> 'citta',
    v_payload -> 'spedizione' ->> 'provincia',
    v_payload -> 'spedizione' ->> 'note',
    v_payload -> 'spedizione' ->> 'metodoSpedizione',
    v_payload -> 'spedizione' ->> 'carrier',
    v_payload -> 'spedizione' ->> 'servizio',
    v_payload -> 'spedizione' ->> 'tariffaVersione',
    (v_payload -> 'spedizione' ->> 'pesoGrammi')::integer,
    v_costo_sped, v_commissione_pct, v_commissione,
    v_metodo_pag, v_payload ->> 'note',
    v_fatt_diversa,
    case when v_fatt_diversa then v_payload -> 'fatturazione' ->> 'nome' else null end,
    case when v_fatt_diversa then v_payload -> 'fatturazione' ->> 'cognome' else null end,
    case when v_fatt_diversa then v_payload -> 'fatturazione' ->> 'indirizzo' else null end,
    case when v_fatt_diversa then v_payload -> 'fatturazione' ->> 'numeroCivico' else null end,
    case when v_fatt_diversa then v_payload -> 'fatturazione' ->> 'cap' else null end,
    case when v_fatt_diversa then v_payload -> 'fatturazione' ->> 'comune' else null end,
    case when v_fatt_diversa then v_payload -> 'fatturazione' ->> 'provincia' else null end,
    case when v_fatt_diversa then v_payload -> 'fatturazione' ->> 'nazione' else null end,
    'paid', v_provider, p_payment_id, p_transaction_id,
    v_totale, 'EUR', now()
  )
  returning id into v_ordine_id;

  -- ── 7. Righe ordine (snapshot canonico del payload) ────────────────────
  for v_riga in select value from jsonb_array_elements(v_righe)
  loop
    insert into public.ordini_righe (
      ordine_id, prodotto_id, variante_id, variante_nome,
      nome_prodotto, prezzo_unitario, quantita, immagine_url
    ) values (
      v_ordine_id,
      (v_riga ->> 'prodottoId')::bigint,
      nullif(v_riga ->> 'varianteId', '')::uuid,
      v_riga ->> 'varianteNome',
      v_riga ->> 'nomeProdotto',
      (v_riga ->> 'prezzoUnitario')::numeric,
      (v_riga ->> 'quantita')::integer,
      v_riga ->> 'immagineUrl'
    );
  end loop;

  -- ── 8. CONVERSIONE RISERVA → VENDITA DEFINITIVA (atomica, guardata) ───
  --    quantita_disponibile −= q E quantita_riservata −= q, mai negative.
  for v_riga in select value from jsonb_array_elements(v_righe)
  loop
    v_prodotto_id := (v_riga ->> 'prodottoId')::bigint;
    v_variante_id := nullif(v_riga ->> 'varianteId', '')::uuid;
    v_quantita    := (v_riga ->> 'quantita')::integer;

    if v_variante_id is not null then
      update public.prodotto_varianti
      set quantita_disponibile = quantita_disponibile - v_quantita,
          quantita_riservata   = quantita_riservata - v_quantita,
          updated_at = now()
      where id = v_variante_id
        and quantita_disponibile - v_quantita >= 0
        and quantita_riservata - v_quantita >= 0;
      if not found then
        raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
      end if;
    else
      update public.prodotti
      set quantita_disponibile = quantita_disponibile - v_quantita,
          quantita_riservata   = quantita_riservata - v_quantita,
          updated_at = now()
      where id = v_prodotto_id
        and (quantita_disponibile is null or quantita_disponibile - v_quantita >= 0)
        and quantita_riservata - v_quantita >= 0;
      if not found then
        raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- ── 9. Sessione: collegata all'ordine e paid (stessa transazione) ─────
  update public.pagamenti_sessioni
  set ordine_id = v_ordine_id,
      status = 'paid',
      payment_id = coalesce(payment_id, p_payment_id),
      updated_at = now()
  where id = p_sessione_id;

  return jsonb_build_object(
    'ok', true, 'giaEsistente', false,
    'ordine', public.ordine_to_json(v_ordine_id)
  );

exception
  when unique_violation then
    -- Corsa di conferma: un altro processo ha già creato l'ordine mentre
    -- attendevamo il lock → restituisci quello esistente (nessun doppio
    -- insert, nessuna doppia modifica stock).
    select ordine_id into v_ordine_id
    from public.pagamenti_sessioni
    where id = p_sessione_id;
    if v_ordine_id is not null then
      return jsonb_build_object('ok', true, 'giaEsistente', true,
        'ordine', public.ordine_to_json(v_ordine_id));
    end if;
    raise;
  when others then
    -- Rollback TOTALE: nessun ordine parziale, nessuna riga parziale,
    -- riserva intatta, sessione MAI falsamente paid.
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED',
      'messaggio', 'Impossibile creare l''ordine.');
end;
$$;

revoke execute on function public.checkout_intento_conferma(uuid, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.checkout_intento_conferma(uuid, text, text, numeric, text) to service_role;

notify pgrst, 'reload schema';

commit;