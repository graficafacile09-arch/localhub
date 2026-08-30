-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — AGENDA ANNUALE: eccezioni per singola data nelle RPC
-- prenotazioni.
--
-- Aggiunge a crea_prenotazione e sposta_prenotazione la risoluzione delle
-- eccezioni dell'Agenda annuale (negozi.data.agenda_eccezioni, jsonb con
-- chiave = data civile YYYY-MM-DD Europe/Rome), ALLINEATA all'helper TS
-- lib/agenda.ts → risolviGiorno():
--   - eccezione presente per la data → PREVALE sul calendario settimanale
--     (stessa forma di una DaySchedule: chiuso, apertura1..chiusura2);
--   - chiuso → nessuno slot (STORE_CLOSED / SLOT_OUTSIDE_HOURS);
--   - orario speciale → solo le finestre speciali vengono accettate.
--
-- Nessuna nuova tabella, nessun nuovo vincolo, nessuna nuova RPC:
-- solo `create or replace` delle 2 RPC esistenti (idempotente).
-- ⚠️ Migration SOLO repository: NON applicata al DB remoto.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 5'. RPC crea_prenotazione: + Agenda annuale ──────────────────────────
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
  -- agenda annuale: eccezione per la singola data (prevale sulla settimana)
  v_eccezione        jsonb;
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

  -- ── 5bis. AGENDA ANNUALE (negozi.data.agenda_eccezioni) ─────────────────
  -- Eccezione per la singola data civile: se presente PREVALE sul calendario
  -- settimanale (stessa forma di una DaySchedule: chiuso, apertura1..chiusura2).
  -- Chiusa → giorno non prenotabile; orario speciale → solo finestre speciali.
  -- Stessa risoluzione dell'helper TS risolviGiorno() (lib/agenda.ts).
  v_eccezione := (v_negozio.data -> 'agenda_eccezioni') -> v_giorno_txt;
  if v_eccezione is not null and jsonb_typeof(v_eccezione) = 'object' then
    v_day := v_eccezione;
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

-- ── 7'. RPC sposta_prenotazione: + Agenda annuale ─────────────────────────
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
  -- agenda annuale: eccezione per la singola data (prevale sulla settimana)
  v_eccezione jsonb;
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

  -- ── AGENDA ANNUALE (negozi.data.agenda_eccezioni) ───────────────────────
  -- Eccezione per la nuova data: se presente PREVALE sul calendario
  -- settimanale (stessa risoluzione dell'helper TS risolviGiorno()).
  v_eccezione := (v_negozio.data -> 'agenda_eccezioni') -> p_nuova_giorno::text;
  if v_eccezione is not null and jsonb_typeof(v_eccezione) = 'object' then
    v_day := v_eccezione;
  end if;

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

-- ── Permessi: ri-affermati (pattern originale) ───────────────────────────
revoke execute on function public.crea_prenotazione(jsonb) from public, anon, authenticated;
grant execute on function public.crea_prenotazione(jsonb) to service_role;

revoke execute on function public.sposta_prenotazione(uuid, date, time, text, text) from public, anon, authenticated;
grant execute on function public.sposta_prenotazione(uuid, date, time, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
