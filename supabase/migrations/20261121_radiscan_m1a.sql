-- ═══════════════════════════════════════════════════════════════════════
-- RADICISCAN — M1a · STRATO DOCUMENTALE (FASE 2Z.14)
-- ═══════════════════════════════════════════════════════════════════════
-- Additiva. Non modifica la migration 20261118_radiscan_core (2A):
--   - nessuna delle sue 4 funzioni viene ricreata o sostituita;
--   - nessuno dei suoi trigger viene toccato
--     (radiscan_analisi_valida_fonte, radiscan_cache_valida_fonte);
--   - nessuno dei suoi CHECK viene rimosso o modificato;
--   - radiscan_cache resta completamente invariata (PK compresa).
--
-- Perimetro: 13 tabelle, 1 vista, 1 ALTER TABLE (solo radiscan_analisi),
-- 8 indici/vincoli indicizzati, 15 trigger, 40 funzioni
-- (13 RPC + 12 helper + 15 funzioni trigger), 3 sequenze, 2 seed.
--
-- Decisioni recepite:
--   D1 quattro stati documentali: registrato, vigente, superato,
--      non_verificabile; "più recente acquisito" non è uno stato.
--   D2 la vigenza è dichiarata da un operatore autorizzato, con evento
--      append-only e riferimento esplicito all'atto; la data di
--      registrazione non dimostra la vigenza.
--   D3 un solo documento vigente per denominazione canonica.
--   D4 nessun livello verificato in M1a; il massimo è
--      coerente_non_verificato.
--   D5 il nuovo vigente registra superato_da_id sul precedente; eventi
--      append-only; nessuna cancellazione; analisi storiche intatte.
--   D6 identità: service_role, p_operatore_id validato su
--      radiscan_operatori; il database non dimostra la provenienza.
--   D7 trigger e CHECK della 2A invariati, nessuna fonte "denominazione",
--      verificato irraggiungibile.
--   D8 radiscan_fonti.canale non esiste e non viene introdotta.
--   A1 un solo ALTER TABLE, su radiscan_analisi; cache legacy intatta.
--   A2 estratti duplicati ammessi: nessun indice di unicità.
--   A3 registro delle chiamate: solo esiti committati; gli errori sono
--      registrati dal backend in una seconda scrittura indipendente.
--      Il registro NON garantisce la registrazione di tutti gli errori.
--   A4 nessuna FK da motore_verifica verso radiscan_motori: la coerenza
--      semantica è responsabilità del backend.
--   A5 pulizia sessioni applicativa (nessun pg_cron): le sessioni sono
--      marcate abbandonate, mai cancellate.
--
-- ─── ORDINE DI ESECUZIONE DEI TRIGGER (dipendenza reale) ────────────────
-- PostgreSQL esegue i trigger BEFORE ROW dello stesso evento in ORDINE
-- ALFABETICO DI NOME, non di creazione. Tre tabelle hanno due trigger:
--   radiscan_documenti_disciplinari: radiscan_documenti_transizione
--                                    poi radiscan_documenti_valida
--   radiscan_prove:                  radiscan_prove_immutabile
--                                    poi radiscan_prove_valida
--   radiscan_sessioni:               radiscan_sessioni_chiusura
--                                    poi radiscan_sessioni_token
-- I nomi NON vanno rinominati: il rinomino cambia l'ordine.
--
-- Non idempotente per scelta: i cinque ADD CONSTRAINT dell'ALTER non hanno
-- IF NOT EXISTS. La migration è one-shot, come la 2A.
-- Nessun DROP, nessun DELETE, nessun TRUNCATE.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Helper puri (nessuna dipendenza da tabelle)
-- ───────────────────────────────────────────────────────────────────────

-- Normalizzazione identica a lib/radiscan/verifica.ts::normalizzaDenominazione:
-- minuscole, senza diacritici, punteggiatura ridotta a spazi, sigle con i
-- punti ricompattate, etichette di qualità finali rimosse.
-- Nessuna dipendenza da unaccent: translate() è deterministica e sufficiente.
create or replace function public.radiscan_normalizza_chiave(p_testo text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_testo text;
  v_parole text[];
  v_parola text;
  v_sigla text := '';
  v_out text[] := '{}';
  v_n integer;
  v_etichette constant text[] := array['dop','igp','stg','doc','docg','igt','pat','deco'];
begin
  if p_testo is null then
    return null;
  end if;

  v_testo := lower(translate(
    p_testo,
    'àáâãäåèéêëìíîïòóôõöùúûüçñ',
    'aaaaaaeeeeiiiiooooouuuucn'
  ));
  v_testo := regexp_replace(v_testo, '[^a-z0-9]+', ' ', 'g');
  v_testo := btrim(regexp_replace(v_testo, '\s+', ' ', 'g'));

  if v_testo = '' then
    return '';
  end if;

  v_parole := string_to_array(v_testo, ' ');

  foreach v_parola in array v_parole loop
    if length(v_parola) = 1 then
      v_sigla := v_sigla || v_parola;
      continue;
    end if;
    if v_sigla <> '' then
      v_out := v_out || v_sigla;
      v_sigla := '';
    end if;
    v_out := v_out || v_parola;
  end loop;

  if v_sigla <> '' then
    v_out := v_out || v_sigla;
  end if;

  v_n := coalesce(array_length(v_out, 1), 0);
  if v_n = 0 then
    return '';
  end if;

  while v_n > 1 and v_out[v_n] = any (v_etichette) loop
    v_out := v_out[1:v_n - 1];
    v_n := v_n - 1;
  end loop;

  return array_to_string(v_out, ' ');
end;
$$;

comment on function public.radiscan_normalizza_chiave(text) is
  'RadiciScan M1a — chiave canonica di una denominazione: minuscole, senza diacritici, sigle ricompattate, etichette finali rimosse.';

-- Guardia indispensabile: in PostgreSQL position('' in 'abc') = 1, quindi
-- una chiave vuota renderebbe positivo ogni confronto. La soglia è 4 perché
-- "Etna" DOC ha esattamente 4 caratteri.
create or replace function public.radiscan_chiave_valida(p_chiave text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p_chiave is not null
     and length(p_chiave) >= 4
     and p_chiave ~ '^[a-z0-9]+( [a-z0-9]+)*$'
     and p_chiave <> all (array['dop','igp','stg','doc','docg','igt','pat','deco'])
     and p_chiave = public.radiscan_normalizza_chiave(p_chiave);
$$;

comment on function public.radiscan_chiave_valida(text) is
  'RadiciScan M1a — true solo per una chiave canonica utilizzabile (>= 4 caratteri, non una sola etichetta, già normalizzata).';

create or replace function public.estratto_contiene_denominazione(
  p_estratto text,
  p_chiave text
)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_estratto is null or p_chiave is null then false
    when length(btrim(p_chiave)) < 4 then false
    when btrim(p_chiave) = any (array['dop','igp','stg','doc','docg','igt','pat','deco']) then false
    else position(
           ' ' || btrim(p_chiave) || ' '
           in ' ' || public.radiscan_normalizza_chiave(p_estratto) || ' '
         ) > 0
  end;
$$;

comment on function public.estratto_contiene_denominazione(text, text) is
  'RadiciScan M1a — confronto su token delimitati, con guardia contro la chiave vuota e contro le sole etichette di qualità.';

create or replace function public.radiscan_livello_massimo_m1a()
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select 'coerente_non_verificato'::text;
$$;

comment on function public.radiscan_livello_massimo_m1a() is
  'RadiciScan M1a — unico livello massimo raggiungibile (D4/D7): il verificato non è prodotto in M1a.';

create or replace function public.radiscan_richiesta_valida(p_richiesta_id text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p_richiesta_id is not null
     and length(btrim(p_richiesta_id)) between 8 and 128
     and btrim(p_richiesta_id) ~ '^[A-Za-z0-9._:-]+$';
$$;

comment on function public.radiscan_richiesta_valida(text) is
  'RadiciScan M1a — formato della chiave di correlazione della richiesta.';

-- ───────────────────────────────────────────────────────────────────────
-- 2. Tabelle (ordine di dipendenza)
-- ───────────────────────────────────────────────────────────────────────

create table if not exists public.radiscan_operatori (
  id uuid primary key default gen_random_uuid(),
  utente_id uuid not null references auth.users (id) on delete restrict,
  ruolo text not null default 'curatore',
  attivo boolean not null default true,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  note text,
  constraint radiscan_operatori_ruolo
    check (ruolo in ('curatore', 'amministratore')),
  constraint radiscan_operatori_note_piena
    check (note is null or length(btrim(note)) > 0)
);

comment on table public.radiscan_operatori is
  'RadiciScan M1a — curatori e amministratori autorizzati. Unico ponte fra auth.users e i permessi RadiciScan.';

create table if not exists public.radiscan_motori (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  descrizione text not null,
  versione_prompt text not null,
  attivo boolean not null default false,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  constraint radiscan_motori_codice_formato
    check (codice ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint radiscan_motori_descrizione_piena
    check (length(btrim(descrizione)) > 0),
  constraint radiscan_motori_versione_prompt
    check (length(btrim(versione_prompt)) between 1 and 64)
);

comment on table public.radiscan_motori is
  'RadiciScan M1a — registro dei motori di verifica documentale (v2 presente e inattivo).';

create table if not exists public.radiscan_denominazioni (
  id uuid primary key default gen_random_uuid(),
  nome_ufficiale text not null,
  chiave text not null,
  schema_qualita text,
  territorio text,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  constraint radiscan_denominazioni_nome_pieno
    check (length(btrim(nome_ufficiale)) > 0),
  constraint radiscan_denominazioni_chiave_formato
    check (chiave ~ '^[a-z0-9]+( [a-z0-9]+)*$'),
  constraint radiscan_denominazioni_chiave_lunghezza
    check (length(chiave) >= 4),
  constraint radiscan_denominazioni_chiave_non_etichetta
    check (chiave <> all (array['dop','igp','stg','doc','docg','igt','pat','deco'])),
  constraint radiscan_denominazioni_schema
    check (
      schema_qualita is null
      or schema_qualita in ('DOP','IGP','STG','DOC','DOCG','IGT','PAT','DECO')
    )
);

comment on table public.radiscan_denominazioni is
  'RadiciScan M1a — denominazioni canoniche: una sola chiave per denominazione (D3).';

create table if not exists public.radiscan_alias (
  id uuid primary key default gen_random_uuid(),
  denominazione_id uuid not null references public.radiscan_denominazioni (id) on delete restrict,
  alias text not null,
  chiave_alias text not null,
  creato_il timestamptz not null default now(),
  constraint radiscan_alias_testo_pieno
    check (length(btrim(alias)) > 0),
  constraint radiscan_alias_chiave_formato
    check (chiave_alias ~ '^[a-z0-9]+( [a-z0-9]+)*$'),
  constraint radiscan_alias_chiave_lunghezza
    check (length(chiave_alias) >= 4),
  constraint radiscan_alias_chiave_non_etichetta
    check (chiave_alias <> all (array['dop','igp','stg','doc','docg','igt','pat','deco']))
);

comment on table public.radiscan_alias is
  'RadiciScan M1a — grafie alternative ricondotte a una denominazione canonica.';

create table if not exists public.radiscan_documenti_disciplinari (
  id uuid primary key default gen_random_uuid(),
  denominazione_id uuid not null references public.radiscan_denominazioni (id) on delete restrict,
  fonte_id uuid not null references public.radiscan_fonti (id) on delete restrict,
  titolo text not null,
  atto_tipo text not null,
  atto_numero text not null,
  atto_data date not null,
  atto_riferimento text not null,
  stato_vigenza text not null default 'registrato',
  valido_dal date,
  valido_al date,
  superato_da_id uuid references public.radiscan_documenti_disciplinari (id) on delete restrict,
  registrato_da uuid not null references public.radiscan_operatori (id) on delete restrict,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  constraint radiscan_documenti_stato
    check (stato_vigenza in ('registrato', 'vigente', 'superato', 'non_verificabile')),
  constraint radiscan_documenti_atto_tipo
    check (atto_tipo in ('decreto', 'regolamento', 'disciplinare', 'modifica', 'altro')),
  constraint radiscan_documenti_atto_numero_pieno
    check (length(btrim(atto_numero)) > 0),
  constraint radiscan_documenti_atto_riferimento_pieno
    check (length(btrim(atto_riferimento)) > 3),
  constraint radiscan_documenti_intervallo
    check (valido_al is null or valido_dal is null or valido_al >= valido_dal),
  constraint radiscan_documenti_vigente_con_data
    check (stato_vigenza <> 'vigente' or valido_dal is not null),
  constraint radiscan_documenti_superato_con_successore
    check (stato_vigenza <> 'superato' or superato_da_id is not null),
  constraint radiscan_documenti_superato_da_non_self
    check (superato_da_id is null or superato_da_id <> id)
);

comment on table public.radiscan_documenti_disciplinari is
  'RadiciScan M1a — documenti disciplinari con stato amministrativo esplicito e riferimento all''atto.';

create table if not exists public.radiscan_documenti_vigenza_eventi (
  id bigint generated always as identity primary key,
  documento_id uuid not null references public.radiscan_documenti_disciplinari (id) on delete restrict,
  stato_precedente text,
  stato_nuovo text not null,
  operatore_id uuid not null references public.radiscan_operatori (id) on delete restrict,
  atto_riferimento text not null,
  motivazione text,
  richiesta_id text not null,
  auth_uid uuid,
  ruolo_db text not null,
  creato_il timestamptz not null default now(),
  constraint radiscan_eventi_stato_precedente
    check (stato_precedente is null or stato_precedente in ('registrato', 'vigente', 'superato', 'non_verificabile')),
  constraint radiscan_eventi_stato_nuovo
    check (stato_nuovo in ('registrato', 'vigente', 'superato', 'non_verificabile')),
  constraint radiscan_eventi_transizione_reale
    check (stato_precedente is distinct from stato_nuovo),
  constraint radiscan_eventi_richiesta_piena
    check (length(btrim(richiesta_id)) > 0),
  constraint radiscan_eventi_atto_pieno
    check (length(btrim(atto_riferimento)) > 3)
);

comment on table public.radiscan_documenti_vigenza_eventi is
  'RadiciScan M1a — registro append-only delle dichiarazioni di vigenza (D2, D5).';

create table if not exists public.radiscan_documenti_estratti (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.radiscan_documenti_disciplinari (id) on delete restrict,
  estratto text not null,
  impronta_estratto text not null,
  registrato_da uuid not null references public.radiscan_operatori (id) on delete restrict,
  creato_il timestamptz not null default now(),
  constraint radiscan_estratti_testo_minimo
    check (length(btrim(estratto)) >= 20),
  constraint radiscan_estratti_impronta_formato
    check (impronta_estratto ~ '^[0-9a-f]{16}$')
);

comment on table public.radiscan_documenti_estratti is
  'RadiciScan M1a — estratti testuali per la verifica di contenimento della denominazione. Duplicati ammessi (A2).';

create table if not exists public.radiscan_sessioni (
  id uuid primary key default gen_random_uuid(),
  token text not null default replace(gen_random_uuid()::text, '-', ''),
  motore_id uuid not null references public.radiscan_motori (id) on delete restrict,
  operatore_id uuid references public.radiscan_operatori (id) on delete restrict,
  stato text not null default 'aperta',
  aperta_il timestamptz not null default now(),
  ultima_attivita_il timestamptz not null default now(),
  chiusa_il timestamptz,
  constraint radiscan_sessioni_token_formato
    check (token ~ '^[0-9a-f]{32}$'),
  constraint radiscan_sessioni_stato
    check (stato in ('aperta', 'chiusa', 'abbandonata')),
  constraint radiscan_sessioni_chiusura_coerente
    check (stato = 'aperta' or chiusa_il is not null)
);

comment on table public.radiscan_sessioni is
  'RadiciScan M1a — sessioni di verifica. Il token nasce dal database (32 hex, 122 bit) e non è scelto dal chiamante.';

create table if not exists public.radiscan_prove (
  id uuid primary key default gen_random_uuid(),
  sessione_id uuid not null references public.radiscan_sessioni (id) on delete restrict,
  tipo text not null,
  impronta_immagine text,
  esito jsonb not null default '{}'::jsonb,
  revocata_il timestamptz,
  revocata_da uuid references public.radiscan_operatori (id) on delete restrict,
  creato_il timestamptz not null default now(),
  constraint radiscan_prove_tipo
    check (tipo in ('etichetta', 'documento', 'foto_prodotto', 'altro')),
  constraint radiscan_prove_impronta_formato
    check (impronta_immagine is null or impronta_immagine ~ '^[0-9a-f]{16}$'),
  constraint radiscan_prove_revoca_coerente
    check ((revocata_il is null) = (revocata_da is null))
);

comment on table public.radiscan_prove is
  'RadiciScan M1a — prove della sessione. Una prova revocata resta nello storico ma è invisibile alle valutazioni.';

create table if not exists public.radiscan_sessione_documenti (
  sessione_id uuid not null references public.radiscan_sessioni (id) on delete restrict,
  documento_id uuid not null references public.radiscan_documenti_disciplinari (id) on delete restrict,
  ruolo text not null default 'principale',
  creato_il timestamptz not null default now(),
  primary key (sessione_id, documento_id),
  constraint radiscan_sessione_documenti_ruolo
    check (ruolo in ('principale', 'confronto'))
);

comment on table public.radiscan_sessione_documenti is
  'RadiciScan M1a — documenti considerati in una sessione (uno principale, altri di confronto).';

create table if not exists public.radiscan_esiti_verifica (
  id uuid primary key default gen_random_uuid(),
  sessione_id uuid not null references public.radiscan_sessioni (id) on delete restrict,
  motore_id uuid not null references public.radiscan_motori (id) on delete restrict,
  documento_id uuid references public.radiscan_documenti_disciplinari (id) on delete restrict,
  livello text not null,
  motivo text not null,
  calcolato_il timestamptz not null default now(),
  richiesta_id text not null,
  -- D4/D7: il livello verificato non è nel dominio. Non è un CHECK rimosso
  -- in futuro senza una migration dedicata a M1b.
  constraint radiscan_esiti_livello_m1a
    check (livello in ('coerente_non_verificato', 'non_verificato', 'incongruenza_possibile')),
  constraint radiscan_esiti_motivo_pieno
    check (length(btrim(motivo)) > 0),
  constraint radiscan_esiti_richiesta_piena
    check (length(btrim(richiesta_id)) > 0)
);

comment on table public.radiscan_esiti_verifica is
  'RadiciScan M1a — esiti append-only del motore documentale. Il livello verificato è impossibile per costruzione.';

create table if not exists public.radiscan_pulizie_sessioni (
  id bigint generated always as identity primary key,
  modalita text not null,
  oltre_ore integer not null,
  sessioni_chiuse integer not null,
  operatore_id uuid references public.radiscan_operatori (id) on delete restrict,
  richiesta_id text not null,
  eseguita_il timestamptz not null default now(),
  constraint radiscan_pulizie_modalita
    check (modalita in ('cron', 'applicativa', 'manuale')),
  constraint radiscan_pulizie_oltre_ore
    check (oltre_ore between 1 and 168),
  constraint radiscan_pulizie_conteggio
    check (sessioni_chiuse >= 0),
  constraint radiscan_pulizie_richiesta_piena
    check (length(btrim(richiesta_id)) > 0)
);

comment on table public.radiscan_pulizie_sessioni is
  'RadiciScan M1a — registro delle pulizie applicative delle sessioni abbandonate (A5, nessun pg_cron).';

create table if not exists public.radiscan_registro_chiamate (
  id bigint generated always as identity primary key,
  funzione text not null,
  operatore_id uuid references public.radiscan_operatori (id) on delete restrict,
  richiesta_id text not null,
  session_user_db text not null,
  current_user_db text not null,
  esito text not null,
  creato_il timestamptz not null default now(),
  constraint radiscan_registro_funzione_piena
    check (length(btrim(funzione)) > 0),
  constraint radiscan_registro_esito
    check (esito in ('ok', 'errore')),
  constraint radiscan_registro_richiesta_piena
    check (length(btrim(richiesta_id)) > 0)
);

comment on table public.radiscan_registro_chiamate is
  'RadiciScan M1a — traccia tecnica delle chiamate concluse con commit (A3). Nessun UPDATE o DELETE: append-only per ACL.';

-- ───────────────────────────────────────────────────────────────────────
-- 3. Helper dipendenti dalle tabelle
-- ───────────────────────────────────────────────────────────────────────

create or replace function public.radiscan_operatore_autorizzato(
  p_operatore_id uuid,
  p_ruoli text[] default array['curatore', 'amministratore']
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.radiscan_operatori o
     where o.id = p_operatore_id
       and o.attivo
       and o.ruolo = any (coalesce(p_ruoli, array['curatore', 'amministratore']))
  );
$$;

comment on function public.radiscan_operatore_autorizzato(uuid, text[]) is
  'RadiciScan M1a — true solo per un operatore esistente, attivo e con ruolo ammesso.';

create or replace function public.radiscan_documento_vigente(p_denominazione_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.id
    from public.radiscan_documenti_disciplinari d
   where d.denominazione_id = p_denominazione_id
     and d.stato_vigenza = 'vigente'
   order by d.valido_dal desc nulls last, d.id desc
   limit 1;
$$;

comment on function public.radiscan_documento_vigente(uuid) is
  'RadiciScan M1a — documento vigente della denominazione. ORDER BY è difensivo: l''unicità è garantita dall''indice parziale.';

create or replace function public.radiscan_documento_e_vigente(p_documento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.radiscan_documenti_disciplinari d
     where d.id = p_documento_id
       and d.stato_vigenza = 'vigente'
  );
$$;

comment on function public.radiscan_documento_e_vigente(uuid) is
  'RadiciScan M1a — stato amministrativo, non utilizzabilità: la decorrenza è calcolata dalla vista.';

create or replace function public.radiscan_motore_attivo(p_motore_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.radiscan_motori m
     where m.id = p_motore_id
       and m.attivo
  );
$$;

comment on function public.radiscan_motore_attivo(uuid) is
  'RadiciScan M1a — v2-documentale è presente con attivo = false e non può aprire sessioni.';

create or replace function public.radiscan_prova_attiva(p_prova_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.radiscan_prove p
     where p.id = p_prova_id
       and p.revocata_il is null
  );
$$;

comment on function public.radiscan_prova_attiva(uuid) is
  'RadiciScan M1a — una prova revocata non è attiva e non concorre alla valutazione.';

create or replace function public.radiscan_sessioni_scadute(p_oltre interval default '2 hours')
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select s.id
    from public.radiscan_sessioni s
   where s.stato = 'aperta'
     and s.ultima_attivita_il < now() - p_oltre;
$$;

comment on function public.radiscan_sessioni_scadute(interval) is
  'RadiciScan M1a — sessioni abbandonate candidate alla chiusura applicativa. Nessuna cancellazione.';

create or replace function public.radiscan_estratto_coerente(p_documento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.radiscan_documenti_estratti e
      join public.radiscan_documenti_disciplinari d on d.id = e.documento_id
      join public.radiscan_denominazioni n on n.id = d.denominazione_id
     where e.documento_id = p_documento_id
       and public.estratto_contiene_denominazione(e.estratto, n.chiave)
  );
$$;

comment on function public.radiscan_estratto_coerente(uuid) is
  'RadiciScan M1a — esiste almeno un estratto del documento che contiene la denominazione canonica.';

-- ───────────────────────────────────────────────────────────────────────
-- 4. Gli 8 indici/vincoli indicizzati (7 UNIQUE + 1 btree)
-- ───────────────────────────────────────────────────────────────────────

create unique index if not exists radiscan_operatori_utente_uidx
  on public.radiscan_operatori (utente_id);

create unique index if not exists radiscan_motori_codice_uidx
  on public.radiscan_motori (codice);

create unique index if not exists radiscan_denominazioni_chiave_uidx
  on public.radiscan_denominazioni (chiave);

create unique index if not exists radiscan_alias_chiave_uidx
  on public.radiscan_alias (chiave_alias);

-- D3: un solo documento vigente per denominazione canonica.
create unique index if not exists radiscan_documenti_vigente_uidx
  on public.radiscan_documenti_disciplinari (denominazione_id)
  where stato_vigenza = 'vigente';

-- Una sola prova attiva per tipo in una sessione; la revoca libera lo slot.
create unique index if not exists radiscan_prove_attiva_uidx
  on public.radiscan_prove (sessione_id, tipo)
  where revocata_il is null;

create unique index if not exists radiscan_sessioni_token_uidx
  on public.radiscan_sessioni (token);

create index if not exists radiscan_esiti_sessione_idx
  on public.radiscan_esiti_verifica (sessione_id, calcolato_il desc);

-- ───────────────────────────────────────────────────────────────────────
-- 5. UNICA ALTER TABLE (A1) — solo public.radiscan_analisi
-- ───────────────────────────────────────────────────────────────────────
-- Colonne additive e nullabili: nessuna riga preesistente viene riscritta.
-- Le righe legacy restano con NULL in tutte e quattro: significano
-- "analisi precedente a M1a, nessun motore documentale".
-- radiscan_cache NON compare in questa migration.
alter table public.radiscan_analisi
  add column if not exists motore_verifica text,
  add column if not exists versione_prompt text,
  add column if not exists sessione_id uuid,
  add column if not exists documento_id uuid,
  add constraint radiscan_analisi_motore_formato
    check (motore_verifica is null or length(btrim(motore_verifica)) between 1 and 64),
  add constraint radiscan_analisi_versione_prompt_formato
    check (versione_prompt is null or length(btrim(versione_prompt)) between 1 and 64),
  add constraint radiscan_analisi_sessione_coerente
    check (sessione_id is null or motore_verifica is not null),
  add constraint radiscan_analisi_sessione_fk
    foreign key (sessione_id) references public.radiscan_sessioni (id) on delete restrict,
  add constraint radiscan_analisi_documento_fk
    foreign key (documento_id) references public.radiscan_documenti_disciplinari (id) on delete restrict;

comment on column public.radiscan_analisi.motore_verifica is
  'RadiciScan M1a — codice del motore documentale (radiscan_motori.codice). Nessuna FK: coerenza garantita dal backend (A4).';

comment on column public.radiscan_analisi.versione_prompt is
  'RadiciScan M1a — versione del prompt del motore al momento dell''analisi. Provider e modello AI restano provider/modello.';

-- ───────────────────────────────────────────────────────────────────────
-- 6. La vista (1) — stato effettivo calcolato, mai memorizzato
-- ───────────────────────────────────────────────────────────────────────
create or replace view public.radiscan_alias_stato
with (security_invoker = true)
as
select
  a.denominazione_id,
  n.chiave,
  n.nome_ufficiale,
  a.alias,
  a.chiave_alias,
  coalesce(d.stato_vigenza, 'registrato') as stato_vigenza,
  case
    when d.id is null then 'registrato'
    when d.stato_vigenza = 'vigente' and d.valido_dal > current_date then 'vigente_futuro'
    when d.stato_vigenza = 'vigente'
         and d.valido_al is not null
         and d.valido_al < current_date then 'vigente_scaduto'
    when d.stato_vigenza = 'vigente' then 'vigente_utilizzabile'
    else d.stato_vigenza
  end as stato_effettivo,
  d.id as documento_vigente_id,
  d.valido_dal,
  d.valido_al
from public.radiscan_alias a
join public.radiscan_denominazioni n on n.id = a.denominazione_id
left join public.radiscan_documenti_disciplinari d
  on d.denominazione_id = a.denominazione_id
 and d.stato_vigenza = 'vigente';

comment on view public.radiscan_alias_stato is
  'RadiciScan M1a — alias con stato amministrativo e stato effettivo calcolato su current_date. La scadenza non modifica il database.';

-- ───────────────────────────────────────────────────────────────────────
-- 7. Le 15 funzioni trigger
-- ───────────────────────────────────────────────────────────────────────

create or replace function public.radiscan_operatori_normalizza()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.ruolo := lower(btrim(new.ruolo));
  new.aggiornato_il := now();
  return new;
end;
$$;

create or replace function public.radiscan_motori_normalizza()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.codice := lower(btrim(new.codice));
  new.aggiornato_il := now();
  return new;
end;
$$;

create or replace function public.radiscan_denominazioni_chiave()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- La chiave è sempre calcolata: un valore fornito dal chiamante è ignorato.
  new.nome_ufficiale := btrim(new.nome_ufficiale);
  new.chiave := public.radiscan_normalizza_chiave(new.nome_ufficiale);

  if not public.radiscan_chiave_valida(new.chiave) then
    raise exception 'Denominazione non valida: chiave "%" inutilizzabile',
      coalesce(new.chiave, '<nulla>')
      using errcode = '23514';
  end if;

  new.aggiornato_il := now();
  return new;
end;
$$;

create or replace function public.radiscan_alias_chiave()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.alias := btrim(new.alias);
  new.chiave_alias := public.radiscan_normalizza_chiave(new.alias);

  if not public.radiscan_chiave_valida(new.chiave_alias) then
    raise exception 'Alias non valido: chiave "%" inutilizzabile',
      coalesce(new.chiave_alias, '<nulla>')
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.radiscan_denominazioni d
     where d.id = new.denominazione_id
       and d.chiave = new.chiave_alias
  ) then
    raise exception 'Alias identico alla chiave canonica della stessa denominazione'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.radiscan_documenti_valida()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.titolo := btrim(new.titolo);
  new.atto_numero := btrim(new.atto_numero);
  new.atto_riferimento := btrim(new.atto_riferimento);
  new.aggiornato_il := now();

  if tg_op = 'INSERT' then
    -- Nessun documento nasce vigente: la vigenza passa sempre da un UPDATE
    -- con evento, altrimenti il gate del trigger di transizione sarebbe
    -- aggirabile inserendo direttamente lo stato finale.
    if new.stato_vigenza is distinct from 'registrato' then
      raise exception 'Un documento può essere inserito solo come registrato (richiesto: %)',
        new.stato_vigenza
        using errcode = '23514';
    end if;
    new.valido_dal := null;
    new.valido_al := null;
    new.superato_da_id := null;
  else
    -- D-01: il divieto colpisce ogni NUOVA dichiarazione di vigenza con
    -- validità già scaduta, anche quando valido_al non cambia nell'UPDATE:
    -- è il caso della promozione da "registrato" con date impostate prima.
    -- Non colpisce invece gli aggiornamenti amministrativi di un documento
    -- già vigente la cui scadenza naturale è solo trascorsa: in quel caso lo
    -- stato non cambia e la vista calcola "vigente_scaduto".
    if new.stato_vigenza = 'vigente'
       and new.valido_al is not null
       and new.valido_al < current_date
       and (new.stato_vigenza is distinct from old.stato_vigenza
            or new.valido_al is distinct from old.valido_al) then
      raise exception 'Un documento non può essere dichiarato vigente con validità già scaduta (%)',
        new.valido_al
        using errcode = '23514';
    end if;

    -- R-01: le date di un documento già vigente sono immutabili. La finestra
    -- si imposta solo prima della dichiarazione (registrato/non_verificabile)
    -- e la promozione la rivalida qui sopra. Senza questo blocco un UPDATE
    -- diretto potrebbe spostare valido_al nel futuro e riaprire una finestra
    -- scaduta senza evento, operatore o richiesta_id: nel modello attuale non
    -- esiste un evento di modifica delle date, quindi l'unica via tracciata
    -- resta la dichiarazione di un nuovo atto. Il controllo sta nel trigger e
    -- non nella RPC perché vale anche per gli UPDATE diretti di service_role.
    if old.stato_vigenza = 'vigente'
       and (new.valido_dal is distinct from old.valido_dal
            or new.valido_al is distinct from old.valido_al) then
      raise exception 'Le date di validità di un documento vigente sono immutabili'
        using errcode = '42501';
    end if;
  end if;

  if new.stato_vigenza = 'vigente' and new.valido_dal is null then
    raise exception 'Lo stato vigente richiede valido_dal'
      using errcode = '23514';
  end if;

  if new.stato_vigenza = 'superato' and new.superato_da_id is null then
    raise exception 'Lo stato superato richiede superato_da_id'
      using errcode = '23514';
  end if;

  if new.valido_al is not null and new.valido_dal is not null and new.valido_al < new.valido_dal then
    raise exception 'Intervallo di validità invertito: % < %', new.valido_al, new.valido_dal
      using errcode = '23514';
  end if;

  -- D-03: il controllo di promuovibilità del successore serve solo quando il
  -- riferimento viene impostato o modificato. Rieseguirlo a ogni UPDATE
  -- renderebbe non aggiornabile un documento superato dopo che anche il suo
  -- successore è stato superato. L'immutabilità del riferimento e la
  -- terminalità di "superato" restano garantite dal trigger di transizione.
  if new.superato_da_id is not null
     and (tg_op = 'INSERT'
          or new.superato_da_id is distinct from old.superato_da_id) then
    if not exists (
      select 1
        from public.radiscan_documenti_disciplinari s
       where s.id = new.superato_da_id
         and s.denominazione_id = new.denominazione_id
         and s.stato_vigenza <> 'superato'
    ) then
      raise exception 'Successore inesistente, di altra denominazione o già superato'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.radiscan_documenti_transizione()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'I documenti disciplinari non possono essere cancellati'
      using errcode = '42501';
  end if;

  -- D-04: normalizzazione prima del confronto. Questo trigger è eseguito
  -- PRIMA di radiscan_documenti_valida (ordine alfabetico dei BEFORE ROW),
  -- quindi senza questo btrim un titolo identico con spazi ai bordi verrebbe
  -- letto come modifica dei campi immutabili. La normalizzazione è
  -- idempotente: radiscan_documenti_valida applica lo stesso btrim subito
  -- dopo, sui medesimi campi.
  new.titolo := btrim(new.titolo);
  new.atto_numero := btrim(new.atto_numero);
  new.atto_riferimento := btrim(new.atto_riferimento);

  -- Immutabilità dell'atto: nessuna riscrittura retroattiva.
  if new.denominazione_id is distinct from old.denominazione_id
     or new.fonte_id is distinct from old.fonte_id
     or new.titolo is distinct from old.titolo
     or new.atto_tipo is distinct from old.atto_tipo
     or new.atto_numero is distinct from old.atto_numero
     or new.atto_data is distinct from old.atto_data
     or new.atto_riferimento is distinct from old.atto_riferimento
     or new.registrato_da is distinct from old.registrato_da then
    raise exception 'I campi dell''atto sono immutabili dopo la registrazione'
      using errcode = '42501';
  end if;

  if old.superato_da_id is not null
     and new.superato_da_id is distinct from old.superato_da_id then
    raise exception 'superato_da_id è immutabile una volta impostato'
      using errcode = '42501';
  end if;

  if new.stato_vigenza is distinct from old.stato_vigenza then
    if not (
         (old.stato_vigenza = 'registrato'
          and new.stato_vigenza in ('vigente', 'non_verificabile'))
      or (old.stato_vigenza = 'non_verificabile'
          and new.stato_vigenza = 'vigente')
      or (old.stato_vigenza = 'vigente'
          and new.stato_vigenza in ('superato', 'non_verificabile'))
    ) then
      raise exception 'Transizione di vigenza non ammessa: % -> %',
        old.stato_vigenza, new.stato_vigenza
        using errcode = '23514';
    end if;

    -- Nessuna transizione senza evento: l'evento deve appartenere a questa
    -- stessa transazione (now() è il timestamp di inizio transazione).
    if not exists (
      select 1
        from public.radiscan_documenti_vigenza_eventi e
       where e.documento_id = new.id
         and e.stato_precedente = old.stato_vigenza
         and e.stato_nuovo = new.stato_vigenza
         and e.creato_il >= now()
    ) then
      raise exception 'Transizione % -> % priva dell''evento di vigenza',
        old.stato_vigenza, new.stato_vigenza
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.radiscan_eventi_append_only()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_corrente text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Il registro degli eventi di vigenza è append-only'
      using errcode = '42501';
  end if;

  new.atto_riferimento := btrim(new.atto_riferimento);
  new.richiesta_id := btrim(new.richiesta_id);

  if not public.radiscan_richiesta_valida(new.richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;

  select d.stato_vigenza
    into v_corrente
    from public.radiscan_documenti_disciplinari d
   where d.id = new.documento_id;

  if v_corrente is null then
    raise exception 'Documento % inesistente', new.documento_id using errcode = '23503';
  end if;

  -- Lo stato di partenza dichiarato deve corrispondere alla realtà: un
  -- evento non può raccontare una transizione diversa da quella corrente.
  if new.stato_precedente is distinct from v_corrente then
    raise exception 'stato_precedente "%" diverso dallo stato corrente "%"',
      coalesce(new.stato_precedente, '<null>'), v_corrente
      using errcode = '23514';
  end if;

  new.creato_il := now();
  return new;
end;
$$;

create or replace function public.radiscan_estratti_valida()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Gli estratti documentali sono append-only'
      using errcode = '42501';
  end if;

  new.estratto := btrim(new.estratto);
  new.impronta_estratto := lower(btrim(new.impronta_estratto));
  new.creato_il := coalesce(new.creato_il, now());

  if length(new.estratto) < 20 then
    raise exception 'Estratto troppo corto: minimo 20 caratteri'
      using errcode = '23514';
  end if;

  if new.impronta_estratto !~ '^[0-9a-f]{16}$' then
    raise exception 'Impronta dell''estratto non valida'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.radiscan_sessioni_token()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Il token è sempre rigenerato dal database: un valore fornito dal
  -- chiamante viene scartato (B1).
  new.token := replace(gen_random_uuid()::text, '-', '');
  new.aperta_il := coalesce(new.aperta_il, now());
  new.ultima_attivita_il := coalesce(new.ultima_attivita_il, now());

  if new.token !~ '^[0-9a-f]{32}$' then
    raise exception 'Token di sessione non valido' using errcode = '23514';
  end if;

  if new.stato <> 'aperta' then
    new.chiusa_il := coalesce(new.chiusa_il, now());
  end if;

  return new;
end;
$$;

create or replace function public.radiscan_sessioni_chiusura()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.token := old.token;
  new.aperta_il := old.aperta_il;

  if old.stato <> 'aperta' and new.stato is distinct from old.stato then
    raise exception 'Una sessione conclusa non può essere riaperta o riclassificata'
      using errcode = '23514';
  end if;

  if new.stato is distinct from old.stato
     and new.stato in ('chiusa', 'abbandonata') then
    new.chiusa_il := now();
  end if;

  if old.chiusa_il is not null and new.chiusa_il is distinct from old.chiusa_il then
    raise exception 'chiusa_il è immutabile una volta impostato'
      using errcode = '42501';
  end if;

  new.ultima_attivita_il := greatest(new.ultima_attivita_il, old.ultima_attivita_il);
  return new;
end;
$$;

create or replace function public.radiscan_prove_valida()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.impronta_immagine is not null then
    new.impronta_immagine := lower(btrim(new.impronta_immagine));
    if new.impronta_immagine !~ '^[0-9a-f]{16}$' then
      raise exception 'Impronta della prova non valida' using errcode = '23514';
    end if;
  end if;

  if new.revocata_il is not null and new.revocata_il > now() then
    raise exception 'Una prova non può essere revocata nel futuro'
      using errcode = '23514';
  end if;

  if (new.revocata_il is null) <> (new.revocata_da is null) then
    raise exception 'Revoca incoerente: data e operatore devono essere entrambi presenti o assenti'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.radiscan_prove_immutabile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Le prove non possono essere cancellate: si revocano'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.sessione_id is distinct from old.sessione_id
     or new.tipo is distinct from old.tipo
     or new.impronta_immagine is distinct from old.impronta_immagine
     or new.esito is distinct from old.esito
     or new.creato_il is distinct from old.creato_il then
    raise exception 'La prova è immutabile: è ammessa solo la revoca'
      using errcode = '42501';
  end if;

  if old.revocata_il is not null
     and (new.revocata_il is distinct from old.revocata_il
          or new.revocata_da is distinct from old.revocata_da) then
    raise exception 'Una prova revocata non può essere modificata'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.radiscan_sessione_documenti_valida()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_stato text;
begin
  if tg_op = 'UPDATE'
     and (new.sessione_id is distinct from old.sessione_id
          or new.documento_id is distinct from old.documento_id) then
    raise exception 'L''associazione sessione/documento è immutabile'
      using errcode = '42501';
  end if;

  -- D-05: il lock sulla riga della sessione è acquisito qui, nel trigger, e
  -- non soltanto nella RPC, perché la tabella è raggiungibile anche con
  -- INSERT diretti da service_role (ACL: select, insert). Il FOR UPDATE resta
  -- attivo fino al termine della transazione: serializza questa associazione
  -- con radiscan_chiudi_sessione e con ogni altra associazione della stessa
  -- sessione, che usano lo stesso unico ordine di lock (prima la sessione).
  select s.stato into v_stato
    from public.radiscan_sessioni s
   where s.id = new.sessione_id
     for update;

  if v_stato is null then
    raise exception 'Sessione % inesistente', new.sessione_id using errcode = '23503';
  end if;

  if v_stato <> 'aperta' then
    raise exception 'La sessione è % e non accetta associazioni', v_stato
      using errcode = '23514';
  end if;

  -- D-02: un solo documento principale per sessione, senza nono indice e
  -- senza modifiche di struttura. Due inserimenti concorrenti sulla stessa
  -- sessione si serializzano sul lock qui sopra: il secondo, sbloccato dal
  -- commit del primo, rilegge la tabella con un nuovo snapshot e trova la
  -- riga principale già committata, quindi viene rifiutato.
  if new.ruolo = 'principale'
     and exists (
       select 1
         from public.radiscan_sessione_documenti sd
        where sd.sessione_id = new.sessione_id
          and sd.ruolo = 'principale'
          and sd.documento_id <> new.documento_id
     ) then
    raise exception 'La sessione % ha già un documento principale', new.sessione_id
      using errcode = '23514';
  end if;

  new.creato_il := coalesce(new.creato_il, now());
  return new;
end;
$$;

comment on function public.radiscan_sessione_documenti_valida() is
  'RadiciScan M1a — associazione sessione/documento: lock sulla riga della sessione (D-05) e un solo documento principale per sessione (D-02). La funzione è dichiarata VOLATILE per necessità: il controllo D-02 deve vedere le righe già elaborate nello stesso comando esterno (PostgreSQL, Visibility of Data Changes). Con STABLE o IMMUTABLE la query userebbe lo snapshot di inizio comando e un INSERT multiplo potrebbe inserire due documenti principali. Non trasformarla in STABLE o IMMUTABLE.';

create or replace function public.radiscan_esiti_verifica_valida()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Gli esiti di verifica sono append-only'
      using errcode = '42501';
  end if;

  -- D4/D7: barriera esplicita, oltre al CHECK sul dominio del livello.
  if new.livello = 'verificato' then
    raise exception 'Il livello verificato non è disponibile in M1a'
      using errcode = '23514';
  end if;

  new.motivo := btrim(new.motivo);

  if not public.radiscan_richiesta_valida(new.richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;

  if not public.radiscan_motore_attivo(new.motore_id) then
    raise exception 'Motore non attivo: nessun esito registrabile'
      using errcode = '42501';
  end if;

  if new.documento_id is not null
     and not exists (
       select 1
         from public.radiscan_sessione_documenti sd
        where sd.sessione_id = new.sessione_id
          and sd.documento_id = new.documento_id
     ) then
    raise exception 'Il documento non è associato alla sessione'
      using errcode = '23514';
  end if;

  new.calcolato_il := now();
  return new;
end;
$$;

create or replace function public.radiscan_pulizie_valida()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Il registro delle pulizie è append-only'
      using errcode = '42501';
  end if;

  if new.modalita = 'cron' and new.operatore_id is not null then
    raise exception 'Una pulizia cron non ha operatore'
      using errcode = '23514';
  end if;

  if new.modalita <> 'cron' and new.operatore_id is null then
    raise exception 'Una pulizia % richiede un operatore', new.modalita
      using errcode = '23514';
  end if;

  if not public.radiscan_richiesta_valida(new.richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;

  new.eseguita_il := coalesce(new.eseguita_il, now());
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- 8. I 15 trigger
-- ATTENZIONE: l'ordine di esecuzione dei BEFORE ROW sullo stesso evento è
-- alfabetico per nome, non di creazione. Non rinominare i trigger.
-- ───────────────────────────────────────────────────────────────────────

create or replace trigger radiscan_operatori_normalizza
  before insert or update on public.radiscan_operatori
  for each row execute function public.radiscan_operatori_normalizza();

create or replace trigger radiscan_motori_normalizza
  before insert or update on public.radiscan_motori
  for each row execute function public.radiscan_motori_normalizza();

create or replace trigger radiscan_denominazioni_chiave
  before insert or update on public.radiscan_denominazioni
  for each row execute function public.radiscan_denominazioni_chiave();

create or replace trigger radiscan_alias_chiave
  before insert or update on public.radiscan_alias
  for each row execute function public.radiscan_alias_chiave();

-- Coesistono due BEFORE ROW su questa tabella:
--   radiscan_documenti_transizione (t) eseguito PRIMA
--   radiscan_documenti_valida      (v) eseguito DOPO
create or replace trigger radiscan_documenti_valida
  before insert or update on public.radiscan_documenti_disciplinari
  for each row execute function public.radiscan_documenti_valida();

create or replace trigger radiscan_documenti_transizione
  before update or delete on public.radiscan_documenti_disciplinari
  for each row execute function public.radiscan_documenti_transizione();

create or replace trigger radiscan_eventi_append_only
  before insert or update or delete on public.radiscan_documenti_vigenza_eventi
  for each row execute function public.radiscan_eventi_append_only();

create or replace trigger radiscan_estratti_valida
  before insert or update or delete on public.radiscan_documenti_estratti
  for each row execute function public.radiscan_estratti_valida();

-- Coesistono due BEFORE ROW su questa tabella:
--   radiscan_sessioni_chiusura (c) eseguito PRIMA
--   radiscan_sessioni_token    (t) eseguito DOPO
create or replace trigger radiscan_sessioni_token
  before insert on public.radiscan_sessioni
  for each row execute function public.radiscan_sessioni_token();

create or replace trigger radiscan_sessioni_chiusura
  before update on public.radiscan_sessioni
  for each row execute function public.radiscan_sessioni_chiusura();

-- Coesistono due BEFORE ROW su questa tabella:
--   radiscan_prove_immutabile (i) eseguito PRIMA
--   radiscan_prove_valida     (v) eseguito DOPO
create or replace trigger radiscan_prove_valida
  before insert or update on public.radiscan_prove
  for each row execute function public.radiscan_prove_valida();

create or replace trigger radiscan_prove_immutabile
  before insert or update or delete on public.radiscan_prove
  for each row execute function public.radiscan_prove_immutabile();

create or replace trigger radiscan_sessione_documenti_valida
  before insert or update on public.radiscan_sessione_documenti
  for each row execute function public.radiscan_sessione_documenti_valida();

create or replace trigger radiscan_esiti_verifica_valida
  before insert or update or delete on public.radiscan_esiti_verifica
  for each row execute function public.radiscan_esiti_verifica_valida();

create or replace trigger radiscan_pulizie_valida
  before insert or update or delete on public.radiscan_pulizie_sessioni
  for each row execute function public.radiscan_pulizie_valida();

-- ───────────────────────────────────────────────────────────────────────
-- 9. Le 13 RPC
-- ───────────────────────────────────────────────────────────────────────
-- Tutte ricevono p_operatore_id (validato qui, non dal browser) e
-- p_richiesta_id. Tutte scrivono una riga in radiscan_registro_chiamate
-- prima del RETURN: la riga è committata solo se la transazione lo è (A3).

create or replace function public.radiscan_apri_sessione(
  p_operatore_id uuid,
  p_motore_id uuid,
  p_richiesta_id text
)
returns table (sessione_id uuid, token text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_token text;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;
  if not public.radiscan_motore_attivo(p_motore_id) then
    raise exception 'Motore inesistente o non attivo' using errcode = '42501';
  end if;

  insert into public.radiscan_sessioni (motore_id, operatore_id)
  values (p_motore_id, p_operatore_id)
  returning radiscan_sessioni.id, radiscan_sessioni.token into v_id, v_token;

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_apri_sessione', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return query select v_id, v_token;
end;
$$;

create or replace function public.radiscan_chiudi_sessione(
  p_operatore_id uuid,
  p_sessione_id uuid,
  p_richiesta_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_stato text;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;

  select s.stato into v_stato
    from public.radiscan_sessioni s
   where s.id = p_sessione_id
     for update;

  if v_stato is null then
    raise exception 'Sessione % inesistente', p_sessione_id using errcode = '23503';
  end if;
  if v_stato <> 'aperta' then
    raise exception 'La sessione è già %', v_stato using errcode = '23514';
  end if;

  update public.radiscan_sessioni
     set stato = 'chiusa', chiusa_il = now(), ultima_attivita_il = now()
   where id = p_sessione_id;

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_chiudi_sessione', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return true;
end;
$$;

create or replace function public.radiscan_registra_prova(
  p_operatore_id uuid,
  p_sessione_id uuid,
  p_tipo text,
  p_impronta text,
  p_esito jsonb,
  p_richiesta_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_stato text;
  v_id uuid;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;

  select s.stato into v_stato
    from public.radiscan_sessioni s
   where s.id = p_sessione_id
     for update;

  if v_stato is null then
    raise exception 'Sessione % inesistente', p_sessione_id using errcode = '23503';
  end if;
  if v_stato <> 'aperta' then
    raise exception 'La sessione è % e non accetta prove', v_stato
      using errcode = '23514';
  end if;

  insert into public.radiscan_prove
    (sessione_id, tipo, impronta_immagine, esito)
  values
    (p_sessione_id, lower(btrim(p_tipo)), nullif(btrim(p_impronta), ''), coalesce(p_esito, '{}'::jsonb))
  returning id into v_id;

  update public.radiscan_sessioni
     set ultima_attivita_il = now()
   where id = p_sessione_id;

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_registra_prova', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return v_id;
end;
$$;

create or replace function public.radiscan_revoca_prova(
  p_operatore_id uuid,
  p_prova_id uuid,
  p_motivo text,
  p_richiesta_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sessione uuid;
  v_revocata timestamptz;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'Motivo della revoca mancante' using errcode = '22023';
  end if;

  select p.sessione_id, p.revocata_il into v_sessione, v_revocata
    from public.radiscan_prove p
   where p.id = p_prova_id
     for update;

  if v_sessione is null then
    raise exception 'Prova % inesistente', p_prova_id using errcode = '23503';
  end if;
  if v_revocata is not null then
    raise exception 'La prova è già revocata' using errcode = '23514';
  end if;

  update public.radiscan_prove
     set revocata_il = now(), revocata_da = p_operatore_id
   where id = p_prova_id;

  update public.radiscan_sessioni
     set ultima_attivita_il = now()
   where id = v_sessione;

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_revoca_prova', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return true;
end;
$$;

create or replace function public.radiscan_associa_documento(
  p_operatore_id uuid,
  p_sessione_id uuid,
  p_documento_id uuid,
  p_ruolo text,
  p_richiesta_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_stato text;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;

  -- D-05: lock esplicito sulla sessione, con lo stesso ordine usato da
  -- radiscan_chiudi_sessione e radiscan_registra_prova. Il trigger
  -- radiscan_sessione_documenti_valida ripete il controllo di stato e la
  -- regola D-02 per gli ingressi diretti; qui il lock serve a dare l'errore
  -- preciso e a non lasciare che una chiusura concorrente renda valida
  -- l'associazione.
  select s.stato into v_stato
    from public.radiscan_sessioni s
   where s.id = p_sessione_id
     for update;

  if v_stato is null then
    raise exception 'Sessione % inesistente', p_sessione_id using errcode = '23503';
  end if;
  if v_stato <> 'aperta' then
    raise exception 'La sessione è % e non accetta associazioni', v_stato
      using errcode = '23514';
  end if;

  insert into public.radiscan_sessione_documenti (sessione_id, documento_id, ruolo)
  values (p_sessione_id, p_documento_id, lower(btrim(coalesce(p_ruolo, 'principale'))));

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_associa_documento', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return true;
end;
$$;

create or replace function public.radiscan_registra_documento(
  p_operatore_id uuid,
  p_denominazione_id uuid,
  p_fonte_id uuid,
  p_titolo text,
  p_atto_tipo text,
  p_atto_numero text,
  p_atto_data date,
  p_atto_riferimento text,
  p_richiesta_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;
  if p_atto_data is null or p_atto_data > current_date then
    raise exception 'La data dell''atto deve essere presente e non futura'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.radiscan_denominazioni d where d.id = p_denominazione_id
  ) then
    raise exception 'Denominazione % inesistente', p_denominazione_id using errcode = '23503';
  end if;
  if not exists (
    select 1 from public.radiscan_fonti f where f.id = p_fonte_id and f.attiva
  ) then
    raise exception 'Fonte % inesistente o non attiva', p_fonte_id using errcode = '23503';
  end if;

  insert into public.radiscan_documenti_disciplinari
    (denominazione_id, fonte_id, titolo, atto_tipo, atto_numero, atto_data,
     atto_riferimento, registrato_da)
  values
    (p_denominazione_id, p_fonte_id, btrim(p_titolo), lower(btrim(p_atto_tipo)),
     btrim(p_atto_numero), p_atto_data, btrim(p_atto_riferimento), p_operatore_id)
  returning id into v_id;

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_registra_documento', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return v_id;
end;
$$;

create or replace function public.radiscan_dichiara_vigenza(
  p_operatore_id uuid,
  p_documento_id uuid,
  p_valido_dal date,
  p_valido_al date,
  p_atto_riferimento text,
  p_richiesta_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_denominazione uuid;
  v_chiave text;
  v_stato text;
  v_vigente uuid;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;
  if p_valido_dal is null then
    raise exception 'valido_dal è obbligatorio per dichiarare la vigenza'
      using errcode = '22023';
  end if;
  if p_valido_al is not null and p_valido_al < p_valido_dal then
    raise exception 'Intervallo di validità invertito' using errcode = '22023';
  end if;
  if p_atto_riferimento is null or length(btrim(p_atto_riferimento)) < 4 then
    raise exception 'Riferimento all''atto mancante: la data di registrazione non dimostra la vigenza'
      using errcode = '22023';
  end if;

  select d.denominazione_id into v_denominazione
    from public.radiscan_documenti_disciplinari d
   where d.id = p_documento_id;

  if v_denominazione is null then
    raise exception 'Documento % inesistente', p_documento_id using errcode = '23503';
  end if;

  select n.chiave into v_chiave
    from public.radiscan_denominazioni n
   where n.id = v_denominazione;

  -- Serializza le dichiarazioni sulla stessa denominazione: l'indice unico
  -- parziale non basta, l'ordine delle operazioni va protetto.
  perform pg_advisory_xact_lock(
    hashtextextended('radiscan:den:' || coalesce(v_chiave, ''), 0)
  );

  select d.stato_vigenza into v_stato
    from public.radiscan_documenti_disciplinari d
   where d.id = p_documento_id
     for update;

  if v_stato not in ('registrato', 'non_verificabile') then
    raise exception 'Un documento in stato % non può essere dichiarato vigente', v_stato
      using errcode = '23514';
  end if;

  -- Le date si impostano mentre il documento è ancora registrato: la
  -- promozione a vigente avviene solo dopo l'evento, e il trigger esige
  -- che valido_dal sia già presente.
  update public.radiscan_documenti_disciplinari
     set valido_dal = p_valido_dal,
         valido_al = p_valido_al,
         aggiornato_il = now()
   where id = p_documento_id;

  select public.radiscan_documento_vigente(v_denominazione) into v_vigente;

  if v_vigente is not null and v_vigente <> p_documento_id then
    perform public.radiscan_supera_documento(
      p_operatore_id, v_vigente, p_documento_id, p_richiesta_id
    );
  else
    insert into public.radiscan_documenti_vigenza_eventi
      (documento_id, stato_precedente, stato_nuovo, operatore_id,
       atto_riferimento, motivazione, richiesta_id, auth_uid, ruolo_db)
    values
      (p_documento_id, v_stato, 'vigente', p_operatore_id,
       btrim(p_atto_riferimento), 'Dichiarazione di vigenza', btrim(p_richiesta_id),
       null, session_user::text);

    update public.radiscan_documenti_disciplinari
       set stato_vigenza = 'vigente', aggiornato_il = now()
     where id = p_documento_id;

  end if;

  -- La riga di registro di questa RPC si scrive in entrambi i percorsi.
  -- Se il ramo ha delegato a radiscan_supera_documento, il registro
  -- contiene due righe nella stessa transazione (funzione distinta, stesso
  -- richiesta_id): è la traccia reale delle due funzioni eseguite.
  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_dichiara_vigenza', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return p_documento_id;
end;
$$;

create or replace function public.radiscan_supera_documento(
  p_operatore_id uuid,
  p_documento_id uuid,
  p_superato_da_id uuid,
  p_richiesta_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_denominazione uuid;
  v_chiave text;
  v_stato_vecchio text;
  v_stato_nuovo text;
  v_atto text;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;
  if p_documento_id is null or p_superato_da_id is null then
    raise exception 'Documento e successore sono obbligatori' using errcode = '22023';
  end if;
  if p_documento_id = p_superato_da_id then
    raise exception 'Un documento non può superare se stesso' using errcode = '23514';
  end if;

  select d.denominazione_id into v_denominazione
    from public.radiscan_documenti_disciplinari d
   where d.id = p_documento_id;

  if v_denominazione is null then
    raise exception 'Documento % inesistente', p_documento_id using errcode = '23503';
  end if;

  select n.chiave into v_chiave
    from public.radiscan_denominazioni n
   where n.id = v_denominazione;

  perform pg_advisory_xact_lock(
    hashtextextended('radiscan:den:' || coalesce(v_chiave, ''), 0)
  );

  select d.stato_vigenza into v_stato_vecchio
    from public.radiscan_documenti_disciplinari d
   where d.id = p_documento_id
     for update;

  if v_stato_vecchio is distinct from 'vigente' then
    raise exception 'Solo il documento vigente può essere superato (stato attuale: %)',
      coalesce(v_stato_vecchio, 'inesistente')
      using errcode = '23514';
  end if;

  -- Il successore deve appartenere alla stessa denominazione: il filtro è
  -- nel WHERE, quindi un documento di altra denominazione non viene letto.
  select d.stato_vigenza, d.atto_riferimento into v_stato_nuovo, v_atto
    from public.radiscan_documenti_disciplinari d
   where d.id = p_superato_da_id
     and d.denominazione_id = v_denominazione
     for update;

  if v_stato_nuovo is null then
    raise exception 'Successore inesistente o appartenente a un''altra denominazione'
      using errcode = '23514';
  end if;

  if v_stato_nuovo not in ('registrato', 'non_verificabile') then
    raise exception 'Il successore è in stato % e non può essere promosso', v_stato_nuovo
      using errcode = '23514';
  end if;

  if not exists (
    select 1
      from public.radiscan_documenti_disciplinari d
     where d.id = p_superato_da_id
       and d.valido_dal is not null
  ) then
    raise exception 'Il successore deve avere valido_dal prima della promozione'
      using errcode = '23514';
  end if;

  -- 1. evento del documento superato (lo stato corrente è ancora vigente).
  insert into public.radiscan_documenti_vigenza_eventi
    (documento_id, stato_precedente, stato_nuovo, operatore_id,
     atto_riferimento, motivazione, richiesta_id, auth_uid, ruolo_db)
  values
    (p_documento_id, 'vigente', 'superato', p_operatore_id,
     v_atto, 'Superamento da atto successivo', btrim(p_richiesta_id),
     null, session_user::text);

  -- 2. il precedente diventa superato: nel frattempo non esiste alcun
  --    documento vigente, quindi l'indice parziale non viene violato.
  update public.radiscan_documenti_disciplinari
     set stato_vigenza = 'superato',
         superato_da_id = p_superato_da_id,
         aggiornato_il = now()
   where id = p_documento_id;

  -- 3. evento del successore (il suo stato corrente è ancora quello letto).
  insert into public.radiscan_documenti_vigenza_eventi
    (documento_id, stato_precedente, stato_nuovo, operatore_id,
     atto_riferimento, motivazione, richiesta_id, auth_uid, ruolo_db)
  values
    (p_superato_da_id, v_stato_nuovo, 'vigente', p_operatore_id,
     v_atto, 'Promozione a vigente', btrim(p_richiesta_id),
     null, session_user::text);

  -- 4. il successore diventa l'unico vigente della denominazione.
  update public.radiscan_documenti_disciplinari
     set stato_vigenza = 'vigente',
         aggiornato_il = now()
   where id = p_superato_da_id;

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_supera_documento', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return true;
end;
$$;

create or replace function public.radiscan_registra_estratto(
  p_operatore_id uuid,
  p_documento_id uuid,
  p_estratto text,
  p_richiesta_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;
  if p_estratto is null or length(btrim(p_estratto)) < 20 then
    raise exception 'Estratto troppo corto: minimo 20 caratteri' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.radiscan_documenti_disciplinari d where d.id = p_documento_id
  ) then
    raise exception 'Documento % inesistente', p_documento_id using errcode = '23503';
  end if;

  insert into public.radiscan_documenti_estratti
    (documento_id, estratto, impronta_estratto, registrato_da)
  values
    (p_documento_id, btrim(p_estratto), substr(md5(btrim(p_estratto)), 1, 16), p_operatore_id)
  returning id into v_id;

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_registra_estratto', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return v_id;
end;
$$;

create or replace function public.radiscan_normalizza_denominazione(
  p_operatore_id uuid,
  p_nome text,
  p_schema text,
  p_territorio text,
  p_richiesta_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_chiave text;
  v_id uuid;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;

  v_chiave := public.radiscan_normalizza_chiave(p_nome);
  if not public.radiscan_chiave_valida(v_chiave) then
    raise exception 'Denominazione non valida: chiave "%" inutilizzabile',
      coalesce(v_chiave, '<nulla>')
      using errcode = '23514';
  end if;

  select d.id into v_id
    from public.radiscan_denominazioni d
   where d.chiave = v_chiave;

  if v_id is null then
    insert into public.radiscan_denominazioni (nome_ufficiale, schema_qualita, territorio)
    values (
      btrim(p_nome),
      nullif(upper(btrim(coalesce(p_schema, ''))), ''),
      nullif(btrim(coalesce(p_territorio, '')), '')
    )
    returning id into v_id;
  end if;

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_normalizza_denominazione', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return v_id;
end;
$$;

create or replace function public.radiscan_registra_alias(
  p_operatore_id uuid,
  p_denominazione_id uuid,
  p_alias text,
  p_richiesta_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_chiave text;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.radiscan_denominazioni d where d.id = p_denominazione_id
  ) then
    raise exception 'Denominazione % inesistente', p_denominazione_id using errcode = '23503';
  end if;

  -- D-07: la chiave normalizzata è calcolata qui, con la stessa funzione
  -- approvata usata dal trigger; nessun segnaposto vuoto. Il trigger
  -- radiscan_alias_chiave resta la protezione indipendente: ricalcola e
  -- valida la chiave per ogni percorso d'ingresso.
  v_chiave := public.radiscan_normalizza_chiave(p_alias);

  insert into public.radiscan_alias (denominazione_id, alias, chiave_alias)
  values (p_denominazione_id, btrim(p_alias), v_chiave)
  returning id into v_id;

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_registra_alias', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return v_id;
end;
$$;

create or replace function public.radiscan_valuta_sessione(
  p_operatore_id uuid,
  p_sessione_id uuid,
  p_richiesta_id text
)
returns table (livello text, motivo text, documento_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_documento uuid;
  v_motore uuid;
  v_utilizzabile boolean;
  v_livello text;
  v_motivo text;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;

  select s.motore_id into v_motore
    from public.radiscan_sessioni s
   where s.id = p_sessione_id;

  if v_motore is null then
    raise exception 'Sessione % inesistente', p_sessione_id using errcode = '23503';
  end if;

  select sd.documento_id into v_documento
    from public.radiscan_sessione_documenti sd
   where sd.sessione_id = p_sessione_id
     and sd.ruolo = 'principale'
   limit 1;

  if v_documento is null then
    v_livello := 'non_verificato';
    v_motivo := 'Nessun documento associato alla sessione: la lettura resta non verificata.';
  else
    -- Utilizzabilità calcolata: stato amministrativo E finestra temporale.
    select (d.stato_vigenza = 'vigente'
            and d.valido_dal <= current_date
            and (d.valido_al is null or d.valido_al >= current_date))
      into v_utilizzabile
      from public.radiscan_documenti_disciplinari d
     where d.id = v_documento;

    if not coalesce(v_utilizzabile, false) then
      v_livello := 'non_verificato';
      v_motivo := 'Il documento non è vigente o è fuori dalla finestra di validità: nessuna verifica possibile.';
    elsif exists (
      select 1
        from public.radiscan_prove pr
        join public.radiscan_documenti_disciplinari d on d.id = v_documento
        join public.radiscan_denominazioni dn on dn.id = d.denominazione_id
       where pr.sessione_id = p_sessione_id
         and pr.revocata_il is null
         and dn.schema_qualita is not null
         and pr.esito ? 'schema'
         and upper(pr.esito ->> 'schema') <> dn.schema_qualita
    ) then
      v_livello := 'incongruenza_possibile';
      v_motivo := 'Lo schema dichiarato in una prova non corrisponde a quello del documento: possibile incongruenza.';
    elsif not public.radiscan_estratto_coerente(v_documento) then
      v_livello := 'non_verificato';
      v_motivo := 'Nessun estratto documentale contiene la denominazione canonica.';
    elsif not exists (
      select 1
        from public.radiscan_prove pr
       where pr.sessione_id = p_sessione_id
         and pr.revocata_il is null
    ) then
      v_livello := 'non_verificato';
      v_motivo := 'Nessuna prova attiva nella sessione.';
    else
      -- Il massimo consentito in M1a: il verificato non è nel dominio.
      v_livello := public.radiscan_livello_massimo_m1a();
      v_motivo := 'Documento vigente e denominazione confermata nell''estratto; il livello verificato non è disponibile in M1a.';
    end if;
  end if;

  insert into public.radiscan_esiti_verifica
    (sessione_id, motore_id, documento_id, livello, motivo, richiesta_id)
  values
    (p_sessione_id, v_motore, v_documento, v_livello, v_motivo, btrim(p_richiesta_id));

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_valuta_sessione', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return query select v_livello, v_motivo, v_documento;
end;
$$;

create or replace function public.radiscan_pulisci_sessioni(
  p_operatore_id uuid,
  p_oltre interval,
  p_richiesta_id text
)
returns table (sessioni_chiuse integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ore integer;
  v_chiuse integer := 0;
begin
  if not public.radiscan_richiesta_valida(p_richiesta_id) then
    raise exception 'richiesta_id non valido' using errcode = '22023';
  end if;
  if not public.radiscan_operatore_autorizzato(p_operatore_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;
  if p_oltre is null then
    raise exception 'Intervallo di inattività mancante' using errcode = '22023';
  end if;

  v_ore := (extract(epoch from p_oltre) / 3600)::integer;
  if v_ore < 1 or v_ore > 168 then
    raise exception 'Intervallo fuori misura: attese da 1 a 168 ore' using errcode = '22023';
  end if;

  -- Nessuna cancellazione: le sessioni abbandonate vengono solo marcate.
  -- Prove, documenti, eventi ed esiti non vengono toccati.
  -- F-02: l'ORDER BY è applicato alla selezione che acquisisce i lock: il plan
  -- è Sort -> LockRows e le righe vengono bloccate in ordine crescente di id.
  -- Due pulizie concorrenti bloccano le stesse sessioni nello stesso ordine e
  -- non possono incrociarsi. L'insieme selezionato non cambia: l'ordinamento
  -- non altera il criterio di selezione né la soglia temporale.
  with scadute as (
    select s.id
      from public.radiscan_sessioni s
     where s.stato = 'aperta'
       and s.ultima_attivita_il < now() - p_oltre
     order by s.id
       for update
  )
  update public.radiscan_sessioni s
     set stato = 'abbandonata',
         chiusa_il = now()
   where s.id in (select id from scadute);

  get diagnostics v_chiuse = row_count;

  insert into public.radiscan_pulizie_sessioni
    (modalita, oltre_ore, sessioni_chiuse, operatore_id, richiesta_id)
  values
    ('applicativa', v_ore, v_chiuse, p_operatore_id, btrim(p_richiesta_id));

  insert into public.radiscan_registro_chiamate
    (funzione, operatore_id, richiesta_id, session_user_db, current_user_db, esito)
  values
    ('radiscan_pulisci_sessioni', p_operatore_id, btrim(p_richiesta_id),
     session_user::text, current_user::text, 'ok');

  return query select v_chiuse;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- 10. Seed dei motori (2) — idempotente e non distruttivo
-- ───────────────────────────────────────────────────────────────────────
-- ON CONFLICT DO NOTHING: se il codice esiste, la riga non viene toccata.
-- Un DO UPDATE potrebbe cambiare versione_prompt a un motore già usato e
-- falsare le analisi storiche.
insert into public.radiscan_motori (codice, descrizione, versione_prompt, attivo)
values
  (
    'v1-documentale',
    'Motore documentale RadiciScan M1a — verifica su fonti registrate',
    'radiscan-1.0.0',
    true
  ),
  (
    'v2-documentale',
    'Motore documentale RadiciScan v2 — non attivo in M1a',
    'radiscan-2.0.0',
    false
  )
on conflict (codice) do nothing;

-- ───────────────────────────────────────────────────────────────────────
-- 11. ACL — 40 REVOKE, 13 GRANT, dopo la creazione dei trigger
-- ───────────────────────────────────────────────────────────────────────
-- Regola: PUBLIC, anon e authenticated non hanno mai EXECUTE. Il REVOKE
-- esplicito è necessario perché con proacl NULL il default PostgreSQL
-- concede EXECUTE a PUBLIC.

-- 13 RPC: EXECUTE al solo service_role.
revoke all on function public.radiscan_apri_sessione(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.radiscan_chiudi_sessione(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.radiscan_registra_prova(uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.radiscan_revoca_prova(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.radiscan_associa_documento(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.radiscan_registra_documento(uuid, uuid, uuid, text, text, text, date, text, text) from public, anon, authenticated;
revoke all on function public.radiscan_dichiara_vigenza(uuid, uuid, date, date, text, text) from public, anon, authenticated;
revoke all on function public.radiscan_supera_documento(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.radiscan_registra_estratto(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.radiscan_normalizza_denominazione(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.radiscan_registra_alias(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.radiscan_valuta_sessione(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.radiscan_pulisci_sessioni(uuid, interval, text) from public, anon, authenticated;

grant execute on function public.radiscan_apri_sessione(uuid, uuid, text) to service_role;
grant execute on function public.radiscan_chiudi_sessione(uuid, uuid, text) to service_role;
grant execute on function public.radiscan_registra_prova(uuid, uuid, text, text, jsonb, text) to service_role;
grant execute on function public.radiscan_revoca_prova(uuid, uuid, text, text) to service_role;
grant execute on function public.radiscan_associa_documento(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.radiscan_registra_documento(uuid, uuid, uuid, text, text, text, date, text, text) to service_role;
grant execute on function public.radiscan_dichiara_vigenza(uuid, uuid, date, date, text, text) to service_role;
grant execute on function public.radiscan_supera_documento(uuid, uuid, uuid, text) to service_role;
grant execute on function public.radiscan_registra_estratto(uuid, uuid, text, text) to service_role;
grant execute on function public.radiscan_normalizza_denominazione(uuid, text, text, text, text) to service_role;
grant execute on function public.radiscan_registra_alias(uuid, uuid, text, text) to service_role;
grant execute on function public.radiscan_valuta_sessione(uuid, uuid, text) to service_role;
grant execute on function public.radiscan_pulisci_sessioni(uuid, interval, text) to service_role;

-- 12 helper: nessun EXECUTE diretto a nessun ruolo applicativo.
revoke all on function public.radiscan_normalizza_chiave(text) from public, anon, authenticated;
revoke all on function public.radiscan_chiave_valida(text) from public, anon, authenticated;
revoke all on function public.radiscan_operatore_autorizzato(uuid, text[]) from public, anon, authenticated;
revoke all on function public.radiscan_documento_vigente(uuid) from public, anon, authenticated;
revoke all on function public.radiscan_documento_e_vigente(uuid) from public, anon, authenticated;
revoke all on function public.estratto_contiene_denominazione(text, text) from public, anon, authenticated;
revoke all on function public.radiscan_sessioni_scadute(interval) from public, anon, authenticated;
revoke all on function public.radiscan_livello_massimo_m1a() from public, anon, authenticated;
revoke all on function public.radiscan_motore_attivo(uuid) from public, anon, authenticated;
revoke all on function public.radiscan_prova_attiva(uuid) from public, anon, authenticated;
revoke all on function public.radiscan_richiesta_valida(text) from public, anon, authenticated;
revoke all on function public.radiscan_estratto_coerente(uuid) from public, anon, authenticated;

-- 15 funzioni trigger: senza EXECUTE diretto, raggiungibili solo via trigger.
revoke all on function public.radiscan_operatori_normalizza() from public, anon, authenticated;
revoke all on function public.radiscan_motori_normalizza() from public, anon, authenticated;
revoke all on function public.radiscan_denominazioni_chiave() from public, anon, authenticated;
revoke all on function public.radiscan_alias_chiave() from public, anon, authenticated;
revoke all on function public.radiscan_documenti_valida() from public, anon, authenticated;
revoke all on function public.radiscan_documenti_transizione() from public, anon, authenticated;
revoke all on function public.radiscan_eventi_append_only() from public, anon, authenticated;
revoke all on function public.radiscan_estratti_valida() from public, anon, authenticated;
revoke all on function public.radiscan_sessioni_token() from public, anon, authenticated;
revoke all on function public.radiscan_sessioni_chiusura() from public, anon, authenticated;
revoke all on function public.radiscan_prove_valida() from public, anon, authenticated;
revoke all on function public.radiscan_prove_immutabile() from public, anon, authenticated;
revoke all on function public.radiscan_sessione_documenti_valida() from public, anon, authenticated;
revoke all on function public.radiscan_esiti_verifica_valida() from public, anon, authenticated;
revoke all on function public.radiscan_pulizie_valida() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 12. RLS e privilegi di tabella / sequenza / vista
-- ───────────────────────────────────────────────────────────────────────

alter table public.radiscan_operatori enable row level security;
alter table public.radiscan_motori enable row level security;
alter table public.radiscan_denominazioni enable row level security;
alter table public.radiscan_alias enable row level security;
alter table public.radiscan_documenti_disciplinari enable row level security;
alter table public.radiscan_documenti_vigenza_eventi enable row level security;
alter table public.radiscan_documenti_estratti enable row level security;
alter table public.radiscan_sessioni enable row level security;
alter table public.radiscan_prove enable row level security;
alter table public.radiscan_sessione_documenti enable row level security;
alter table public.radiscan_esiti_verifica enable row level security;
alter table public.radiscan_pulizie_sessioni enable row level security;
alter table public.radiscan_registro_chiamate enable row level security;

revoke all on table
  public.radiscan_operatori,
  public.radiscan_motori,
  public.radiscan_denominazioni,
  public.radiscan_alias,
  public.radiscan_documenti_disciplinari,
  public.radiscan_documenti_vigenza_eventi,
  public.radiscan_documenti_estratti,
  public.radiscan_sessioni,
  public.radiscan_prove,
  public.radiscan_sessione_documenti,
  public.radiscan_esiti_verifica,
  public.radiscan_pulizie_sessioni,
  public.radiscan_registro_chiamate
  from anon, authenticated;

-- service_role: SELECT/INSERT su tutto; UPDATE solo dove serve; mai DELETE.
grant select, insert, update on table public.radiscan_operatori to service_role;
grant select, insert, update on table public.radiscan_motori to service_role;
grant select, insert on table public.radiscan_denominazioni to service_role;
grant select, insert on table public.radiscan_alias to service_role;
grant select, insert, update on table public.radiscan_documenti_disciplinari to service_role;
grant select, insert on table public.radiscan_documenti_vigenza_eventi to service_role;
grant select, insert on table public.radiscan_documenti_estratti to service_role;
grant select, insert, update on table public.radiscan_sessioni to service_role;
grant select, insert, update on table public.radiscan_prove to service_role;
grant select, insert on table public.radiscan_sessione_documenti to service_role;
grant select, insert on table public.radiscan_esiti_verifica to service_role;
grant select, insert on table public.radiscan_pulizie_sessioni to service_role;
grant select, insert on table public.radiscan_registro_chiamate to service_role;

revoke all on sequence
  public.radiscan_documenti_vigenza_eventi_id_seq,
  public.radiscan_pulizie_sessioni_id_seq,
  public.radiscan_registro_chiamate_id_seq
  from anon, authenticated;

grant usage, select on sequence
  public.radiscan_documenti_vigenza_eventi_id_seq,
  public.radiscan_pulizie_sessioni_id_seq,
  public.radiscan_registro_chiamate_id_seq
  to service_role;

revoke all on table public.radiscan_alias_stato from public, anon, authenticated;
grant select on table public.radiscan_alias_stato to service_role;

notify pgrst, 'reload schema';

commit;
