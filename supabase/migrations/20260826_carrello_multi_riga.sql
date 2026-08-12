-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE F2.1 CARRELLO: RPC CREA_ORDINE_CARRELLO (multi-riga)
--
-- Obiettivo: creare un ordine multi-riga (2–50 righe) in UNA transazione
-- atomica, senza modificare `public.crea_ordine` (flussi legacy E1–F1 e i
-- loro test restano intatti). La RPC `public.crea_ordine_carrello`:
--
--   1. valida il payload (chiave idempotenza, modalità, cliente, spedizione,
--      righe: 2–50, prodottoId numerico, varianteId uuid|null, quantità 1–99);
--   2. idempotenza via ordini.idempotency_key UNIQUE (retry → giaEsistente,
--      nessun secondo decremento di stock);
--   3. LOCK DETERMINISTICO: tutti i prodotti (SELECT ... FOR UPDATE in
--      ordine crescente di id), poi tutte le varianti (stesso ordine):
--      ordine di lock coerente tra ordini concorrenti → niente deadlock;
--   4. verifiche server-side per ogni riga: prodotto attivo, negozio attivo,
--      TUTTE le righe dello STESSO negozio (altrimenti NEGOZIO_DIVERSO),
--      coerenza variante ↔ prodotto (obbligatoria per ha_varianti, rifiutata
--      sui legacy, appartenenza + attiva come crea_ordine E5);
--   5. prezzo SEMPRE dal DB (variante.prezzo oppure prodotto.prezzo) e
--      disponibilità REALE per riga (variante: disponibile − riservata;
--      legacy: disponibile), con messaggio che indica prodotto e riga;
--   6. totale calcolato esclusivamente dal server: Σ(prezzo × quantità) +
--      costo spedizione applicato UNA SOLA volta per ordine (standard 5.9 /
--      express 12.9, solo modalita='spedizione');
--   7. insert ordine (stesse colonne di crea_ordine, negozio unico) + N righe
--      con snapshot completo (nome, prezzo, immagine, variante_id,
--      variante_nome) + decremento ATOMICO dello stock per ogni riga
--      (variante → variante con trigger E1 sul padre; legacy → prodotto),
--      UPDATE guardato (mai stock negativo) e rollback totale su qualunque
--      errore (nessun decremento orfano);
--   8. ritorno via public.ordine_to_json (già multi-riga).
--
-- Backward-compatible: nessuna colonna/tabella nuova (ordini e ordini_righe
-- sono già multi-riga lato lettura), nessun dato esistente toccato, RPC
-- separata da crea_ordine. Permessi identici: SOLO service_role.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create or replace function public.crea_ordine_carrello(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key            text;
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

  v_righe          jsonb;
  v_n_righe        integer;
  v_riga           jsonb;
  v_pos            integer := 0;
  v_prodotto_id    bigint;
  v_variante_id    uuid;
  v_quantita       integer;
  v_quantita_num   numeric;

  v_prodotto_ids   bigint[];
  v_variante_ids   uuid[];
  v_pid            bigint;
  v_vid            uuid;

  v_prodotto       record;
  v_variante       record;
  v_negozio        record;
  v_ordine         record;
  v_riga_row       record;
  v_negozio_id     uuid;
  v_negozi_distinti integer;
  v_qta_prod       integer;
  v_prezzo         numeric;
  v_totale         numeric := 0;
  v_costo_sped     numeric := 0;
begin
  -- ── estrazione + validazione difensiva del payload (barriera finale) ──
  v_key := p_payload ->> 'idempotencyKey';
  if v_key is null or length(v_key) = 0 or length(v_key) > 64 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Chiave di idempotenza non valida.');
  end if;

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

  -- ── Cliente autenticato (SERVER-ONLY, come crea_ordine E5) ─────────────
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

  -- ── Righe: array JSONB con 2..50 elementi ──────────────────────────────
  v_righe := p_payload -> 'righe';
  if jsonb_typeof(v_righe) <> 'array' then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Carrello non valido.');
  end if;
  v_n_righe := jsonb_array_length(v_righe);
  if v_n_righe < 2 or v_n_righe > 50 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il carrello deve contenere da 2 a 50 prodotti.');
  end if;

  -- ── 1. Idempotenza: ordine già esistente con questa chiave → lo restituisce ──
  select * into v_ordine
  from public.ordini
  where idempotency_key = v_key
  limit 1;

  if v_ordine.id is not null then
    return jsonb_build_object('ok', true, 'giaEsistente', true, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

  -- ── 2. Parsing + validazione righe in una temp table ─────────────────────
  create temp table tt_carrello_righe (
    pos          integer primary key,
    prodotto_id  bigint not null,
    variante_id  uuid,
    quantita     integer not null
  ) on commit drop;

  v_pos := 0;
  for v_riga in select value from jsonb_array_elements(v_righe)
  loop
    v_pos := v_pos + 1;

    if v_riga ->> 'prodottoId' is null or v_riga ->> 'prodottoId' !~ '^[0-9]+$' then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Prodotto non valido (riga ' || v_pos || ').');
    end if;
    v_prodotto_id := (v_riga ->> 'prodottoId')::bigint;

    begin
      v_variante_id := nullif(v_riga ->> 'varianteId', '')::uuid;
    exception
      when invalid_text_representation then
        return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida (riga ' || v_pos || ').');
    end;

    v_quantita_num := (v_riga ->> 'quantita')::numeric;
    if v_quantita_num is null or v_quantita_num <> trunc(v_quantita_num)
       or v_quantita_num < 1 or v_quantita_num > 99 then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Quantità non valida (1-99) per la riga ' || v_pos || '.');
    end if;
    v_quantita := v_quantita_num::integer;

    insert into tt_carrello_righe (pos, prodotto_id, variante_id, quantita)
    values (v_pos, v_prodotto_id, v_variante_id, v_quantita);
  end loop;

  -- ── 3. LOCK DETERMINISTICO prodotti (ordine crescente per id) ───────────
  select array_agg(distinct prodotto_id order by prodotto_id)
  into v_prodotto_ids
  from tt_carrello_righe;

  create temp table tt_carrello_prodotti (
    id                   bigint primary key,
    negozio_id           uuid,
    nome                 text,
    prezzo               numeric,
    quantita_disponibile integer,
    immagine_principale  text,
    attivo               boolean,
    ha_varianti          boolean
  ) on commit drop;

  foreach v_pid in array v_prodotto_ids
  loop
    select * into v_prodotto
    from public.prodotti
    where id = v_pid
    for update;

    if v_prodotto.id is null then
      return jsonb_build_object('ok', false, 'codice', 'PRODOTTO_NON_TROVATO', 'messaggio', 'Prodotto non trovato.');
    end if;
    if not coalesce(v_prodotto.attivo, false) then
      return jsonb_build_object('ok', false, 'codice', 'PRODOTTO_INATTIVO', 'messaggio', 'Un prodotto del carrello non è più disponibile.');
    end if;

    insert into tt_carrello_prodotti (id, negozio_id, nome, prezzo, quantita_disponibile, immagine_principale, attivo, ha_varianti)
    values (
      v_prodotto.id, v_prodotto.negozio_id, v_prodotto.nome, v_prodotto.prezzo,
      v_prodotto.quantita_disponibile, v_prodotto.immagine_principale,
      v_prodotto.attivo, coalesce(v_prodotto.ha_varianti, false)
    );
  end loop;

  -- ── 4. TUTTE le righe devono appartenere allo STESSO negozio ────────────
  select count(distinct negozio_id) into v_negozi_distinti
  from tt_carrello_prodotti;

  if v_negozi_distinti <> 1 then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_DIVERSO', 'messaggio', 'Il carrello contiene prodotti di negozi diversi: completa l''acquisto per ogni negozio separatamente.');
  end if;

  select negozio_id into v_negozio_id
  from tt_carrello_prodotti
  limit 1;

  -- Negozio SEMPRE risolto dai prodotti (mai fidarsi del client)
  select * into v_negozio
  from public.negozi
  where id = v_negozio_id;

  if v_negozio.id is null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;
  if not coalesce(v_negozio.attivo, false) or v_negozio.deleted_at is not null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_INATTIVO', 'messaggio', 'Il negozio non è più attivo.');
  end if;

  -- ── 5. LOCK DETERMINISTICO varianti (ordine crescente per id, dopo i ────
  --       prodotti: ordine di lock coerente → niente deadlock). La temp table
  --       viene creata SEMPRE (il join finale la referenzia anche senza
  --       varianti: left join su tabella vuota); il riempimento solo se serve.
  create temp table tt_carrello_varianti (
    id                   uuid primary key,
    prodotto_id          bigint,
    nome                 text,
    prezzo               numeric,
    quantita_disponibile integer,
    quantita_riservata   integer,
    immagine_principale  text,
    attivo               boolean
  ) on commit drop;

  select array_agg(distinct variante_id order by variante_id)
  into v_variante_ids
  from tt_carrello_righe
  where variante_id is not null;

  if v_variante_ids is not null then
    foreach v_vid in array v_variante_ids
    loop
      select * into v_variante
      from public.prodotto_varianti
      where id = v_vid
      for update;

      if v_variante.id is null then
        return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non trovata.');
      end if;

      insert into tt_carrello_varianti (id, prodotto_id, nome, prezzo, quantita_disponibile, quantita_riservata, immagine_principale, attivo)
      values (
        v_variante.id, v_variante.prodotto_id, v_variante.nome, v_variante.prezzo,
        v_variante.quantita_disponibile, v_variante.quantita_riservata,
        v_variante.immagine_principale, v_variante.attivo
      );
    end loop;
  end if;

  -- ── 6. Per ogni riga: coerenza variante + prezzo + disponibilità + totale ─
  for v_riga_row in
    select r.pos, r.prodotto_id, r.variante_id, r.quantita,
           p.nome as nome_prodotto, p.prezzo as prezzo_prodotto,
           p.quantita_disponibile as qta_prodotto, p.immagine_principale as imm_prodotto,
           p.ha_varianti
    from tt_carrello_righe r
    join tt_carrello_prodotti p on p.id = r.prodotto_id
    order by r.pos
  loop
    -- Coerenza variante ↔ prodotto (difesa in profondità, come crea_ordine E5)
    if v_riga_row.ha_varianti and v_riga_row.variante_id is null then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_OBBLIGATORIA', 'messaggio', 'Seleziona una variante del prodotto (riga ' || v_riga_row.pos || ').');
    end if;
    if not v_riga_row.ha_varianti and v_riga_row.variante_id is not null then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto (riga ' || v_riga_row.pos || ').');
    end if;

    if v_riga_row.variante_id is not null then
      select * into v_variante
      from tt_carrello_varianti
      where id = v_riga_row.variante_id;

      if v_variante.id is null then
        return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non trovata (riga ' || v_riga_row.pos || ').');
      end if;
      if v_variante.prodotto_id <> v_riga_row.prodotto_id then
        return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto (riga ' || v_riga_row.pos || ').');
      end if;
      if not coalesce(v_variante.attivo, false) then
        return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Questa variante non è più disponibile (riga ' || v_riga_row.pos || ').');
      end if;

      v_prezzo := coalesce(v_variante.prezzo, v_riga_row.prezzo_prodotto);
      if v_prezzo is null or v_prezzo < 0 then
        return jsonb_build_object('ok', false, 'codice', 'PREZZO_NON_VALIDO', 'messaggio', 'Prezzo del prodotto non valido (riga ' || v_riga_row.pos || ').');
      end if;

      if v_variante.quantita_disponibile - v_variante.quantita_riservata < v_riga_row.quantita then
        return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
          'messaggio', 'Disponibilità insufficiente per "' || coalesce(v_variante.nome, v_riga_row.nome_prodotto) || '" (riga ' || v_riga_row.pos || '): restano ' ||
          (v_variante.quantita_disponibile - v_variante.quantita_riservata) || ' pezzi.');
      end if;
    else
      v_prezzo := v_riga_row.prezzo_prodotto;
      if v_prezzo is null or v_prezzo < 0 then
        return jsonb_build_object('ok', false, 'codice', 'PREZZO_NON_VALIDO', 'messaggio', 'Prezzo del prodotto non valido (riga ' || v_riga_row.pos || ').');
      end if;

      if v_riga_row.qta_prodotto is not null and v_riga_row.qta_prodotto < v_riga_row.quantita then
        return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
          'messaggio', 'Disponibilità insufficiente per "' || v_riga_row.nome_prodotto || '" (riga ' || v_riga_row.pos || '): restano ' || v_riga_row.qta_prodotto || ' pezzi.');
      end if;
    end if;

    v_totale := v_totale + round((v_prezzo * v_riga_row.quantita)::numeric, 2);
  end loop;

  -- ── 7. Costo spedizione applicato UNA SOLA volta per ordine ──────────────
  if v_modalita = 'spedizione' then
    if v_metodo_sped = 'express' then
      v_costo_sped := 12.9;
    else
      v_costo_sped := 5.9;
    end if;
  end if;
  v_totale := round((v_totale + v_costo_sped)::numeric, 2);

  -- ── 8. Insert ordine (stesse colonne di crea_ordine, negozio unico) ──────
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

  -- ── 9. Insert N righe (snapshot completo: variante inclusa) ───────────────
  for v_riga_row in
    select r.pos, r.prodotto_id, r.variante_id, r.quantita,
           p.nome as nome_prodotto,
           case when r.variante_id is not null then coalesce(v.prezzo, p.prezzo) else p.prezzo end as prezzo,
           case when r.variante_id is not null then coalesce(v.immagine_principale, p.immagine_principale) else p.immagine_principale end as immagine,
           v.nome as variante_nome
    from tt_carrello_righe r
    join tt_carrello_prodotti p on p.id = r.prodotto_id
    left join tt_carrello_varianti v on v.id = r.variante_id
    order by r.pos
  loop
    insert into public.ordini_righe (
      ordine_id, prodotto_id, variante_id, variante_nome,
      nome_prodotto, prezzo_unitario, quantita, immagine_url
    ) values (
      v_ordine.id, v_riga_row.prodotto_id, v_riga_row.variante_id, v_riga_row.variante_nome,
      v_riga_row.nome_prodotto, v_riga_row.prezzo, v_riga_row.quantita, v_riga_row.immagine
    );
  end loop;

  -- ── 10. Decremento ATOMICO stock per riga (ULTIMO: qualunque errore ──────
  --    precedente annulla l'intera transazione → nessun decremento orfano) ──
  for v_riga_row in
    select r.prodotto_id, r.variante_id, r.quantita
    from tt_carrello_righe r
    order by r.pos
  loop
    if v_riga_row.variante_id is not null then
      -- Decrementa SOLO la variante; il trigger E1 ricalcola l'aggregato padre.
      update public.prodotto_varianti
      set quantita_disponibile = quantita_disponibile - v_riga_row.quantita
      where id = v_riga_row.variante_id
        and quantita_disponibile - v_riga_row.quantita >= 0;

      if not found then
        raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
      end if;
    else
      select quantita_disponibile into v_qta_prod
      from tt_carrello_prodotti
      where id = v_riga_row.prodotto_id;

      if v_qta_prod is not null then
        update public.prodotti
        set quantita_disponibile = quantita_disponibile - v_riga_row.quantita
        where id = v_riga_row.prodotto_id
          and quantita_disponibile - v_riga_row.quantita >= 0;

        if not found then
          raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end loop;

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
    -- Rollback totale: nessuna modifica a ordini/righe/stock.
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare l''ordine.');
end;
$$;

-- ── Permessi: SOLO il server (service role), pattern crea_ordine ──────────
revoke execute on function public.crea_ordine_carrello(jsonb) from public, anon, authenticated;
grant execute on function public.crea_ordine_carrello(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
