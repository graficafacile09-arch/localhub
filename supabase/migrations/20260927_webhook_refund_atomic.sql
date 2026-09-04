-- InCittà — FASE 10 BLOCCO 3C: FINALIZZAZIONE ATOMICA REFUND WEBHOOK
--
-- Finalizes cumulative Stripe refunds in one locked database operation.
-- This migration intentionally does not integrate refund operations from Block 2.

begin;

create or replace function public.pagamenti_webhook_rimborso_finalizza(
  p_ordine_id uuid,
  p_negozio_id uuid,
  p_payment_intent text,
  p_charge_id text,
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
  v_sessione record;
  v_sessioni_count integer;
  v_pagato numeric;
  v_rimborsato numeric;
  v_stato_nuovo text;
  v_currency text;
begin
  -- Identifiers remain distinct: charge_id is accepted for event validation and
  -- diagnostics, while payment_transaction_id remains the PaymentIntent.
  if p_ordine_id is null
     or p_negozio_id is null
     or p_payment_intent is null
     or length(btrim(p_payment_intent)) = 0
     or p_charge_id is null
     or length(btrim(p_charge_id)) = 0
     or p_amount_refunded is null
     or p_amount_refunded < 0
     or p_amount_refunded <> round(p_amount_refunded, 2)
     or p_currency is null
     or length(btrim(p_currency)) = 0 then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_VALIDATION_ERROR',
      'messaggio', 'Dati refund Stripe non validi.'
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

  -- The order lock serializes all refund webhook finalizations for this order.
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object(
      'ok', false,
      'codice', 'ORDINE_NON_TROVATO',
      'messaggio', 'Ordine non trovato.'
    );
  end if;

  -- Merchant and provider binding: the merchant resolved from the verified
  -- Stripe signature must own the order, and the order must be Stripe-backed.
  if v_ordine.negozio_id <> p_negozio_id then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_BINDING_MISMATCH',
      'messaggio', 'Il refund non appartiene al negozio dell''ordine.'
    );
  end if;
  if v_ordine.payment_provider <> 'stripe' then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_PROVIDER_MISMATCH',
      'messaggio', 'Il provider dell''ordine non è Stripe.'
    );
  end if;

  -- PaymentIntent is the only payment transaction identifier accepted here.
  -- Checkout Session ID (payment_id), Charge ID and Refund ID are not
  -- interchangeable. A missing/different PaymentIntent fails closed.
  if v_ordine.payment_transaction_id is null
     or btrim(v_ordine.payment_transaction_id) <> btrim(p_payment_intent) then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_PAYMENTINTENT_MISMATCH',
      'messaggio', 'Il PaymentIntent del refund non corrisponde all''ordine.'
    );
  end if;

  v_currency := upper(btrim(p_currency));
  if v_currency <> 'EUR'
     or v_ordine.payment_currency is null
     or upper(btrim(v_ordine.payment_currency)) <> v_currency then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_CURRENCY_MISMATCH',
      'messaggio', 'La valuta del refund non corrisponde al pagamento.'
    );
  end if;

  v_pagato := v_ordine.payment_amount;
  v_rimborsato := coalesce(v_ordine.payment_refunded_amount, 0);
  if v_pagato is null or v_pagato <= 0 or v_rimborsato < 0 or v_rimborsato > v_pagato then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_ACCOUNTING_INCONSISTENT',
      'messaggio', 'Accounting pagamento non coerente.'
    );
  end if;

  -- Require exactly one Stripe payment session for the order's Checkout
  -- Session. No LIMIT 1 can hide duplicate or ambiguous local rows.
  select count(*) into v_sessioni_count
  from public.pagamenti_sessioni
  where ordine_id = p_ordine_id
    and negozio_id = p_negozio_id
    and provider = 'stripe'
    and payment_id = v_ordine.payment_id;

  if v_sessioni_count <> 1 then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_SESSION_AMBIGUA',
      'messaggio', 'La payment session Stripe non è associata in modo univoco.'
    );
  end if;

  select * into v_sessione
  from public.pagamenti_sessioni
  where ordine_id = p_ordine_id
    and negozio_id = p_negozio_id
    and provider = 'stripe'
    and payment_id = v_ordine.payment_id;

  if v_sessione.status <> 'paid'
     or v_sessione.amount is null
     or v_sessione.amount <> v_pagato
     or v_sessione.currency is null
     or upper(btrim(v_sessione.currency)) <> v_currency then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_SESSION_MISMATCH',
      'messaggio', 'La payment session Stripe non è coerente con l''ordine.'
    );
  end if;

  if p_amount_captured is not null
     and (p_amount_captured > v_pagato or p_amount_refunded > p_amount_captured) then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_AMOUNT_INVALID',
      'messaggio', 'Il refund supera l''importo catturato.'
    );
  end if;
  if p_amount_refunded > v_pagato then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_AMOUNT_INVALID',
      'messaggio', 'Il refund supera l''importo pagato.'
    );
  end if;

  -- Validate the current local payment state before accepting any no-op. This
  -- prevents a stale zero/lower event from masking an unpaid or inconsistent
  -- order.
  if v_ordine.payment_status not in ('paid', 'partially_refunded', 'refunded') then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_NON_CONSENTITO',
      'messaggio', 'L''ordine non è in uno stato rimborsabile.'
    );
  end if;
  if v_ordine.payment_status = 'paid' and v_rimborsato <> 0 then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_STATE_INCONSISTENT',
      'messaggio', 'Ordine paid con accounting refund già presente.'
    );
  end if;
  if v_ordine.payment_status = 'partially_refunded'
     and (v_rimborsato <= 0 or v_rimborsato >= v_pagato) then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_STATE_INCONSISTENT',
      'messaggio', 'Stato refund locale non coerente.'
    );
  end if;
  if v_ordine.payment_status = 'refunded' and v_rimborsato <> v_pagato then
    return jsonb_build_object(
      'ok', false,
      'codice', 'REFUND_STATE_INCONSISTENT',
      'messaggio', 'Ordine già totalmente rimborsato con accounting incoerente.'
    );
  end if;

  -- A lower/equal cumulative amount is an idempotent out-of-order no-op.
  -- Validate it first (above), then preserve the maximum confirmed amount.
  if p_amount_refunded <= v_rimborsato then
    return jsonb_build_object(
      'ok', true,
      'cambiato', false,
      'stato', v_ordine.payment_status,
      'payment_refunded_amount', v_rimborsato,
      'payment_transaction_id', v_ordine.payment_transaction_id,
      'motivo', 'cumulative_amount_non_crescente'
    );
  end if;

  -- A refunded order must never regress to partially_refunded. Any genuinely
  -- larger value would expose an inconsistent local state, so fail closed.
  v_stato_nuovo := case
    when p_amount_refunded = v_pagato then 'refunded'
    else 'partially_refunded'
  end;

  -- One UPDATE performs both state and accounting changes while the order row
  -- remains locked. The PaymentIntent column is deliberately untouched.
  update public.ordini
  set payment_status = v_stato_nuovo,
      payment_refunded_amount = p_amount_refunded,
      payment_refunded_at = now(),
      updated_at = now()
  where id = p_ordine_id;

  return jsonb_build_object(
    'ok', true,
    'cambiato', true,
    'stato', v_stato_nuovo,
    'payment_refunded_amount', p_amount_refunded,
    'payment_transaction_id', v_ordine.payment_transaction_id
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'codice', 'SAVE_FAILED',
      'messaggio', 'Impossibile finalizzare atomicamente il refund.'
    );
end;
$$;

revoke execute on function public.pagamenti_webhook_rimborso_finalizza(uuid, uuid, text, text, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.pagamenti_webhook_rimborso_finalizza(uuid, uuid, text, text, numeric, numeric, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
