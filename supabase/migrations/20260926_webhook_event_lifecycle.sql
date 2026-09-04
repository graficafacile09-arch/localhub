-- InCittà — FASE 10 BLOCCO 3A: LIFECYCLE EVENTI WEBHOOK STRIPE
--
-- Adds retryable event acquisition/finalization without changing event payloads
-- or business payment handling. Existing pagamenti_eventi rows are preserved.

begin;

alter table public.pagamenti_eventi
  add column if not exists processing_at timestamptz;

create index if not exists pagamenti_eventi_processing_idx
  on public.pagamenti_eventi (status, processing_at);

-- Atomically insert/acquire an event. Exact processed duplicates are terminal;
-- received/error rows and stale processing rows are retryable. A live
-- processing row is returned to the caller without a second acquisition.
create or replace function public.pagamenti_evento_acquisisci(
  p_event_id text,
  p_event_type text,
  p_ordine_id uuid,
  p_negozio_id uuid,
  p_payment_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event record;
  v_acquired boolean := false;
  v_now timestamptz := now();
begin
  if p_event_id is null or length(btrim(p_event_id)) = 0 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Event ID non valido.');
  end if;

  select * into v_event
  from public.pagamenti_eventi
  where event_id = btrim(p_event_id)
  for update;

  if not found then
    insert into public.pagamenti_eventi (
      provider, event_id, event_type, ordine_id, negozio_id, payment_id,
      payload, status, attempts, received_at, processing_at, processed_at, error
    ) values (
      'stripe', btrim(p_event_id), p_event_type, p_ordine_id, p_negozio_id,
      nullif(btrim(coalesce(p_payment_id, '')), ''), p_payload, 'processing', 1,
      v_now, v_now, null, null
    )
    on conflict (event_id) do nothing
    returning * into v_event;

    if found then
      v_acquired := true;
    else
      -- A concurrent insert won the unique event_id race. Lock and inspect its
      -- committed state before deciding whether this request may retry it.
      select * into v_event
      from public.pagamenti_eventi
      where event_id = btrim(p_event_id)
      for update;
    end if;
  end if;

  if not v_acquired and v_event.status = 'processed' then
    return jsonb_build_object(
      'ok', true, 'acquired', false, 'terminal', true, 'stato', 'processed',
      'event_id', v_event.event_id, 'attempts', v_event.attempts
    );
  end if;

  if not v_acquired
     and v_event.status = 'processing'
     and v_event.processing_at is not null
     and v_event.processing_at > v_now - interval '10 minutes' then
    return jsonb_build_object(
      'ok', true, 'acquired', false, 'in_corso', true, 'stato', 'processing',
      'event_id', v_event.event_id, 'attempts', v_event.attempts
    );
  end if;

  if not v_acquired then
    update public.pagamenti_eventi
    set status = 'processing',
        attempts = coalesce(attempts, 0) + 1,
        processing_at = v_now,
        processed_at = null,
        error = null,
        event_type = coalesce(p_event_type, event_type),
        ordine_id = coalesce(p_ordine_id, ordine_id),
        negozio_id = coalesce(p_negozio_id, negozio_id),
        payment_id = coalesce(nullif(btrim(coalesce(p_payment_id, '')), ''), payment_id),
        payload = coalesce(p_payload, payload)
    where id = v_event.id
    returning * into v_event;
    v_acquired := true;
  end if;

  return jsonb_build_object(
    'ok', true, 'acquired', v_acquired, 'terminal', false, 'in_corso', false,
    'stato', 'processing', 'event_id', v_event.event_id,
    'attempts', v_event.attempts
  );
end;
$$;

-- Finalizes only the currently acquired attempt. A successful finalization is
-- the only path that sets processed/processed_at. Failures remain retryable.
create or replace function public.pagamenti_evento_finalizza(
  p_event_id text,
  p_success boolean,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event record;
  v_status text;
begin
  if p_event_id is null or length(btrim(p_event_id)) = 0 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Event ID non valido.');
  end if;

  select * into v_event
  from public.pagamenti_eventi
  where event_id = btrim(p_event_id)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'codice', 'EVENT_NOT_FOUND', 'messaggio', 'Evento non trovato.');
  end if;

  if v_event.status = 'processed' then
    return jsonb_build_object('ok', true, 'stato', 'processed', 'already_processed', true);
  end if;

  if v_event.status <> 'processing' then
    return jsonb_build_object('ok', false, 'codice', 'EVENT_NOT_PROCESSING', 'stato', v_event.status);
  end if;

  v_status := case when p_success then 'processed' else 'error' end;
  update public.pagamenti_eventi
  set status = v_status,
      processing_at = null,
      processed_at = case when p_success then now() else null end,
      error = case when p_success then null else left(coalesce(p_error, 'elaborazione fallita'), 2000) end
  where id = v_event.id;

  return jsonb_build_object('ok', true, 'stato', v_status, 'event_id', v_event.event_id);
end;
$$;

revoke execute on function public.pagamenti_evento_acquisisci(text, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.pagamenti_evento_acquisisci(text, text, uuid, uuid, text, jsonb) to service_role;

revoke execute on function public.pagamenti_evento_finalizza(text, boolean, text) from public, anon, authenticated;
grant execute on function public.pagamenti_evento_finalizza(text, boolean, text) to service_role;

notify pgrst, 'reload schema';
commit;
