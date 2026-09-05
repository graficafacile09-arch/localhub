-- ============================================================================
-- InCittà — EXPIRED ORDERS / PAYMENT EXPIRATION HARDENING
-- ============================================================================
-- Scope:
--   - reject late paid/authorized transitions for canceled or expired orders;
--   - centralize atomic order/payment closure and stock restoration;
--   - close active payment sessions during cancellation;
--   - preserve idempotency and existing refund/payment transitions.
--
-- This migration is additive and intentionally does not modify the migration
-- ledger. It is safe to run more than once.
-- ============================================================================

begin;

-- ── 1. Payment state machine: reject canceled/expired confirmations ─────────
create or replace function public.aggiorna_payment_status(
  p_ordine_id uuid,
  p_nuovo_stato text,
  p_payment_id text default null,
  p_transaction_id text default null,
  p_importo numeric default null,
  p_valuta text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordine record;
  v_attuale text;
  v_consentita boolean := false;
begin
  if p_ordine_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  end if;
  if p_nuovo_stato is null or p_nuovo_stato not in (
    'pending', 'authorized', 'paid', 'failed', 'expired', 'canceled',
    'refunded', 'partially_refunded'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato pagamento non valido.');
  end if;

  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  v_attuale := v_ordine.payment_status;

  -- Legacy orders must be explicitly initialized by the backend.
  if v_attuale is null then
    if p_nuovo_stato = 'pending' then
      update public.ordini
      set payment_status = 'pending',
          payment_id = coalesce(p_payment_id, null),
          payment_transaction_id = coalesce(p_transaction_id, null),
          payment_amount = coalesce(p_importo, null),
          payment_currency = coalesce(p_valuta, null),
          payment_expires_at = coalesce(p_expires_at, null)
      where id = p_ordine_id;
      return jsonb_build_object('ok', true, 'cambiato', true, 'stato', 'pending');
    end if;
    return jsonb_build_object(
      'ok', false,
      'codice', 'STATO_LEGACY_DA_INIZIALIZZARE',
      'messaggio', 'Ordine senza stato pagamento: inizializza esplicitamente a pending.'
    );
  end if;

  -- Same-state retries remain idempotent, including terminal states.
  if v_attuale = p_nuovo_stato then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', v_attuale);
  end if;

  -- A canceled order has already released its stock. Never accept a new
  -- authorization or capture for it.
  if v_ordine.stato = 'cancellato'
     and p_nuovo_stato in ('paid', 'authorized') then
    return jsonb_build_object(
      'ok', false,
      'codice', 'ORDINE_ANNULLATO',
      'messaggio', 'Ordine annullato: la conferma di pagamento è stata ignorata.'
    );
  end if;

  -- A payment deadline is authoritative even if the asynchronous sweep has
  -- not run yet. Closure/refund transitions remain available.
  if v_ordine.payment_expires_at is not null
     and v_ordine.payment_expires_at <= now()
     and p_nuovo_stato in ('paid', 'authorized') then
    return jsonb_build_object(
      'ok', false,
      'codice', 'PAGAMENTO_SCADUTO',
      'messaggio', 'Il pagamento è arrivato dopo la scadenza della sessione.'
    );
  end if;

  v_consentita := (
    (v_attuale = 'pending' and p_nuovo_stato in ('authorized', 'paid', 'failed', 'expired', 'canceled'))
    or (v_attuale = 'authorized' and p_nuovo_stato in ('paid', 'failed', 'expired', 'canceled'))
    or (v_attuale = 'paid' and p_nuovo_stato in ('refunded', 'partially_refunded'))
    or (v_attuale = 'partially_refunded' and p_nuovo_stato = 'refunded')
  );

  if not v_consentita then
    return jsonb_build_object(
      'ok', false,
      'codice', 'TRANSIZIONE_NON_CONSENTITA',
      'messaggio', 'Transizione di stato pagamento non consentita: ' || v_attuale || ' → ' || p_nuovo_stato || '.'
    );
  end if;

  update public.ordini
  set payment_status = p_nuovo_stato,
      payment_id = coalesce(p_payment_id, payment_id),
      payment_transaction_id = coalesce(p_transaction_id, payment_transaction_id),
      payment_amount = coalesce(p_importo, payment_amount),
      payment_currency = coalesce(p_valuta, payment_currency),
      payment_expires_at = case
        when p_nuovo_stato = 'expired' and payment_expires_at is null then now()
        else coalesce(p_expires_at, payment_expires_at)
      end,
      payment_authorized_at = case when p_nuovo_stato = 'authorized' then now() else payment_authorized_at end,
      payment_paid_at = case when p_nuovo_stato = 'paid' then now() else payment_paid_at end
  where id = p_ordine_id;

  return jsonb_build_object('ok', true, 'cambiato', true, 'stato', p_nuovo_stato);
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare lo stato di pagamento.');
end;
$$;

revoke execute on function public.aggiorna_payment_status(uuid, text, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.aggiorna_payment_status(uuid, text, text, text, numeric, text, timestamptz) to service_role;

-- ── 2. Central atomic closure for expiry/cancellation -----------------------
-- p_payment_status is deliberately restricted to the two pre-capture closure
-- states. The one-argument legacy RPC below delegates to this function.
create or replace function public.pagamenti_ordine_chiuso(
  p_ordine_id uuid,
  p_payment_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordine record;
  v_riga record;
  v_motivo text;
begin
  if p_ordine_id is null or p_payment_status not in ('expired', 'canceled') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Parametri scadenza non validi.');
  end if;

  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  if v_ordine.payment_status is null then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', null);
  end if;

  -- Paid/refunded/failed/closed orders never release stock again.
  if v_ordine.payment_status not in ('pending', 'authorized') then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', v_ordine.payment_status);
  end if;

  v_motivo := case when p_payment_status = 'expired' then 'pagamento_scaduto' else 'pagamento_cancellato' end;

  -- A prior logistical cancellation already released stock. Only close the
  -- payment/session state in this branch.
  if v_ordine.stato = 'cancellato' then
    update public.ordini
    set payment_status = p_payment_status,
        payment_expires_at = coalesce(payment_expires_at, now()),
        updated_at = now()
    where id = p_ordine_id;

    update public.pagamenti_sessioni
    set status = p_payment_status, updated_at = now()
    where ordine_id = p_ordine_id
      and status in ('created', 'pending');

    return jsonb_build_object('ok', true, 'cambiato', true, 'stato', p_payment_status);
  end if;

  -- An expiry event for an old session must not close an order that already
  -- has a newer, still-live payment session. Explicit cancellation bypasses
  -- this guard because cancellation must close every active session.
  if p_payment_status = 'expired' and exists (
    select 1
    from public.pagamenti_sessioni s
    where s.ordine_id = p_ordine_id
      and s.status in ('created', 'pending')
      and (s.expires_at is null or s.expires_at > now())
      and (v_ordine.payment_expires_at is null or v_ordine.payment_expires_at > now())
  ) then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', v_ordine.payment_status, 'motivo', 'sessione_attiva');
  end if;

  -- Lock all order lines before restoring stock. The order row lock plus the
  -- terminal payment status makes repeated calls no-ops.
  for v_riga in
    select * from public.ordini_righe where ordine_id = p_ordine_id for update
  loop
    if v_riga.variante_id is not null then
      update public.prodotto_varianti
      set quantita_disponibile = quantita_disponibile + v_riga.quantita,
          updated_at = now()
      where id = v_riga.variante_id;
    else
      update public.prodotti
      set quantita_disponibile = quantita_disponibile + v_riga.quantita,
          updated_at = now()
      where id = v_riga.prodotto_id
        and quantita_disponibile is not null;
    end if;
  end loop;

  update public.ordini
  set payment_status = p_payment_status,
      payment_expires_at = coalesce(payment_expires_at, now()),
      stato = 'cancellato',
      annullato_motivo = v_motivo,
      annullato_nota = null,
      annullato_at = now(),
      annullato_da = null,
      updated_at = now()
  where id = p_ordine_id;

  update public.pagamenti_sessioni
  set status = p_payment_status, updated_at = now()
  where ordine_id = p_ordine_id
    and status in ('created', 'pending');

  return jsonb_build_object('ok', true, 'cambiato', true, 'stato', p_payment_status);
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile chiudere il pagamento dell''ordine.');
end;
$$;

revoke execute on function public.pagamenti_ordine_chiuso(uuid, text) from public, anon, authenticated;
grant execute on function public.pagamenti_ordine_chiuso(uuid, text) to service_role;

-- Keep the existing public API and semantics for all current callers.
create or replace function public.pagamenti_ordine_scaduto(p_ordine_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.pagamenti_ordine_chiuso(p_ordine_id, 'expired');
end;
$$;

revoke execute on function public.pagamenti_ordine_scaduto(uuid) from public, anon, authenticated;
grant execute on function public.pagamenti_ordine_scaduto(uuid) to service_role;

-- ── 3. Merchant/admin cancellation closes active payment sessions ----------
create or replace function public.aggiorna_stato_ordine(
  p_ordine_id uuid,
  p_nuovo_stato text,
  p_motivo text default null,
  p_nota text default null,
  p_merchant_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordine record;
  v_riga record;
begin
  if p_ordine_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  end if;
  if p_nuovo_stato is null or p_nuovo_stato not in (
    'in_preparazione', 'confermato', 'in_lavorazione', 'pronto',
    'in_consegna', 'consegnato', 'cancellato'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato non valido.');
  end if;

  select * into v_ordine from public.ordini where id = p_ordine_id for update;
  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  if p_merchant_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Utente non autorizzato.');
  end if;
  if not exists (
    select 1 from public.negozi n
    where n.id = v_ordine.negozio_id and n.owner_user_id = p_merchant_user_id
  ) and not public.is_admin_authorized(p_merchant_user_id) then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questo ordine.');
  end if;

  if v_ordine.stato = p_nuovo_stato then
    return jsonb_build_object('ok', true, 'cambiato', false, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

  if not (
    (v_ordine.stato = 'in_preparazione' and p_nuovo_stato in ('confermato', 'cancellato'))
    or (v_ordine.stato = 'confermato' and p_nuovo_stato in ('in_lavorazione', 'cancellato'))
    or (v_ordine.stato = 'in_lavorazione' and p_nuovo_stato in ('pronto', 'cancellato'))
    or (v_ordine.stato = 'pronto' and p_nuovo_stato in ('consegnato', 'cancellato'))
    or (v_ordine.stato = 'in_consegna' and p_nuovo_stato in ('consegnato', 'cancellato'))
  ) then
    return jsonb_build_object('ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA', 'messaggio', 'Transizione di stato non consentita.');
  end if;

  if p_nuovo_stato = 'cancellato' and (p_motivo is null or length(btrim(p_motivo)) = 0) then
    return jsonb_build_object('ok', false, 'codice', 'MOTIVO_OBBLIGATORIO', 'messaggio', 'Indica un motivo per l''annullamento.');
  end if;

  update public.ordini
  set stato = p_nuovo_stato,
      aggiornato_da = p_merchant_user_id,
      updated_at = now(),
      annullato_motivo = case when p_nuovo_stato = 'cancellato' then left(btrim(coalesce(p_motivo, '')), 120) else null end,
      annullato_nota = case when p_nuovo_stato = 'cancellato' then left(btrim(coalesce(p_nota, '')), 500) else null end,
      annullato_at = case when p_nuovo_stato = 'cancellato' then now() else null end,
      annullato_da = case when p_nuovo_stato = 'cancellato' then p_merchant_user_id else null end
  where id = p_ordine_id;

  if p_nuovo_stato = 'cancellato' then
    -- Close sessions in the same transaction and order lock as stock release.
    update public.pagamenti_sessioni
    set status = 'expired', updated_at = now()
    where ordine_id = p_ordine_id
      and status in ('created', 'pending');

    for v_riga in
      select * from public.ordini_righe where ordine_id = p_ordine_id for update
    loop
      if v_riga.variante_id is not null then
        update public.prodotto_varianti
        set quantita_disponibile = quantita_disponibile + v_riga.quantita,
            updated_at = now()
        where id = v_riga.variante_id;
      else
        update public.prodotti
        set quantita_disponibile = quantita_disponibile + v_riga.quantita,
            updated_at = now()
        where id = v_riga.prodotto_id
          and quantita_disponibile is not null;
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'cambiato', true, 'ordine', public.ordine_to_json(v_ordine.id));
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare l''ordine.');
end;
$$;

revoke execute on function public.aggiorna_stato_ordine(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aggiorna_stato_ordine(uuid, text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
