-- InCittà — FASE 10 BLOCCO 2: OPERAZIONI REFUND DUREVOLI
--
-- Una refund operation è la fonte durevole dell'idempotenza applicativa.
-- La reservation vive in questa tabella; ordini.payment_refunded_amount viene
-- aggiornato solo dopo la conferma di un refund effettivamente riuscito.
-- Nessuna chiamata provider viene eseguita in PostgreSQL.

begin;

create table if not exists public.pagamenti_rimborso_operazioni (
  id                 uuid primary key default gen_random_uuid(),
  ordine_id          uuid not null references public.ordini(id) on delete cascade,
  importo            numeric(10, 2) not null,
  provider           text not null,
  idempotency_key    text not null unique,
  stato              text not null default 'pending',
  refund_id          text,
  attempts           integer not null default 0,
  errore_codice      text,
  errore_dettaglio   text,
  lease_until        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  succeeded_at       timestamptz,
  failed_at          timestamptz,
  constraint pagamenti_rimborso_operazioni_importo_ck check (importo > 0),
  constraint pagamenti_rimborso_operazioni_stato_ck check (
    stato in ('pending', 'processing', 'succeeded', 'failed', 'reconciliation_required')
  )
);

create index if not exists pagamenti_rimborso_operazioni_ordine_idx
  on public.pagamenti_rimborso_operazioni (ordine_id, created_at desc);
create index if not exists pagamenti_rimborso_operazioni_stato_idx
  on public.pagamenti_rimborso_operazioni (stato, lease_until);
-- Una sola operation non conclusa può prenotare lo stesso importo di uno
-- stesso ordine. Un errore provider definitivo è retryabile; processing e
-- reconciliation_required restano invece riserve attive.
create unique index if not exists pagamenti_rimborso_operazioni_ordine_importo_attivo_unq
  on public.pagamenti_rimborso_operazioni (ordine_id, importo)
  where stato in ('pending', 'processing', 'reconciliation_required');

alter table public.pagamenti_rimborso_operazioni enable row level security;
revoke all on table public.pagamenti_rimborso_operazioni from public, anon, authenticated;
grant all on table public.pagamenti_rimborso_operazioni to service_role;

-- Prepara o recupera una operation. Il lock dell'ordine serializza la
-- reservation con ogni altra operation sul medesimo ordine.
create or replace function public.pagamenti_rimborso_operazione_prepara(
  p_ordine_id uuid,
  p_importo numeric,
  p_merchant_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordine record;
  v_operazione record;
  v_residuo numeric;
  v_prenotato numeric;
  v_stato_nuovo text;
begin
  if p_ordine_id is null or p_importo is null or p_importo <= 0
     or p_importo <> round(p_importo, 2)
     or p_merchant_user_id is null
     or p_idempotency_key is null
     or length(btrim(p_idempotency_key)) = 0
     or length(btrim(p_idempotency_key)) > 128 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Parametri refund non validi.');
  end if;

  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  if not exists (
    select 1 from public.negozi n
    where n.id = v_ordine.negozio_id
      and n.owner_user_id = p_merchant_user_id
  ) and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_merchant_user_id
      and ur.role = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questo ordine.');
  end if;

  -- La stessa chiave identifica sempre la stessa operation.
  select * into v_operazione
  from public.pagamenti_rimborso_operazioni
  where idempotency_key = btrim(p_idempotency_key)
  for update;

  if v_operazione.id is not null then
    if v_operazione.ordine_id <> p_ordine_id or v_operazione.importo <> p_importo then
      return jsonb_build_object('ok', false, 'codice', 'IDEMPOTENCY_CONFLICT', 'messaggio', 'La chiave identifica un rimborso diverso.');
    end if;
    return jsonb_build_object(
      'ok', true, 'esistente', true, 'operazione_id', v_operazione.id,
      'ordine_id', v_operazione.ordine_id, 'provider', v_operazione.provider,
      'payment_id', v_ordine.payment_id, 'idempotency_key', v_operazione.idempotency_key, 'importo_richiesto', v_operazione.importo,
      'stato', v_operazione.stato, 'refund_id', v_operazione.refund_id,
      'payment_status', v_ordine.payment_status,
      'payment_refunded_amount', v_ordine.payment_refunded_amount,
      'residuo', round((coalesce(v_ordine.payment_amount, 0)
        - coalesce(v_ordine.payment_refunded_amount, 0))::numeric, 2)
    );
  end if;

  if v_ordine.payment_status is null
     or v_ordine.payment_status not in ('paid', 'partially_refunded') then
    return jsonb_build_object('ok', false, 'codice', 'RIMBORSO_NON_CONSENTITO', 'messaggio', 'L''ordine non è in uno stato rimborsabile.');
  end if;
  if v_ordine.payment_provider is null
     or v_ordine.payment_provider not in ('stripe', 'paypal', 'klarna', 'scalapay')
     or v_ordine.payment_id is null or length(btrim(v_ordine.payment_id)) = 0 then
    return jsonb_build_object('ok', false, 'codice', 'PAGAMENTO_NON_RIMBORSABILE', 'messaggio', 'Nessun pagamento gateway rimborsabile su questo ordine.');
  end if;

  -- Dopo il lock dell'ordine, due chiavi diverse per lo stesso importo devono
  -- convergere sulla stessa operation già attiva, senza una seconda reservation.
  select * into v_operazione
  from public.pagamenti_rimborso_operazioni
  where ordine_id = p_ordine_id
    and importo = p_importo
    and stato in ('pending', 'processing', 'reconciliation_required')
  order by created_at asc
  limit 1
  for update;
  if v_operazione.id is not null then
    return jsonb_build_object(
      'ok', true, 'esistente', true, 'operazione_id', v_operazione.id,
      'ordine_id', v_operazione.ordine_id, 'provider', v_operazione.provider,
      'payment_id', v_ordine.payment_id, 'idempotency_key', v_operazione.idempotency_key,
      'importo_richiesto', v_operazione.importo, 'stato', v_operazione.stato,
      'refund_id', v_operazione.refund_id, 'payment_status', v_ordine.payment_status,
      'payment_refunded_amount', v_ordine.payment_refunded_amount,
      'residuo', round((coalesce(v_ordine.payment_amount, 0)
        - coalesce(v_ordine.payment_refunded_amount, 0))::numeric, 2)
    );
  end if;

  v_prenotato := coalesce((select sum(o.importo)
    from public.pagamenti_rimborso_operazioni o
    where o.ordine_id = p_ordine_id
      and o.stato in ('pending', 'processing', 'reconciliation_required')), 0);
  v_residuo := coalesce(v_ordine.payment_amount, 0)
    - coalesce(v_ordine.payment_refunded_amount, 0) - v_prenotato;
  if v_residuo <= 0 then
    return jsonb_build_object('ok', false, 'codice', 'NON_REFUNDABLE', 'messaggio', 'Nessun importo residuo da rimborsare.');
  end if;
  if p_importo > v_residuo then
    return jsonb_build_object('ok', false, 'codice', 'OVER_REFUND', 'messaggio', 'L''importo supera il residuo rimborsabile.');
  end if;

  -- La unique key ordine/importo gestisce anche due chiavi diverse arrivate
  -- contemporaneamente: entrambe le richieste recuperano la stessa operation.
  insert into public.pagamenti_rimborso_operazioni (
    ordine_id, importo, provider, idempotency_key, stato
  ) values (
    p_ordine_id, p_importo, v_ordine.payment_provider, btrim(p_idempotency_key), 'pending'
  )
  returning * into v_operazione;

  v_stato_nuovo := case
    when p_importo >= coalesce(v_ordine.payment_amount, 0) - coalesce(v_ordine.payment_refunded_amount, 0)
      then 'refunded'
    else 'partially_refunded'
  end;

  return jsonb_build_object(
    'ok', true, 'esistente', false, 'operazione_id', v_operazione.id,
    'ordine_id', p_ordine_id, 'provider', v_ordine.payment_provider,
    'payment_id', v_ordine.payment_id, 'idempotency_key', v_operazione.idempotency_key, 'payment_amount', v_ordine.payment_amount,
    'payment_refunded_amount', v_ordine.payment_refunded_amount,
    'importo_richiesto', p_importo, 'residuo', round((v_residuo - p_importo)::numeric, 2),
    'stato_nuovo', v_stato_nuovo, 'stato', 'pending', 'refund_id', null
  );
exception
  when unique_violation then
    select * into v_operazione
    from public.pagamenti_rimborso_operazioni
    where ordine_id = p_ordine_id and importo = p_importo
      and stato in ('pending', 'processing', 'reconciliation_required')
    order by created_at asc
    limit 1;
    if v_operazione.id is not null then
      return jsonb_build_object(
        'ok', true, 'esistente', true, 'operazione_id', v_operazione.id,
        'ordine_id', v_operazione.ordine_id, 'provider', v_operazione.provider,
        'payment_id', v_ordine.payment_id, 'idempotency_key', v_operazione.idempotency_key, 'importo_richiesto', v_operazione.importo,
        'stato', v_operazione.stato, 'refund_id', v_operazione.refund_id,
        'payment_status', v_ordine.payment_status,
        'payment_refunded_amount', v_ordine.payment_refunded_amount,
        'residuo', round((coalesce(v_ordine.payment_amount, 0)
          - coalesce(v_ordine.payment_refunded_amount, 0))::numeric, 2)
      );
    end if;
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile creare l''operazione di rimborso.');
end;
$$;

-- Claim atomico: una sola richiesta può eseguire il provider. Un lease scaduto
-- diventa reconciliation_required, mai automaticamente un nuovo refund cieco.
create or replace function public.pagamenti_rimborso_operazione_claim(p_operazione_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_op record;
  v_order record;
begin
  select * into v_op from public.pagamenti_rimborso_operazioni where id = p_operazione_id for update;
  if v_op.id is null then
    return jsonb_build_object('ok', false, 'codice', 'OPERATION_NOT_FOUND');
  end if;
  if v_op.stato = 'succeeded' then
    return jsonb_build_object('ok', true, 'claimed', false, 'stato', v_op.stato, 'operazione_id', v_op.id, 'refund_id', v_op.refund_id);
  end if;
  if v_op.stato = 'processing' and v_op.lease_until is not null and v_op.lease_until > now() then
    return jsonb_build_object('ok', true, 'claimed', false, 'stato', 'processing', 'operazione_id', v_op.id);
  end if;

  select * into v_order from public.ordini where id = v_op.ordine_id;
  update public.pagamenti_rimborso_operazioni
  set stato = 'processing', attempts = attempts + 1,
      lease_until = now() + interval '10 minutes',
      submitted_at = coalesce(submitted_at, now()), updated_at = now(),
      errore_codice = null, errore_dettaglio = null
  where id = v_op.id;
  return jsonb_build_object(
    'ok', true, 'claimed', true, 'stato', 'processing', 'operazione_id', v_op.id,
    'ordine_id', v_op.ordine_id, 'provider', v_op.provider,
    'payment_id', v_order.payment_id, 'idempotency_key', v_op.idempotency_key, 'importo_richiesto', v_op.importo,
    'refund_id', v_op.refund_id
  );
end;
$$;

create or replace function public.pagamenti_rimborso_operazione_fallita(
  p_operazione_id uuid,
  p_stato text,
  p_codice text,
  p_dettaglio text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_op record;
begin
  if p_stato not in ('failed', 'reconciliation_required') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR');
  end if;
  select * into v_op from public.pagamenti_rimborso_operazioni where id = p_operazione_id for update;
  if v_op.id is null then return jsonb_build_object('ok', false, 'codice', 'OPERATION_NOT_FOUND'); end if;
  if v_op.stato = 'succeeded' then
    return jsonb_build_object('ok', true, 'stato', 'succeeded', 'refund_id', v_op.refund_id);
  end if;
  update public.pagamenti_rimborso_operazioni
  set stato = p_stato, errore_codice = left(p_codice, 100),
      errore_dettaglio = left(p_dettaglio, 1000), lease_until = null,
      failed_at = case when p_stato = 'failed' then now() else failed_at end,
      updated_at = now()
  where id = p_operazione_id;
  return jsonb_build_object('ok', true, 'stato', p_stato, 'operazione_id', p_operazione_id);
end;
$$;

-- Completa in modo atomico operation + payment_refunded_amount + payment_status.
-- Se l'aggiornamento dello stato non è possibile, conserva refund_id e marca
-- l'operation come reconciliation_required senza fingere un refund DB completo.
create or replace function public.pagamenti_rimborso_operazione_completa(
  p_operazione_id uuid,
  p_refund_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_op record;
  v_order record;
  v_esito jsonb;
  v_stato_nuovo text;
  v_residuo numeric;
begin
  select * into v_op from public.pagamenti_rimborso_operazioni where id = p_operazione_id for update;
  if v_op.id is null then return jsonb_build_object('ok', false, 'codice', 'OPERATION_NOT_FOUND'); end if;
  if v_op.stato = 'succeeded' then
    return jsonb_build_object('ok', true, 'stato', 'succeeded', 'operazione_id', v_op.id, 'refund_id', v_op.refund_id);
  end if;
  if p_refund_id is null or length(btrim(p_refund_id)) = 0 then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_ID_MANCANTE');
  end if;

  select * into v_order from public.ordini where id = v_op.ordine_id for update;
  if v_order.id is null then return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO'); end if;
  v_residuo := coalesce(v_order.payment_amount, 0) - coalesce(v_order.payment_refunded_amount, 0);
  if v_op.importo > v_residuo then
    update public.pagamenti_rimborso_operazioni
    set stato = 'reconciliation_required', refund_id = btrim(p_refund_id),
        errore_codice = 'OVER_REFUND_DB', errore_dettaglio = 'Il refund provider supera il residuo DB.',
        lease_until = null, updated_at = now()
    where id = v_op.id;
    return jsonb_build_object('ok', false, 'stato', 'reconciliation_required', 'refund_id', p_refund_id);
  end if;

  v_stato_nuovo := case when v_op.importo >= v_residuo then 'refunded' else 'partially_refunded' end;
  select public.aggiorna_payment_status(v_op.ordine_id, v_stato_nuovo, null, null, null, null, null) into v_esito;
  if coalesce((v_esito->>'ok')::boolean, false) is not true then
    update public.pagamenti_rimborso_operazioni
    set stato = 'reconciliation_required', refund_id = btrim(p_refund_id),
        errore_codice = coalesce(v_esito->>'codice', 'STATE_NOT_UPDATED'),
        errore_dettaglio = left(coalesce(v_esito->>'messaggio', 'Stato pagamento non aggiornato.'), 1000),
        lease_until = null, updated_at = now()
    where id = v_op.id;
    return jsonb_build_object('ok', false, 'stato', 'reconciliation_required', 'refund_id', p_refund_id);
  end if;

  update public.ordini
  set payment_refunded_amount = round((coalesce(payment_refunded_amount, 0) + v_op.importo)::numeric, 2),
      payment_refunded_at = now(), updated_at = now()
  where id = v_op.ordine_id;
  update public.pagamenti_rimborso_operazioni
  set stato = 'succeeded', refund_id = btrim(p_refund_id), lease_until = null,
      succeeded_at = now(), updated_at = now(), errore_codice = null, errore_dettaglio = null
  where id = v_op.id;
  return jsonb_build_object(
    'ok', true, 'stato', 'succeeded', 'operazione_id', v_op.id,
    'ordine_id', v_op.ordine_id, 'importo_rimborsato', v_op.importo,
    'refund_id', btrim(p_refund_id),
    'payment_status', v_stato_nuovo,
    'residuo', round((v_residuo - v_op.importo)::numeric, 2)
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'stato', 'reconciliation_required', 'codice', 'STATE_NOT_UPDATED');
end;
$$;

revoke execute on function public.pagamenti_rimborso_operazione_prepara(uuid, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.pagamenti_rimborso_operazione_prepara(uuid, numeric, uuid, text) to service_role;
revoke execute on function public.pagamenti_rimborso_operazione_claim(uuid) from public, anon, authenticated;
grant execute on function public.pagamenti_rimborso_operazione_claim(uuid) to service_role;
revoke execute on function public.pagamenti_rimborso_operazione_fallita(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.pagamenti_rimborso_operazione_fallita(uuid, text, text, text) to service_role;
revoke execute on function public.pagamenti_rimborso_operazione_completa(uuid, text) from public, anon, authenticated;
grant execute on function public.pagamenti_rimborso_operazione_completa(uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
