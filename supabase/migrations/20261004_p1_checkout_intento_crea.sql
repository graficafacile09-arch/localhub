-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — P1 PAYMENT-FIRST: RPC CHECKOUT_INTENTO_CREA
--
-- Crea un INTENTO di checkout per i pagamenti ONLINE (Stripe, PayPal,
-- Klarna, Scalapay) SENZA creare alcuna riga in `ordini` / `ordini_righe`:
--
--   1. valida prodotto/variante/negozio/quantità/prezzo/disponibilità
--      (barriera finale identica a crea_ordine / crea_ordine_carrello);
--   2. LOCK deterministico (prodotti per id crescente, poi varianti) —
--      stesso ordine di lock delle RPC esistenti → nessun deadlock;
--   3. disponibilità effettiva = quantita_disponibile − quantita_riservata;
--   4. RISERVA atomica: quantita_riservata += q (MAI decremento definitivo
--      di quantita_disponibile);
--   5. inserisce una riga in `pagamenti_sessioni` con `ordine_id = NULL`
--      (intento), `status = 'created'`, `checkout_key` e `checkout_payload`
--      (snapshot canonico completo per ricostruire l'ordine a pagamento
--      avvenuto nella P2, senza rileggere dati mutabili dal catalogo);
--   6. idempotenza: stesso (checkout_key, negozio_id) attivo → riusa
--      l'intento esistente, nessuna seconda riserva (indice parziale unico
--      pagamenti_sessioni_checkout_key_attiva_unq dalla P0);
--   7. rollback atomico: qualunque errore annulla TUTTO (nessuna riserva
--      fantasma, nessuna sessione parziale).
--
-- Payload accettato (firma identica alle RPC esistenti, service role):
--   {
--     "checkoutKey": "...",        -- chiave idempotenza del CLIENTE (≤64)
--     "provider": "stripe|paypal|klarna|scalapay",
--     "modalita": "spedizione",
--     "clienteNome|clienteCognome|clienteTelefono|clienteEmail", "clienteUserId", "clienteIp",
--     "spedizioneIndirizzo|Cap|Citta|Provincia|Note", "spedizioneCarrier",
--     "spedizioneServizio", "metodoPagamento", "note",
--     "fatturazione": { ... },    -- passthrough opzionale (snapshot)
--     "righe": [ { "prodottoId", "varianteId"?, "quantita" } ]  -- 1..50
--   }
--
-- Ritorno: { ok, checkoutId, checkoutKey, negozioId, negozioNome,
--            totale, costoSpedizione, commissioneImporto, giaEsistente }
--
-- Il totale/spedizione/commissione sono calcolati SOLO dal DB con le
-- stesse funzioni delle RPC esistenti (calcola_tariffa_spedizione,
-- commissione per negozio/piattaforma): mai valori dal client.
--
-- Migration ADDITIVA: non modifica crea_ordine/crea_ordine_carrello né il
-- comportamento di bonifico/ritiro. SECURITY DEFINER + solo service_role.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create or replace function public.checkout_intento_crea(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key            text;
  v_provider       text;
  v_modalita       text;
  v_cliente_user_id uuid;
  v_cliente_nome   text;
  v_cliente_cognome text;
  v_cliente_telefono text;
  v_cliente_email  text;
  v_cliente_ip     text;
  v_sped_indirizzo text;
  v_sped_cap       text;
  v_sped_citta     text;
  v_sped_prov      text;
  v_sped_note      text;
  v_carrier        text;
  v_servizio       text;
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
  v_sessione       record;
  v_riga_row       record;
  v_negozio_id     uuid;
  v_negozi_distinti integer;
  v_qta_eff        numeric;
  v_prezzo         numeric;
  v_totale         numeric := 0;
  v_subtotale      numeric := 0;
  v_costo_sped     numeric := 0;
  v_peso_grammi    integer := 0;
  v_max_locale     numeric := null;
  v_locale_mancante boolean := false;
  v_tariffa        jsonb;
  v_tariffa_vers   text;
  v_gratuita       boolean;
  v_metodo_sped    text;
  v_commissione_pct numeric;
  v_commissione    numeric;
  v_payload        jsonb;
  v_righe_payload  jsonb := '[]'::jsonb;
begin
  -- ── estrazione + validazione difensiva del payload (barriera finale) ──
  v_key := p_payload ->> 'checkoutKey';
  if v_key is null or length(v_key) = 0 or length(v_key) > 64 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Chiave di idempotenza non valida.');
  end if;

  v_provider := p_payload ->> 'provider';
  if v_provider not in ('stripe', 'paypal', 'klarna', 'scalapay') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Metodo di pagamento online non valido.');
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
  v_sped_indirizzo := p_payload ->> 'spedizioneIndirizzo';
  v_sped_cap := p_payload ->> 'spedizioneCap';
  v_sped_citta := p_payload ->> 'spedizioneCitta';
  v_sped_prov := p_payload ->> 'spedizioneProvincia';
  v_sped_note := p_payload ->> 'spedizioneNote';
  v_carrier := p_payload ->> 'spedizioneCarrier';
  v_servizio := p_payload ->> 'spedizioneServizio';
  v_metodo_pag := p_payload ->> 'metodoPagamento';
  v_note := p_payload ->> 'note';

  -- Cliente autenticato (SERVER-ONLY, pattern crea_ordine)
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
    if v_carrier not in ('poste_italiane', 'brt', 'locale', 'gls') then
      return jsonb_build_object('ok', false, 'codice', 'CORRIERE_NON_VALIDO', 'messaggio', 'Corriere di spedizione non valido.');
    end if;
    if (v_carrier = 'poste_italiane' and v_servizio not in ('standard', 'express'))
       or (v_carrier = 'brt' and v_servizio <> 'online')
       or (v_carrier = 'gls' and v_servizio <> 'standard')
       or (v_carrier = 'locale' and v_servizio <> 'locale') then
      return jsonb_build_object('ok', false, 'codice', 'SERVIZIO_NON_VALIDO', 'messaggio', 'Servizio di spedizione non valido per il corriere scelto.');
    end if;
  end if;

  -- ── Righe: array JSONB 1..50 (buy-now = 1 riga, carrello = gruppo negozio) ──
  v_righe := p_payload -> 'righe';
  if jsonb_typeof(v_righe) <> 'array' then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Carrello non valido.');
  end if;
  v_n_righe := jsonb_array_length(v_righe);
  if v_n_righe < 1 or v_n_righe > 50 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il carrello deve contenere da 1 a 50 prodotti.');
  end if;

  create temp table tt_intento_righe (
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

    insert into tt_intento_righe (pos, prodotto_id, variante_id, quantita)
    values (v_pos, v_prodotto_id, v_variante_id, v_quantita);
  end loop;

  -- ── LOCK DETERMINISTICO prodotti (id crescente: nessun deadlock) ─────
  select array_agg(distinct prodotto_id order by prodotto_id)
  into v_prodotto_ids
  from tt_intento_righe;

  create temp table tt_intento_prodotti (
    id                   bigint primary key,
    negozio_id           uuid,
    nome                 text,
    prezzo               numeric,
    quantita_disponibile integer,
    quantita_riservata   integer,
    immagine_principale  text,
    attivo               boolean,
    ha_varianti          boolean,
    costo_spedizione_locale numeric(10,2)
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

    insert into tt_intento_prodotti (id, negozio_id, nome, prezzo, quantita_disponibile, quantita_riservata, immagine_principale, attivo, ha_varianti, costo_spedizione_locale)
    values (
      v_prodotto.id, v_prodotto.negozio_id, v_prodotto.nome, v_prodotto.prezzo,
      v_prodotto.quantita_disponibile, v_prodotto.quantita_riservata,
      v_prodotto.immagine_principale, v_prodotto.attivo,
      coalesce(v_prodotto.ha_varianti, false), v_prodotto.costo_spedizione_locale
    );
  end loop;

  -- ── Tutte le righe devono appartenere allo STESSO negozio ─────────────
  select count(distinct negozio_id) into v_negozi_distinti
  from tt_intento_prodotti;

  if v_negozi_distinti <> 1 then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_DIVERSO', 'messaggio', 'Il carrello contiene prodotti di negozi diversi: completa l''acquisto per ogni negozio separatamente.');
  end if;

  select negozio_id into v_negozio_id
  from tt_intento_prodotti
  limit 1;

  select * into v_negozio
  from public.negozi
  where id = v_negozio_id;

  if v_negozio.id is null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;
  if not coalesce(v_negozio.attivo, false) or v_negozio.deleted_at is not null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_INATTIVO', 'messaggio', 'Il negozio non è più attivo.');
  end if;

  -- ── IDEMPOTENZA (dopo la risoluzione del negozio): intento attivo ─────
  select * into v_sessione
  from public.pagamenti_sessioni
  where checkout_key = v_key
    and negozio_id = v_negozio_id
    and status in ('created', 'pending')
  order by created_at desc
  limit 1;

  if v_sessione.id is not null then
    return jsonb_build_object(
      'ok', true, 'giaEsistente', true,
      'checkoutId', v_sessione.id::text,
      'checkoutKey', v_sessione.checkout_key,
      'negozioId', v_negozio_id::text,
      'negozioNome', v_negozio.nome,
      'totale', v_sessione.amount,
      'costoSpedizione', coalesce(v_sessione.checkout_payload ->> 'costoSpedizione', '0')::numeric,
      'commissioneImporto', coalesce(v_sessione.checkout_payload ->> 'commissioneImporto', '0')::numeric
    );
  end if;

  -- ── LOCK DETERMINISTICO varianti (dopo i prodotti) ────────────────────
  create temp table tt_intento_varianti (
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
  from tt_intento_righe
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

      insert into tt_intento_varianti (id, prodotto_id, nome, prezzo, quantita_disponibile, quantita_riservata, immagine_principale, attivo)
      values (
        v_variante.id, v_variante.prodotto_id, v_variante.nome, v_variante.prezzo,
        v_variante.quantita_disponibile, v_variante.quantita_riservata,
        v_variante.immagine_principale, v_variante.attivo
      );
    end loop;
  end if;

  -- ── Per ogni riga: coerenza variante + prezzo + disponibilità effettiva ─
  for v_riga_row in
    select r.pos, r.prodotto_id, r.variante_id, r.quantita,
           p.nome as nome_prodotto, p.prezzo as prezzo_prodotto,
           p.quantita_disponibile as qta_prodotto, p.quantita_riservata as ris_prodotto,
           p.immagine_principale as imm_prodotto, p.ha_varianti,
           p.costo_spedizione_locale
    from tt_intento_righe r
    join tt_intento_prodotti p on p.id = r.prodotto_id
    order by r.pos
  loop
    if v_riga_row.ha_varianti and v_riga_row.variante_id is null then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_OBBLIGATORIA', 'messaggio', 'Seleziona una variante del prodotto (riga ' || v_riga_row.pos || ').');
    end if;
    if not v_riga_row.ha_varianti and v_riga_row.variante_id is not null then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto (riga ' || v_riga_row.pos || ').');
    end if;

    if v_riga_row.variante_id is not null then
      select * into v_variante
      from tt_intento_varianti
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

      v_qta_eff := v_variante.quantita_disponibile - v_variante.quantita_riservata;
      if v_qta_eff < v_riga_row.quantita then
        return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
          'messaggio', 'Disponibilità insufficiente per "' || coalesce(v_variante.nome, v_riga_row.nome_prodotto) || '" (riga ' || v_riga_row.pos || '): restano ' ||
          v_qta_eff || ' pezzi.');
      end if;

      v_righe_payload := v_righe_payload || jsonb_build_array(jsonb_build_object(
        'prodottoId', v_riga_row.prodotto_id::text,
        'varianteId', v_riga_row.variante_id::text,
        'varianteNome', v_variante.nome,
        'nomeProdotto', v_riga_row.nome_prodotto,
        'prezzoUnitario', v_prezzo,
        'quantita', v_riga_row.quantita,
        'immagineUrl', coalesce(v_variante.immagine_principale, v_riga_row.imm_prodotto)
      ));
    else
      v_prezzo := v_riga_row.prezzo_prodotto;
      if v_prezzo is null or v_prezzo < 0 then
        return jsonb_build_object('ok', false, 'codice', 'PREZZO_NON_VALIDO', 'messaggio', 'Prezzo del prodotto non valido (riga ' || v_riga_row.pos || ').');
      end if;

      -- Disponibilità effettiva anche per i prodotti legacy (disponibile − riservata)
      if v_riga_row.qta_prodotto is not null then
        v_qta_eff := v_riga_row.qta_prodotto - v_riga_row.ris_prodotto;
        if v_qta_eff < v_riga_row.quantita then
          return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
            'messaggio', 'Disponibilità insufficiente per "' || v_riga_row.nome_prodotto || '" (riga ' || v_riga_row.pos || '): restano ' ||
            v_qta_eff || ' pezzi.');
        end if;
      end if;

      v_righe_payload := v_righe_payload || jsonb_build_array(jsonb_build_object(
        'prodottoId', v_riga_row.prodotto_id::text,
        'varianteId', null,
        'varianteNome', null,
        'nomeProdotto', v_riga_row.nome_prodotto,
        'prezzoUnitario', v_prezzo,
        'quantita', v_riga_row.quantita,
        'immagineUrl', v_riga_row.imm_prodotto
      ));
    end if;

    v_subtotale := v_subtotale + round((v_prezzo * v_riga_row.quantita)::numeric, 2);

    -- Corriere locale: MAX tra le tariffe locali dei prodotti dell'intento
    if v_carrier = 'locale' then
      if v_riga_row.costo_spedizione_locale is null or v_riga_row.costo_spedizione_locale < 0 then
        v_locale_mancante := true;
      elsif v_max_locale is null or v_riga_row.costo_spedizione_locale > v_max_locale then
        v_max_locale := v_riga_row.costo_spedizione_locale;
      end if;
    end if;
  end loop;

  -- ── Costo spedizione CALCOLATO DAL SISTEMA (mai dal client) ───────────
  if v_modalita = 'spedizione' then
    if v_carrier in ('poste_italiane', 'brt', 'gls') then
      -- Spedizione gratuita configurata dal negozio per questo metodo?
      select exists (
        select 1 from public.negozio_metodi_spedizione nms
        where nms.negozio_id = v_negozio_id
          and nms.carrier = v_carrier
          and nms.servizio = v_servizio
          and coalesce(nms.attivo, false) = true
          and coalesce(nms.spedizione_gratuita, false) = true
      ) into v_gratuita;

      if coalesce(v_gratuita, false) then
        v_costo_sped := 0;
        v_tariffa_vers := null;
      else
        if v_negozio.pacco_peso_grammi is null or v_negozio.pacco_peso_grammi <= 0 then
          return jsonb_build_object('ok', false, 'codice', 'PESO_MANCANTE',
            'messaggio', 'Il pacco di spedizione di questo negozio non è ancora configurato.');
        end if;
        v_peso_grammi := v_negozio.pacco_peso_grammi;
        v_tariffa := public.calcola_tariffa_spedizione(v_carrier, v_servizio, v_peso_grammi);
        if coalesce(v_tariffa ->> 'ok', 'false') <> 'true' then
          return jsonb_build_object('ok', false, 'codice', v_tariffa ->> 'codice', 'messaggio', v_tariffa ->> 'messaggio');
        end if;
        v_costo_sped := (v_tariffa ->> 'prezzo')::numeric;
        v_tariffa_vers := v_tariffa ->> 'versione';
      end if;
    elsif v_carrier = 'locale' then
      if v_locale_mancante or v_max_locale is null then
        return jsonb_build_object('ok', false, 'codice', 'CORRIERE_LOCALE_NON_DISPONIBILE',
          'messaggio', 'Il corriere locale non è disponibile per uno o più prodotti del carrello.');
      end if;
      v_costo_sped := v_max_locale;
      v_tariffa_vers := null;
    end if;
    v_metodo_sped := case when v_servizio = 'express' then 'express' else 'standard' end;
  end if;
  v_totale := round((v_subtotale + v_costo_sped)::numeric, 2);

  -- ── COMMISSIONE PIATTAFORMA (solo server, snapshot deterministico) ────
  v_commissione_pct := coalesce(
    v_negozio.commissione_percentuale,
    public.commissione_piattaforma_percentuale()
  );
  v_commissione := round((v_totale * v_commissione_pct / 100.0)::numeric, 2);
  if v_commissione < 0 then v_commissione := 0; end if;
  if v_commissione > v_totale then v_commissione := v_totale; end if;

  -- ── RISERVA ATOMICA stock (MAI decremento definitivo) ─────────────────
  for v_riga_row in
    select r.prodotto_id, r.variante_id, r.quantita
    from tt_intento_righe r
    order by r.pos
  loop
    if v_riga_row.variante_id is not null then
      update public.prodotto_varianti
      set quantita_riservata = quantita_riservata + v_riga_row.quantita,
          updated_at = now()
      where id = v_riga_row.variante_id
        and (quantita_disponibile - quantita_riservata - v_riga_row.quantita) >= 0;
      if not found then
        raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
      end if;
    else
      update public.prodotti
      set quantita_riservata = quantita_riservata + v_riga_row.quantita,
          updated_at = now()
      where id = v_riga_row.prodotto_id
        and (quantita_disponibile is null or quantita_disponibile - quantita_riservata - v_riga_row.quantita >= 0);
      if not found then
        raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- ── PAYLOAD canonico (snapshot per la P2: ordine costruibile senza ────
  --    rileggere dati mutabili dal catalogo). Nessun secret/credenziale.
  v_payload := jsonb_build_object(
    'version', 1,
    'checkoutKey', v_key,
    'provider', v_provider,
    'metodoPagamento', v_metodo_pag,
    'modalita', v_modalita,
    'negozioId', v_negozio_id::text,
    'negozioNome', v_negozio.nome,
    'righe', v_righe_payload,
    'subtotale', v_subtotale,
    'costoSpedizione', v_costo_sped,
    'totale', v_totale,
    'commissionePercentuale', v_commissione_pct,
    'commissioneImporto', v_commissione,
    'spedizione', case when v_modalita = 'spedizione' then jsonb_build_object(
      'indirizzo', v_sped_indirizzo,
      'cap', v_sped_cap,
      'citta', v_sped_citta,
      'provincia', v_sped_prov,
      'note', v_sped_note,
      'carrier', v_carrier,
      'servizio', v_servizio,
      'metodoSpedizione', v_metodo_sped,
      'tariffaVersione', v_tariffa_vers,
      'pesoGrammi', v_peso_grammi
    ) else null end,
    'cliente', jsonb_build_object(
      'nome', v_cliente_nome,
      'cognome', v_cliente_cognome,
      'telefono', v_cliente_telefono,
      'email', v_cliente_email,
      'userId', v_cliente_user_id::text
    ),
    'fatturazione', coalesce(p_payload -> 'fatturazione', 'null'::jsonb),
    'note', v_note,
    'clienteIp', v_cliente_ip
  );

  -- ── INSERT sessione (intento: ordine_id NULL) ─────────────────────────
  insert into public.pagamenti_sessioni (
    ordine_id, negozio_id, provider, status,
    amount, currency, checkout_key, checkout_payload
  ) values (
    null, v_negozio_id, v_provider, 'created',
    v_totale, 'EUR', v_key, v_payload
  )
  returning id into v_sessione;

  return jsonb_build_object(
    'ok', true, 'giaEsistente', false,
    'checkoutId', v_sessione.id::text,
    'checkoutKey', v_key,
    'negozioId', v_negozio_id::text,
    'negozioNome', v_negozio.nome,
    'totale', v_totale,
    'costoSpedizione', v_costo_sped,
    'commissioneImporto', v_commissione
  );

exception
  when unique_violation then
    -- Corsa di idempotenza: un altro processo ha già creato l'intento con
    -- la stessa (checkout_key, negozio_id) attivo → riusa quello esistente.
    select * into v_sessione
    from public.pagamenti_sessioni
    where checkout_key = v_key
      and negozio_id = v_negozio_id
      and status in ('created', 'pending')
    order by created_at desc
    limit 1;

    if v_sessione.id is not null then
      return jsonb_build_object(
        'ok', true, 'giaEsistente', true,
        'checkoutId', v_sessione.id::text,
        'checkoutKey', v_sessione.checkout_key,
        'negozioId', v_negozio_id::text,
        'negozioNome', v_negozio.nome,
        'totale', v_sessione.amount,
        'costoSpedizione', coalesce(v_sessione.checkout_payload ->> 'costoSpedizione', '0')::numeric,
        'commissioneImporto', coalesce(v_sessione.checkout_payload ->> 'commissioneImporto', '0')::numeric
      );
    end if;
    raise;
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile creare l''intento di pagamento.');
end;
$$;

revoke execute on function public.checkout_intento_crea(jsonb) from public, anon, authenticated;
grant execute on function public.checkout_intento_crea(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;