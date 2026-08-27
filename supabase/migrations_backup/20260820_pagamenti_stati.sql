-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE 3 PAGAMENTI: RPC AGGIORNA_PAYMENT_STATUS
--
-- Obiettivo: applicare lato DB la macchina a stati del pagamento,
-- specchiata ESATTAMENTE da lib/pagamenti/stati.ts (fonte logica TS).
--
-- Principi:
--   1. SECURITY DEFINER, eseguita SOLO dal backend/service_role:
--      REVOKE da public/anon/authenticated, GRANT a service_role
--      (pattern crea_ordine / aggiorna_stato_ordine).
--   2. Lock riga ordine (SELECT ... FOR UPDATE): serializza le
--      transizioni concorrenti sullo stesso ordine.
--   3. Transizioni consentite (identiche alla macchina TS):
--        pending   → authorized | paid | failed | expired | canceled
--        authorized→ paid | failed | canceled
--        paid      → refunded | partially_refunded
--        partially_refunded → refunded
--      stesso stato → no-op idempotente (cambiato=false).
--      Tutte le altre → rifiutate (TRANSIZIONE_NON_CONSENTITA).
--   4. payment_status NULL (ordini legacy pre-foundation) gestito in modo
--      SICURO (fail-closed): l'unica transizione ammessa da NULL è
--      l'inizializzazione esplicita → pending. Qualunque altra destinazione
--      da NULL viene rifiutata (STATO_LEGACY_DA_INIZIALIZZARE).
--   5. Aggiorna SOLO i campi payment_* (stato + timestamp/id coerenti):
--        payment_authorized_at  → ora (transizione → authorized)
--        payment_paid_at        → ora (transizione → paid)
--        payment_expires_at     → valorizzato se p_expires_at fornito
--        payment_id / payment_transaction_id / payment_amount /
--        payment_currency       → aggiornati SOLO se forniti (update
--                                 parziale: mai azzerati con NULL).
--   6. NON modifica MAI: ordini.stato, stock, righe, dati cliente,
--      metodo_pagamento. Nessun parametro negozio_id: l'ordine contiene
--      già il suo negozio (multi-merchant: mai fidarsi del client; il
--      controllo ownership delle future route è server-side).
--   7. Migration ESCLUSIVAMENTE additiva. NOTA: richiede che la migration
--      foundation 20260818 (colonne payment_* su ordini) sia già stata
--      applicata: la RPC fa riferimento a ordini.payment_status.
-- ═══════════════════════════════════════════════════════════════════════

begin;

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
set search_path = public
as $$
declare
  v_ordine record;
  v_attuale text;
  v_consentita boolean := false;
begin
  -- ── Validazione di base ───────────────────────────────────────────────
  if p_ordine_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  end if;
  if p_nuovo_stato is null or p_nuovo_stato not in (
    'pending', 'authorized', 'paid', 'failed', 'expired', 'canceled',
    'refunded', 'partially_refunded'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato pagamento non valido.');
  end if;

  -- ── Lock riga ordine: serializza le transizioni concorrenti ───────────
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  v_attuale := v_ordine.payment_status;

  -- ── Gestione sicura di NULL/legacy (fail-closed) ──────────────────────
  -- Un ordine pre-foundation (payment_status NULL) NON ha un pagamento:
  -- l'unica mossa ammessa è l'inizializzazione esplicita → pending da parte
  -- del backend. Qualunque altra destinazione da NULL viene rifiutata.
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
      'ok', false, 'codice', 'STATO_LEGACY_DA_INIZIALIZZARE',
      'messaggio', 'Ordine senza stato pagamento: inizializza esplicitamente a pending.'
    );
  end if;

  -- ── Macchina a stati (specchia lib/pagamenti/stati.ts) ────────────────
  v_consentita := (
    (v_attuale = 'pending'    and p_nuovo_stato in ('authorized', 'paid', 'failed', 'expired', 'canceled'))
    or (v_attuale = 'authorized' and p_nuovo_stato in ('paid', 'failed', 'canceled'))
    or (v_attuale = 'paid'     and p_nuovo_stato in ('refunded', 'partially_refunded'))
    or (v_attuale = 'partially_refunded' and p_nuovo_stato = 'refunded')
  );

  if not v_consentita then
    return jsonb_build_object(
      'ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA',
      'messaggio', 'Transizione di stato pagamento non consentita: ' || v_attuale || ' → ' || p_nuovo_stato || '.'
    );
  end if;

  -- ── Idempotenza: stesso stato → no-op (retry: nessun doppio effetto) ──
  if v_attuale = p_nuovo_stato then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', v_attuale);
  end if;

  -- ── Aggiornamento (SOLO campi payment_*, mai stato/stock/righe/cliente) ──
  -- I parametri omessi (NULL) PRESERVANO i valori esistenti (update
  -- parziale): una transizione successiva non deve mai azzerare
  -- payment_id / transaction / importo già salvati.
  update public.ordini
  set payment_status = p_nuovo_stato,
      payment_id = coalesce(p_payment_id, payment_id),
      payment_transaction_id = coalesce(p_transaction_id, payment_transaction_id),
      payment_amount = coalesce(p_importo, payment_amount),
      payment_currency = coalesce(p_valuta, payment_currency),
      payment_expires_at = case
        when p_nuovo_stato = 'expired' and payment_expires_at is null then now()
        else coalesce(p_expires_at, payment_expires_at) end,
      payment_authorized_at = case when p_nuovo_stato = 'authorized' then now() else payment_authorized_at end,
      payment_paid_at = case when p_nuovo_stato = 'paid' then now() else payment_paid_at end
  where id = p_ordine_id;

  return jsonb_build_object('ok', true, 'cambiato', true, 'stato', p_nuovo_stato);

exception
  when others then
    -- Rollback totale: nessuna modifica parziale a payment_*.
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare lo stato di pagamento.');
end;
$$;

-- ── Permessi: SOLO service_role (pattern crea_ordine) ──────────────────────
revoke execute on function public.aggiorna_payment_status(uuid, text, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.aggiorna_payment_status(uuid, text, text, text, numeric, text, timestamptz) to service_role;

notify pgrst, 'reload schema';

commit;
