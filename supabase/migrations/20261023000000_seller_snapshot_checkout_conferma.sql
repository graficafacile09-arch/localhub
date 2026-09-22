begin;

-- InCittà — Seller Snapshot: ordine congelato all'atto della conferma pagamento.
-- Migration ADDITIVA: non modifica ordini storici e non tocca la grafica/UI.
-- Le colonne vengono mantenute anche se già presenti sul DB remoto.

alter table public.ordini
  add column if not exists venditore_identity_id uuid,
  add column if not exists venditore_denominazione_legale text,
  add column if not exists venditore_nome_commerciale text,
  add column if not exists venditore_forma_giuridica text,
  add column if not exists venditore_partita_iva text,
  add column if not exists venditore_codice_fiscale text,
  add column if not exists venditore_pec text,
  add column if not exists venditore_sede_legale text,
  add column if not exists venditore_email text,
  add column if not exists venditore_telefono text,
  add column if not exists venditore_stato_verifica text,
  add column if not exists venditore_valida_dal timestamptz,
  add column if not exists venditore_valida_al timestamptz,
  add column if not exists venditore_origine_dati text;

create or replace function public.resolve_seller_identity(p_negozio_id uuid)
returns table(
  identity_id uuid,
  denominazione_legale text,
  nome_commerciale text,
  forma_giuridica text,
  partita_iva text,
  codice_fiscale text,
  pec text,
  sede_legale text,
  email text,
  telefono text,
  stato_verifica text,
  valida_dal timestamptz,
  valida_al timestamptz,
  origine_dati text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_negozio record;
  v_venditore record;
  v_identity record;
begin
  if p_negozio_id is null then
    raise exception using errcode = '22023', message = 'NEGOZIO_NON_VALIDO';
  end if;

  select n.id, n.merchant_id,
         to_jsonb(n) ->> 'partita_iva' as partita_iva,
         to_jsonb(n) ->> 'codice_fiscale' as codice_fiscale,
         to_jsonb(n) ->> 'pec' as pec,
         to_jsonb(n) ->> 'sede_legale' as sede_legale,
         n.email
    into v_negozio
  from public.negozi n
  where n.id = p_negozio_id;

  if v_negozio.id is null then
    raise exception using errcode = 'P0001', message = 'NEGOZIO_NON_TROVATO';
  end if;

  if v_negozio.merchant_id is null then
    raise exception using errcode = 'P0001', message = 'NEGOZIO_SENZA_MERCHANT';
  end if;

  select v.id, v.current_identity_id
    into v_venditore
  from public.venditori v
  where v.id = v_negozio.merchant_id;

  if v_venditore.id is null then
    raise exception using errcode = 'P0001', message = 'MERCHANT_NON_TROVATO';
  end if;

  if v_venditore.current_identity_id is null then
    raise exception using errcode = 'P0001', message = 'MERCHANT_SENZA_IDENTITY_CORRENTE';
  end if;

  select i.*
    into v_identity
  from public.identita_venditore i
  where i.id = v_venditore.current_identity_id;

  if v_identity.id is null then
    raise exception using errcode = 'P0001', message = 'IDENTITY_NON_TROVATA';
  end if;

  if v_identity.merchant_id is distinct from v_venditore.id then
    raise exception using errcode = 'P0001', message = 'IDENTITY_MERCHANT_NON_COERENTE';
  end if;

  return query
  select
    v_identity.id,
    v_identity.denominazione_legale,
    v_identity.nome_commerciale,
    v_identity.forma_giuridica,
    coalesce(v_identity.partita_iva, v_negozio.partita_iva),
    coalesce(v_identity.codice_fiscale, v_negozio.codice_fiscale),
    coalesce(v_identity.pec, v_negozio.pec),
    coalesce(v_identity.sede_legale, v_negozio.sede_legale),
    coalesce(v_identity.email, v_negozio.email),
    v_identity.telefono,
    v_identity.stato_verifica,
    v_identity.valida_dal,
    v_identity.valida_al,
    v_identity.origine_dati;
end;
$$;

create or replace function public.checkout_intento_conferma(
  p_sessione_id uuid,
  p_payment_id text,
  p_transaction_id text,
  p_importo numeric,
  p_valuta text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessione record;
  v_payload jsonb;
  v_righe jsonb;
  v_riga jsonb;
  v_ordine_id uuid;
  v_totale numeric;
  v_costo_sped numeric;
  v_negozio_id uuid;
  v_negozio_nome text;
  v_provider text;
  v_metodo_pag text;
  v_commissione_pct numeric;
  v_commissione numeric;
  v_prodotto_id bigint;
  v_variante_id uuid;
  v_quantita integer;
  v_fatt_diversa boolean;
  v_seller record;
begin
  if p_sessione_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Sessione non valida.');
  end if;

  select * into v_sessione
  from public.pagamenti_sessioni
  where id = p_sessione_id
  for update;

  if v_sessione.id is null then
    return jsonb_build_object('ok', false, 'codice', 'CHECKOUT_NON_TROVATO', 'messaggio', 'Checkout non trovato.');
  end if;

  if v_sessione.ordine_id is not null then
    return jsonb_build_object(
      'ok', true, 'giaEsistente', true,
      'ordine', public.ordine_to_json(v_sessione.ordine_id)
    );
  end if;

  if v_sessione.status not in ('created', 'pending') then
    return jsonb_build_object('ok', false, 'codice', 'CHECKOUT_NON_DISPONIBILE',
      'messaggio', 'Questo checkout non è più confermabile.');
  end if;

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

  v_totale := (v_payload ->> 'totale')::numeric;
  v_costo_sped := coalesce((v_payload ->> 'costoSpedizione')::numeric, 0);
  v_negozio_id := (v_payload ->> 'negozioId')::uuid;
  v_negozio_nome := v_payload ->> 'negozioNome';
  v_provider := v_sessione.provider;
  v_commissione_pct := (v_payload ->> 'commissionePercentuale')::numeric;
  v_commissione := coalesce((v_payload ->> 'commissioneImporto')::numeric, 0);
  v_fatt_diversa := coalesce((v_payload -> 'fatturazione' ->> 'diversa')::boolean, false);

  if v_totale is null or v_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'PAYLOAD_NON_VALIDO',
      'messaggio', 'Payload del checkout incompleto.');
  end if;

  -- Congeliamo l'identità del venditore PRIMA dell'INSERT ordine.
  -- Gli ordini storici restano invariati.
  select * into v_seller
  from public.resolve_seller_identity(v_negozio_id);

  if p_importo is null or round(p_importo::numeric, 2) <> round(v_totale, 2) then
    return jsonb_build_object('ok', false, 'codice', 'IMPORTO_NON_COERENTE',
      'messaggio', 'Importo del pagamento non coerente con il checkout.');
  end if;

  if coalesce(upper(p_valuta), '') <> 'EUR' then
    return jsonb_build_object('ok', false, 'codice', 'VALUTA_NON_VALIDA',
      'messaggio', 'Valuta non valida.');
  end if;

  v_metodo_pag := case when v_provider = 'paypal' then 'paypal' else 'carta' end;

  insert into public.ordini (
    idempotency_key, modalita, totale, negozio_id, negozio_nome,
    venditore_identity_id, venditore_denominazione_legale, venditore_nome_commerciale,
    venditore_forma_giuridica, venditore_partita_iva, venditore_codice_fiscale,
    venditore_pec, venditore_sede_legale, venditore_email, venditore_telefono,
    venditore_stato_verifica, venditore_valida_dal, venditore_valida_al, venditore_origine_dati,
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
    v_seller.identity_id, v_seller.denominazione_legale, v_seller.nome_commerciale,
    v_seller.forma_giuridica, v_seller.partita_iva, v_seller.codice_fiscale,
    v_seller.pec, v_seller.sede_legale, v_seller.email, v_seller.telefono,
    v_seller.stato_verifica, v_seller.valida_dal, v_seller.valida_al, v_seller.origine_dati,
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

  for v_riga in select value from jsonb_array_elements(v_righe)
  loop
    v_prodotto_id := (v_riga ->> 'prodottoId')::bigint;
    v_variante_id := nullif(v_riga ->> 'varianteId', '')::uuid;
    v_quantita := (v_riga ->> 'quantita')::integer;

    if v_variante_id is not null then
      update public.prodotto_varianti
      set quantita_disponibile = quantita_disponibile - v_quantita,
          quantita_riservata = quantita_riservata - v_quantita,
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
          quantita_riservata = quantita_riservata - v_quantita,
          updated_at = now()
      where id = v_prodotto_id
        and (quantita_disponibile is null or quantita_disponibile - v_quantita >= 0)
        and quantita_riservata - v_quantita >= 0;
      if not found then
        raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
      end if;
    end if;
  end loop;

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
    select ordine_id into v_ordine_id
    from public.pagamenti_sessioni
    where id = p_sessione_id;
    if v_ordine_id is not null then
      return jsonb_build_object('ok', true, 'giaEsistente', true,
        'ordine', public.ordine_to_json(v_ordine_id));
    end if;
    raise;
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED',
      'messaggio', 'Impossibile creare l''ordine.');
end;
$$;

revoke execute on function public.checkout_intento_conferma(uuid, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.checkout_intento_conferma(uuid, text, text, numeric, text) to service_role;

notify pgrst, 'reload schema';
commit;
