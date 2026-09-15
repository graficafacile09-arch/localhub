-- ── 2. Central atomic closure for expiry/cancellation -----------------------
CREATE OR REPLACE FUNCTION public.pagamenti_ordine_chiuso(
  p_ordine_id uuid,
  p_payment_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ordine record;
  v_riga record;
  v_motivo text;
BEGIN
  IF p_ordine_id IS NULL OR p_payment_status NOT IN ('expired', 'canceled') THEN
    RETURN jsonb_build_object('ok', FALSE, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Parametri scadenza non validi.');
  END IF;

  SELECT * INTO v_ordine
  FROM public.ordini
  WHERE id = p_ordine_id
  FOR UPDATE;

  IF v_ordine.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  END IF;

  IF v_ordine.payment_status IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'cambiato', FALSE, 'stato', NULL);
  END IF;

  IF v_ordine.payment_status NOT IN ('pending', 'authorized') THEN
    RETURN jsonb_build_object('ok', TRUE, 'cambiato', FALSE, 'stato', v_ordine.payment_status);
  END IF;

  v_motivo := CASE WHEN p_payment_status = 'expired' THEN 'pagamento_scaduto' ELSE 'pagamento_cancellato' END;

  IF v_ordine.stato = 'cancellato' THEN
    UPDATE public.ordini
    SET payment_status = p_payment_status,
        payment_expires_at = COALESCE(payment_expires_at, NOW()),
        updated_at = NOW()
    WHERE id = p_ordine_id;

    UPDATE public.pagamenti_sessioni
    SET status = p_payment_status, updated_at = NOW()
    WHERE ordine_id = p_ordine_id
      AND status IN ('created', 'pending');

    RETURN jsonb_build_object('ok', TRUE, 'cambiato', TRUE, 'stato', p_payment_status);
  END IF;

  IF p_payment_status = 'expired' AND EXISTS (
    SELECT 1
    FROM public.pagamenti_sessioni s
    WHERE s.ordine_id = p_ordine_id
      AND s.status IN ('created', 'pending')
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
      AND (v_ordine.payment_expires_at IS NULL OR v_ordine.payment_expires_at > NOW())
  ) THEN
    RETURN jsonb_build_object('ok', TRUE, 'cambiato', FALSE, 'stato', v_ordine.payment_status, 'motivo', 'sessione_attiva');
  END IF;

  FOR v_riga IN
    SELECT * FROM public.ordini_righe WHERE ordine_id = p_ordine_id FOR UPDATE
  LOOP
    IF v_riga.variante_id IS NOT NULL THEN
      UPDATE public.prodotto_varianti
      SET quantita_disponibile = quantita_disponibile + v_riga.quantita,
          updated_at = NOW()
      WHERE id = v_riga.variante_id;
    ELSE
      UPDATE public.prodotti
      SET quantita_disponibile = quantita_disponibile + v_riga.quantita,
          updated_at = NOW()
      WHERE id = v_riga.prodotto_id
        AND quantita_disponibile IS NOT NULL;
    END IF;
  END LOOP;

  UPDATE public.ordini
  SET payment_status = p_payment_status,
      payment_expires_at = COALESCE(payment_expires_at, NOW()),
      stato = 'cancellato',
      annullato_motivo = v_motivo,
      annullato_nota = NULL,
      annullato_at = NOW(),
      annullato_da = NULL,
      updated_at = NOW()
  WHERE id = p_ordine_id;

  UPDATE public.pagamenti_sessioni
  SET status = p_payment_status, updated_at = NOW()
  WHERE ordine_id = p_ordine_id
    AND status IN ('created', 'pending');

  RETURN jsonb_build_object('ok', TRUE, 'cambiato', TRUE, 'stato', p_payment_status);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile chiudere il pagamento dell''ordine.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pagamenti_ordine_chiuso(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pagamenti_ordine_chiuso(uuid, text) TO service_role;

-- Keep the existing public API and semantics for all current callers.
CREATE OR REPLACE FUNCTION public.pagamenti_ordine_scaduto(p_ordine_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.pagamenti_ordine_chiuso(p_ordine_id, 'expired');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pagamenti_ordine_scaduto(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pagamenti_ordine_scaduto(uuid) TO service_role;