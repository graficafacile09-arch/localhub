-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — P3 PAYMENT-FIRST: RPC CHECKOUT_INTENTO_SCADUTO
--
-- Scadenza definitiva di un INTENTO di checkout (pagamenti_sessioni con
-- ordine_id = NULL): rilascia la riserva stock e porta la sessione a
-- 'expired'. MAI un ordine. Tutto nella STESSA transazione atomica:
--
--   1. LOCK della sessione (SELECT … FOR UPDATE): punto di serializzazione
--      con la conferma webhook (P2). Corsa sweep/webhook:
--        A vince → sessione expired + stock rilasciato → B vede expired →
--          late-payment/refund (P3), MAI ordine;
--        B vince → checkout_intento_conferma crea l'ordine → A vede
--          ordine_id valorizzato → no-op, stock NON rilasciato.
--      MAI: ordine + refund, doppio decremento, doppio rilascio, stock
--      negativo.
--   2. idempotente: sessione con ordine_id valorizzato → no-op; sessione
--      già 'expired' → no-op (un doppio sweep non rilascia due volte);
--   3. verifica che la sessione sia REALMENTE scaduta (expires_at <= now);
--      altrimenti CHECKOUT_NON_SCADUTO (mai rilasciare in anticipo);
--   4. rilascio atomico: quantita_riservata −= q (mai sotto zero) per ogni
--      riga del checkout_payload, prodotti e varianti. quantita_disponibile
--      NON viene toccata (era già invariata in P1);
--   5. UPDATE sessione → status = 'expired'.
--
-- SECURITY DEFINER + solo service_role (pattern checkout_intento_crea).
-- Migration ADDITIVA: non tocca checkout_intento_crea/annulla/conferma né
-- i flussi bonifico/ritiro.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create or replace function public.checkout_intento_scaduto(p_sessione_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessione  record;
  v_riga      jsonb;
  v_prodotto_id bigint;
  v_variante_id uuid;
  v_quantita  integer;
  v_rilasciato boolean := false;
begin
  if p_sessione_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Sessione non valida.');
  end if;

  -- ── 1. LOCK sessione (serializzazione con la conferma webhook) ────────
  select * into v_sessione
  from public.pagamenti_sessioni
  where id = p_sessione_id
  for update;

  if v_sessione.id is null then
    return jsonb_build_object('ok', false, 'codice', 'CHECKOUT_NON_TROVATO', 'messaggio', 'Checkout non trovato.');
  end if;

  -- ── 2a. Sessione già collegata a un ordine (B ha vinto la corsa): ─────
  --       MAI rilasciare stock, MAI toccare la sessione.
  if v_sessione.ordine_id is not null then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', 'ordine_collegato');
  end if;

  -- ── 2b. Idempotenza: già expired (doppio sweep / annullata prima) ─────
  if v_sessione.status = 'expired' then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', 'expired');
  end if;

  -- Solo intenti ATTIVI possono scadere (paid/refunded → no-op).
  if v_sessione.status not in ('created', 'pending') then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', v_sessione.status);
  end if;

  -- ── 3. Deve essere REALMENTE scaduta (mai rilasciare in anticipo) ─────
  if v_sessione.expires_at is null or v_sessione.expires_at > now() then
    return jsonb_build_object('ok', false, 'codice', 'CHECKOUT_NON_SCADUTO',
      'messaggio', 'Il checkout non è ancora scaduto.');
  end if;

  -- ── 4. Rilascio atomico della riserva (mai sotto zero) ─────────────────
  if v_sessione.checkout_payload is not null
     and jsonb_typeof(v_sessione.checkout_payload -> 'righe') = 'array' then
    for v_riga in
      select value from jsonb_array_elements(v_sessione.checkout_payload -> 'righe')
    loop
      v_prodotto_id := (v_riga ->> 'prodottoId')::bigint;
      v_quantita    := (v_riga ->> 'quantita')::integer;
      begin
        v_variante_id := nullif(v_riga ->> 'varianteId', '')::uuid;
      exception
        when invalid_text_representation then
          v_variante_id := null;
      end;

      if v_variante_id is not null then
        update public.prodotto_varianti
        set quantita_riservata = greatest(quantita_riservata - v_quantita, 0),
            updated_at = now()
        where id = v_variante_id;
      else
        update public.prodotti
        set quantita_riservata = greatest(quantita_riservata - v_quantita, 0),
            updated_at = now()
        where id = v_prodotto_id;
      end if;
      v_rilasciato := true;
    end loop;
  end if;

  -- ── 5. Sessione → expired ──────────────────────────────────────────────
  update public.pagamenti_sessioni
  set status = 'expired', updated_at = now()
  where id = p_sessione_id;

  return jsonb_build_object('ok', true, 'cambiato', true,
    'stato', 'expired', 'stockRilasciato', v_rilasciato);

exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED',
      'messaggio', 'Impossibile far scadere il checkout.');
end;
$$;

revoke execute on function public.checkout_intento_scaduto(uuid) from public, anon, authenticated;
grant execute on function public.checkout_intento_scaduto(uuid) to service_role;

notify pgrst, 'reload schema';

commit;