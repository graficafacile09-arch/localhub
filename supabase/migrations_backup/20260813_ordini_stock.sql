-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE ORDINI (sicurezza): decremento atomico scorte + rate limit
--
-- Obiettivo 1 — SCORTE ATOMICHE:
--   La creazione di un ordine deve decrementare quantita_disponibile in modo
--   atomico: nessun SELECT→INSERT→UPDATE separato (due richieste simultanee
--   non possono vendere più pezzi di quelli disponibili). La funzione
--   public.crea_ordine(p_payload jsonb) esegue TUTTO in una transazione:
--     1. idempotenza (idempotency_key già presente → ordine esistente);
--     2. SELECT ... FOR UPDATE sul prodotto (lock riga: serializza i
--        concorrenti sullo stesso prodotto);
--     3. validazioni (prodotto attivo, negozio attivo, prezzo, scorte);
--     4. INSERT ordine + ordini_righe;
--     5. UPDATE guardato quantita_disponibile = quantita_disponibile - q
--        (WHERE quantita_disponibile - q >= 0 → mai negativa).
--   Qualunque errore durante la creazione annulla l'intera transazione
--   (rollback): MAI un decremento "orfano" senza ordine. La chiave di
--   idempotenza è protetta dal vincolo UNIQUE: una ripetizione con la stessa
--   chiave non decrementa mai di nuovo lo stock.
--   La funzione è security definer ed eseguibile SOLO via service role
--   (revoke da anon/authenticated): il client browser non può aggirare il
--   rate limit chiamandola direttamente.
--
-- Obiettivo 2 — RATE LIMIT:
--   La colonna ordini.cliente_ip registra l'IP del richiedente; il limite
--   viene applicato nella route PRIMA di qualsiasi operazione costosa
--   contando gli ordini di quel IP nell'ultimo minuto/ora (stesso
--   lib/rate-limiter.ts, soggetto "ordini").
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. IP del cliente (rate limiting + audit) ───────────────────────────────
alter table public.ordini
  add column if not exists cliente_ip text;

-- Indice per il conteggio rate-limit per IP (finestra temporale)
create index if not exists ordini_cliente_ip_created_at_idx
  on public.ordini (cliente_ip, created_at desc);

-- ── 2. Garanzia: lo stock non può MAI diventare negativo ────────────────────
-- (la RPC lo garantisce con l'UPDATE guardato; il CHECK è la rete di sicurezza
-- per qualunque altro flusso di scrittura, es. pannelli merchant futuri)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prodotti_quantita_disponibile_non_negativa'
  ) then
    alter table public.prodotti
      add constraint prodotti_quantita_disponibile_non_negativa
      check (quantita_disponibile is null or quantita_disponibile >= 0);
  end if;
end $$;

-- ── 3. Helper: ordine → jsonb pubblico (numero, negozio, righe, totale) ────
create or replace function public.ordine_to_json(p_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id::text,
    'numero', o.numero,
    'stato', o.stato,
    'totale', o.totale,
    'createdAt', o.created_at::text,
    'modalita', o.modalita,
    'negozioId', o.negozio_id::text,
    'negozioNome', o.negozio_nome,
    'ritiroData', o.ritiro_data,
    'ritiroFascia', o.ritiro_fascia,
    'righe', coalesce((
      select jsonb_agg(jsonb_build_object(
        'prodottoId', r.prodotto_id::text,
        'nomeProdotto', r.nome_prodotto,
        'prezzoUnitario', r.prezzo_unitario,
        'quantita', r.quantita,
        'immagineUrl', r.immagine_url
      ) order by r.created_at)
      from public.ordini_righe r
      where r.ordine_id = o.id
    ), '[]'::jsonb)
  )
  from public.ordini o
  where o.id = p_id;
$$;

-- ── 4. RPC atomica: crea ordine + righe + decremento scorte ─────────────────
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
    null, v_cliente_nome, v_cliente_cognome, v_cliente_telefono, v_cliente_email, v_cliente_ip,
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
      -- Irraggiungibile (teniamo il lock della riga e lo stock è già stato
      -- verificato sopra): se mai accadesse, il raise viene catturato da
      -- `when others` → SAVE_FAILED (500) con rollback totale — fail-closed,
      -- mai un decremento senza ordine.
      raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'giaEsistente', false, 'ordine', public.ordine_to_json(v_ordine.id));

exception
  when unique_violation then
    -- Corsa di idempotenza: mentre attendevamo il lock, un altro processo ha
    -- già creato l'ordine con la stessa chiave → restituisci l'ordine
    -- esistente (la transazione corrente è già stata annullata dal rollback
    -- del subtransaction: nessun doppio decremento).
    select * into v_ordine
    from public.ordini
    where idempotency_key = v_key
    limit 1;

    if v_ordine.id is not null then
      return jsonb_build_object('ok', true, 'giaEsistente', true, 'ordine', public.ordine_to_json(v_ordine.id));
    end if;
    raise;
  when others then
    -- Qualunque altro errore (es. dati corrotti): rollback totale della
    -- transazione → NESSUNA modifica a ordini/righe/stock.
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare l''ordine.');
end;
$$;

-- ── 5. Permessi: le RPC sono usate SOLO dal server (service role) ───────────
--    L'anon/authenticated non deve poter creare ordini aggirando la route
--    (che applica il rate limit).
revoke execute on function public.crea_ordine(jsonb) from public, anon, authenticated;
grant execute on function public.crea_ordine(jsonb) to service_role;
revoke execute on function public.ordine_to_json(uuid) from public, anon, authenticated;
grant execute on function public.ordine_to_json(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
