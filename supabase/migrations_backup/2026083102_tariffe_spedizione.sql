-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — MOTORE TARIFFARIO SPEDIZIONI (T1)
--
-- Il prezzo della spedizione è DETERMINATO DA INCITTÀ, mai dal venditore.
-- Due fonti tariffarie ufficiali (dati di sistema, non modificabili dal
-- venditore):
--   - POSTE ITALIANE (Poste Delivery Web, consumer): servizi Standard ed
--     Express con fasce di peso;
--   - BRT (C2X / Spedire online, HOME-TO-HOME): servizio online 24/48h con
--     fasce di peso;
-- più una TERZA modalità "CORRIERE LOCALE" il cui prezzo è configurato dal
-- venditore PER SINGOLO PRODOTTO (prodotti.costo_spedizione_locale): è
-- l'unica eccezione in cui il venditore definisce un prezzo di consegna.
--
-- Peso: prodotti.peso_grammi (grammi, intero). Se assente/≤0 il checkout
-- con Poste/BRT viene RIFIUTATO (mai un peso inventato, mai un prezzo finto).
--
-- Versionamento: shipping_tariff_versions + shipping_tariffs permettono di
-- aggiornare i listini senza modificare il checkout. Ogni ordine salva la
-- versione tariffaria applicata (ordini.spedizione_tariffa_versione), così
-- gli ordini storici conservano il prezzo effettivamente applicato.
--
-- Sicurezza: il costo è calcolato ESCLUSIVAMENTE nel DB dalle tariffe e dal
-- peso del catalogo (o dal costo locale del prodotto). Qualunque
-- costo/prezzo di spedizione inviato dal client viene ignorato.
--
-- Backward-compatible: colonne nuove NULL-able (ordini esistenti invariati),
-- nessuna colonna duplicata, nessun dato cancellato.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ═════════════════════════════════════════════════════════════════════
-- 1. PRODOTTI — peso reale (grammi) + tariffa corriere locale per prodotto
-- ═════════════════════════════════════════════════════════════════════
alter table if exists public.prodotti
  add column if not exists peso_grammi integer;

alter table if exists public.prodotti
  add column if not exists costo_spedizione_locale numeric(10,2);

-- ═════════════════════════════════════════════════════════════════════
-- 2. TABELLE TARIFFARIE
-- ═════════════════════════════════════════════════════════════════════
create table if not exists public.shipping_carriers (
  id         uuid primary key default gen_random_uuid(),
  codice     text not null unique,
  nome       text not null,
  attivo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shipping_services (
  id             uuid primary key default gen_random_uuid(),
  carrier_id     uuid not null references public.shipping_carriers(id) on delete cascade,
  codice         text not null,
  tier           text not null,          -- 'standard' | 'express' (raggruppamento UI)
  nome           text not null,
  tempo_consegna text,
  attivo         boolean not null default true,
  unique (carrier_id, codice)
);

create table if not exists public.shipping_tariff_versions (
  id          uuid primary key default gen_random_uuid(),
  codice      text not null unique,
  descrizione text,
  attiva      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.shipping_tariffs (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.shipping_tariff_versions(id) on delete cascade,
  service_id  uuid not null references public.shipping_services(id) on delete cascade,
  peso_min_g  integer not null,          -- limite inferiore ESCLUSIVO
  peso_max_g  integer not null,          -- limite superiore INCLUSIVO
  prezzo      numeric(10,2) not null,
  unique (version_id, service_id, peso_max_g)
);

-- ═════════════════════════════════════════════════════════════════════
-- 3. SEED — corrieri e servizi
-- ═════════════════════════════════════════════════════════════════════
insert into public.shipping_carriers (codice, nome) values
  ('poste_italiane', 'Poste Italiane'),
  ('brt', 'BRT')
on conflict (codice) do nothing;

insert into public.shipping_services (carrier_id, codice, tier, nome, tempo_consegna)
select c.id, s.codice, s.tier, s.nome, s.tempo_consegna
from public.shipping_carriers c
join (values
  ('poste_italiane', 'standard', 'standard', 'Poste Italiane Standard', '3-5 giorni lavorativi'),
  ('poste_italiane', 'express',  'express',  'Poste Italiane Express',  '1-2 giorni lavorativi'),
  ('brt',            'online',   'standard', 'BRT',                     '24/48 ore')
) as s(carrier, codice, tier, nome, tempo_consegna) on s.carrier = c.codice
on conflict (carrier_id, codice) do nothing;

-- ═════════════════════════════════════════════════════════════════════
-- 4. SEED — versione tariffaria iniziale
-- ═════════════════════════════════════════════════════════════════════
insert into public.shipping_tariff_versions (codice, descrizione) values
  ('2026-08-posteweb-brt-1', 'Listino iniziale: Poste Delivery Web + BRT C2X online')
on conflict (codice) do nothing;

-- ═════════════════════════════════════════════════════════════════════
-- 5. SEED — tariffe (peso in grammi, prezzo in euro)
--    Poste Delivery Web: fasce 0-1, 1-2, 2-3, 3-5, 5-10, 10-15, 15-20,
--    20-25, 25-30, 30-40, 40-50, 50-70 kg (Standard / Express).
--    BRT C2X online: 0-2, 2-5, 5-10, 10-20, 20-31,5 kg.
-- ═════════════════════════════════════════════════════════════════════
insert into public.shipping_tariffs (version_id, service_id, peso_min_g, peso_max_g, prezzo)
select
  v.id,
  s.id,
  t.peso_min_g,
  t.peso_max_g,
  t.prezzo
from public.shipping_tariff_versions v
cross join (values
  -- Poste Italiane — Standard
  ('poste_italiane', 'standard',      0,   1000,  5.65),
  ('poste_italiane', 'standard',   1000,   2000,  5.90),
  ('poste_italiane', 'standard',   2000,   3000,  6.70),
  ('poste_italiane', 'standard',   3000,   5000,  7.30),
  ('poste_italiane', 'standard',   5000,  10000, 10.40),
  ('poste_italiane', 'standard',  10000,  15000, 11.70),
  ('poste_italiane', 'standard',  15000,  20000, 12.30),
  ('poste_italiane', 'standard',  20000,  25000, 14.80),
  ('poste_italiane', 'standard',  25000,  30000, 14.80),
  ('poste_italiane', 'standard',  30000,  40000, 28.30),
  ('poste_italiane', 'standard',  40000,  50000, 32.30),
  ('poste_italiane', 'standard',  50000,  70000, 39.70),
  -- Poste Italiane — Express
  ('poste_italiane', 'express',       0,   1000,  6.65),
  ('poste_italiane', 'express',    1000,   2000,  6.90),
  ('poste_italiane', 'express',    2000,   3000,  7.70),
  ('poste_italiane', 'express',    3000,   5000,  8.30),
  ('poste_italiane', 'express',    5000,  10000, 11.20),
  ('poste_italiane', 'express',   10000,  15000, 12.50),
  ('poste_italiane', 'express',   15000,  20000, 13.10),
  ('poste_italiane', 'express',   20000,  25000, 15.60),
  ('poste_italiane', 'express',   25000,  30000, 15.60),
  ('poste_italiane', 'express',   30000,  40000, 29.90),
  ('poste_italiane', 'express',   40000,  50000, 33.90),
  ('poste_italiane', 'express',   50000,  70000, 41.90),
  -- BRT — online (24/48h)
  ('brt',            'online',        0,   2000, 13.89),
  ('brt',            'online',     2000,   5000, 15.75),
  ('brt',            'online',     5000,  10000, 18.35),
  ('brt',            'online',    10000,  20000, 20.95),
  ('brt',            'online',    20000,  31500, 25.98)
) as t(carrier, servizio, peso_min_g, peso_max_g, prezzo)
join public.shipping_services s on s.codice = t.servizio
join public.shipping_carriers c on c.id = s.carrier_id and c.codice = t.carrier
where v.codice = '2026-08-posteweb-brt-1'
on conflict (version_id, service_id, peso_max_g) do nothing;

-- ═════════════════════════════════════════════════════════════════════
-- 6. ORDINI — colonne tariffarie (NULL-able: ordini esistenti invariati)
-- ═════════════════════════════════════════════════════════════════════
alter table if exists public.ordini
  add column if not exists spedizione_carrier text;

alter table if exists public.ordini
  add column if not exists spedizione_servizio text;

alter table if exists public.ordini
  add column if not exists spedizione_tariffa_versione text;

alter table if exists public.ordini
  add column if not exists spedizione_peso_grammi integer;

-- ═════════════════════════════════════════════════════════════════════
-- 7. FUNZIONE — calcolo tariffa Poste/BRT (unica fonte autoritativa)
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.calcola_tariffa_spedizione(
  p_carrier text,
  p_service text,
  p_peso_grammi integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prezzo   numeric;
  v_versione text;
begin
  if p_peso_grammi is null or p_peso_grammi <= 0 then
    return jsonb_build_object('ok', false, 'codice', 'PESO_MANCANTE',
      'messaggio', 'Peso del prodotto non configurato.');
  end if;

  select t.prezzo, v.codice
  into v_prezzo, v_versione
  from public.shipping_tariffs t
  join public.shipping_services s on s.id = t.service_id
  join public.shipping_carriers c on c.id = s.carrier_id
  join public.shipping_tariff_versions v on v.id = t.version_id
  where c.codice = p_carrier
    and s.codice = p_service
    and coalesce(c.attivo, false)
    and coalesce(s.attivo, false)
    and coalesce(v.attiva, false)
    and p_peso_grammi > t.peso_min_g
    and p_peso_grammi <= t.peso_max_g
  order by t.peso_max_g asc
  limit 1;

  if v_prezzo is null then
    return jsonb_build_object('ok', false, 'codice', 'TARIFFA_NON_TROVATA',
      'messaggio', 'Nessuna tariffa disponibile per il corriere/servizio/peso richiesti.');
  end if;

  return jsonb_build_object('ok', true, 'prezzo', v_prezzo, 'versione', v_versione);
end;
$$;

revoke execute on function public.calcola_tariffa_spedizione(text, text, integer) from public, anon, authenticated;
grant execute on function public.calcola_tariffa_spedizione(text, text, integer) to service_role;

-- ═════════════════════════════════════════════════════════════════════
-- 8. RPC crea_ordine — calcolo tariffa server-side (sostituisce 5.9/12.9)
-- ═════════════════════════════════════════════════════════════════════
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
      if v_prodotto.peso_grammi is null or v_prodotto.peso_grammi <= 0 then
        return jsonb_build_object('ok', false, 'codice', 'PESO_MANCANTE',
          'messaggio', 'Il peso di questo prodotto non è ancora configurato dal negozio.');
      end if;
      v_peso_grammi := v_prodotto.peso_grammi * v_quantita;
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

  -- ── 6. Insert ordine ────────────────────────────────────────────────────
  insert into public.ordini (
    idempotency_key, modalita, totale, negozio_id, negozio_nome,
    cliente_user_id, cliente_nome, cliente_cognome, cliente_telefono, cliente_email, cliente_ip,
    ritiro_data, ritiro_fascia,
    spedizione_indirizzo, spedizione_cap, spedizione_citta, spedizione_provincia, spedizione_note,
    metodo_spedizione, spedizione_carrier, spedizione_servizio,
    spedizione_tariffa_versione, spedizione_peso_grammi,
    costo_spedizione, metodo_pagamento, note
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
    v_costo_sped,
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

revoke execute on function public.crea_ordine(jsonb) from public, anon, authenticated;
grant execute on function public.crea_ordine(jsonb) to service_role;

-- ═════════════════════════════════════════════════════════════════════
-- 9. RPC crea_ordine_carrello — tariffa calcolata dal sistema
--    (peso totale per negozio; corriere locale = MAX tariffe prodotto)
-- ═════════════════════════════════════════════════════════════════════
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

    -- Peso totale (solo corrieri Poste/BRT): somma peso × quantità.
    if v_carrier in ('poste_italiane', 'brt') then
      if v_riga_row.peso_grammi is null or v_riga_row.peso_grammi <= 0 then
        v_peso_mancante := true;
      else
        v_peso_grammi := v_peso_grammi + (v_riga_row.peso_grammi * v_riga_row.quantita);
      end if;
    end if;

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
      if v_peso_mancante or v_peso_grammi <= 0 then
        return jsonb_build_object('ok', false, 'codice', 'PESO_MANCANTE',
          'messaggio', 'Il peso di uno o più prodotti del carrello non è ancora configurato dal negozio.');
      end if;
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

  -- ── 8. Insert ordine ────────────────────────────────────────────────────
  insert into public.ordini (
    idempotency_key, modalita, totale, negozio_id, negozio_nome,
    cliente_user_id, cliente_nome, cliente_cognome, cliente_telefono, cliente_email, cliente_ip,
    ritiro_data, ritiro_fascia,
    spedizione_indirizzo, spedizione_cap, spedizione_citta, spedizione_provincia, spedizione_note,
    metodo_spedizione, spedizione_carrier, spedizione_servizio,
    spedizione_tariffa_versione, spedizione_peso_grammi,
    costo_spedizione, metodo_pagamento, note
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
    v_costo_sped,
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

revoke execute on function public.crea_ordine_carrello(jsonb) from public, anon, authenticated;
grant execute on function public.crea_ordine_carrello(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
