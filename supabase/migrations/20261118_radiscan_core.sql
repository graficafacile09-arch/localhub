-- ═══════════════════════════════════════════════════════════════════════
-- RADICISCAN — NUCLEO DATI AUTONOMO (FASE 2A, revisione correttiva)
-- ═══════════════════════════════════════════════════════════════════════
-- Additiva e idempotente: solo CREATE TABLE / CREATE INDEX / CREATE OR
-- REPLACE FUNCTION / CREATE OR REPLACE TRIGGER / INSERT ... ON CONFLICT /
-- REVOKE / GRANT.
-- Nessun ALTER su tabelle esistenti, nessuna DROP, nessuna modifica a
-- scan_log, product_vision_cache, consume_rate_limit,
-- consume_merchant_monthly_scan o a qualunque altro oggetto del sistema
-- di riconoscimento prodotti dei venditori: RadiciScan non li legge e non
-- li scrive.
--
-- Contenuto:
--   1. radiscan_fonti   — registro delle fonti ufficiali (unica verità)
--   2. radiscan_analisi — log delle analisi (solo metadati, MAI immagini)
--   3. radiscan_cache    — cache per impronta + versione prompt
--   4. radiscan_usage    — contatore quote per chiave
--   5. validazione delle fonti — helper + trigger sulle due tabelle
--   6. radiscan_consume_usage — RPC quote, limiti derivati dalla modalità
--   7. permessi — tutto chiuso tranne service_role
--   8. registro fonti — seed dei soli registri ufficiali
--
-- Correzioni integrative recepite:
--   - VERIFICATO solo con denominazione ufficiale attiva, completa e
--     documentata (tipo_atto, territorio, schema, URL, riferimento,
--     consultata_il), verificata da trigger;
--   - fonte_id ed esito.fonteId allineati da vincolo;
--   - snapshot della denominazione verificata nell'analisi;
--   - ON DELETE RESTRICT sulle fonti;
--   - quote obbligatorie e fail-closed, limiti non aggirabili dal chiamante;
--   - chiavi di quota con lunghezza vincolata;
--   - retry_after calcolato sulla mezzanotte locale successiva (Europe/Rome);
--   - cache 30 giorni con versione prompt nella chiave primaria;
--   - search_path = pg_catalog, public su tutte le funzioni;
--   - whitelist HTTPS dei domini ufficiali imposta anche nel database.
--
-- Nota per la FASE 2B (non implementata qui): il download di una fonte,
-- quando previsto, dovrà disabilitare i redirect automatici o rivalidare
-- ogni singolo hop contro la whitelist, con timeout esplicito. Questo file
-- impone la whitelist in scrittura, non può imporre il comportamento di rete.
--
-- Immagini: NON vengono conservate né nella cache né nel log. Di
-- un'immagine resta solo l'hash percettivo (average hash) e l'esito
-- strutturato, come richiesto nella decisione 3 della FASE 2.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Registro delle fonti ufficiali
-- ───────────────────────────────────────────────────────────────────────
-- UNICA FONTE DI VERITÀ del registro: questa tabella. Il codice non
-- contiene un elenco parallelo di fonti; lib/radiscan/fonti.ts mantiene
-- soltanto la whitelist statica dei domini ufficiali ammessi.
--
-- Il livello VERIFICATO richiede una riga `denominazione` attiva e
-- completa: i vincoli qui sotto rendono impossibile registrare una
-- denominazione senza territorio, schema, URL ufficiale, riferimento
-- normativo e data di consultazione.
create table if not exists public.radiscan_fonti (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  denominazione text not null,
  tipo_atto text not null,
  schema_qualita text,
  territorio text,
  ente text not null,
  url_ufficiale text not null,
  riferimento_normativo text not null,
  consultata_il date not null,
  attiva boolean not null default true,
  note text,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  constraint radiscan_fonti_slug_formato
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint radiscan_fonti_tipo_atto
    check (tipo_atto in ('registro', 'denominazione')),
  constraint radiscan_fonti_schema_qualita
    check (
      schema_qualita is null
      or schema_qualita in ('DOP', 'IGP', 'STG', 'DOC', 'DOCG', 'IGT', 'PAT', 'DECO')
    ),
  constraint radiscan_fonti_denominazione_piena
    check (length(btrim(denominazione)) > 0),
  constraint radiscan_fonti_ente_pieno
    check (length(btrim(ente)) > 0),
  -- Whitelist HTTPS dei domini ufficiali, imposta anche nel database.
  constraint radiscan_fonti_url_whitelist
    check (
      url_ufficiale ~ '^https://(ec\.europa\.eu|www\.masaf\.gov\.it|www\.regione\.calabria\.it|www\.arsacweb\.it)(/|$)'
    ),
  constraint radiscan_fonti_riferimento_normativo_pieno
    check (length(btrim(riferimento_normativo)) > 3),
  -- Una singola denominazione è verificabile solo se il registro riporta
  -- anche territorio e schema di qualità.
  constraint radiscan_fonti_denominazione_completa
    check (
      tipo_atto = 'registro'
      or (
        territorio is not null
        and length(btrim(territorio)) > 0
        and schema_qualita is not null
      )
    )
);

comment on table public.radiscan_fonti is
  'RadiciScan — registro curato delle fonti ufficiali. Unica fonte di verità per il livello VERIFICATO.';

-- ───────────────────────────────────────────────────────────────────────
-- 2. Log delle analisi (solo metadati)
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.radiscan_analisi (
  id uuid primary key default gen_random_uuid(),
  richiesta_id text not null,
  creato_il timestamptz not null default now(),
  modalita text not null,
  utente_id uuid,
  impronta_immagine text,
  livello text not null,
  esito jsonb not null default '{}'::jsonb,
  fonte_id uuid references public.radiscan_fonti (id) on delete restrict,
  -- Snapshot: la denominazione com'era nella fonte al momento della
  -- verifica. Se la fonte cambia o viene disattivata, la storia non cambia.
  denominazione_verificata text,
  provider text not null,
  modello text not null,
  durata_ms integer,
  esito_tecnico text not null,
  codice_errore text,
  constraint radiscan_analisi_modalita
    check (modalita in ('anonimo', 'autenticato')),
  constraint radiscan_analisi_livello
    check (livello in (
      'verificato',
      'coerente_non_verificato',
      'non_verificato',
      'incongruenza_possibile'
    )),
  constraint radiscan_analisi_esito_tecnico
    check (esito_tecnico in ('ok', 'errore', 'quota', 'timeout')),
  constraint radiscan_analisi_impronta_formato
    check (impronta_immagine is null or impronta_immagine ~ '^[0-9a-f]{16}$'),
  constraint radiscan_analisi_durata_positiva
    check (durata_ms is null or durata_ms >= 0),
  -- Invariante di affidabilità: nessuna analisi VERIFICATA senza fonte.
  constraint radiscan_analisi_verificato_con_fonte
    check (livello <> 'verificato' or fonte_id is not null),
  -- Invariante di affidabilità: nessuna analisi VERIFICATA senza snapshot.
  constraint radiscan_analisi_verificato_con_denominazione
    check (
      livello <> 'verificato'
      or (
        denominazione_verificata is not null
        and length(btrim(denominazione_verificata)) > 0
      )
    ),
  -- Allineamento obbligatorio tra colonna e payload: non possono
  -- raccontare due fonti diverse (né una presente e l'altra assente).
  constraint radiscan_analisi_esito_fonte_coerente
    check (
      coalesce(esito ->> 'fonteId', '') = coalesce(fonte_id::text, '')
    ),
  constraint radiscan_analisi_anonimo_senza_utente
    check (modalita <> 'anonimo' or utente_id is null)
);

comment on table public.radiscan_analisi is
  'RadiciScan — log delle analisi: metadati, esito strutturato e snapshot della denominazione; nessuna immagine conservata.';

comment on column public.radiscan_analisi.denominazione_verificata is
  'Denominazione ufficiale copiata dalla fonte al momento della verifica (solo livello verificato).';

create index if not exists radiscan_analisi_creato_il_idx
  on public.radiscan_analisi (creato_il desc);

create index if not exists radiscan_analisi_utente_idx
  on public.radiscan_analisi (utente_id, creato_il desc);

-- ───────────────────────────────────────────────────────────────────────
-- 3. Cache RadiciScan (nessuna immagine, solo hash + esito)
-- ───────────────────────────────────────────────────────────────────────
-- La chiave primaria include la versione del prompt: cambiare il prompt
-- non può restituire esiti prodotti da una versione precedente.
create table if not exists public.radiscan_cache (
  impronta_immagine text not null,
  versione_prompt text not null,
  livello text not null,
  esito jsonb not null,
  fonte_id uuid references public.radiscan_fonti (id) on delete restrict,
  creato_il timestamptz not null default now(),
  scade_il timestamptz not null default (now() + interval '30 days'),
  primary key (impronta_immagine, versione_prompt),
  constraint radiscan_cache_impronta_formato
    check (impronta_immagine ~ '^[0-9a-f]{16}$'),
  constraint radiscan_cache_versione_prompt
    check (length(btrim(versione_prompt)) between 1 and 64),
  constraint radiscan_cache_livello
    check (livello in (
      'verificato',
      'coerente_non_verificato',
      'non_verificato',
      'incongruenza_possibile'
    )),
  constraint radiscan_cache_verificato_con_fonte
    check (livello <> 'verificato' or fonte_id is not null),
  constraint radiscan_cache_esito_fonte_coerente
    check (
      coalesce(esito ->> 'fonteId', '') = coalesce(fonte_id::text, '')
    )
);

comment on table public.radiscan_cache is
  'RadiciScan — cache per hash percettivo e versione prompt. Nessuna immagine viene memorizzata.';

create index if not exists radiscan_cache_scade_il_idx
  on public.radiscan_cache (scade_il);

-- ───────────────────────────────────────────────────────────────────────
-- 4. Contatore quote (una riga per richiesta ammessa)
-- ───────────────────────────────────────────────────────────────────────
-- `chiave` è calcolata dall'applicazione: per gli anonimi un hash salato
-- dell'indirizzo IP, per gli autenticati l'id utente. Nessun dato in chiaro
-- di rete viene memorizzato. La lunghezza è vincolata per evitare crescita
-- incontrollata della tabella.
create table if not exists public.radiscan_usage (
  id bigint generated always as identity primary key,
  chiave text not null,
  creato_il timestamptz not null default now(),
  constraint radiscan_usage_chiave_lunghezza
    check (length(chiave) between 16 and 128)
);

comment on table public.radiscan_usage is
  'RadiciScan — contatore quote per chiave (hash IP salato o id utente autenticato).';

create index if not exists radiscan_usage_chiave_creato_il_idx
  on public.radiscan_usage (chiave, creato_il desc);

-- ───────────────────────────────────────────────────────────────────────
-- 5. Validazione delle fonti
-- ───────────────────────────────────────────────────────────────────────
-- Una fonte può sostenere il livello VERIFICATO soltanto se è una
-- denominazione ufficiale ATTIVA e COMPLETA. Il controllo è nel database,
-- non solo nel codice: nessun percorso applicativo può aggirarlo.
create or replace function public.radiscan_fonte_verificabile(p_fonte_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.radiscan_fonti f
     where f.id = p_fonte_id
       and f.tipo_atto = 'denominazione'
       and f.attiva
       and f.territorio is not null
       and length(btrim(f.territorio)) > 0
       and f.schema_qualita is not null
       and f.url_ufficiale ~ '^https://(ec\.europa\.eu|www\.masaf\.gov\.it|www\.regione\.calabria\.it|www\.arsacweb\.it)(/|$)'
       and length(btrim(f.riferimento_normativo)) > 3
       and f.consultata_il is not null
  );
$$;

comment on function public.radiscan_fonte_verificabile(uuid) is
  'RadiciScan — true solo per una denominazione ufficiale attiva, completa e documentata.';

-- Analisi: valida la fonte e compila lo snapshot.
create or replace function public.radiscan_valida_fonte_analisi()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_denominazione text;
begin
  if new.livello <> 'verificato' then
    if new.denominazione_verificata is not null then
      raise exception
        'Denominazione verificata valorizzata senza livello verificato'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.fonte_id is null
     or not public.radiscan_fonte_verificabile(new.fonte_id) then
    raise exception
      'Livello verificato senza fonte ufficiale attiva e documentata'
      using errcode = '23514';
  end if;

  select f.denominazione
    into v_denominazione
    from public.radiscan_fonti f
   where f.id = new.fonte_id;

  if v_denominazione is null then
    raise exception
      'Fonte % inesistente', new.fonte_id
      using errcode = '23514';
  end if;

  if new.denominazione_verificata is not null
     and btrim(new.denominazione_verificata) <> btrim(v_denominazione) then
    raise exception
      'Snapshot della denominazione incoerente con la fonte %', new.fonte_id
      using errcode = '23514';
  end if;

  new.denominazione_verificata := v_denominazione;
  return new;
end;
$$;

-- Cache: stessa validazione, senza snapshot (l'esito lo contiene già).
create or replace function public.radiscan_valida_fonte_cache()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.livello = 'verificato'
     and (
       new.fonte_id is null
       or not public.radiscan_fonte_verificabile(new.fonte_id)
     ) then
    raise exception
      'Livello verificato senza fonte ufficiale attiva e documentata'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace trigger radiscan_analisi_valida_fonte
  before insert or update
  on public.radiscan_analisi
  for each row
  execute function public.radiscan_valida_fonte_analisi();

create or replace trigger radiscan_cache_valida_fonte
  before insert or update
  on public.radiscan_cache
  for each row
  execute function public.radiscan_valida_fonte_cache();

-- ───────────────────────────────────────────────────────────────────────
-- 6. RPC atomica delle quote RadiciScan
-- ───────────────────────────────────────────────────────────────────────
-- I limiti NON sono parametri: derivano dalla modalità dichiarata, così un
-- chiamante non può allentarli né disattivarli passando zero.
--   anonimo      → 3/minuto, 15/giorno
--   autenticato  → 10/minuto, 60/giorno
-- Parametri mancanti, nulli, modalità sconosciuta o chiave fuori misura
-- producono un'eccezione: il chiamante risponde 503 (fail-closed), non
-- prosegue senza quota.
-- La finestra giornaliera si chiude a mezzanotte italiana (Europe/Rome).
create or replace function public.radiscan_consume_usage(
  p_chiave text,
  p_modalita text,
  p_etichetta text default 'analisi'
)
returns table (
  allowed boolean,
  retry_after integer,
  reason text,
  usati_oggi integer,
  limite_giorno integer,
  limite_minuto integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_chiave text := nullif(btrim(coalesce(p_chiave, '')), '');
  v_modalita text := lower(nullif(btrim(coalesce(p_modalita, '')), ''));
  v_etichetta text := coalesce(nullif(btrim(p_etichetta), ''), 'analisi');
  v_limite_minuto integer;
  v_limite_giorno integer;
  v_usati_minuto integer;
  v_usati_giorno integer;
  v_primo_minuto timestamptz;
  v_inizio_giorno timestamptz;
  v_prossima_mezzanotte timestamptz;
  v_attesa integer;
begin
  if v_chiave is null or length(v_chiave) < 16 or length(v_chiave) > 128 then
    raise exception 'Chiave di quota non valida'
      using errcode = '22023';
  end if;

  if v_modalita = 'anonimo' then
    v_limite_minuto := 3;
    v_limite_giorno := 15;
  elsif v_modalita = 'autenticato' then
    v_limite_minuto := 10;
    v_limite_giorno := 60;
  else
    raise exception 'Modalità di quota non valida'
      using errcode = '22023';
  end if;

  -- Guardia difensiva: nessun limite può essere disattivato.
  if v_limite_minuto is null
     or v_limite_giorno is null
     or v_limite_minuto <= 0
     or v_limite_giorno <= 0 then
    raise exception 'Limiti di quota non validi'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('radiscan:' || v_chiave, 0));

  v_inizio_giorno :=
    date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome';

  -- Mezzanotte locale SUCCESSIVA, calcolata in aritmetica timestamp:
  -- regge sia l'ora legale sia quella solare (giorni da 23 e 25 ore).
  v_prossima_mezzanotte :=
    date_trunc('day', (now() at time zone 'Europe/Rome') + interval '1 day')
      at time zone 'Europe/Rome';

  select count(*)::integer, min(creato_il)
    into v_usati_minuto, v_primo_minuto
    from public.radiscan_usage
   where chiave = v_chiave
     and creato_il >= now() - interval '1 minute';

  select count(*)::integer
    into v_usati_giorno
    from public.radiscan_usage
   where chiave = v_chiave
     and creato_il >= v_inizio_giorno;

  if v_usati_minuto >= v_limite_minuto then
    v_attesa := greatest(
      1,
      ceil(extract(epoch from (v_primo_minuto + interval '1 minute' - now())))::integer
    );
    return query select
      false,
      v_attesa,
      format(
        'Hai raggiunto il limite di %s %s al minuto. Riprova tra poco.',
        v_limite_minuto,
        v_etichetta
      ),
      v_usati_giorno,
      v_limite_giorno,
      v_limite_minuto;
    return;
  end if;

  if v_usati_giorno >= v_limite_giorno then
    v_attesa := greatest(
      1,
      ceil(extract(epoch from (v_prossima_mezzanotte - now())))::integer
    );
    return query select
      false,
      v_attesa,
      format(
        'Hai raggiunto il limite di %s %s al giorno. Riprova domani.',
        v_limite_giorno,
        v_etichetta
      ),
      v_usati_giorno,
      v_limite_giorno,
      v_limite_minuto;
    return;
  end if;

  insert into public.radiscan_usage (chiave) values (v_chiave);

  return query select
    true,
    0,
    null::text,
    v_usati_giorno + 1,
    v_limite_giorno,
    v_limite_minuto;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- 7. Permessi: solo service_role
-- ───────────────────────────────────────────────────────────────────────
revoke all on function public.radiscan_consume_usage(text, text, text)
  from public, anon, authenticated;
grant execute on function public.radiscan_consume_usage(text, text, text)
  to service_role;

revoke all on function public.radiscan_fonte_verificabile(uuid)
  from public, anon, authenticated;
grant execute on function public.radiscan_fonte_verificabile(uuid)
  to service_role;

revoke all on function public.radiscan_valida_fonte_analisi()
  from public, anon, authenticated;
grant execute on function public.radiscan_valida_fonte_analisi()
  to service_role;

revoke all on function public.radiscan_valida_fonte_cache()
  from public, anon, authenticated;
grant execute on function public.radiscan_valida_fonte_cache()
  to service_role;

alter table public.radiscan_fonti enable row level security;
alter table public.radiscan_analisi enable row level security;
alter table public.radiscan_cache enable row level security;
alter table public.radiscan_usage enable row level security;

revoke all on table
  public.radiscan_fonti,
  public.radiscan_analisi,
  public.radiscan_cache,
  public.radiscan_usage
  from anon, authenticated;

revoke all on sequence public.radiscan_usage_id_seq from anon, authenticated;

grant all on table
  public.radiscan_fonti,
  public.radiscan_analisi,
  public.radiscan_cache,
  public.radiscan_usage
  to service_role;

grant usage, select on sequence public.radiscan_usage_id_seq to service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 8. Seed del registro: SOLO registri ufficiali
-- ───────────────────────────────────────────────────────────────────────
-- Le righe inserite sono REGISTRI (tipo_atto = 'registro'), verificati
-- manualmente il 18/11/2026 sulle pagine istituzionali indicate.
--
-- Le righe tipo_atto = 'denominazione' (la singola DOP/IGP/DOC/IGT/PAT con
-- territorio e riferimento normativo specifico) NON sono precaricate:
-- ognuna richiede una verifica documentale puntuale sul registro ufficiale,
-- con l'atto di registrazione esatto. Non viene inventata nessuna
-- denominazione, nessun territorio e nessun estremo normativo.
insert into public.radiscan_fonti
  (slug, denominazione, tipo_atto, schema_qualita, territorio, ente,
   url_ufficiale, riferimento_normativo, consultata_il, attiva, note)
values
  (
    'ue-eambrosia',
    'eAmbrosia — Registro unionale delle indicazioni geografiche',
    'registro', null, null,
    'Commissione europea — DG Agricoltura e sviluppo rurale',
    'https://ec.europa.eu/geographical-indications-register',
    'Reg. (UE) 2024/1143, artt. 22 e 65; Reg. (UE) n. 1308/2013 per il settore vitivinicolo',
    '2026-11-18', true,
    'Registro legale UE di DOP, IGP, STG, vini e bevande spiritose, con atti di protezione e disciplinari.'
  ),
  (
    'masaf-dop-igp-stg',
    'MASAF — Prodotti agricoli DOP, IGP e STG',
    'registro', null, null,
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste',
    'https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/396',
    'Reg. (UE) 2024/1143, art. 5, par. 1, lett. c)',
    '2026-11-18', true,
    'Sezione ministeriale sui regimi DOP, IGP e STG dei prodotti agricoli e alimentari.'
  ),
  (
    'masaf-elenco-dop-igp',
    'MASAF — Elenco e disciplinari DOP e IGP dei prodotti agricoli',
    'registro', null, null,
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste',
    'https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/15453',
    'Reg. (UE) 2024/1143, art. 22, par. 1',
    '2026-11-18', true,
    'Elenco delle denominazioni italiane iscritte nel registro unionale, con disciplinari per classe di prodotto.'
  ),
  (
    'masaf-elenco-stg',
    'MASAF — Elenco e disciplinari STG dei prodotti agricoli',
    'registro', null, null,
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste',
    'https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/24230',
    'Reg. (UE) 2024/1143, art. 65, par. 1',
    '2026-11-18', true,
    'Elenco delle specialità tradizionali garantite italiane iscritte nel registro unionale.'
  ),
  (
    'masaf-pat',
    'MASAF — Prodotti agroalimentari tradizionali (PAT)',
    'registro', null, null,
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste',
    'https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/398',
    'DM 8 settembre 1999, n. 350, art. 3; legge 12 dicembre 2016, n. 238, art. 12, comma 1',
    '2026-11-18', true,
    'Elenco nazionale dei PAT, articolato su base regionale e aggiornato con decreto ministeriale annuale.'
  ),
  (
    'regione-calabria-pat',
    'Regione Calabria — Prodotti agroalimentari tradizionali',
    'registro', null, 'Calabria',
    'Regione Calabria — Dipartimento Agricoltura, risorse agroalimentari e forestazione',
    'https://www.regione.calabria.it/dipartimento-agricoltura-risorse-agroalimentari-e-forestazione/aree-tematiche/filiera-agroalimentare-ed-educazione-alimentare/p-a-t',
    'DM 8 settembre 1999, n. 350, art. 3; legge 12 dicembre 2016, n. 238, art. 12, comma 1',
    '2026-11-18', true,
    'Elenco regionale calabrese dei PAT e procedura di revisione; il territorio della riga è la regione, non la singola denominazione.'
  ),
  (
    'masaf-vini-dop-igp',
    'MASAF — Vini DOP e IGP',
    'registro', null, null,
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste',
    'https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/395',
    'Reg. (UE) n. 1308/2013, art. 92, par. 1',
    '2026-11-18', true,
    'Sezione ministeriale sui vini DOP (DOCG, DOC) e IGP (IGT) e sulle menzioni tradizionali italiane.'
  ),
  (
    'masaf-vini-elenchi',
    'MASAF — Elenchi e disciplinari dei vini DOP e IGP',
    'registro', null, null,
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste',
    'https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/4625',
    'Reg. (UE) n. 1308/2013, artt. 92 e 112; legge 12 dicembre 2016, n. 238',
    '2026-11-18', true,
    'Elenchi alfabetici dei vini DOP e IGP italiani, disciplinari e collegamento ai documenti unici in eAmbrosia.'
  ),
  (
    'arsac-qualita-calabria',
    'ARSAC — Prodotti di qualità della Calabria',
    'registro', null, 'Calabria',
    'ARSAC — Agenzia regionale per lo sviluppo in agricoltura della Calabria',
    'https://www.arsacweb.it/dop-igp-calabria',
    'DM 8 settembre 1999, n. 350, art. 3; legge 12 dicembre 2016, n. 238',
    '2026-11-18', true,
    'Repertorio regionale di DOP, IGP, vini a denominazione e PAT calabresi; fonte di orientamento, non sostitutiva del registro unionale.'
  )
on conflict (slug) do update set
  denominazione = excluded.denominazione,
  tipo_atto = excluded.tipo_atto,
  schema_qualita = excluded.schema_qualita,
  territorio = excluded.territorio,
  ente = excluded.ente,
  url_ufficiale = excluded.url_ufficiale,
  riferimento_normativo = excluded.riferimento_normativo,
  consultata_il = excluded.consultata_il,
  attiva = excluded.attiva,
  note = excluded.note,
  aggiornato_il = now();

notify pgrst, 'reload schema';

commit;
