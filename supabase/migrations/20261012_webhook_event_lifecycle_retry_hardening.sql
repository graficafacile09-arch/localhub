-- InCittà — FASE 10 BLOCCO 3, STEP 1
-- WEBHOOK STRIPE: EVENT LIFECYCLE + RETRY HARDENING
--
-- Additive/idempotent hardening of the existing pagamenti_eventi lifecycle.
-- No table, order, catalog, payment provider, refund or webhook payload is
-- changed. Existing rows are preserved.
--
-- Lifecycle:
--   new row: received (attempts=0) -> processing (attempts=1)
--   processed: terminal duplicate/no-op
--   received/error: retryable
--   processing with a fresh lease: in progress/no-op
--   processing with an expired lease: retryable recovery
--
-- p_attempt protects finalization: a worker that lost a stale lease cannot
-- finalize a newer attempt for the same event_id.

begin;

-- The previous RPC had a three-argument finalizer. Replace it with a
-- four-argument version carrying the attempt number; the fourth argument is
-- required so every application caller participates in lease protection.
drop function if exists public.pagamenti_evento_finalizza(text, boolean, text);

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
  v_now timestamptz := now();
  v_previous_status text;
begin
  if p_event_id is null or length(btrim(p_event_id)) = 0 then
    return jsonb_build_object(
      'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'VALIDATION_ERROR',
      'messaggio', 'Event ID non valido.'
    );
  end if;

  select * into v_event
  from public.pagamenti_eventi
  where event_id = btrim(p_event_id)
  for update;

  if not found then
    -- Persist the event first in its received state, then claim the first
    -- attempt in the same transaction. No second row can be created because
    -- event_id remains protected by the existing UNIQUE constraint.
    insert into public.pagamenti_eventi (
      provider, event_id, event_type, ordine_id, negozio_id, payment_id,
      payload, status, attempts, received_at, processing_at, processed_at, error
    ) values (
      'stripe', btrim(p_event_id), p_event_type, p_ordine_id, p_negozio_id,
      nullif(btrim(coalesce(p_payment_id, '')), ''), p_payload, 'received', 0,
      v_now, null, null, null
    )
    on conflict (event_id) do nothing
    returning * into v_event;

    if found then
      v_previous_status := 'received';
      update public.pagamenti_eventi
      set status = 'processing',
          attempts = 1,
          processing_at = v_now,
          error = null
      where id = v_event.id
      returning * into v_event;

      if not found then
        return jsonb_build_object(
          'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'ACQUIRE_FAILED',
          'messaggio', 'Impossibile acquisire il nuovo evento.'
        );
      end if;

      return jsonb_build_object(
        'ok', true, 'esito', 'NEW_EVENT', 'acquired', true,
        'terminal', false, 'in_corso', false, 'stato', 'processing',
        'stato_iniziale', v_previous_status, 'event_id', v_event.event_id,
        'attempts', v_event.attempts
      );
    end if;

    -- A concurrent insert won the unique event_id race. Lock and inspect its
    -- committed state before deciding whether this request may retry it.
    select * into v_event
    from public.pagamenti_eventi
    where event_id = btrim(p_event_id)
    for update;
    if not found then
      return jsonb_build_object(
        'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'EVENT_NOT_FOUND',
        'messaggio', 'Evento non trovato dopo la concorrenza di inserimento.'
      );
    end if;
  end if;

  if v_event.status = 'processed' then
    return jsonb_build_object(
      'ok', true, 'esito', 'DUPLICATE_PROCESSED', 'acquired', false,
      'terminal', true, 'in_corso', false, 'stato', 'processed',
      'event_id', v_event.event_id, 'attempts', coalesce(v_event.attempts, 0)
    );
  end if;

  if v_event.status = 'processing'
     and v_event.processing_at is not null
     and v_event.processing_at > v_now - interval '10 minutes' then
    return jsonb_build_object(
      'ok', true, 'esito', 'IN_PROGRESS', 'acquired', false,
      'terminal', false, 'in_corso', true, 'stato', 'processing',
      'event_id', v_event.event_id, 'attempts', coalesce(v_event.attempts, 0)
    );
  end if;

  -- received, error and stale processing are all retryable. The increment
  -- and lease claim happen in one locked UPDATE.
  v_previous_status := coalesce(v_event.status, 'received');
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

  if not found then
    return jsonb_build_object(
      'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'ACQUIRE_FAILED',
      'messaggio', 'Impossibile acquisire il retry dell''evento.'
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'esito', 'RETRYABLE_EXISTING', 'acquired', true,
    'terminal', false, 'in_corso', false, 'stato', 'processing',
    'stato_precedente', v_previous_status, 'event_id', v_event.event_id,
    'attempts', v_event.attempts
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'ACQUIRE_FAILED',
      'messaggio', 'Impossibile acquisire l''evento.'
    );
end;
$$;

create or replace function public.pagamenti_evento_finalizza(
  p_event_id text,
  p_success boolean,
  p_error text,
  p_attempt integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event record;
  v_status text;
  v_aggiornate integer;
begin
  if p_event_id is null or length(btrim(p_event_id)) = 0 or p_attempt is null or p_attempt < 1 then
    return jsonb_build_object(
      'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'VALIDATION_ERROR',
      'messaggio', 'Event ID o tentativo non valido.'
    );
  end if;

  select * into v_event
  from public.pagamenti_eventi
  where event_id = btrim(p_event_id)
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'EVENT_NOT_FOUND',
      'messaggio', 'Evento non trovato.'
    );
  end if;

  if v_event.status = 'processed' then
    return jsonb_build_object(
      'ok', true, 'esito', 'DUPLICATE_PROCESSED', 'stato', 'processed',
      'already_processed', true, 'event_id', v_event.event_id
    );
  end if;

  if v_event.status <> 'processing' then
    return jsonb_build_object(
      'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'EVENT_NOT_PROCESSING',
      'stato', v_event.status
    );
  end if;

  if v_event.attempts <> p_attempt then
    return jsonb_build_object(
      'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'ATTEMPT_NOT_CURRENT',
      'stato', v_event.status, 'attempts', v_event.attempts
    );
  end if;

  v_status := case when p_success then 'processed' else 'error' end;
  update public.pagamenti_eventi
  set status = v_status,
      processing_at = null,
      processed_at = case when p_success then now() else null end,
      error = case when p_success then null else left(coalesce(p_error, 'elaborazione fallita'), 2000) end
  where id = v_event.id
    and status = 'processing'
    and attempts = p_attempt;

  get diagnostics v_aggiornate = row_count;
  if v_aggiornate <> 1 then
    return jsonb_build_object(
      'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'FINALIZE_NOT_CONFIRMED',
      'messaggio', 'Aggiornamento stato evento non confermato.'
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'esito', case when p_success then 'PROCESSED' else 'RETRYABLE_ERROR' end,
    'stato', v_status, 'event_id', v_event.event_id, 'attempts', p_attempt
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false, 'esito', 'DATABASE_ERROR', 'codice', 'FINALIZE_FAILED',
      'messaggio', 'Impossibile finalizzare l''evento.'
    );
end;
$$;

revoke execute on function public.pagamenti_evento_acquisisci(text, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.pagamenti_evento_acquisisci(text, text, uuid, uuid, text, jsonb) to service_role;

revoke execute on function public.pagamenti_evento_finalizza(text, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.pagamenti_evento_finalizza(text, boolean, text, integer) to service_role;

notify pgrst, 'reload schema';
commit;
