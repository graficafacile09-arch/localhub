-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — ASSOCIAZIONE ORDINE → ACCOUNT CLIENTE
--
-- Obiettivo:
--   Oggi la RPC public.crea_ordine() salva SEMPRE cliente_user_id = NULL:
--   ogni ordine nasce "guest" anche quando l'acquirente è autenticato.
--   Con questa migrazione la RPC accetta il campo opzionale
--   'clienteUserId' nel payload e lo salva ATOMICAMENTE alla creazione
--   dell'ordine, nella stessa transazione che gestisce idempotenza,
--   lock del prodotto, insert di ordine+righe e decremento dello stock.
--
-- Garanzie:
--   - L'UUID arriva SOLO dal server (la route legge la sessione Supabase
--     con lib/auth/session.ts): la RPC è eseguibile solo via service role
--     e non espone alcun percorso di trust dal browser.
--   - Payload senza 'clienteUserId' (o non valido / utente inesistente)
--     → cliente_user_id = NULL: ordine guest, identico al comportamento
--     attuale (backward-compatible, nessun ordine esistente modificato).
--   - Un retry idempotente con la stessa idempotency_key restituisce
--     l'ordine esistente SENZA toccare cliente_user_id.
--   - Stock atomico, lock della riga, idempotenza e rate limit invariati.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create or replace function public.crea_ordine(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key            text;
  v_prodotto_id    bigint;
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
  v_ordine         record;
  v_prezzo         numeric;
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
  -- L'UUID arriva esclusivamente dalla route, che lo ricava dalla sessione
  -- Supabase (mai dal browser). Cast difensivo: un valore assente, vuoto o
  -- non-UUID diventa NULL (ordine guest) e non rompe MAI la creazione.
  begin
    v_cliente_user_id := nullif(p_payload ->> 'clienteUserId', '')::uuid;
  exception
    when invalid_text_representation then
      v_cliente_user_id := null;
  end;

  -- Se l'utente non esiste in auth.users → NULL (mai un FK violation che
  -- annullerebbe l'intero ordine per un id inesistente). Il controllo è
  -- avvolto in un blocco exception: se auth.users non fosse leggibile,
  -- l'ordine resta comunque creabile (cliente_user_id = NULL). Fail-safe:
  -- la creazione dell'ordine non può MAI fallire per questo controllo.
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

  -- ── 4. Prezzo e disponibilità (dal DATABASE) ──────────────────────────────
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

  -- ── 5. Totale calcolato dal server ────────────────────────────────────────
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

  -- ── 7. Riga ordine ────────────────────────────────────────────────────────
  insert into public.ordini_righe (
    ordine_id, prodotto_id, nome_prodotto, prezzo_unitario, quantita, immagine_url
  ) values (
    v_ordine.id, v_prodotto_id, v_prodotto.nome, v_prezzo, v_quantita, v_prodotto.immagine_principale
  );

  -- ── 8. Decremento atomico scorte (ULTIMA operazione: qualunque errore ─────
  --    precedente annulla l'intera transazione → nessun decremento orfano) ──
  if v_prodotto.quantita_disponibile is not null then
    update public.prodotti
    set quantita_disponibile = quantita_disponibile - v_quantita
    where id = v_prodotto_id
      and quantita_disponibile - v_quantita >= 0;

    if not found then
      raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
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

notify pgrst, 'reload schema';

commit;
