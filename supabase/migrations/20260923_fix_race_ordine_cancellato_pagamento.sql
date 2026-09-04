-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FIX P1 (RACE): CANCELLAZIONE ORDINE ↔ CONFERMA PAGAMENTO
--
-- Problema:
--   un ordine in payment_status pending con una sessione di pagamento ancora
--   attiva può essere ANNULLATO dal negozio/admin (aggiorna_stato_ordine →
--   'cancellato', ripristino stock ATOMICO). Se il pagamento viene confermato
--   DOPO l'annullamento (es. webhook checkout.session.completed ritardato),
--   aggiorna_payment_status consente ancora pending → paid senza guardie
--   sullo stato LOGISTICO dell'ordine → stato finale incoerente:
--   ordine = cancellato, payment_status = paid, stock = già ripristinato
--   (doppia disponibilità / vendita fantasma).
--
-- Fix (ATOMICO lato database; nessuna logica JS/TS; stessa firma RPC):
--   1. aggiorna_payment_status: con il lock riga già acquisito (FOR UPDATE),
--      RIFIUTA le conferme di pagamento (paid/authorized) quando
--      ordini.stato = 'cancellato'. Conseguenze volute:
--        - il webhook registra l'evento ma NON porta l'ordine a paid e NON
--          invia email/whatsapp di conferma pagamento (marcaPagato tratta
--          l'esito non-ok come errore applicativo → niente side-effect);
--        - transizioni di RIMBORSO (paid → refunded / partially_refunded)
--          restano consentite anche su ordini annullati (annullo di un
--          ordine già pagato → rimborso regolare);
--        - transizioni di chiusura sessione (expired/canceled/failed) e la
--          chiamata identica (idempotenza) conservano il comportamento
--          originale.
--   2. aggiorna_stato_ordine (solo ramo 'cancellato'): scade ATOMICAMENTE le
--      sessioni di pagamento ancora attive dell'ordine (stessa transazione,
--      stesso lock): nessuna sessione "attiva" sopravvive all'annullamento.
--
-- Invariante garantita: un ordine con stato 'cancellato' NON può diventare
-- paid/authorized attraverso il normale flusso di conferma pagamento.
--
-- Migration ADDITIVA (CREATE OR REPLACE): nessun dato esistente modificato,
-- permessi invariati (REVOKE da public/anon/authenticated, GRANT a
-- service_role), nessun DROP/DELETE.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. RPC aggiorna_payment_status: guardia anti-race ordine annullato ─────
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

  -- ── Guardia anti-race (FIX P1): ordine annullato → mai conferma pagamento ─
  -- Un ordine con stato 'cancellato' è terminale e ha già lo stock
  -- ripristinato dall'annullamento: una conferma di pagamento TARDIVA (es.
  -- webhook checkout.session.completed arrivato dopo l'annullamento) NON deve
  -- poter portare payment_status a paid/authorized. Le transizioni di rimborso
  -- (paid → refunded/partially_refunded) e di chiusura sessione
  -- (expired/canceled) restano consentite anche su ordini annullati. La
  -- chiamata identica (v_attuale = p_nuovo_stato) conserva il comportamento
  -- originale (idempotenza, nessun errore introdotto sui retry).
  if v_ordine.stato = 'cancellato'
     and p_nuovo_stato in ('paid', 'authorized')
     and coalesce(v_attuale, '') <> p_nuovo_stato then
    return jsonb_build_object(
      'ok', false, 'codice', 'ORDINE_ANNULLATO',
      'messaggio', 'Ordine annullato: la conferma di pagamento è stata ignorata.'
    );
  end if;

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

revoke execute on function public.aggiorna_payment_status(uuid, text, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.aggiorna_payment_status(uuid, text, text, text, numeric, text, timestamptz) to service_role;

-- ── 2. RPC aggiorna_stato_ordine: scadenza sessioni attive in annullamento ─
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
set search_path = public
as $$
declare
  v_ordine record;
  v_riga   record;
begin
  -- ── Validazione di base ────────────────────────────────────────────────────
  if p_ordine_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  end if;
  if p_nuovo_stato is null or p_nuovo_stato not in (
    'in_preparazione', 'confermato', 'in_lavorazione', 'pronto',
    'in_consegna', 'consegnato', 'cancellato'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato non valido.');
  end if;

  -- ── Lock riga ordine: serializza le operazioni concorrenti ─────────────────
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  -- ── Ownership server-side (difesa in profondità; la route già verifica) ────
  if p_merchant_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Utente non autorizzato.');
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

  -- ── Idempotenza: stessa stato → no-op (retry: nessun doppio effetto, ──────
  --    nessuna seconda email, nessun doppio ripristino stock) ────────────────
  if v_ordine.stato = p_nuovo_stato then
    return jsonb_build_object('ok', true, 'cambiato', false, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

  -- ── Macchina a stati (transizioni consentite) ──────────────────────────────
  if not (
    (v_ordine.stato = 'in_preparazione' and p_nuovo_stato in ('confermato', 'cancellato'))
    or (v_ordine.stato = 'confermato' and p_nuovo_stato in ('in_lavorazione', 'cancellato'))
    or (v_ordine.stato = 'in_lavorazione' and p_nuovo_stato in ('pronto', 'cancellato'))
    or (v_ordine.stato = 'pronto' and p_nuovo_stato in ('consegnato', 'cancellato'))
    or (v_ordine.stato = 'in_consegna' and p_nuovo_stato in ('consegnato', 'cancellato'))
  ) then
    return jsonb_build_object('ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA', 'messaggio', 'Transizione di stato non consentita.');
  end if;

  -- ── Annullamento: motivo OBBLIGATORIO ──────────────────────────────────────
  if p_nuovo_stato = 'cancellato' and (p_motivo is null or length(btrim(p_motivo)) = 0) then
    return jsonb_build_object('ok', false, 'codice', 'MOTIVO_OBBLIGATORIO', 'messaggio', 'Indica un motivo per l''annullamento.');
  end if;

  -- ── Aggiornamento stato (atomico; il trigger registra l'evento) ────────────
  update public.ordini
  set stato = p_nuovo_stato,
      aggiornato_da = p_merchant_user_id,
      updated_at = now(),
      annullato_motivo = case when p_nuovo_stato = 'cancellato' then left(btrim(coalesce(p_motivo, '')), 120) else null end,
      annullato_nota = case when p_nuovo_stato = 'cancellato' then left(btrim(coalesce(p_nota, '')), 500) else null end,
      annullato_at = case when p_nuovo_stato = 'cancellato' then now() else null end,
      annullato_da = case when p_nuovo_stato = 'cancellato' then p_merchant_user_id else null end
  where id = p_ordine_id;

  -- ── Annullamento: ripristino ATOMICO stock + scadenza sessioni attive ──────
  -- FASE E5: se la riga ha variante_id → ripristina la VARIANTE (il trigger E1
  -- aggiorna l'aggregato del padre); altrimenti (legacy O variante eliminata
  -- con ON DELETE SET NULL) → ripristina il prodotto padre come oggi.
  -- La transizione cancellato→cancellato è impossibile → ripristino UNA sola
  -- volta. Lock delle righe per serializzare.
  -- FIX P1 (race): l'annullamento scade ATOMICAMENTE le sessioni di pagamento
  -- ancora attive dell'ordine (stessa transazione, stesso lock): nessuna
  -- sessione "attiva" sopravvive all'annullamento. Un'eventuale conferma
  -- tardiva del provider è comunque rifiutata dalla guardia introdotta in
  -- aggiorna_payment_status.
  if p_nuovo_stato = 'cancellato' then
    update public.pagamenti_sessioni
    set status = 'expired', updated_at = now()
    where ordine_id = p_ordine_id
      and status in ('created', 'pending');

    for v_riga in
      select *
      from public.ordini_righe
      where ordine_id = p_ordine_id
      for update
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
    -- Rollback totale: nessuna modifica parziale a stato/stock/eventi.
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare l''ordine.');
end;
$$;

revoke execute on function public.aggiorna_stato_ordine(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aggiorna_stato_ordine(uuid, text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
