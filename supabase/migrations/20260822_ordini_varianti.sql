-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE E5 VARIANTI: CHECKOUT ATOMICO CON VARIANTE
--
-- Obiettivo: estendere la RPC public.crea_ordine e la RPC
-- public.aggiorna_stato_ordine affinché, quando il payload trasporta
-- varianteId (FASE E4):
--   - la variante venga verificata e LOCKATA con SELECT ... FOR UPDATE;
--   - prezzo e stock vengano letti ESCLUSIVAMENTE dal DB (mai dal client);
--   - venga decrementato atomicamente SOLO lo stock della variante
--     (mai anche quello del prodotto padre: il trigger E1
--     aggiorna_prodotto_da_varianti ricalcola l'aggregato del padre);
--   - ordini_righe salvi variante_id + variante_nome (snapshot stabile);
--   - idempotenza e transazione restino atomiche (comportamento attuale);
--   - i prodotti legacy (senza varianteId) continuino a funzionare
--     ESATTAMENTE come oggi.
--
-- In annullamento (aggiorna_stato_ordine → 'cancellato'):
--   - riga con variante_id IS NOT NULL → ripristina variante.quantita_disponibile
--     (il trigger E1 aggiorna l'aggregato del padre; mai incremento diretto);
--   - riga legacy o variante eliminata (ON DELETE SET NULL) → ripristina
--     prodotti.quantita_disponibile come oggi;
--   - la transizione cancellato→cancellato è impossibile (no-op idempotente)
--     → nessun doppio ripristino.
--
-- Backward-compatible: nessun dato esistente viene toccato; nessuna colonna
-- aggiunta (variante_id/variante_nome su ordini_righe sono già presenti
-- dalla 20260821_prodotto_varianti.sql); sola sostituzione delle due RPC.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. RPC crea_ordine: supporto variante (atomico, security definer) ──────
create or replace function public.crea_ordine(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key            text;
  v_prodotto_id    bigint;
  v_variante_id    uuid;
  v_quantita       integer;
  v_quantita_num   numeric;
  v_modalita       text;
  v_cliente_user_id uuid;
  v_cliente_nome   text;
  v_cliente_cognome text;
  v_cliente_telefono text;
  v_cliente_email  text;
  v_cliente_ip     text;
  v_ritiro_data    text;
  v_ritiro_fascia  text;
  v_sped_indirizzo text;
  v_sped_cap       text;
  v_sped_citta     text;
  v_sped_prov      text;
  v_sped_note      text;
  v_metodo_sped    text;
  v_metodo_pag     text;
  v_note           text;
  v_prodotto       record;
  v_negozio        record;
  v_variante       record;
  v_ordine         record;
  v_prezzo         numeric;
  v_immagine_riga  text;
  v_variante_nome  text;
  v_costo_sped     numeric := 0;
  v_totale         numeric;
begin
  -- ── estrazione + validazione difensiva del payload (barriera finale) ──
  v_key := p_payload ->> 'idempotencyKey';
  if v_key is null or length(v_key) = 0 or length(v_key) > 64 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Chiave di idempotenza non valida.');
  end if;

  if p_payload ->> 'prodottoId' is null or p_payload ->> 'prodottoId' !~ '^[0-9]+$' then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Prodotto non valido.');
  end if;
  v_prodotto_id := (p_payload ->> 'prodottoId')::bigint;

  -- FASE E5 — variante: assente/vuota → NULL (legacy); malformata → rifiutata.
  begin
    v_variante_id := nullif(p_payload ->> 'varianteId', '')::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida.');
  end;

  v_quantita_num := (p_payload ->> 'quantita')::numeric;
  if v_quantita_num is null or v_quantita_num <> trunc(v_quantita_num)
     or v_quantita_num < 1 or v_quantita_num > 99 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Quantità non valida (1-99).');
  end if;
  v_quantita := v_quantita_num::integer;

  v_modalita := p_payload ->> 'modalita';
  if v_modalita not in ('ritiro', 'spedizione') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Modalità di consegna non valida.');
  end if;

  v_cliente_nome := coalesce(p_payload ->> 'clienteNome', '');
  v_cliente_cognome := coalesce(p_payload ->> 'clienteCognome', '');
  if length(v_cliente_nome) = 0 or length(v_cliente_cognome) = 0
     or length(v_cliente_nome) > 80 or length(v_cliente_cognome) > 80 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Nome e cognome sono obbligatori.');
  end if;
  v_cliente_telefono := p_payload ->> 'clienteTelefono';
  v_cliente_email := p_payload ->> 'clienteEmail';
  v_cliente_ip := p_payload ->> 'clienteIp';
  v_ritiro_data := p_payload ->> 'ritiroData';
  v_ritiro_fascia := p_payload ->> 'ritiroFascia';
  v_sped_indirizzo := p_payload ->> 'spedizioneIndirizzo';
  v_sped_cap := p_payload ->> 'spedizioneCap';
  v_sped_citta := p_payload ->> 'spedizioneCitta';
  v_sped_prov := p_payload ->> 'spedizioneProvincia';
  v_sped_note := p_payload ->> 'spedizioneNote';
  v_metodo_sped := p_payload ->> 'metodoSpedizione';
  v_metodo_pag := p_payload ->> 'metodoPagamento';
  v_note := p_payload ->> 'note';

  -- ── Cliente autenticato (SERVER-ONLY) ──────────────────────────────────
  begin
    v_cliente_user_id := nullif(p_payload ->> 'clienteUserId', '')::uuid;
  exception
    when invalid_text_representation then
      v_cliente_user_id := null;
  end;

  if v_cliente_user_id is not null then
    begin
      if not exists (select 1 from auth.users u where u.id = v_cliente_user_id) then
        v_cliente_user_id := null;
      end if;
    exception
      when others then
        v_cliente_user_id := null;
    end;
  end if;

  if v_modalita = 'spedizione' then
    if v_sped_indirizzo is null or length(v_sped_indirizzo) = 0
       or v_sped_cap is null or v_sped_citta is null or length(v_sped_citta) = 0
       or v_sped_prov is null or length(v_sped_prov) = 0 then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Dati di spedizione incompleti.');
    end if;
    if v_sped_cap !~ '^[0-9]{5}$' then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il CAP deve essere composto da 5 cifre.');
    end if;
    if v_metodo_sped not in ('standard', 'express') then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Metodo di spedizione non valido.');
    end if;
    if v_metodo_pag not in ('carta', 'paypal', 'bonifico') then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Metodo di pagamento non valido.');
    end if;
  end if;

  -- ── 1. Idempotenza: ordine già esistente con questa chiave → lo restituisce ──
  --    (nessun nuovo insert, nessun secondo decremento di stock)
  select * into v_ordine
  from public.ordini
  where idempotency_key = v_key
  limit 1;

  if v_ordine.id is not null then
    return jsonb_build_object('ok', true, 'giaEsistente', true, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

  -- ── 2. LOCK riga prodotto: serializza gli ordini concorrenti ──────────────
  select * into v_prodotto
  from public.prodotti
  where id = v_prodotto_id
  for update;

  if v_prodotto.id is null then
    return jsonb_build_object('ok', false, 'codice', 'PRODOTTO_NON_TROVATO', 'messaggio', 'Prodotto non trovato.');
  end if;
  if not coalesce(v_prodotto.attivo, false) then
    return jsonb_build_object('ok', false, 'codice', 'PRODOTTO_INATTIVO', 'messaggio', 'Questo prodotto non è più disponibile.');
  end if;

  -- ── 3. Negozio: SEMPRE risolto dal prodotto (mai fidarsi del client) ──────
  select * into v_negozio
  from public.negozi
  where id = v_prodotto.negozio_id;

  if v_negozio.id is null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;
  if not coalesce(v_negozio.attivo, false) or v_negozio.deleted_at is not null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_INATTIVO', 'messaggio', 'Il negozio non è più attivo.');
  end if;

  -- ── 3bis. FASE E5 — coerenza variante ↔ prodotto ─────────────────────────
  --    Regole (difesa in profondità; il layer TS applica già gli stessi):
  --      - prodotto con varianti (ha_varianti) SENZA varianteId → rifiutato;
  --      - varianteId su prodotto legacy → rifiutato;
  --      - varianteId di un ALTRO prodotto / inesistente / inattiva → rifiutato.
  if coalesce(v_prodotto.ha_varianti, false) and v_variante_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VARIANTE_OBBLIGATORIA', 'messaggio', 'Seleziona una variante del prodotto.');
  end if;
  if not coalesce(v_prodotto.ha_varianti, false) and v_variante_id is not null then
    return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto.');
  end if;

  if v_variante_id is not null then
    -- LOCK riga variante: serializza gli acquisti concorrenti sulla stessa
    -- variante (dopo il lock del prodotto: ordine di lock coerente → niente
    -- deadlock tra ordini concorrenti).
    select * into v_variante
    from public.prodotto_varianti
    where id = v_variante_id
    for update;

    if v_variante.id is null then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non trovata.');
    end if;
    -- Appartenenza al prodotto indicato (mai fidarsi del client)
    if v_variante.prodotto_id <> v_prodotto_id then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto.');
    end if;
    if not coalesce(v_variante.attivo, false) then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Questa variante non è più disponibile.');
    end if;
  end if;

  -- ── 4. Prezzo, disponibilità e immagine (dal DATABASE) ───────────────────
  if v_variante_id is not null then
    -- Prezzo variante se valorizzato, altrimenti prezzo del prodotto padre
    -- (per i prodotti con varianti prodotti.prezzo è l'aggregato del trigger).
    v_prezzo := coalesce(v_variante.prezzo, v_prodotto.prezzo);
    if v_prezzo is null or v_prezzo < 0 then
      return jsonb_build_object('ok', false, 'codice', 'PREZZO_NON_VALIDO', 'messaggio', 'Prezzo del prodotto non valido.');
    end if;

    -- Disponibilità REALE della variante = disponibile - riservata.
    -- Se insufficiente → rifiuto (nessun decremento, rollback implicito).
    if v_variante.quantita_disponibile - v_variante.quantita_riservata < v_quantita then
      return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
        'messaggio', 'Disponibilità insufficiente (restano ' ||
          (v_variante.quantita_disponibile - v_variante.quantita_riservata) || ' pezzi).');
    end if;

    v_immagine_riga := coalesce(v_variante.immagine_principale, v_prodotto.immagine_principale);
    v_variante_nome := v_variante.nome;
  else
    -- Prodotto legacy: comportamento attuale IDENTICO.
    v_prezzo := v_prodotto.prezzo;
    if v_prezzo is null or v_prezzo < 0 then
      return jsonb_build_object('ok', false, 'codice', 'PREZZO_NON_VALIDO', 'messaggio', 'Prezzo del prodotto non valido.');
    end if;

    if v_prodotto.quantita_disponibile is not null then
      if v_prodotto.quantita_disponibile < v_quantita then
        return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
          'messaggio', 'Disponibilità insufficiente (restano ' || v_prodotto.quantita_disponibile || ' pezzi).');
      end if;
    end if;

    v_immagine_riga := v_prodotto.immagine_principale;
    v_variante_nome := null;
  end if;

  -- ── 5. Totale calcolato dal server (mai dal client) ──────────────────────
  if v_modalita = 'spedizione' then
    if v_metodo_sped = 'express' then
      v_costo_sped := 12.9;
    else
      v_costo_sped := 5.9;
    end if;
  end if;
  v_totale := round((v_prezzo * v_quantita + v_costo_sped)::numeric, 2);

  -- ── 6. Insert ordine (numero via sequenza LH-..., idempotency_key UNIQUE) ──
  insert into public.ordini (
    idempotency_key, modalita, totale, negozio_id, negozio_nome,
    cliente_user_id, cliente_nome, cliente_cognome, cliente_telefono, cliente_email, cliente_ip,
    ritiro_data, ritiro_fascia,
    spedizione_indirizzo, spedizione_cap, spedizione_citta, spedizione_provincia, spedizione_note,
    metodo_spedizione, costo_spedizione, metodo_pagamento, note
  ) values (
    v_key, v_modalita, v_totale, v_negozio.id, v_negozio.nome,
    v_cliente_user_id, v_cliente_nome, v_cliente_cognome, v_cliente_telefono, v_cliente_email, v_cliente_ip,
    case when v_modalita = 'ritiro' then v_ritiro_data else null end,
    case when v_modalita = 'ritiro' then v_ritiro_fascia else null end,
    case when v_modalita = 'spedizione' then v_sped_indirizzo else null end,
    case when v_modalita = 'spedizione' then v_sped_cap else null end,
    case when v_modalita = 'spedizione' then v_sped_citta else null end,
    case when v_modalita = 'spedizione' then v_sped_prov else null end,
    case when v_modalita = 'spedizione' then v_sped_note else null end,
    case when v_modalita = 'spedizione' then v_metodo_sped else null end,
    v_costo_sped,
    case when v_modalita = 'spedizione' then v_metodo_pag else null end,
    v_note
  )
  returning * into v_ordine;

  -- ── 7. Riga ordine (snapshot completo: variante inclusa) ──────────────────
  insert into public.ordini_righe (
    ordine_id, prodotto_id, variante_id, variante_nome,
    nome_prodotto, prezzo_unitario, quantita, immagine_url
  ) values (
    v_ordine.id, v_prodotto_id, v_variante_id, v_variante_nome,
    v_prodotto.nome, v_prezzo, v_quantita, v_immagine_riga
  );

  -- ── 8. Decremento atomico scorte (ULTIMA operazione: qualunque errore ─────
  --    precedente annulla l'intera transazione → nessun decremento orfano) ──
  if v_variante_id is not null then
    -- Decrementa SOLO la variante; il trigger E1 (aggiorna_prodotto_da_varianti)
    -- ricalcola automaticamente l'aggregato del padre (mai doppio decremento).
    update public.prodotto_varianti
    set quantita_disponibile = quantita_disponibile - v_quantita
    where id = v_variante_id
      and quantita_disponibile - v_quantita >= 0;

    if not found then
      -- Irraggiungibile (lock della riga + verifica stock sopra): se mai
      -- accadesse, fail-closed con rollback totale.
      raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
    end if;
  else
    if v_prodotto.quantita_disponibile is not null then
      update public.prodotti
      set quantita_disponibile = quantita_disponibile - v_quantita
      where id = v_prodotto_id
        and quantita_disponibile - v_quantita >= 0;

      if not found then
        raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'giaEsistente', false, 'ordine', public.ordine_to_json(v_ordine.id));

exception
  when unique_violation then
    -- Corsa di idempotenza: restituisci l'ordine esistente.
    select * into v_ordine
    from public.ordini
    where idempotency_key = v_key
    limit 1;

    if v_ordine.id is not null then
      return jsonb_build_object('ok', true, 'giaEsistente', true, 'ordine', public.ordine_to_json(v_ordine.id));
    end if;
    raise;
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare l''ordine.');
end;
$$;

-- Permessi invariati: la RPC resta eseguibile SOLO dal server (service role).
revoke execute on function public.crea_ordine(jsonb) from public, anon, authenticated;
grant execute on function public.crea_ordine(jsonb) to service_role;

-- ── 2. RPC aggiorna_stato_ordine: ripristino stock variante in annullamento ─
create or replace function public.aggiorna_stato_ordine(
  p_ordine_id uuid,
  p_nuovo_stato text,
  p_motivo text default null,
  p_nota text default null,
  p_merchant_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine record;
  v_riga   record;
begin
  -- ── Validazione di base ────────────────────────────────────────────────────
  if p_ordine_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  end if;
  if p_nuovo_stato is null or p_nuovo_stato not in (
    'in_preparazione', 'confermato', 'in_lavorazione', 'pronto',
    'in_consegna', 'consegnato', 'cancellato'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato non valido.');
  end if;

  -- ── Lock riga ordine: serializza le operazioni concorrenti ─────────────────
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  -- ── Ownership server-side (difesa in profondità; la route già verifica) ────
  if p_merchant_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Utente non autorizzato.');
  end if;
  if not exists (
    select 1 from public.negozi n
    where n.id = v_ordine.negozio_id
      and n.owner_user_id = p_merchant_user_id
  ) and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_merchant_user_id
      and ur.role = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questo ordine.');
  end if;

  -- ── Idempotenza: stessa stato → no-op (retry: nessun doppio effetto, ──────
  --    nessuna seconda email, nessun doppio ripristino stock) ────────────────
  if v_ordine.stato = p_nuovo_stato then
    return jsonb_build_object('ok', true, 'cambiato', false, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

  -- ── Macchina a stati (transizioni consentite) ──────────────────────────────
  if not (
    (v_ordine.stato = 'in_preparazione' and p_nuovo_stato in ('confermato', 'cancellato'))
    or (v_ordine.stato = 'confermato' and p_nuovo_stato in ('in_lavorazione', 'cancellato'))
    or (v_ordine.stato = 'in_lavorazione' and p_nuovo_stato in ('pronto', 'cancellato'))
    or (v_ordine.stato = 'pronto' and p_nuovo_stato in ('consegnato', 'cancellato'))
    or (v_ordine.stato = 'in_consegna' and p_nuovo_stato in ('consegnato', 'cancellato'))
  ) then
    return jsonb_build_object('ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA', 'messaggio', 'Transizione di stato non consentita.');
  end if;

  -- ── Annullamento: motivo OBBLIGATORIO ──────────────────────────────────────
  if p_nuovo_stato = 'cancellato' and (p_motivo is null or length(btrim(p_motivo)) = 0) then
    return jsonb_build_object('ok', false, 'codice', 'MOTIVO_OBBLIGATORIO', 'messaggio', 'Indica un motivo per l''annullamento.');
  end if;

  -- ── Aggiornamento stato (atomico; il trigger registra l'evento) ────────────
  update public.ordini
  set stato = p_nuovo_stato,
      aggiornato_da = p_merchant_user_id,
      updated_at = now(),
      annullato_motivo = case when p_nuovo_stato = 'cancellato' then left(btrim(coalesce(p_motivo, '')), 120) else null end,
      annullato_nota = case when p_nuovo_stato = 'cancellato' then left(btrim(coalesce(p_nota, '')), 500) else null end,
      annullato_at = case when p_nuovo_stato = 'cancellato' then now() else null end,
      annullato_da = case when p_nuovo_stato = 'cancellato' then p_merchant_user_id else null end
  where id = p_ordine_id;

  -- ── Ripristino ATOMICO dello stock in caso di annullamento ─────────────────
  -- FASE E5: se la riga ha variante_id → ripristina la VARIANTE (il trigger E1
  -- aggiorna l'aggregato del padre); altrimenti (legacy O variante eliminata
  -- con ON DELETE SET NULL) → ripristina il prodotto padre come oggi.
  -- La transizione cancellato→cancellato è impossibile → ripristino UNA sola
  -- volta. Lock delle righe per serializzare.
  if p_nuovo_stato = 'cancellato' then
    for v_riga in
      select *
      from public.ordini_righe
      where ordine_id = p_ordine_id
      for update
    loop
      if v_riga.variante_id is not null then
        update public.prodotto_varianti
        set quantita_disponibile = quantita_disponibile + v_riga.quantita,
            updated_at = now()
        where id = v_riga.variante_id;
      else
        update public.prodotti
        set quantita_disponibile = quantita_disponibile + v_riga.quantita,
            updated_at = now()
        where id = v_riga.prodotto_id
          and quantita_disponibile is not null;
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'cambiato', true, 'ordine', public.ordine_to_json(v_ordine.id));

exception
  when others then
    -- Rollback totale: nessuna modifica parziale a stato/stock/eventi.
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare l''ordine.');
end;
$$;

-- ── 3. Permessi: la RPC è usata SOLO dal server (service role) ───────────────
revoke execute on function public.aggiorna_stato_ordine(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aggiorna_stato_ordine(uuid, text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
