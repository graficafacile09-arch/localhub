-- InCittà — FASE 10 BLOCCO 3 / STEP 4
-- HARDENING REFUND OPERATIONS STRIPE
--
-- Additive, idempotent hardening of the existing 3D finalizer.
-- No tables or data are changed here. The RPC keeps the existing operation
-- statuses and atomic order-locking model.
--
-- Important invariant: a non-succeeded operation must never be marked
-- succeeded merely because Stripe sent a stale/lower cumulative amount. The
-- cumulative finalizer may legitimately return an idempotent no-op, but that
-- no-op is only terminal for an operation that was already represented. For a
-- pending/retryable operation it means reconciliation is still required.

begin;

create unique index if not exists pagamenti_rimborso_operazioni_refund_id_unq
  on public.pagamenti_rimborso_operazioni (refund_id)
  where refund_id is not null;

create or replace function public.pagamenti_webhook_rimborso_operazione_finalizza(
  p_ordine_id uuid,
  p_negozio_id uuid,
  p_payment_intent text,
  p_operation_id uuid,
  p_refund_id text,
  p_refund_amount numeric,
  p_amount_refunded numeric,
  p_amount_captured numeric default null,
  p_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordine record;
  v_operazione record;
  v_conflitto record;
  v_accounting_result jsonb;
  v_accounting numeric;
  v_cambiato boolean;
  v_updated_id uuid;
begin
  if p_ordine_id is null
     or p_negozio_id is null
     or p_payment_intent is null
     or length(btrim(p_payment_intent)) = 0
     or p_operation_id is null
     or p_refund_id is null
     or length(btrim(p_refund_id)) = 0
     or p_refund_amount is null
     or p_refund_amount <= 0
     or p_refund_amount <> round(p_refund_amount, 2)
     or p_amount_refunded is null
     or p_amount_refunded < 0
     or p_amount_refunded <> round(p_amount_refunded, 2)
     or p_currency is null
     or length(btrim(p_currency)) = 0 then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_VALIDATION_ERROR',
      'messaggio', 'Dati refund operation non validi.'
    );
  end if;

  if p_amount_captured is not null
     and (p_amount_captured < 0 or p_amount_captured <> round(p_amount_captured, 2)) then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_VALIDATION_ERROR',
      'messaggio', 'Importo catturato Stripe non valido.'
    );
  end if;

  -- The verified webhook has already checked event.account and the Stripe
  -- merchant binding. The RPC independently rechecks the order/payment
  -- binding before changing accounting, so a service-role caller cannot move
  -- a refund operation to another order or provider.
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;
  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;
  if v_ordine.negozio_id <> p_negozio_id then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_BINDING_MISMATCH', 'messaggio', 'Merchant refund diverso dall''ordine.');
  end if;
  if v_ordine.payment_provider <> 'stripe' then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_PROVIDER_MISMATCH', 'messaggio', 'Il provider dell''ordine non è Stripe.');
  end if;
  if v_ordine.payment_transaction_id is null
     or btrim(v_ordine.payment_transaction_id) <> btrim(p_payment_intent) then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_PAYMENTINTENT_MISMATCH', 'messaggio', 'Il PaymentIntent non corrisponde all''ordine.');
  end if;
  if upper(btrim(p_currency)) <> 'EUR'
     or v_ordine.payment_currency is null
     or upper(btrim(v_ordine.payment_currency)) <> upper(btrim(p_currency)) then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_CURRENCY_MISMATCH', 'messaggio', 'La valuta del refund non corrisponde al pagamento.');
  end if;
  if v_ordine.payment_amount is null
     or v_ordine.payment_amount <= 0
     or p_amount_refunded > v_ordine.payment_amount
     or p_refund_amount > v_ordine.payment_amount then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_AMOUNT_INVALID', 'messaggio', 'Il refund supera l''importo pagato.');
  end if;
  if p_amount_captured is not null
     and (p_amount_captured > v_ordine.payment_amount or p_amount_refunded > p_amount_captured) then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_AMOUNT_INVALID', 'messaggio', 'Il refund supera l''importo catturato.');
  end if;
  if p_refund_amount > p_amount_refunded then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_AMOUNT_INVALID', 'messaggio', 'Il refund individuale supera il cumulativo Stripe.');
  end if;

  -- Fixed lock order: order first, operation second, matching the existing 3C
  -- finalizer and preventing concurrent accounting deadlocks.
  select * into v_operazione
  from public.pagamenti_rimborso_operazioni
  where id = p_operation_id
  for update;
  if v_operazione.id is null then
    return jsonb_build_object('ok', false, 'codice', 'OPERATION_NOT_FOUND', 'messaggio', 'Refund operation non trovata.');
  end if;
  if v_operazione.ordine_id <> p_ordine_id
     or v_operazione.provider <> 'stripe' then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_OPERATION_BINDING_MISMATCH', 'messaggio', 'La refund operation non appartiene all''ordine Stripe.');
  end if;
  if v_operazione.importo <> p_refund_amount then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_OPERATION_AMOUNT_MISMATCH', 'messaggio', 'L''importo Refund non corrisponde all''operation.');
  end if;
  if v_operazione.refund_id is not null
     and btrim(v_operazione.refund_id) <> btrim(p_refund_id) then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_ID_MISMATCH', 'messaggio', 'Il Refund ID è già associato a un altro refund.');
  end if;

  -- A Stripe Refund ID can belong to one operation only, including another
  -- order. The unique index is the final database guard; this explicit check
  -- gives the caller a deterministic business result before the write.
  select * into v_conflitto
  from public.pagamenti_rimborso_operazioni
  where refund_id = btrim(p_refund_id)
    and id <> p_operation_id;
  if v_conflitto.id is not null then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_ID_CONFLICT', 'messaggio', 'Il Refund ID è già associato a un''altra operation.');
  end if;

  if v_operazione.stato = 'succeeded' then
    v_accounting := coalesce(v_ordine.payment_refunded_amount, 0);
    if v_accounting < v_operazione.importo then
      return jsonb_build_object('ok', false, 'codice', 'REFUND_ACCOUNTING_INCONSISTENT', 'messaggio', 'Operation succeeded senza accounting sufficiente.');
    end if;
    return jsonb_build_object(
      'ok', true, 'cambiato', false, 'duplicate', true,
      'stato', 'succeeded', 'operazione_id', v_operazione.id,
      'ordine_id', v_ordine.id, 'refund_id', btrim(p_refund_id),
      'payment_status', v_ordine.payment_status,
      'payment_refunded_amount', v_accounting,
      'payment_transaction_id', v_ordine.payment_transaction_id,
      'residuo', round((v_ordine.payment_amount - v_accounting)::numeric, 2)
    );
  end if;
  if v_operazione.stato not in ('pending', 'processing', 'failed', 'reconciliation_required') then
    return jsonb_build_object('ok', false, 'codice', 'REFUND_OPERATION_STATE_INVALID', 'messaggio', 'Stato refund operation non riconciliabile.');
  end if;

  -- 3C locks the order and applies only a strictly larger cumulative amount.
  -- Its successful no-op is not enough to complete a pending operation: if no
  -- accounting changed, this operation may be represented by a stale/lower
  -- delivery and must remain retryable/reconciliation_required.
  select public.pagamenti_webhook_rimborso_finalizza(
    p_ordine_id,
    p_negozio_id,
    p_payment_intent,
    p_refund_id,
    p_amount_refunded,
    p_amount_captured,
    p_currency
  ) into v_accounting_result;

  if coalesce((v_accounting_result->>'ok')::boolean, false) is not true then
    return v_accounting_result;
  end if;

  v_cambiato := coalesce((v_accounting_result->>'cambiato')::boolean, false);
  if not v_cambiato then
    return jsonb_build_object(
      'ok', false,
      'stato', 'reconciliation_required',
      'codice', 'REFUND_CUMULATIVE_STALE',
      'messaggio', 'Il cumulativo Stripe non è superiore all''accounting locale; operation non finalizzata.',
      'operazione_id', v_operazione.id,
      'refund_id', btrim(p_refund_id),
      'payment_refunded_amount', coalesce(v_accounting_result->>'payment_refunded_amount', v_ordine.payment_refunded_amount::text)
    );
  end if;

  -- The current operation must be represented by the new cumulative value.
  -- This is an explicit guard against double accounting and synthetic full
  -- refunds; the individual Refund amount remains the operation amount.
  if coalesce((v_accounting_result->>'payment_refunded_amount')::numeric, 0) < p_refund_amount then
    return jsonb_build_object(
      'ok', false,
      'stato', 'reconciliation_required',
      'codice', 'REFUND_ACCOUNTING_INCONSISTENT',
      'messaggio', 'Accounting cumulativo insufficiente per la refund operation.'
    );
  end if;

  update public.pagamenti_rimborso_operazioni
  set stato = 'succeeded',
      refund_id = btrim(p_refund_id),
      lease_until = null,
      succeeded_at = coalesce(succeeded_at, now()),
      updated_at = now(),
      errore_codice = null,
      errore_dettaglio = null
  where id = p_operation_id
    and stato in ('pending', 'processing', 'failed', 'reconciliation_required')
  returning id into v_updated_id;

  if v_updated_id is null then
    return jsonb_build_object(
      'ok', false,
      'codice', 'OPERATION_FINALIZE_NOT_CONFIRMED',
      'messaggio', 'La finalizzazione della refund operation non è stata confermata.'
    );
  end if;

  return v_accounting_result || jsonb_build_object(
    'operation_id', p_operation_id,
    'operation_state', 'succeeded',
    'refund_id', btrim(p_refund_id),
    'refund_amount', p_refund_amount
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_ID_CONFLICT',
      'messaggio', 'Il Refund ID è già associato a un''altra operation.'
    );
  when others then
    return jsonb_build_object(
      'ok', false,
      'codice', 'SAVE_FAILED',
      'messaggio', 'Impossibile finalizzare atomicamente la refund operation.'
    );
end;
$$;

revoke execute on function public.pagamenti_webhook_rimborso_operazione_finalizza(uuid, uuid, text, uuid, text, numeric, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.pagamenti_webhook_rimborso_operazione_finalizza(uuid, uuid, text, uuid, text, numeric, numeric, numeric, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
