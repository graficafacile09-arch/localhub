-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE 6b: PRENOTAZIONI
-- Infrastruttura DB: tabella, sequenza, indici, trigger updated_at, RLS
-- e le 3 RPC atomiche (crea/annulla/sposta).
--
-- Scelte progettuali (allineate allo schema reale del progetto):
--   - A  negozi.id è uuid → prenotazioni.negozio_id uuid (FK negozi).
--   - A  auth.users.id è uuid → cliente_user_id uuid (FK, null = guest).
--   -    servizio_id è un riferimento LOGICO allo snapshot JSONB dentro
--        negozi.data->'servizi_strutturati' (i servizi sono jsonb, non una
--        tabella): nessuna FK verso servizi_strutturati.
--   -    idempotency_key UNIQUE: il client genera una chiave per tentativo
--        → doppio click/retry NON crea due prenotazioni.
--   -    UNIQUE (negozio_id, giorno, ora_inizio): seconda barriera anti
--        double-booking sullo stesso istante di inizio.
--   -    giorno/ora_inizio/ora_fine sono civili (Europe/Rome): il timezone
--        è espresso con AT TIME ZONE e confronti via dati PostgreSQL.
--   -    snapshot servizio_nome + durata_min: la prenotazione resta integra.
--   -    RLS: insert/update/delete mai pubblici (si passa dalle RPC/API con
--        service role, pattern ordini/rimborsi); SELECT per cliente
--        proprietario, merchant del negozio e admin.
--   -    msg di errore coerente alle RPC esistenti: {ok:false, codice, messaggio}.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Sequenza per il numero prenotazione (PR-000001, ...) ──────────────
create sequence if not exists public.prenotazioni_numero_seq;

-- ── 2. Tabella prenotazioni ───────────────────────────────────────────────
create table if not exists public.prenotazioni (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null
    default (
      'PR-' || lpad(nextval('public.prenotazioni_numero_seq')::text, 6, '0')
    ),

  -- Idempotenza anti doppio invio (pattern ordini)
  idempotency_key text not null,
  constraint prenotazioni_idempotency_key_unq unique (idempotency_key),

  -- Negozio (uuid FK)
  negozio_id      uuid not null references public.negozi (id) on delete restrict,

  -- Servizio: riferimento logico allo snapshot JSONB nei negozi.data
  servizio_id     text not null,
  servizio_nome   text not null,

  -- Durata (minuti) — derivata dal servizio (snapshot), mai dal client
  durata_min      integer not null default 30
    check (durata_min between 5 and 480),

  -- Slot civile (Europe/Rome)
  giorno          date not null,
  ora_inizio      time not null,
  ora_fine        time not null,

  -- Seconda barriera anti double-booking (stesso istante di inizio)
  constraint prenotazioni_slot_unq
    unique (negozio_id, giorno, ora_inizio),

  -- Cliente: autenticato (nullable: guest/prenotazione pubblica) + snapshot
  cliente_user_id  uuid references auth.users (id) on delete set null,
  cliente_nome     text not null,
  cliente_cognome  text not null,
  cliente_telefono text,
  cliente_email    text,
  note             text,

  -- Stato della prenotazione
  stato            text not null default 'confermata'
    check (stato in ('confermata', 'cancellata', 'effettuata', 'no_show')),

  motivo_annullo   text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Indici di lettura (pannelli cliente/merchant)
create index if not exists prenotazioni_negozio_id_idx
  on public.prenotazioni (negozio_id, giorno);
create index if not exists prenotazioni_cliente_user_id_idx
  on public.prenotazioni (cliente_user_id, created_at desc);

-- Trigger updated_at (funzione già esistente nel progetto)
drop trigger if exists prenotazioni_set_updated_at on public.prenotazioni;
create trigger prenotazioni_set_updated_at
  before update on public.prenotazioni
  for each row execute function public.set_updated_at();

-- ── 3. RLS ────────────────────────────────────────────────────────────────
-- La CREAZIONE/MODIFICA/CANCELLAZIONE publica NON è possibile direttamente:
-- passano dalle RPC/API con service role (pattern ordini/rimborsi).
-- Le SELECT sono consentite a: cliente proprietario, merchant del negozio,
-- admin autorizzato.
alter table public.prenotazioni enable row level security;

-- Cliente: vede le proprie prenotazioni
drop policy if exists "prenotazioni self select" on public.prenotazioni;
create policy "prenotazioni self select"
  on public.prenotazioni for select
  using (cliente_user_id = auth.uid());

-- Merchant proprietario del negozio: vede le prenotazioni del proprio negozio
drop policy if exists "prenotazioni merchant select" on public.prenotazioni;
create policy "prenotazioni merchant select"
  on public.prenotazioni for select
  using (
    exists (
      select 1 from public.negozi n
      where n.id = prenotazioni.negozio_id
        and n.owner_user_id = auth.uid()
    )
  );

-- Admin autorizzato: vede tutte le prenotazioni
drop policy if exists "prenotazioni admin select all" on public.prenotazioni;
create policy "prenotazioni admin select all"
  on public.prenotazioni for select
  using (public.is_admin_authorized());

-- ── 4. Helpers ─────────────────────────────────────────────────────────

-- Parsing HH:MM → minuti (usato nelle RPC; immutabile e riusabile).
create or replace function public.prenotazioni_parse_min(p_t text)
returns integer
language sql
immutable
as $$
  select case
    when p_t is null or p_t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then null
    else (split_part(p_t, ':', 1))::int * 60 + (split_part(p_t, ':', 2))::int
  end;
$$;

-- Prenotazione → jsonb di ritorno
create or replace function public.prenotazione_to_json(p_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id::text,
    'numero', p.numero,
    'idempotencyKey', p.idempotency_key,
    'negozioId', p.negozio_id::text,
    'servizioId', p.servizio_id,
    'servizioNome', p.servizio_nome,
    'durataMin', p.durata_min,
    'giorno', p.giorno::text,
    'oraInizio', p.ora_inizio::text,
    'oraFine', p.ora_fine::text,
    'clienteUserId', p.cliente_user_id::text,
    'clienteNome', p.cliente_nome,
    'clienteCognome', p.cliente_cognome,
    'clienteTelefono', p.cliente_telefono,
    'clienteEmail', p.cliente_email,
    'note', p.note,
    'stato', p.stato,
    'motivoAnnullo', p.motivo_annullo,
    'createdAt', p.created_at::text,
    'updatedAt', p.updated_at::text
  )
  from public.prenotazioni p
  where p.id = p_id;
$$;

-- ── 5. RPC crea_prenotazione: FONTE DI VERITÀ (atomica, lock, anti double) ─
create or replace function public.crea_prenotazione(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key              text;
  v_negozio_id       text;
  v_servizio_id      text;
  v_giorno_txt       text;
  v_ora_txt          text;
  v_nome             text;
  v_cognome          text;
  v_telefono         text;
  v_email            text;
  v_note             text;
  v_cliente_user_id  uuid;

  v_giorno           date;
  v_ora_inizio       time;
  v_ora_fine         time;
  v_durata           integer;

  v_negozio          record;
  v_servizio         jsonb;
  v_servizio_nome    text;
  v_prenotazione     record;

  -- timezone operativa: giorno/ora civili = Europe/Rome
  v_now_rome         timestamp;
  v_ora_desiderata   timestamp;

  -- orari del giorno desiderato (jsonb dentro negozi.orari)
  v_day_key          text;
  v_day              jsonb;
  v_win_open1        integer; v_win_close1 integer;
  v_win_open2        integer; v_win_close2 integer;
  v_start_min        integer; v_end_min     integer;
  v_overlap          boolean;
begin
  -- ── 0. Validazione payload difensiva (barriera finale) ──────────────────
  if p_payload is null or not jsonb_typeof(p_payload) = 'object' then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_PAYLOAD', 'messaggio', 'Payload non valido.');
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  if v_key is null or length(v_key) = 0 or length(v_key) > 64 then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_IDEMPOTENCY_KEY', 'messaggio', 'Chiave di idempotenza non valida.');
  end if;

  v_negozio_id := p_payload ->> 'negozioId';
  if v_negozio_id is null or v_negozio_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_PAYLOAD', 'messaggio', 'Negozio non valido.');
  end if;

  v_servizio_id := p_payload ->> 'servizioId';
  if v_servizio_id is null or length(v_servizio_id) = 0 or length(v_servizio_id) > 64 then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_PAYLOAD', 'messaggio', 'Servizio non valido.');
  end if;

  v_giorno_txt := p_payload ->> 'giorno';
  if v_giorno_txt is null or v_giorno_txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_DATE', 'messaggio', 'Data non valida.');
  end if;
  begin
    v_giorno := v_giorno_txt::date;
  exception when others then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_DATE', 'messaggio', 'Data non valida.');
  end;

  v_ora_txt := p_payload ->> 'oraInizio';
  if v_ora_txt is null or v_ora_txt !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_TIME', 'messaggio', 'Orario non valido.');
  end if;
  begin
    v_ora_inizio := v_ora_txt::time;
  exception when others then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_TIME', 'messaggio', 'Orario non valido.');
  end;

  v_nome := coalesce(nullif(btrim(p_payload ->> 'nome'), ''), '');
  v_cognome := coalesce(nullif(btrim(p_payload ->> 'cognome'), ''), '');
  if length(v_nome) = 0 or length(v_nome) > 80 then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_PAYLOAD', 'messaggio', 'Nome obbligatorio (max 80 caratteri).');
  end if;
  if length(v_cognome) = 0 or length(v_cognome) > 80 then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_PAYLOAD', 'messaggio', 'Cognome obbligatorio (max 80 caratteri).');
  end if;

  v_telefono := coalesce(nullif(btrim(p_payload ->> 'telefono'), ''), null);
  v_email := coalesce(nullif(btrim(lower(p_payload ->> 'email')), ''), null);
  if v_telefono is null and v_email is null then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_PAYLOAD', 'messaggio', 'Inserisci almeno un recapito (telefono o email).');
  end if;
  if v_telefono is not null and length(v_telefono) > 30 then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_PAYLOAD', 'messaggio', 'Telefono non valido.');
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_PAYLOAD', 'messaggio', 'Email non valida.');
  end if;

  v_note := coalesce(nullif(btrim(p_payload ->> 'note'), ''), null);
  if v_note is not null and length(v_note) > 2000 then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_PAYLOAD', 'messaggio', 'Nota troppo lunga (max 2000 caratteri).');
  end if;

  -- Cliente autenticato (guest: null). Il client può leggere la propria
  -- sessione, ma la RPC NON si fida: quando presente deve essere un uuid.
  v_cliente_user_id := null;
  begin
    v_cliente_user_id := (p_payload ->> 'clienteUserId')::uuid;
  exception when others then
    v_cliente_user_id := null;
  end;

  -- ── 1. Idempotenza: prenotazione già esistente con questa chiave ────────
  select * into v_prenotazione
  from public.prenotazioni
  where idempotency_key = v_key
  limit 1;
  if v_prenotazione.id is not null then
    return jsonb_build_object('ok', true, 'giaEsistente', true,
      'prenotazione', public.prenotazione_to_json(v_prenotazione.id));
  end if;

  -- ── 2. LOCK riga negozio: serializza le richieste concorrenti dello ─────
  --      stesso negozio PRIMA di qualunque verifica disponibilità.
  select * into v_negozio
  from public.negozi
  where id = v_negozio_id::uuid
  for update;

  if v_negozio.id is null then
    return jsonb_build_object('ok', false, 'codice', 'STORE_NOT_FOUND', 'messaggio', 'Negozio non trovato.');
  end if;
  if not coalesce(v_negozio.attivo, false) or v_negozio.deleted_at is not null then
    return jsonb_build_object('ok', false, 'codice', 'STORE_INACTIVE', 'messaggio', 'Il negozio non è attivo.');
  end if;

  -- ── 3. Servizio dentro negozi.data->'servizi_strutturati' (JSONB) ───────
  select s
  into v_servizio
  from jsonb_array_elements(
    coalesce(v_negozio.data->'servizi_strutturati', '[]'::jsonb)
  ) s
  where s->>'id' = v_servizio_id
  limit 1;

  if v_servizio is null then
    return jsonb_build_object('ok', false, 'codice', 'SERVICE_NOT_FOUND', 'messaggio', 'Servizio non trovato.');
  end if;
  if coalesce((v_servizio->>'attivo') = 'false', false) then
    return jsonb_build_object('ok', false, 'codice', 'SERVICE_INACTIVE', 'messaggio', 'Il servizio non è più attivo.');
  end if;

  -- Durata dal DATABASE (jsonb), mai dal client.
  begin
    v_durata := coalesce((v_servizio->>'durata_min')::integer, 30);
  exception when others then
    v_durata := 30;
  end;
  if v_durata < 5 or v_durata > 480 then
    v_durata := 30;
  end if;
  v_servizio_nome := coalesce(v_servizio->>'nome', v_servizio_id);
  v_ora_fine := (v_ora_inizio + make_interval(mins => v_durata))::time;

  -- ── 4. Giorno/ora: nel passato? (Europe/Rome esplicito) ─────────────────
  -- now in timezone Europe/Rome (civil) = now() at time zone 'Europe/Rome'
  v_now_rome := now() at time zone 'Europe/Rome';
  v_ora_desiderata := (v_giorno::timestamp + v_ora_inizio);
  if v_ora_desiderata <= v_now_rome then
    return jsonb_build_object('ok', false, 'codice', 'PAST_DATE', 'messaggio', 'Non puoi prenotare nel passato.');
  end if;

  -- ── 5. Orari del negozio per il giorno desiderato ───────────────────────
  -- negozi.orari è jsonb con chiavi giorno italiane ("lunedì", ...). Deriva
  -- la chiave da extract(dow) (0=domenica ... 6=sabato).
  v_day_key := (array[
    'domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'
  ])[extract(dow from v_giorno)::int + 1];

  v_day := (v_negozio.orari -> v_day_key);
  if v_day is null then
    v_day := '{"chiuso": true}'::jsonb;
  end if;

  if coalesce((v_day->>'chiuso')::text, 'false') = 'true' then
    return jsonb_build_object('ok', false, 'codice', 'STORE_CLOSED', 'messaggio', 'Il negozio è chiuso in questo giorno.');
  end if;

  -- Parse per-fascia HH:MM → minuti; regime pastorale: nessuno → SCHEDULE_MISSING
  v_win_open1 := public.prenotazioni_parse_min(v_day->>'apertura1');
  v_win_close1 := public.prenotazioni_parse_min(v_day->>'chiusura1');
  v_win_open2 := public.prenotazioni_parse_min(v_day->>'apertura2');
  v_win_close2 := public.prenotazioni_parse_min(v_day->>'chiusura2');
  v_start_min := extract(hour from v_ora_inizio) * 60 + extract(minute from v_ora_inizio);
  v_end_min := extract(hour from v_ora_fine) * 60 + extract(minute from v_ora_fine);

  -- ── 6. L'intervallo deve rientrare interamente in una finestra ──────────
  if not (
       (v_win_open1 is not null and v_win_close1 is not null
         and v_start_min >= v_win_open1 and v_end_min <= v_win_close1)
    or (v_win_open2 is not null and v_win_close2 is not null
         and v_start_min >= v_win_open2 and v_end_min <= v_win_close2)
  ) then
    return jsonb_build_object('ok', false, 'codice', 'SLOT_OUTSIDE_HOURS',
      'messaggio', 'L''orario richiesto non rientra negli orari di apertura del negozio.');
  end if;

  -- ── 7. Overlap con prenotazioni confermate (intervalli, non solo inizio) ─
  select exists (
    select 1
    from public.prenotazioni p
    where p.stato = 'confermata'
      and p.negozio_id = v_negozio_id::uuid
      and p.giorno = v_giorno
      and v_ora_inizio < p.ora_fine
      and v_ora_fine > p.ora_inizio
  ) into v_overlap;

  if v_overlap then
    return jsonb_build_object('ok', false, 'codice', 'SLOT_OCCUPATO',
      'messaggio', 'Questo orario non è più disponibile.');
  end if;

  -- ── 8. INSERT snapshot ──────────────────────────────────────────────────
  insert into public.prenotazioni (
    idempotency_key, negozio_id, servizio_id, servizio_nome, durata_min,
    giorno, ora_inizio, ora_fine,
    cliente_user_id, cliente_nome, cliente_cognome,
    cliente_telefono, cliente_email, note,
    stato
  ) values (
    v_key, v_negozio_id::uuid, v_servizio_id, v_servizio_nome, v_durata,
    v_giorno, v_ora_inizio, v_ora_fine,
    v_cliente_user_id, v_nome, v_cognome,
    v_telefono, v_email, v_note,
    'confermata'
  )
  returning * into v_prenotazione;

  return jsonb_build_object('ok', true, 'giaEsistente', false,
    'prenotazione', public.prenotazione_to_json(v_prenotazione.id));

exception
  when unique_violation then
    -- Corsa di idempotenza → restituisci la prenotazione esistente.
    select * into v_prenotazione
    from public.prenotazioni
    where idempotency_key = v_key
    limit 1;
    if v_prenotazione.id is not null then
      return jsonb_build_object('ok', true, 'giaEsistente', true,
        'prenotazione', public.prenotazione_to_json(v_prenotazione.id));
    end if;
    -- Collisione reale sullo slot (stesso negozio/giorno/ora_inizio).
    return jsonb_build_object('ok', false, 'codice', 'SLOT_OCCUPATO',
      'messaggio', 'Questo orario non è più disponibile.');
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED',
      'messaggio', 'Impossibile salvare la prenotazione.');
end;
$$;

-- ── 6. RPC annulla_prenotazione: confermata → cancellata ──────────────────
create or replace function public.annulla_prenotazione(
  p_prenotazione_id uuid,
  p_motivo text,
  p_actor text,
  p_actor_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pren  record;
  v_id    uuid;
begin
  if p_actor not in ('cliente', 'merchant', 'admin') then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Attore non valido.');
  end if;

  select * into v_pren
  from public.prenotazioni
  where id = p_prenotazione_id
  for update;

  if v_pren.id is null then
    return jsonb_build_object('ok', false, 'codice', 'BOOKING_NOT_FOUND', 'messaggio', 'Prenotazione non trovata.');
  end if;

  if v_pren.stato <> 'confermata' then
    return jsonb_build_object('ok', false, 'codice', 'BOOKING_NOT_ACTIVE', 'messaggio', 'La prenotazione non è più modificabile.');
  end if;

  -- Autorizzazione (difesa in profondità; la route già verifica)
  if p_actor = 'cliente' then
    begin v_id := p_actor_id::uuid; exception when others then v_id := null; end;
    if v_id is null or v_pren.cliente_user_id <> v_id then
      return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questa prenotazione.');
    end if;
  elsif p_actor = 'merchant' then
    begin v_id := p_actor_id::uuid; exception when others then v_id := null; end;
    if v_id is null or not exists (
      select 1 from public.negozi n
      where n.id = v_pren.negozio_id and n.owner_user_id = v_id
    ) then
      return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questa prenotazione.');
    end if;
  else -- admin
    begin v_id := p_actor_id::uuid; exception when others then v_id := null; end;
    if v_id is null or not public.is_admin_authorized(v_id) then
      return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questa prenotazione.');
    end if;
  end if;

  update public.prenotazioni
  set stato = 'cancellata',
      motivo_annullo = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'annullata')
  where id = p_prenotazione_id;

  return jsonb_build_object('ok', true,
    'prenotazione', public.prenotazione_to_json(p_prenotazione_id));

exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile annullare la prenotazione.');
end;
$$;

-- ── 7. RPC sposta_prenotazione: modifica temporale, stessa riga ───────────
create or replace function public.sposta_prenotazione(
  p_prenotazione_id uuid,
  p_nuova_giorno date,
  p_nuova_ora time,
  p_actor text,
  p_actor_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pren     record;
  v_negozio  record;
  v_nuova_fine time;
  v_id       uuid;
  v_now_rome timestamp;
  v_ora_des  timestamp;
  v_day_key  text;
  v_day      jsonb;
  v_win_open1 integer; v_win_close1 integer;
  v_win_open2 integer; v_win_close2 integer;
  v_start_min integer; v_end_min integer;
  v_overlap  boolean;
begin
  if p_actor not in ('cliente', 'merchant', 'admin') then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Attore non valido.');
  end if;
  if p_nuova_giorno is null or p_nuova_ora is null then
    return jsonb_build_object('ok', false, 'codice', 'INVALID_PAYLOAD', 'messaggio', 'Nuovo giorno/ora non validi.');
  end if;

  -- Lock riga prenotazione
  select * into v_pren
  from public.prenotazioni
  where id = p_prenotazione_id
  for update;

  if v_pren.id is null then
    return jsonb_build_object('ok', false, 'codice', 'BOOKING_NOT_FOUND', 'messaggio', 'Prenotazione non trovata.');
  end if;
  if v_pren.stato <> 'confermata' then
    return jsonb_build_object('ok', false, 'codice', 'BOOKING_NOT_ACTIVE', 'messaggio', 'La prenotazione non è più modificabile.');
  end if;

  -- Autorizzazione (come annulla)
  if p_actor = 'cliente' then
    begin v_id := p_actor_id::uuid; exception when others then v_id := null; end;
    if v_id is null or v_pren.cliente_user_id <> v_id then
      return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questa prenotazione.');
    end if;
  elsif p_actor = 'merchant' then
    begin v_id := p_actor_id::uuid; exception when others then v_id := null; end;
    if v_id is null or not exists (
      select 1 from public.negozi n
      where n.id = v_pren.negozio_id and n.owner_user_id = v_id
    ) then
      return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questa prenotazione.');
    end if;
  else -- admin
    begin v_id := p_actor_id::uuid; exception when others then v_id := null; end;
    if v_id is null or not public.is_admin_authorized(v_id) then
      return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questa prenotazione.');
    end if;
  end if;

  -- Lock negozio (percoerenza con crea)
  select * into v_negozio
  from public.negozi
  where id = v_pren.negozio_id
  for update;

  if v_negozio.id is null or not coalesce(v_negozio.attivo, false) or v_negozio.deleted_at is not null then
    return jsonb_build_object('ok', false, 'codice', 'STORE_INACTIVE', 'messaggio', 'Il negozio non è attivo.');
  end if;

  -- Nuova durata con lo snapshot già salvato (mai dal client)
  v_nuova_fine := (p_nuova_ora + make_interval(mins => v_pren.durata_min))::time;

  -- Passato?
  v_now_rome := now() at time zone 'Europe/Rome';
  v_ora_des := (p_nuova_giorno::timestamp + p_nuova_ora);
  if v_ora_des <= v_now_rome then
    return jsonb_build_object('ok', false, 'codice', 'PAST_DATE', 'messaggio', 'Non puoi spostare nel passato.');
  end if;

  -- Orari del nuovo giorno
  v_day_key := (array[
    'domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'
  ])[extract(dow from p_nuova_giorno)::int + 1];
  v_day := coalesce((v_negozio.orari -> v_day_key), '{"chiuso": true}'::jsonb);

  if coalesce((v_day->>'chiuso')::text, 'false') = 'true' then
    return jsonb_build_object('ok', false, 'codice', 'STORE_CLOSED', 'messaggio', 'Il negozio è chiuso in questo giorno.');
  end if;

  v_win_open1 := public.prenotazioni_parse_min(v_day->>'apertura1');
  v_win_close1 := public.prenotazioni_parse_min(v_day->>'chiusura1');
  v_win_open2 := public.prenotazioni_parse_min(v_day->>'apertura2');
  v_win_close2 := public.prenotazioni_parse_min(v_day->>'chiusura2');
  v_start_min := extract(hour from p_nuova_ora) * 60 + extract(minute from p_nuova_ora);
  v_end_min := extract(hour from v_nuova_fine) * 60 + extract(minute from v_nuova_fine);

  if not (
       (v_win_open1 is not null and v_win_close1 is not null
         and v_start_min >= v_win_open1 and v_end_min <= v_win_close1)
    or (v_win_open2 is not null and v_win_close2 is not null
         and v_start_min >= v_win_open2 and v_end_min <= v_win_close2)
  ) then
    return jsonb_build_object('ok', false, 'codice', 'SLOT_OUTSIDE_HOURS', 'messaggio', 'Il nuovo orario non rientra negli orari di apertura.');
  end if;

  -- Overlap ESCLUDENDO la riga corrente
  select exists (
    select 1
    from public.prenotazioni p
    where p.stato = 'confermata'
      and p.id <> p_prenotazione_id
      and p.negozio_id = v_pren.negozio_id
      and p.giorno = p_nuova_giorno
      and p_nuova_ora < p.ora_fine
      and v_nuova_fine > p.ora_inizio
  ) into v_overlap;

  if v_overlap then
    return jsonb_build_object('ok', false, 'codice', 'SLOT_OCCUPATO', 'messaggio', 'Questo orario non è più disponibile.');
  end if;

  -- Aggiorna stesso slot (idempotency_key invariata, stessa riga)
  update public.prenotazioni
  set giorno = p_nuova_giorno,
      ora_inizio = p_nuova_ora,
      ora_fine = v_nuova_fine
  where id = p_prenotazione_id;

  return jsonb_build_object('ok', true,
    'prenotazione', public.prenotazione_to_json(p_prenotazione_id));

exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'codice', 'SLOT_OCCUPATO', 'messaggio', 'Questo orario non è più disponibile.');
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile spostare la prenotazione.');
end;
$$;

-- ── 8. Permessi: solo service_role (pattern ordini/rimborsi) ──────────────
-- Le RPC sono chiamate SOLO dal server (service role); anon/authenticated
-- non devono poter aggirare la route applicativa.
revoke execute on function public.crea_prenotazione(jsonb) from public, anon, authenticated;
grant execute on function public.crea_prenotazione(jsonb) to service_role;

revoke execute on function public.annulla_prenotazione(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.annulla_prenotazione(uuid, text, text, text) to service_role;

revoke execute on function public.sposta_prenotazione(uuid, date, time, text, text) from public, anon, authenticated;
grant execute on function public.sposta_prenotazione(uuid, date, time, text, text) to service_role;

revoke execute on function public.prenotazione_to_json(uuid) from public, anon, authenticated;
grant execute on function public.prenotazione_to_json(uuid) to service_role;

revoke execute on function public.prenotazioni_parse_min(text) from public, anon, authenticated;
grant execute on function public.prenotazioni_parse_min(text) to service_role;

notify pgrst, 'reload schema';

commit;