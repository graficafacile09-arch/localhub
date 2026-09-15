-- ── 1. Payment state machine: reject canceled/expired confirmations ─────────
CREATE OR REPLACE FUNCTION public.aggiorna_payment_status(
  p_ordine_id uuid,
  p_nuovo_stato text,
  p_payment_id text DEFAULT NULL,
  p_transaction_id text DEFAULT NULL,
  p_importo numeric DEFAULT NULL,
  p_valuta text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ordine record;
  v_attuale text;
  v_consentita boolean := FALSE;
BEGIN
  IF p_ordine_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  END IF;
  IF p_nuovo_stato IS NULL OR p_nuovo_stato NOT IN (
    'pending', 'authorized', 'paid', 'failed', 'expired', 'canceled',
    'refunded', 'partially_refunded'
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato pagamento non valido.');
  END IF;

  SELECT * INTO v_ordine
  FROM public.ordini
  WHERE id = p_ordine_id
  FOR UPDATE;

  IF v_ordine.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  END IF;

  v_attuale := v_ordine.payment_status;

  -- Legacy orders must be explicitly initialized by the backend.
  IF v_attuale IS NULL THEN
    IF p_nuovo_stato = 'pending' THEN
      UPDATE public.ordini
      SET payment_status = 'pending',
          payment_id = COALESCE(p_payment_id, NULL),
          payment_transaction_id = COALESCE(p_transaction_id, NULL),
          payment_amount = COALESCE(p_importo, NULL),
          payment_currency = COALESCE(p_valuta, NULL),
          payment_expires_at = COALESCE(p_expires_at, NULL)
      WHERE id = p_ordine_id;
      RETURN jsonb_build_object('ok', TRUE, 'cambiato', TRUE, 'stato', 'pending');
    END IF;
    RETURN jsonb_build_object(
      'ok', FALSE,
      'codice', 'STATO_LEGACY_DA_INIZIALIZZARE',
      'messaggio', 'Ordine senza stato pagamento: inizializza esplicitamente a pending.'
    );
  END IF;

  -- Same-state retries remain idempotent, including terminal states.
  IF v_attuale = p_nuovo_stato THEN
    RETURN jsonb_build_object('ok', TRUE, 'cambiato', FALSE, 'stato', v_attuale);
  END IF;

  -- A canceled order has already released its stock. Never accept a new
  -- authorization or capture for it.
  IF v_ordine.stato = 'cancellato'
     AND p_nuovo_stato IN ('paid', 'authorized') THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'codice', 'ORDINE_ANNULLATO',
      'messaggio', 'Ordine annullato: la conferma di pagamento è stata ignorata.'
    );
  END IF;

  -- A payment deadline is authoritative even if the asynchronous sweep has
  -- not run yet. Closure/refund transitions remain available.
  IF v_ordine.payment_expires_at IS NOT NULL
     AND v_ordine.payment_expires_at <= NOW()
     AND p_nuovo_stato IN ('paid', 'authorized') THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'codice', 'PAGAMENTO_SCADUTO',
      'messaggio', 'Il pagamento è arrivato dopo la scadenza della sessione.'
    );
  END IF;

  v_consentita := (
    (v_attuale = 'pending' AND p_nuovo_stato IN ('authorized', 'paid', 'failed', 'expired', 'canceled'))
    OR (v_attuale = 'authorized' AND p_nuovo_stato IN ('paid', 'failed', 'expired', 'canceled'))
    OR (v_attuale = 'paid' AND p_nuovo_stato IN ('refunded', 'partially_refunded'))
    OR (v_attuale = 'partially_refunded' AND p_nuovo_stato = 'refunded')
  );

  IF NOT v_consentita THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'codice', 'TRANSIZIONE_NON_CONSENTITA',
      'messaggio', 'Transizione di stato pagamento non consentita: ' || v_attuale || ' → ' || p_nuovo_stato || '.'
    );
  END IF;

  UPDATE public.ordini
  SET payment_status = p_nuovo_stato,
      payment_id = COALESCE(p_payment_id, payment_id),
      payment_transaction_id = COALESCE(p_transaction_id, payment_transaction_id),
      payment_amount = COALESCE(p_importo, payment_amount),
      payment_currency = COALESCE(p_valuta, payment_currency),
      payment_expires_at = CASE
        WHEN p_nuovo_stato = 'expired' AND payment_expires_at IS NULL THEN NOW()
        ELSE COALESCE(p_expires_at, payment_expires_at)
      END,
      payment_authorized_at = CASE WHEN p_nuovo_stato = 'authorized' THEN NOW() ELSE payment_authorized_at END,
      payment_paid_at = CASE WHEN p_nuovo_stato = 'paid' THEN NOW() ELSE payment_paid_at END
  WHERE id = p_ordine_id;

  RETURN jsonb_build_object('ok', TRUE, 'cambiato', TRUE, 'stato', p_nuovo_stato);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare lo stato di pagamento.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aggiorna_payment_status(uuid, text, text, text, numeric, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggiorna_payment_status(uuid, text, text, text, numeric, text, timestamptz) TO service_role;