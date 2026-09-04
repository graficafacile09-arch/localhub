-- InCitta — FASE 10 BLOCCO 3D: STRIPE REFUND ↔ REFUND OPERATION
--
-- Extends the already atomic 3C finalizer without changing its invariants.
-- The operation and cumulative order accounting are committed in one
-- transaction. No operation is created for an external Stripe refund.

begin;

-- A Stripe Refund can finalize at most one local operation, regardless of
-- webhook event ID or delivery order.
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

  -- Lock order first, matching the 3C lock order and serializing all
  -- cumulative accounting updates for this payment.
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

  -- The order lock is acquired first, matching 3C and the existing durable
  -- completion RPC. This fixed lock order prevents webhook/provider races
  -- from deadlocking while serializing cumulative accounting.
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

  -- A Stripe Refund ID may belong to only one local operation, including
  -- operations on another order. This prevents cross-order replay.
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

  -- 3C owns cumulative accounting and the payment-state transition. Calling
  -- it inside this function keeps its order lock and this operation update in
  -- the same PostgreSQL transaction.
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

  update public.pagamenti_rimborso_operazioni
  set stato = 'succeeded',
      refund_id = btrim(p_refund_id),
      lease_until = null,
      succeeded_at = coalesce(succeeded_at, now()),
      updated_at = now(),
      errore_codice = null,
      errore_dettaglio = null
  where id = p_operation_id;

  return v_accounting_result || jsonb_build_object(
    'operation_id', p_operation_id,
    'operation_state', 'succeeded',
    'refund_id', btrim(p_refund_id),
    'refund_amount', p_refund_amount
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile finalizzare atomicamente la refund operation.');
end;
$$;

revoke execute on function public.pagamenti_webhook_rimborso_operazione_finalizza(uuid, uuid, text, uuid, text, numeric, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.pagamenti_webhook_rimborso_operazione_finalizza(uuid, uuid, text, uuid, text, numeric, numeric, numeric, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
