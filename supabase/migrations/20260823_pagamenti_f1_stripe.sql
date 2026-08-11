-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE F1 PAGAMENTI (STRIPE): SESSIONI, RISERVA E SCADENZA
--
-- Obiettivo: aggiungere l'infrastruttura per il pagamento online reale
-- (Stripe Checkout) SENZA modificare il comportamento legacy:
--
--   1. RPC public.pagamenti_ordine_scaduto(p_ordine_id uuid):
--      gestione ATOMICA della scadenza di un pagamento in attesa
--      (payment_status = 'pending' | 'authorized'):
--        - lock riga ordine (SELECT ... FOR UPDATE);
--        - ripristino stock di TUTTE le righe (variante → variante,
--          legacy → prodotto; identico al pattern di aggiorna_stato_ordine);
--        - ordine → stato logistico 'cancellato' con motivo
--          'pagamento_scaduto' (mai fidarsi del client: motivo di sistema);
--        - payment_status → 'expired' (coerente con la macchina a stati
--          lib/pagamenti/stati.ts: pending/authorized → expired);
--        - sessioni attive dell'ordine → 'expired';
--        - IDEMPOTENTE: ordine già concluso (paid/failed/expired/refunded)
--          o già 'cancellato' → nessun doppio ripristino stock;
--        - ordine senza pagamento (payment_status NULL) → no-op;
--   2. Indice parziale UNIQUE su pagamenti_sessioni(ordine_id) con
--      status IN ('created','pending'): al massimo UNA sessione attiva per
--      ordine → la creazione concorrente di sessioni duplicate fallisce
--      con unique_violation (e la logica riusa quella esistente).
--
-- Principi:
--   - SECURITY DEFINER + REVOKE da anon/authenticated, GRANT a service_role
--     (pattern crea_ordine / aggiorna_stato_ordine);
--   - migration ESCLUSIVAMENTE additiva: nessun dato esistente toccato;
--   - il checkout e le RPC esistenti NON vengono modificate qui.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Indice unico: una sola sessione attiva per ordine ───────────────────
--    (precondizione usata da lib/pagamenti/sessioni.ts per l'idempotenza
--    della creazione sessione: il retry non duplica mai la sessione attiva.)
create unique index if not exists pagamenti_sessioni_ordine_attiva_unq
  on public.pagamenti_sessioni (ordine_id)
  where status in ('created', 'pending');

-- ── 2. RPC: scadenza pagamento (riserva stock con scadenza) ────────────────
create or replace function public.pagamenti_ordine_scaduto(p_ordine_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine record;
  v_riga   record;
begin
  if p_ordine_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  end if;

  -- ── Lock riga ordine: serializza con crea_ordine/aggiorna_stato_ordine ──
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  -- Ordine senza pagamento online (legacy): niente da fare.
  if v_ordine.payment_status is null then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', null);
  end if;

  -- Idempotenza: solo pending/authorized possono scadere. Un ordine già
  -- pagato/fallito/scaduto/rimborsato → no-op (nessun doppio ripristino).
  if v_ordine.payment_status not in ('pending', 'authorized') then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', v_ordine.payment_status);
  end if;

  -- Ordine già annullato dal negozio mentre il pagamento era in attesa:
  -- lo stock è già stato ripristinato dall'annullamento → aggiorna SOLO il
  -- payment_status (nessun secondo ripristino).
  if v_ordine.stato = 'cancellato' then
    update public.ordini
    set payment_status = 'expired',
        payment_expires_at = coalesce(payment_expires_at, now())
    where id = p_ordine_id;

    update public.pagamenti_sessioni
    set status = 'expired', updated_at = now()
    where ordine_id = p_ordine_id
      and status in ('created', 'pending');

    return jsonb_build_object('ok', true, 'cambiato', true, 'stato', 'expired');
  end if;

  -- ── Retry in corso? Se esiste un'ALTRA sessione attiva NON scaduta per ──
  --    questo ordine, la scadenza riguarda una sessione VECCHIA (l'utente ha
  --    riprovato a pagare): NON annullare l'ordine né ripristinare lo stock.
  if exists (
    select 1 from public.pagamenti_sessioni s
    where s.ordine_id = p_ordine_id
      and s.status in ('created', 'pending')
      and (s.expires_at is null or s.expires_at > now())
  ) then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', v_ordine.payment_status, 'motivo', 'sessione_attiva');
  end if;

  -- ── Ripristino ATOMICO stock (pattern identico ad aggiorna_stato_ordine) ─
  for v_riga in
    select *
    from public.ordini_righe
    where ordine_id = p_ordine_id
    for update
  loop
    if v_riga.variante_id is not null then
      -- Riga con variante: ripristina la VARIANTE; il trigger E1
      -- (aggiorna_prodotto_da_varianti) ricalcola l'aggregato del padre.
      update public.prodotto_varianti
      set quantita_disponibile = quantita_disponibile + v_riga.quantita,
          updated_at = now()
      where id = v_riga.variante_id;
    else
      -- Legacy (o variante eliminata con ON DELETE SET NULL): ripristina il
      -- prodotto padre come oggi.
      update public.prodotti
      set quantita_disponibile = quantita_disponibile + v_riga.quantita,
          updated_at = now()
      where id = v_riga.prodotto_id
        and quantita_disponibile is not null;
    end if;
  end loop;

  -- ── Aggiornamento ordine: payment scaduto + stato logistico annullato ────
  -- Il motivo è di SISTEMA (mai dal client): il negozio vede l'ordine
  -- annullato con "Pagamento scaduto".
  update public.ordini
  set payment_status = 'expired',
      payment_expires_at = coalesce(payment_expires_at, now()),
      stato = 'cancellato',
      annullato_motivo = 'pagamento_scaduto',
      annullato_nota = null,
      annullato_at = now(),
      annullato_da = null,
      updated_at = now()
  where id = p_ordine_id;

  -- Sessioni attive dell'ordine → scadute.
  update public.pagamenti_sessioni
  set status = 'expired', updated_at = now()
  where ordine_id = p_ordine_id
    and status in ('created', 'pending');

  return jsonb_build_object('ok', true, 'cambiato', true, 'stato', 'expired');
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile elaborare la scadenza del pagamento.');
end;
$$;

revoke execute on function public.pagamenti_ordine_scaduto(uuid) from public, anon, authenticated;
grant execute on function public.pagamenti_ordine_scaduto(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
