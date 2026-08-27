-- Scalapay: abilita il rimborso via API anche per gli ordini pagati con Scalapay.
--
-- Il gateway Scalapay (lib/pagamenti/gateway-scalapay.ts) implementa
-- PaymentGateway.rimborsa (POST /v2/payments/{token}/refund): il provider è
-- quindi rimborsabile esattamente come Stripe/PayPal/Klarna. Questa migration
-- estende la sola allowlist `payment_provider` della RPC
-- pagamenti_prepara_rimborso (nessuna modifica a dati, colonne o altri flussi).

begin;

create or replace function public.pagamenti_prepara_rimborso(
  p_ordine_id uuid,
  p_importo numeric,
  p_merchant_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine        record;
  v_residuo       numeric;
  v_nuovo         numeric;
  v_stato_nuovo   text;
begin
  -- ── Validazione di base ───────────────────────────────────────────────
  if p_ordine_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  end if;
  if p_importo is null or p_importo <= 0 then
    return jsonb_build_object('ok', false, 'codice', 'IMPORTO_NON_VALIDO', 'messaggio', 'Importo del rimborso non valido.');
  end if;
  if p_importo <> round(p_importo, 2) then
    return jsonb_build_object('ok', false, 'codice', 'IMPORTO_NON_VALIDO', 'messaggio', 'L''importo deve avere al massimo 2 decimali.');
  end if;
  if p_merchant_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Utente non autorizzato.');
  end if;

  -- ── Lock riga ordine: serializza con gli altri flussi (FOR UPDATE) ───
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  -- ── Ownership (difesa in profondità; la route già verifica) ──────────
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

  -- ── Stato pagamento: rimborsabile solo paid / partially_refunded ─────
  if v_ordine.payment_status is null
     or v_ordine.payment_status not in ('paid', 'partially_refunded') then
    return jsonb_build_object('ok', false, 'codice', 'RIMBORSO_NON_CONSENTITO',
      'messaggio', 'L''ordine non è in uno stato rimborsabile (stato: ' ||
      coalesce(v_ordine.payment_status, 'nessun pagamento') || ').');
  end if;

  -- ── Provider gateway + payment_id presenti (mai bonifico/legacy) ─────
  if v_ordine.payment_provider is null
     or v_ordine.payment_provider not in ('stripe', 'paypal', 'klarna', 'scalapay')
     or v_ordine.payment_id is null or length(btrim(v_ordine.payment_id)) = 0 then
    return jsonb_build_object('ok', false, 'codice', 'PAGAMENTO_NON_RIMBORSABILE',
      'messaggio', 'Nessun pagamento gateway rimborsabile su questo ordine.');
  end if;

  -- ── Residuo rimborsabile + over-refund guard ─────────────────────────
  v_residuo := coalesce(v_ordine.payment_amount, 0) - coalesce(v_ordine.payment_refunded_amount, 0);
  if v_residuo <= 0 then
    return jsonb_build_object('ok', false, 'codice', 'NON_REFUNDABLE',
      'messaggio', 'Nessun importo residuo da rimborsare.');
  end if;
  if p_importo > v_residuo then
    return jsonb_build_object('ok', false, 'codice', 'OVER_REFUND',
      'messaggio', 'L''importo supera il residuo rimborsabile (' || v_residuo || ').');
  end if;

  -- ── Prenotazione: incremento atomico payment_refunded_amount ─────────
  v_nuovo := round((coalesce(v_ordine.payment_refunded_amount, 0) + p_importo)::numeric, 2);
  v_stato_nuovo := case when round((v_residuo - p_importo)::numeric, 2) <= 0
                        then 'refunded' else 'partially_refunded' end;

  update public.ordini
  set payment_refunded_amount = v_nuovo,
      payment_refunded_at = now(),
      updated_at = now()
  where id = p_ordine_id;

  return jsonb_build_object(
    'ok', true,
    'ordine_id', v_ordine.id,
    'provider', v_ordine.payment_provider,
    'payment_id', v_ordine.payment_id,
    'payment_amount', v_ordine.payment_amount,
    'payment_refunded_amount', v_nuovo,
    'importo_richiesto', p_importo,
    'residuo', round((v_residuo - p_importo)::numeric, 2),
    'stato_nuovo', v_stato_nuovo
  );
end;
$$;

commit;
