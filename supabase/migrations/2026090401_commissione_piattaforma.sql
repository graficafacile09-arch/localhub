-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — COMMISSIONE PIATTAFORMA (Stripe Connect application fee)
--
-- Modello: marketplace con Stripe Connect direct charge + application fee.
-- La commissione è SOLO server-side:
--   - percentuale configurata in piattaforma_config (default 10%);
--   - calcolo deterministico in centesimi, clamp 0 ≤ commissione ≤ totale;
--   - snapshot salvato sull'ordine alla creazione (commissione_percentuale
--     + commissione_importo) — mai valori dal client;
--   - l'application_fee_amount di Stripe Connect deriva ESCLUSIVAMENTE
--     dallo snapshot ordine (mai ricalcolata dal browser).
--
-- Principi:
--   1. Migration additiva (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT
--      EXISTS, CREATE OR REPLACE): nessun dato esistente toccato, gli
--      ordini storici restano NULL su commissione_*.
--   2. RPC create or replace (crea_ordine / crea_ordine_carrello) SOLO
--      nella parte di calcolo/salvataggio commissione: firma, validazioni
--      e comportamento ordine/spedizione/stock restano invariati.
--   3. security definer + revoke/grant service_role come le RPC esistenti.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Snapshot commissione sull'ordine (NULL sugli storici) ──────────────
alter table public.ordini
  add column if not exists commissione_percentuale numeric(5, 2);

alter table public.ordini
  add column if not exists commissione_importo numeric(10, 2);

-- ── 2. Configurazione centralizzata piattaforma (chiave-valore) ───────────
create table if not exists public.piattaforma_config (
  chiave          text primary key,
  valore_numeric  numeric(12, 4),
  valore_testo    text,
  updated_at      timestamptz not null default now()
);

-- Default iniziale: commissione 10% (configurabile senza toccare il codice).
insert into public.piattaforma_config (chiave, valore_numeric)
values ('commissione_percentuale', 10.00)
on conflict (chiave) do nothing;

-- ── 3. Percentuale commissione (fonte unica, default 10) ──────────────────
create or replace function public.commissione_piattaforma_percentuale()
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select valore_numeric from public.piattaforma_config
     where chiave = 'commissione_percentuale' limit 1),
    10.00
  );
$$;

revoke execute on function public.commissione_piattaforma_percentuale() from public, anon, authenticated;
grant execute on function public.commissione_piattaforma_percentuale() to service_role;

-- ── 4. crea_ordine — calcolo + snapshot commissione ────────────────────────
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
  v_carrier        text;
  v_servizio       text;
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
  v_peso_grammi    integer;
  v_tariffa        jsonb;
  v_tariffa_vers   text;
  v_totale         numeric;
  v_commissione_pct numeric;
  v_commissione    numeric;
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
  v_carrier := p_payload ->> 'spedizioneCarrier';
  v_servizio := p_payload ->> 'spedizioneServizio';
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
    if v_carrier not in ('poste_italiane', 'brt', 'locale') then
      return jsonb_build_object('ok', false, 'codice', 'CORRIERE_NON_VALIDO', 'messaggio', 'Corriere di spedizione non valido.');
    end if;
    if (v_carrier = 'poste_italiane' and v_servizio not in ('standard', 'express'))
       or (v_carrier = 'brt' and v_servizio <> 'online')
       or (v_carrier = 'locale' and v_servizio <> 'locale') then
      return jsonb_build_object('ok', false, 'codice', 'SERVIZIO_NON_VALIDO', 'messaggio', 'Servizio di spedizione non valido per il corriere scelto.');
    end if;
    if v_metodo_pag not in ('carta', 'paypal', 'bonifico') then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Metodo di pagamento non valido.');
    end if;
  end if;

  -- ── 1. Idempotenza ─────────────────────────────────────────────────────
  select * into v_ordine
  from public.ordini
  where idempotency_key = v_key
  limit 1;

  if v_ordine.id is not null then
    return jsonb_build_object('ok', true, 'giaEsistente', true, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

  -- ── 2. LOCK riga prodotto ───────────────────────────────────────────────
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

  -- ── 3. Negozio (dal prodotto) ───────────────────────────────────────────
  select * into v_negozio
  from public.negozi
  where id = v_prodotto.negozio_id;

  if v_negozio.id is null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;
  if not coalesce(v_negozio.attivo, false) or v_negozio.deleted_at is not null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_INATTIVO', 'messaggio', 'Il negozio non è più attivo.');
  end if;

  -- ── 3bis. coerenza variante ↔ prodotto ─────────────────────────────────
  if coalesce(v_prodotto.ha_varianti, false) and v_variante_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VARIANTE_OBBLIGATORIA', 'messaggio', 'Seleziona una variante del prodotto.');
  end if;
  if not coalesce(v_prodotto.ha_varianti, false) and v_variante_id is not null then
    return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto.');
  end if;

  if v_variante_id is not null then
    select * into v_variante
    from public.prodotto_varianti
    where id = v_variante_id
    for update;

    if v_variante.id is null then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non trovata.');
    end if;
    if v_variante.prodotto_id <> v_prodotto_id then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto.');
    end if;
    if not coalesce(v_variante.attivo, false) then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Questa variante non è più disponibile.');
    end if;
  end if;

  -- ── 4. Prezzo, disponibilità e immagine (dal DATABASE) ─────────────────
  if v_variante_id is not null then
    v_prezzo := coalesce(v_variante.prezzo, v_prodotto.prezzo);
    if v_prezzo is null or v_prezzo < 0 then
      return jsonb_build_object('ok', false, 'codice', 'PREZZO_NON_VALIDO', 'messaggio', 'Prezzo del prodotto non valido.');
    end if;
    if v_variante.quantita_disponibile - v_variante.quantita_riservata < v_quantita then
      return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
        'messaggio', 'Disponibilità insufficiente (restano ' ||
          (v_variante.quantita_disponibile - v_variante.quantita_riservata) || ' pezzi).');
    end if;
    v_immagine_riga := coalesce(v_variante.immagine_principale, v_prodotto.immagine_principale);
    v_variante_nome := v_variante.nome;
  else
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

  -- ── 5. Costo spedizione CALCOLATO DAL SISTEMA (mai dal client) ─────────
  if v_modalita = 'spedizione' then
    if v_carrier = 'poste_italiane' or v_carrier = 'brt' then
      if v_negozio.pacco_peso_grammi is null or v_negozio.pacco_peso_grammi <= 0 then
        return jsonb_build_object('ok', false, 'codice', 'PESO_MANCANTE',
          'messaggio', 'Il pacco di spedizione di questo negozio non è ancora configurato.');
      end if;
      -- V1 pacco unico per ordine: il peso deriva dal pacco configurato dal
      -- venditore, MAI dalla somma peso prodotto × quantità.
      v_peso_grammi := v_negozio.pacco_peso_grammi;
      v_tariffa := public.calcola_tariffa_spedizione(v_carrier, v_servizio, v_peso_grammi);
      if coalesce(v_tariffa ->> 'ok', 'false') <> 'true' then
        return jsonb_build_object('ok', false, 'codice', v_tariffa ->> 'codice', 'messaggio', v_tariffa ->> 'messaggio');
      end if;
      v_costo_sped := (v_tariffa ->> 'prezzo')::numeric;
      v_tariffa_vers := v_tariffa ->> 'versione';
    elsif v_carrier = 'locale' then
      if v_prodotto.costo_spedizione_locale is null or v_prodotto.costo_spedizione_locale < 0 then
        return jsonb_build_object('ok', false, 'codice', 'CORRIERE_LOCALE_NON_DISPONIBILE',
          'messaggio', 'Il corriere locale non è disponibile per questo prodotto.');
      end if;
      v_costo_sped := v_prodotto.costo_spedizione_locale;
      v_tariffa_vers := null;
    end if;
    -- metodo_spedizione (legacy) = tier: express solo per Poste Express.
    v_metodo_sped := case when v_servizio = 'express' then 'express' else 'standard' end;
  end if;
  v_totale := round((v_prezzo * v_quantita + v_costo_sped)::numeric, 2);

  -- ── 5bis. COMMISSIONE PIATTAFORMA (solo server, snapshot deterministico) ─
  -- Percentuale da piattaforma_config (default 10), MAI dal payload.
  -- Calcolo in centesimi con arrotondamento + clamp [0, totale].
  v_commissione_pct := public.commissione_piattaforma_percentuale();
  v_commissione := round((v_totale * v_commissione_pct / 100.0)::numeric, 2);
  if v_commissione < 0 then v_commissione := 0; end if;
  if v_commissione > v_totale then v_commissione := v_totale; end if;

  -- ── 6. Insert ordine ────────────────────────────────────────────────────
  insert into public.ordini (
    idempotency_key, modalita, totale, negozio_id, negozio_nome,
    cliente_user_id, cliente_nome, cliente_cognome, cliente_telefono, cliente_email, cliente_ip,
    ritiro_data, ritiro_fascia,
    spedizione_indirizzo, spedizione_cap, spedizione_citta, spedizione_provincia, spedizione_note,
    metodo_spedizione, spedizione_carrier, spedizione_servizio,
    spedizione_tariffa_versione, spedizione_peso_grammi,
    costo_spedizione, commissione_percentuale, commissione_importo,
    metodo_pagamento, note
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
    case when v_modalita = 'spedizione' then v_carrier else null end,
    case when v_modalita = 'spedizione' then v_servizio else null end,
    case when v_modalita = 'spedizione' then v_tariffa_vers else null end,
    case when v_modalita = 'spedizione' then v_peso_grammi else null end,
    v_costo_sped, v_commissione_pct, v_commissione,
    case when v_modalita = 'spedizione' then v_metodo_pag else null end,
    v_note
  )
  returning * into v_ordine;

  -- ── 7. Riga ordine ──────────────────────────────────────────────────────
  insert into public.ordini_righe (
    ordine_id, prodotto_id, variante_id, variante_nome,
    nome_prodotto, prezzo_unitario, quantita, immagine_url
  ) values (
    v_ordine.id, v_prodotto_id, v_variante_id, v_variante_nome,
    v_prodotto.nome, v_prezzo, v_quantita, v_immagine_riga
  );

  -- ── 8. Decremento atomico scorte ────────────────────────────────────────
  if v_variante_id is not null then
    update public.prodotto_varianti
    set quantita_disponibile = quantita_disponibile - v_quantita
    where id = v_variante_id
      and quantita_disponibile - v_quantita >= 0;
    if not found then
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

-- ── 5. crea_ordine_carrello — calcolo + snapshot commissione ───────────────
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
  v_ordine         record;
  v_riga_row       record;
  v_negozio_id     uuid;
  v_negozi_distinti integer;
  v_qta_prod       integer;
  v_prezzo         numeric;
  v_totale         numeric := 0;
  v_costo_sped     numeric := 0;
  v_peso_grammi    integer := 0;
  v_peso_mancante  boolean := false;
  v_max_locale     numeric := null;
  v_locale_mancante boolean := false;
  v_tariffa        jsonb;
  v_tariffa_vers   text;
  v_commissione_pct numeric;
  v_commissione    numeric;
begin
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
  v_carrier := p_payload ->> 'spedizioneCarrier';
  v_servizio := p_payload ->> 'spedizioneServizio';
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
    if v_carrier not in ('poste_italiane', 'brt', 'locale') then
      return jsonb_build_object('ok', false, 'codice', 'CORRIERE_NON_VALIDO', 'messaggio', 'Corriere di spedizione non valido.');
    end if;
    if (v_carrier = 'poste_italiane' and v_servizio not in ('standard', 'express'))
       or (v_carrier = 'brt' and v_servizio <> 'online')
       or (v_carrier = 'locale' and v_servizio <> 'locale') then
      return jsonb_build_object('ok', false, 'codice', 'SERVIZIO_NON_VALIDO', 'messaggio', 'Servizio di spedizione non valido per il corriere scelto.');
    end if;
    if v_metodo_pag not in ('carta', 'paypal', 'bonifico') then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Metodo di pagamento non valido.');
    end if;
  end if;

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

  v_righe := p_payload -> 'righe';
  if jsonb_typeof(v_righe) <> 'array' then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Carrello non valido.');
  end if;
  v_n_righe := jsonb_array_length(v_righe);
  if v_n_righe < 2 or v_n_righe > 50 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il carrello deve contenere da 2 a 50 prodotti.');
  end if;

  select * into v_ordine
  from public.ordini
  where idempotency_key = v_key
  limit 1;
  if v_ordine.id is not null then
    return jsonb_build_object('ok', true, 'giaEsistente', true, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

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
    ha_varianti          boolean,
    peso_grammi          integer,
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

    insert into tt_carrello_prodotti (id, negozio_id, nome, prezzo, quantita_disponibile, immagine_principale, attivo, ha_varianti, peso_grammi, costo_spedizione_locale)
    values (
      v_prodotto.id, v_prodotto.negozio_id, v_prodotto.nome, v_prodotto.prezzo,
      v_prodotto.quantita_disponibile, v_prodotto.immagine_principale,
      v_prodotto.attivo, coalesce(v_prodotto.ha_varianti, false),
      v_prodotto.peso_grammi, v_prodotto.costo_spedizione_locale
    );
  end loop;

  select count(distinct negozio_id) into v_negozi_distinti
  from tt_carrello_prodotti;
  if v_negozi_distinti <> 1 then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_DIVERSO', 'messaggio', 'Il carrello contiene prodotti di negozi diversi: completa l''acquisto per ogni negozio separatamente.');
  end if;

  select negozio_id into v_negozio_id
  from tt_carrello_prodotti
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

  for v_riga_row in
    select r.pos, r.prodotto_id, r.variante_id, r.quantita,
           p.nome as nome_prodotto, p.prezzo as prezzo_prodotto,
           p.quantita_disponibile as qta_prodotto, p.immagine_principale as imm_prodotto,
           p.ha_varianti, p.peso_grammi, p.costo_spedizione_locale
    from tt_carrello_righe r
    join tt_carrello_prodotti p on p.id = r.prodotto_id
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

    -- Corriere locale: MAX tra le tariffe locali dei prodotti dell'ordine.
    if v_carrier = 'locale' then
      if v_riga_row.costo_spedizione_locale is null or v_riga_row.costo_spedizione_locale < 0 then
        v_locale_mancante := true;
      elsif v_max_locale is null or v_riga_row.costo_spedizione_locale > v_max_locale then
        v_max_locale := v_riga_row.costo_spedizione_locale;
      end if;
    end if;
  end loop;

  -- ── 7. Costo spedizione CALCOLATO DAL SISTEMA (mai dal client) ─────────
  if v_modalita = 'spedizione' then
    if v_carrier = 'poste_italiane' or v_carrier = 'brt' then
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
    elsif v_carrier = 'locale' then
      if v_locale_mancante or v_max_locale is null then
        return jsonb_build_object('ok', false, 'codice', 'CORRIERE_LOCALE_NON_DISPONIBILE',
          'messaggio', 'Il corriere locale non è disponibile per uno o più prodotti del carrello.');
      end if;
      -- Un ordine = una consegna del corriere locale: si applica il prezzo
      -- MASSIMO tra le tariffe locali dei prodotti (mai la somma cieca).
      v_costo_sped := v_max_locale;
      v_tariffa_vers := null;
    end if;
    v_metodo_sped := case when v_servizio = 'express' then 'express' else 'standard' end;
  end if;
  v_totale := round((v_totale + v_costo_sped)::numeric, 2);

  -- ── 7bis. COMMISSIONE PIATTAFORMA (solo server, snapshot deterministico) ─
  v_commissione_pct := public.commissione_piattaforma_percentuale();
  v_commissione := round((v_totale * v_commissione_pct / 100.0)::numeric, 2);
  if v_commissione < 0 then v_commissione := 0; end if;
  if v_commissione > v_totale then v_commissione := v_totale; end if;

  -- ── 8. Insert ordine ────────────────────────────────────────────────────
  insert into public.ordini (
    idempotency_key, modalita, totale, negozio_id, negozio_nome,
    cliente_user_id, cliente_nome, cliente_cognome, cliente_telefono, cliente_email, cliente_ip,
    ritiro_data, ritiro_fascia,
    spedizione_indirizzo, spedizione_cap, spedizione_citta, spedizione_provincia, spedizione_note,
    metodo_spedizione, spedizione_carrier, spedizione_servizio,
    spedizione_tariffa_versione, spedizione_peso_grammi,
    costo_spedizione, commissione_percentuale, commissione_importo,
    metodo_pagamento, note
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
    case when v_modalita = 'spedizione' then v_carrier else null end,
    case when v_modalita = 'spedizione' then v_servizio else null end,
    case when v_modalita = 'spedizione' then v_tariffa_vers else null end,
    case when v_modalita = 'spedizione' then v_peso_grammi else null end,
    v_costo_sped, v_commissione_pct, v_commissione,
    case when v_modalita = 'spedizione' then v_metodo_pag else null end,
    v_note
  )
  returning * into v_ordine;

  -- ── 9. Insert N righe ───────────────────────────────────────────────────
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

  -- ── 10. Decremento ATOMICO stock ────────────────────────────────────────
  for v_riga_row in
    select r.prodotto_id, r.variante_id, r.quantita
    from tt_carrello_righe r
    order by r.pos
  loop
    if v_riga_row.variante_id is not null then
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


revoke execute on function public.crea_ordine(jsonb) from public, anon, authenticated;
grant execute on function public.crea_ordine(jsonb) to service_role;

revoke execute on function public.crea_ordine_carrello(jsonb) from public, anon, authenticated;
grant execute on function public.crea_ordine_carrello(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
