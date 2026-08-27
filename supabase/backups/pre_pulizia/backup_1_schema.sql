


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."aggiorna_payment_status"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_payment_id" "text" DEFAULT NULL::"text", "p_transaction_id" "text" DEFAULT NULL::"text", "p_importo" numeric DEFAULT NULL::numeric, "p_valuta" "text" DEFAULT NULL::"text", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."aggiorna_payment_status"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_payment_id" "text", "p_transaction_id" "text", "p_importo" numeric, "p_valuta" "text", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggiorna_prodotto_da_varianti"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_prodotto_id bigint;
  v_ha_varianti boolean;
  v_min_prezzo  numeric;
  v_somma_qta   integer;
  v_somma_ris   integer;
begin
  -- Prodotto interessato (NEW per insert/update, OLD per delete)
  v_prodotto_id := coalesce(new.prodotto_id, old.prodotto_id);

  select p.ha_varianti
  into v_ha_varianti
  from public.prodotti p
  where p.id = v_prodotto_id;

  -- Mai toccare i prodotti legacy / non-varianti
  if v_ha_varianti is null or not v_ha_varianti then
    return null;
  end if;

  -- Aggregazione SOLO delle varianti attive
  select min(v.prezzo),
         coalesce(sum(v.quantita_disponibile), 0),
         coalesce(sum(v.quantita_riservata), 0)
  into v_min_prezzo, v_somma_qta, v_somma_ris
  from public.prodotto_varianti v
  where v.prodotto_id = v_prodotto_id
    and v.attivo = true;

  update public.prodotti
  set prezzo              = coalesce(v_min_prezzo, prezzo),
      quantita_disponibile = v_somma_qta,
      quantita_riservata   = v_somma_ris
  where id = v_prodotto_id;

  return null;
end;
$$;


ALTER FUNCTION "public"."aggiorna_prodotto_da_varianti"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggiorna_stato_ordine"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_motivo" "text" DEFAULT NULL::"text", "p_nota" "text" DEFAULT NULL::"text", "p_merchant_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- ── Ripristino ATOMICO dello stock in caso di annullamento ─────────────────
  -- FASE E5: se la riga ha variante_id → ripristina la VARIANTE (il trigger E1
  -- aggiorna l'aggregato del padre); altrimenti (legacy O variante eliminata
  -- con ON DELETE SET NULL) → ripristina il prodotto padre come oggi.
  -- La transizione cancellato→cancellato è impossibile → ripristino UNA sola
  -- volta. Lock delle righe per serializzare.
  if p_nuovo_stato = 'cancellato' then
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


ALTER FUNCTION "public"."aggiorna_stato_ordine"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_motivo" "text", "p_nota" "text", "p_merchant_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggiorna_stato_reclamo"("p_reclamo_id" "uuid", "p_nuovo_stato" "text", "p_merchant_user_id" "uuid", "p_nota" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reclamo  record;
  v_ownership boolean;
begin
  -- ── Guardie ──────────────────────────────────────────────────────────
  if p_merchant_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Operazione consentita solo ai venditori autenticati.');
  end if;
  if p_nuovo_stato is null or p_nuovo_stato not in ('aperto', 'in_gestione', 'risolto', 'chiuso') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato del reclamo non valido.');
  end if;

  -- LOCK riga: la macchina a stati viene validata ATOMICAMENTE anche sotto
  -- concorrenza (stesso pattern di aggiorna_stato_ordine, migrazione 20260815).
  select * into v_reclamo
  from public.ordine_reclami
  where id = p_reclamo_id
  for update;

  if v_reclamo.id is null then
    return jsonb_build_object('ok', false, 'codice', 'RECLAMO_NON_TROVATO', 'messaggio', 'Reclamo non trovato.');
  end if;

  -- ── Ownership ATOMICAMENTE: negozio dell'ordine di proprietà del ─────
  --    venditore (o admin autorizzato via user_roles). Mai un negozio_id
  --    accettato dal client.
  select exists (
    select 1
    from public.negozi n
    where n.id = v_reclamo.negozio_id
      and n.deleted_at is null
      and (
        n.owner_user_id = p_merchant_user_id
        or exists (
          select 1 from public.user_roles ur
          where ur.user_id = p_merchant_user_id and ur.role = 'admin'
        )
      )
  ) into v_ownership;

  if not v_ownership then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire reclami di altri negozi.');
  end if;

  -- ── Macchina a stati (stesso stato → no-op idempotente) ──────────────
  if v_reclamo.stato = p_nuovo_stato then
    return jsonb_build_object('ok', true, 'cambiato', false, 'reclamo', public.reclamo_to_json(v_reclamo.id));
  end if;

  if not (
    (v_reclamo.stato = 'aperto'       and p_nuovo_stato in ('in_gestione', 'risolto', 'chiuso'))
    or (v_reclamo.stato = 'in_gestione' and p_nuovo_stato in ('risolto', 'chiuso'))
    or (v_reclamo.stato = 'risolto'    and p_nuovo_stato = 'chiuso')
  ) then
    return jsonb_build_object('ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA',
      'messaggio', 'Transizione di stato non consentita per questo reclamo.');
  end if;

  -- ── Aggiornamento (gestito_at/da registrati sempre) ──────────────────
  update public.ordine_reclami
  set stato        = p_nuovo_stato,
      gestito_at   = now(),
      gestito_da   = p_merchant_user_id,
      gestito_nota = coalesce(nullif(trim(coalesce(p_nota, '')), ''), gestito_nota)
  where id = p_reclamo_id
  returning * into v_reclamo;

  return jsonb_build_object('ok', true, 'cambiato', true, 'reclamo', public.reclamo_to_json(v_reclamo.id));

exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare il reclamo.');
end;
$$;


ALTER FUNCTION "public"."aggiorna_stato_reclamo"("p_reclamo_id" "uuid", "p_nuovo_stato" "text", "p_merchant_user_id" "uuid", "p_nota" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggiorna_stato_spedizione"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_tracking_code" "text" DEFAULT NULL::"text", "p_tracking_url" "text" DEFAULT NULL::"text", "p_consegna_stimata" "text" DEFAULT NULL::"text", "p_merchant_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ordine           record;
  v_tracking_code    text;
  v_tracking_url     text;
  v_consegna_stimata text;
begin
  -- ── Validazione di base ────────────────────────────────────────────────────
  if p_ordine_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  end if;
  if p_nuovo_stato is null or p_nuovo_stato not in (
    'non_affidata', 'affidata', 'in_transito', 'consegnata', 'problema'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato spedizione non valido.');
  end if;

  -- ── Lock riga ordine ───────────────────────────────────────────────────────
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  -- ── Ownership server-side (stesso modello di aggiorna_stato_ordine) ────────
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

  -- ── La spedizione esiste SOLO per modalita='spedizione' ────────────────────
  if v_ordine.modalita <> 'spedizione' then
    return jsonb_build_object('ok', false, 'codice', 'MODALITA_NON_SPEDIZIONE', 'messaggio', 'Questo ordine non è in spedizione.');
  end if;

  -- ── Un ordine annullato non ha più spedizione gestibile ────────────────────
  if v_ordine.stato = 'cancellato' then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_CANCELLATO', 'messaggio', 'L''ordine è annullato.');
  end if;

  -- ── Macchina a stati (transizioni consentite; consegnata è terminale).      ──
  -- NOTA NULL-safe: coalesce(v_ordine.stato_spedizione, '') evita che un
  -- confronto con stato_spedizione NULL produca UNKNOWN e faccia saltare il
  -- rifiuto (three-valued logic). '' rappresenta lo stato NULL.
  if not (
    (p_nuovo_stato = 'non_affidata' and v_ordine.stato_spedizione is null)
    or (p_nuovo_stato = 'affidata' and coalesce(v_ordine.stato_spedizione, '') in ('', 'non_affidata', 'problema'))
    or (p_nuovo_stato = 'in_transito' and coalesce(v_ordine.stato_spedizione, '') in ('affidata', 'problema'))
    or (p_nuovo_stato = 'consegnata' and coalesce(v_ordine.stato_spedizione, '') = 'in_transito')
    or (p_nuovo_stato = 'problema' and coalesce(v_ordine.stato_spedizione, '') in ('affidata', 'in_transito'))
  ) then
    return jsonb_build_object('ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA', 'messaggio', 'Transizione di stato spedizione non consentita.');
  end if;

  -- ── Sanificazione input (mai fidarsi del client) ───────────────────────────
  v_tracking_code := left(btrim(coalesce(p_tracking_code, '')), 120);
  v_tracking_url := left(btrim(coalesce(p_tracking_url, '')), 500);
  v_consegna_stimata := left(btrim(coalesce(p_consegna_stimata, '')), 120);

  -- ── Tracking OBBLIGATORIO per "affidata" ───────────────────────────────────
  if p_nuovo_stato = 'affidata' and v_tracking_code = '' then
    return jsonb_build_object('ok', false, 'codice', 'TRACKING_OBBLIGATORIO', 'messaggio', 'Inserisci il codice di tracking.');
  end if;

  -- ── URL di tracking: opzionale ma, se presente, deve essere http(s) ────────
  if v_tracking_url <> '' and v_tracking_url !~* '^https?://' then
    return jsonb_build_object('ok', false, 'codice', 'TRACKING_URL_NON_VALIDA', 'messaggio', 'URL di tracking non valido.');
  end if;

  -- ── Idempotenza: stesso stato → no-op (aggiorna solo i campi forniti) ──────
  if v_ordine.stato_spedizione = p_nuovo_stato then
    update public.ordini
    set tracking_code = case when v_tracking_code <> '' then v_tracking_code else tracking_code end,
        tracking_url = case when v_tracking_url <> '' then v_tracking_url else tracking_url end,
        consegna_stimata = case when v_consegna_stimata <> '' then v_consegna_stimata else consegna_stimata end,
        updated_at = now()
    where id = p_ordine_id;
    return jsonb_build_object('ok', true, 'cambiato', false, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

  -- ── Aggiornamento stato (atomico; il trigger registra l'evento) ────────────
  update public.ordini
  set stato_spedizione = p_nuovo_stato,
      tracking_code = case when p_nuovo_stato = 'affidata' then v_tracking_code else tracking_code end,
      tracking_url = case when v_tracking_url <> '' then v_tracking_url else tracking_url end,
      consegna_stimata = case when v_consegna_stimata <> '' then v_consegna_stimata else consegna_stimata end,
      affidata_at = case when p_nuovo_stato = 'affidata' then now() else affidata_at end,
      consegnata_at = case when p_nuovo_stato = 'consegnata' then now() else consegnata_at end,
      aggiornato_da = p_merchant_user_id,
      updated_at = now()
  where id = p_ordine_id;

  return jsonb_build_object('ok', true, 'cambiato', true, 'ordine', public.ordine_to_json(v_ordine.id));

exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare la spedizione.');
end;
$$;


ALTER FUNCTION "public"."aggiorna_stato_spedizione"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_tracking_code" "text", "p_tracking_url" "text", "p_consegna_stimata" "text", "p_merchant_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggiungi_messaggio_reclamo_cliente"("p_reclamo_id" "uuid", "p_cliente_user_id" "uuid", "p_corpo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reclamo  record;
  v_corpo    text;
  v_messaggio record;
begin
  -- ?? Guardie ??????????????????????????????????????????????????????????
  if p_cliente_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Operazione consentita solo a clienti autenticati.');
  end if;
  v_corpo := nullif(trim(coalesce(p_corpo, '')), '');
  if v_corpo is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il messaggio non pu� essere vuoto.');
  end if;
  if length(v_corpo) > 2000 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Messaggio troppo lungo (max 2000 caratteri).');
  end if;

  -- ?? Reclamo + ownership (mai fidarsi di un id dal browser) ???????????
  select * into v_reclamo
  from public.ordine_reclami
  where id = p_reclamo_id
  limit 1;

  if v_reclamo.id is null then
    return jsonb_build_object('ok', false, 'codice', 'RECLAMO_NON_TROVATO', 'messaggio', 'Reclamo non trovato.');
  end if;
  if v_reclamo.cliente_user_id is distinct from p_cliente_user_id then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi scrivere su un reclamo altrui.');
  end if;
  if v_reclamo.stato = 'chiuso' then
    return jsonb_build_object('ok', false, 'codice', 'RECLAMO_CHIUSO', 'messaggio', 'Il reclamo � chiuso: non � possibile inviare nuovi messaggi.');
  end if;

  -- ?? Inserimento (mittente_nome = snapshot cliente del reclamo) ???????
  insert into public.reclamo_comunicazioni (reclamo_id, mittente, mittente_nome, corpo)
  values (v_reclamo.id, 'cliente', coalesce(nullif(trim(v_reclamo.cliente_nome), ''), 'Cliente'), v_corpo)
  returning * into v_messaggio;

  return jsonb_build_object('ok', true, 'messaggio', public.reclamo_messaggio_to_json(v_messaggio.id));

exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il messaggio.');
end;
$$;


ALTER FUNCTION "public"."aggiungi_messaggio_reclamo_cliente"("p_reclamo_id" "uuid", "p_cliente_user_id" "uuid", "p_corpo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggiungi_messaggio_reclamo_venditore"("p_reclamo_id" "uuid", "p_merchant_user_id" "uuid", "p_corpo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reclamo   record;
  v_ownership boolean;
  v_corpo     text;
  v_nome      text;
  v_messaggio record;
begin
  -- ?? Guardie ??????????????????????????????????????????????????????????
  if p_merchant_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Operazione consentita solo a venditori autenticati.');
  end if;
  v_corpo := nullif(trim(coalesce(p_corpo, '')), '');
  if v_corpo is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il messaggio non pu� essere vuoto.');
  end if;
  if length(v_corpo) > 2000 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Messaggio troppo lungo (max 2000 caratteri).');
  end if;

  -- LOCK riga: come aggiorna_stato_reclamo (transizioni atomiche).
  select * into v_reclamo
  from public.ordine_reclami
  where id = p_reclamo_id
  for update;

  if v_reclamo.id is null then
    return jsonb_build_object('ok', false, 'codice', 'RECLAMO_NON_TROVATO', 'messaggio', 'Reclamo non trovato.');
  end if;

  -- ?? Ownership ATOMICAMENTE: negozio di propriet� del venditore ???????
  select exists (
    select 1
    from public.negozi n
    where n.id = v_reclamo.negozio_id
      and n.deleted_at is null
      and (
        n.owner_user_id = p_merchant_user_id
        or exists (
          select 1 from public.user_roles ur
          where ur.user_id = p_merchant_user_id and ur.role = 'admin'
        )
      )
  ) into v_ownership;

  if not v_ownership then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire reclami di altri negozi.');
  end if;

  if v_reclamo.stato = 'chiuso' then
    return jsonb_build_object('ok', false, 'codice', 'RECLAMO_CHIUSO', 'messaggio', 'Il reclamo � chiuso: non � possibile inviare nuovi messaggi.');
  end if;

  -- Nome mittente dal profilo auth (fallback: prefisso email).
  select coalesce(
    nullif(trim(coalesce(a.raw_user_meta_data ->> 'full_name', '')), ''),
    split_part(coalesce(a.email, ''), '@', 1),
    'Venditore'
  ) into v_nome
  from auth.users a
  where a.id = p_merchant_user_id;

  -- ?? Inserimento ??????????????????????????????????????????????????????
  insert into public.reclamo_comunicazioni (reclamo_id, mittente, mittente_nome, corpo)
  values (v_reclamo.id, 'venditore', v_nome, v_corpo)
  returning * into v_messaggio;

  return jsonb_build_object('ok', true, 'messaggio', public.reclamo_messaggio_to_json(v_messaggio.id));

exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il messaggio.');
end;
$$;


ALTER FUNCTION "public"."aggiungi_messaggio_reclamo_venditore"("p_reclamo_id" "uuid", "p_merchant_user_id" "uuid", "p_corpo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calcola_tariffa_spedizione"("p_carrier" "text", "p_service" "text", "p_peso_grammi" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_prezzo   numeric;
  v_versione text;
begin
  if p_peso_grammi is null or p_peso_grammi <= 0 then
    return jsonb_build_object('ok', false, 'codice', 'PESO_MANCANTE',
      'messaggio', 'Peso del prodotto non configurato.');
  end if;

  select t.prezzo, v.codice
  into v_prezzo, v_versione
  from public.shipping_tariffs t
  join public.shipping_services s on s.id = t.service_id
  join public.shipping_carriers c on c.id = s.carrier_id
  join public.shipping_tariff_versions v on v.id = t.version_id
  where c.codice = p_carrier
    and s.codice = p_service
    and coalesce(c.attivo, false)
    and coalesce(s.attivo, false)
    and coalesce(v.attiva, false)
    and p_peso_grammi > t.peso_min_g
    and p_peso_grammi <= t.peso_max_g
  order by t.peso_max_g asc
  limit 1;

  if v_prezzo is null then
    return jsonb_build_object('ok', false, 'codice', 'TARIFFA_NON_TROVATA',
      'messaggio', 'Nessuna tariffa disponibile per il corriere/servizio/peso richiesti.');
  end if;

  return jsonb_build_object('ok', true, 'prezzo', v_prezzo, 'versione', v_versione);
end;
$$;


ALTER FUNCTION "public"."calcola_tariffa_spedizione"("p_carrier" "text", "p_service" "text", "p_peso_grammi" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."commissione_piattaforma_percentuale"() RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select valore_numeric from public.piattaforma_config
     where chiave = 'commissione_percentuale' limit 1),
    10.00
  );
$$;


ALTER FUNCTION "public"."commissione_piattaforma_percentuale"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_reset_token"("p_token_hash" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
begin
  update public.reset_tokens
     set used_at = now()
   where token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
  returning user_id into v_user_id;

  -- Pulizia: i token consumati/scaduti più vecchi di 7 giorni via via pl.
  delete from public.reset_tokens
   where created_at < now() - interval '7 days';

  return v_user_id;
end;
$$;


ALTER FUNCTION "public"."consume_reset_token"("p_token_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crea_ordine"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_key            text;
  v_prodotto_id    bigint;
  v_variante_id    uuid;
  v_quantita       integer;
  v_quantita_num   numeric;
  v_modalita       text;
  v_cliente_user_id uuid;
  v_cliente_nome   text;
  v_cliente_cognome text;
  v_cliente_telefono text;
  v_cliente_email  text;
  v_cliente_ip     text;
  v_ritiro_data    text;
  v_ritiro_fascia  text;
  v_sped_indirizzo text;
  v_sped_cap       text;
  v_sped_citta     text;
  v_sped_prov      text;
  v_sped_note      text;
  v_metodo_sped    text;
  v_carrier        text;
  v_servizio       text;
  v_metodo_pag     text;
  v_note           text;
  v_prodotto       record;
  v_negozio        record;
  v_variante       record;
  v_ordine         record;
  v_prezzo         numeric;
  v_immagine_riga  text;
  v_variante_nome  text;
  v_costo_sped     numeric := 0;
  v_peso_grammi    integer;
  v_tariffa        jsonb;
  v_tariffa_vers   text;
  v_gratuita       boolean;
  v_totale         numeric;
  v_commissione_pct numeric;
  v_commissione    numeric;
begin
  -- ── estrazione + validazione difensiva del payload (barriera finale) ──
  v_key := p_payload ->> 'idempotencyKey';
  if v_key is null or length(v_key) = 0 or length(v_key) > 64 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Chiave di idempotenza non valida.');
  end if;

  if p_payload ->> 'prodottoId' is null or p_payload ->> 'prodottoId' !~ '^[0-9]+$' then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Prodotto non valido.');
  end if;
  v_prodotto_id := (p_payload ->> 'prodottoId')::bigint;

  begin
    v_variante_id := nullif(p_payload ->> 'varianteId', '')::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida.');
  end;

  v_quantita_num := (p_payload ->> 'quantita')::numeric;
  if v_quantita_num is null or v_quantita_num <> trunc(v_quantita_num)
     or v_quantita_num < 1 or v_quantita_num > 99 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Quantità non valida (1-99).');
  end if;
  v_quantita := v_quantita_num::integer;

  v_modalita := p_payload ->> 'modalita';
  if v_modalita not in ('ritiro', 'spedizione') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Modalità di consegna non valida.');
  end if;

  v_cliente_nome := coalesce(p_payload ->> 'clienteNome', '');
  v_cliente_cognome := coalesce(p_payload ->> 'clienteCognome', '');
  if length(v_cliente_nome) = 0 or length(v_cliente_cognome) = 0
     or length(v_cliente_nome) > 80 or length(v_cliente_cognome) > 80 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Nome e cognome sono obbligatori.');
  end if;
  v_cliente_telefono := p_payload ->> 'clienteTelefono';
  v_cliente_email := p_payload ->> 'clienteEmail';
  v_cliente_ip := p_payload ->> 'clienteIp';
  v_ritiro_data := p_payload ->> 'ritiroData';
  v_ritiro_fascia := p_payload ->> 'ritiroFascia';
  v_sped_indirizzo := p_payload ->> 'spedizioneIndirizzo';
  v_sped_cap := p_payload ->> 'spedizioneCap';
  v_sped_citta := p_payload ->> 'spedizioneCitta';
  v_sped_prov := p_payload ->> 'spedizioneProvincia';
  v_sped_note := p_payload ->> 'spedizioneNote';
  v_carrier := p_payload ->> 'spedizioneCarrier';
  v_servizio := p_payload ->> 'spedizioneServizio';
  v_metodo_pag := p_payload ->> 'metodoPagamento';
  v_note := p_payload ->> 'note';

  -- ── Cliente autenticato (SERVER-ONLY) ──────────────────────────────────
  begin
    v_cliente_user_id := nullif(p_payload ->> 'clienteUserId', '')::uuid;
  exception
    when invalid_text_representation then
      v_cliente_user_id := null;
  end;

  if v_cliente_user_id is not null then
    begin
      if not exists (select 1 from auth.users u where u.id = v_cliente_user_id) then
        v_cliente_user_id := null;
      end if;
    exception
      when others then
        v_cliente_user_id := null;
    end;
  end if;

  if v_modalita = 'spedizione' then
    if v_sped_indirizzo is null or length(v_sped_indirizzo) = 0
       or v_sped_cap is null or v_sped_citta is null or length(v_sped_citta) = 0
       or v_sped_prov is null or length(v_sped_prov) = 0 then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Dati di spedizione incompleti.');
    end if;
    if v_sped_cap !~ '^[0-9]{5}$' then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il CAP deve essere composto da 5 cifre.');
    end if;
    if v_carrier not in ('poste_italiane', 'brt', 'locale', 'gls') then
      return jsonb_build_object('ok', false, 'codice', 'CORRIERE_NON_VALIDO', 'messaggio', 'Corriere di spedizione non valido.');
    end if;
    if (v_carrier = 'poste_italiane' and v_servizio not in ('standard', 'express'))
       or (v_carrier = 'brt' and v_servizio <> 'online')
       or (v_carrier = 'gls' and v_servizio <> 'standard')
       or (v_carrier = 'locale' and v_servizio <> 'locale') then
      return jsonb_build_object('ok', false, 'codice', 'SERVIZIO_NON_VALIDO', 'messaggio', 'Servizio di spedizione non valido per il corriere scelto.');
    end if;
    if v_metodo_pag not in ('carta', 'paypal', 'bonifico') then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Metodo di pagamento non valido.');
    end if;
  end if;

  -- ── 1. Idempotenza ─────────────────────────────────────────────────────
  select * into v_ordine
  from public.ordini
  where idempotency_key = v_key
  limit 1;

  if v_ordine.id is not null then
    return jsonb_build_object('ok', true, 'giaEsistente', true, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

  -- ── 2. LOCK riga prodotto ───────────────────────────────────────────────
  select * into v_prodotto
  from public.prodotti
  where id = v_prodotto_id
  for update;

  if v_prodotto.id is null then
    return jsonb_build_object('ok', false, 'codice', 'PRODOTTO_NON_TROVATO', 'messaggio', 'Prodotto non trovato.');
  end if;
  if not coalesce(v_prodotto.attivo, false) then
    return jsonb_build_object('ok', false, 'codice', 'PRODOTTO_INATTIVO', 'messaggio', 'Questo prodotto non è più disponibile.');
  end if;

  -- ── 3. Negozio (dal prodotto) ───────────────────────────────────────────
  select * into v_negozio
  from public.negozi
  where id = v_prodotto.negozio_id;

  if v_negozio.id is null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;
  if not coalesce(v_negozio.attivo, false) or v_negozio.deleted_at is not null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_INATTIVO', 'messaggio', 'Il negozio non è più attivo.');
  end if;

  -- ── 3bis. coerenza variante ↔ prodotto ─────────────────────────────────
  if coalesce(v_prodotto.ha_varianti, false) and v_variante_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VARIANTE_OBBLIGATORIA', 'messaggio', 'Seleziona una variante del prodotto.');
  end if;
  if not coalesce(v_prodotto.ha_varianti, false) and v_variante_id is not null then
    return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto.');
  end if;

  if v_variante_id is not null then
    select * into v_variante
    from public.prodotto_varianti
    where id = v_variante_id
    for update;

    if v_variante.id is null then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non trovata.');
    end if;
    if v_variante.prodotto_id <> v_prodotto_id then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto.');
    end if;
    if not coalesce(v_variante.attivo, false) then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Questa variante non è più disponibile.');
    end if;
  end if;

  -- ── 4. Prezzo, disponibilità e immagine (dal DATABASE) ─────────────────
  if v_variante_id is not null then
    v_prezzo := coalesce(v_variante.prezzo, v_prodotto.prezzo);
    if v_prezzo is null or v_prezzo < 0 then
      return jsonb_build_object('ok', false, 'codice', 'PREZZO_NON_VALIDO', 'messaggio', 'Prezzo del prodotto non valido.');
    end if;
    if v_variante.quantita_disponibile - v_variante.quantita_riservata < v_quantita then
      return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
        'messaggio', 'Disponibilità insufficiente (restano ' ||
          (v_variante.quantita_disponibile - v_variante.quantita_riservata) || ' pezzi).');
    end if;
    v_immagine_riga := coalesce(v_variante.immagine_principale, v_prodotto.immagine_principale);
    v_variante_nome := v_variante.nome;
  else
    v_prezzo := v_prodotto.prezzo;
    if v_prezzo is null or v_prezzo < 0 then
      return jsonb_build_object('ok', false, 'codice', 'PREZZO_NON_VALIDO', 'messaggio', 'Prezzo del prodotto non valido.');
    end if;
    if v_prodotto.quantita_disponibile is not null then
      if v_prodotto.quantita_disponibile < v_quantita then
        return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
          'messaggio', 'Disponibilità insufficiente (restano ' || v_prodotto.quantita_disponibile || ' pezzi).');
      end if;
    end if;
    v_immagine_riga := v_prodotto.immagine_principale;
    v_variante_nome := null;
  end if;

  -- ── 5. Costo spedizione CALCOLATO DAL SISTEMA (mai dal client) ─────────
  if v_modalita = 'spedizione' then
    if v_carrier = 'poste_italiane' or v_carrier = 'brt' or v_carrier = 'gls' then
      -- Spedizione gratuita configurata dal negozio per questo metodo?
      select exists(
        select 1 from public.negozio_metodi_spedizione nms
        where nms.negozio_id = v_negozio.id
          and nms.carrier = v_carrier
          and nms.servizio = v_servizio
          and nms.spedizione_gratuita = true
      ) into v_gratuita;

      if coalesce(v_gratuita, false) then
        v_costo_sped := 0;
        v_tariffa_vers := null;
        v_peso_grammi := v_negozio.pacco_peso_grammi;
      else
        if v_negozio.pacco_peso_grammi is null or v_negozio.pacco_peso_grammi <= 0 then
          return jsonb_build_object('ok', false, 'codice', 'PESO_MANCANTE',
            'messaggio', 'Il pacco di spedizione di questo negozio non è ancora configurato.');
        end if;
        -- V1 pacco unico per ordine: il peso deriva dal pacco configurato dal
        -- venditore, MAI dalla somma peso prodotto × quantità.
        v_peso_grammi := v_negozio.pacco_peso_grammi;
        v_tariffa := public.calcola_tariffa_spedizione(v_carrier, v_servizio, v_peso_grammi);
        if coalesce(v_tariffa ->> 'ok', 'false') <> 'true' then
          return jsonb_build_object('ok', false, 'codice', v_tariffa ->> 'codice', 'messaggio', v_tariffa ->> 'messaggio');
        end if;
        v_costo_sped := (v_tariffa ->> 'prezzo')::numeric;
        v_tariffa_vers := v_tariffa ->> 'versione';
      end if;
    elsif v_carrier = 'locale' then
      if v_prodotto.costo_spedizione_locale is null or v_prodotto.costo_spedizione_locale < 0 then
        return jsonb_build_object('ok', false, 'codice', 'CORRIERE_LOCALE_NON_DISPONIBILE',
          'messaggio', 'Il corriere locale non è disponibile per questo prodotto.');
      end if;
      v_costo_sped := v_prodotto.costo_spedizione_locale;
      v_tariffa_vers := null;
    end if;
    -- metodo_spedizione (legacy) = tier: express solo per Poste Express.
    v_metodo_sped := case when v_servizio = 'express' then 'express' else 'standard' end;
  end if;
  v_totale := round((v_prezzo * v_quantita + v_costo_sped)::numeric, 2);

  -- ── 5bis. COMMISSIONE PIATTAFORMA (solo server, snapshot deterministico) ─
  v_commissione_pct := public.commissione_piattaforma_percentuale();
  v_commissione := round((v_totale * v_commissione_pct / 100.0)::numeric, 2);
  if v_commissione < 0 then v_commissione := 0; end if;
  if v_commissione > v_totale then v_commissione := v_totale; end if;

  -- ── 6. Insert ordine ────────────────────────────────────────────────────
  insert into public.ordini (
    idempotency_key, modalita, totale, negozio_id, negozio_nome,
    cliente_user_id, cliente_nome, cliente_cognome, cliente_telefono, cliente_email, cliente_ip,
    ritiro_data, ritiro_fascia,
    spedizione_indirizzo, spedizione_cap, spedizione_citta, spedizione_provincia, spedizione_note,
    metodo_spedizione, spedizione_carrier, spedizione_servizio,
    spedizione_tariffa_versione, spedizione_peso_grammi,
    costo_spedizione, commissione_percentuale, commissione_importo,
    metodo_pagamento, note
  ) values (
    v_key, v_modalita, v_totale, v_negozio.id, v_negozio.nome,
    v_cliente_user_id, v_cliente_nome, v_cliente_cognome, v_cliente_telefono, v_cliente_email, v_cliente_ip,
    case when v_modalita = 'ritiro' then v_ritiro_data else null end,
    case when v_modalita = 'ritiro' then v_ritiro_fascia else null end,
    case when v_modalita = 'spedizione' then v_sped_indirizzo else null end,
    case when v_modalita = 'spedizione' then v_sped_cap else null end,
    case when v_modalita = 'spedizione' then v_sped_citta else null end,
    case when v_modalita = 'spedizione' then v_sped_prov else null end,
    case when v_modalita = 'spedizione' then v_sped_note else null end,
    case when v_modalita = 'spedizione' then v_metodo_sped else null end,
    case when v_modalita = 'spedizione' then v_carrier else null end,
    case when v_modalita = 'spedizione' then v_servizio else null end,
    case when v_modalita = 'spedizione' then v_tariffa_vers else null end,
    case when v_modalita = 'spedizione' then v_peso_grammi else null end,
    v_costo_sped, v_commissione_pct, v_commissione,
    case when v_modalita = 'spedizione' then v_metodo_pag else null end,
    v_note
  )
  returning * into v_ordine;

  -- ── 7. Riga ordine ──────────────────────────────────────────────────────
  insert into public.ordini_righe (
    ordine_id, prodotto_id, variante_id, variante_nome,
    nome_prodotto, prezzo_unitario, quantita, immagine_url
  ) values (
    v_ordine.id, v_prodotto_id, v_variante_id, v_variante_nome,
    v_prodotto.nome, v_prezzo, v_quantita, v_immagine_riga
  );

  -- ── 8. Decremento atomico scorte ────────────────────────────────────────
  if v_variante_id is not null then
    update public.prodotto_varianti
    set quantita_disponibile = quantita_disponibile - v_quantita
    where id = v_variante_id
      and quantita_disponibile - v_quantita >= 0;
    if not found then
      raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
    end if;
  else
    if v_prodotto.quantita_disponibile is not null then
      update public.prodotti
      set quantita_disponibile = quantita_disponibile - v_quantita
      where id = v_prodotto_id
        and quantita_disponibile - v_quantita >= 0;
      if not found then
        raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'giaEsistente', false, 'ordine', public.ordine_to_json(v_ordine.id));

exception
  when unique_violation then
    select * into v_ordine
    from public.ordini
    where idempotency_key = v_key
    limit 1;
    if v_ordine.id is not null then
      return jsonb_build_object('ok', true, 'giaEsistente', true, 'ordine', public.ordine_to_json(v_ordine.id));
    end if;
    raise;
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare l''ordine.');
end;
$_$;


ALTER FUNCTION "public"."crea_ordine"("p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crea_ordine_carrello"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_key            text;
  v_modalita       text;
  v_cliente_user_id uuid;
  v_cliente_nome   text;
  v_cliente_cognome text;
  v_cliente_telefono text;
  v_cliente_email  text;
  v_cliente_ip     text;
  v_ritiro_data    text;
  v_ritiro_fascia  text;
  v_sped_indirizzo text;
  v_sped_cap       text;
  v_sped_citta     text;
  v_sped_prov      text;
  v_sped_note      text;
  v_metodo_sped    text;
  v_carrier        text;
  v_servizio       text;
  v_metodo_pag     text;
  v_note           text;

  v_righe          jsonb;
  v_n_righe        integer;
  v_riga           jsonb;
  v_pos            integer := 0;
  v_prodotto_id    bigint;
  v_variante_id    uuid;
  v_quantita       integer;
  v_quantita_num   numeric;

  v_prodotto_ids   bigint[];
  v_variante_ids   uuid[];
  v_pid            bigint;
  v_vid            uuid;

  v_prodotto       record;
  v_variante       record;
  v_negozio        record;
  v_ordine         record;
  v_riga_row       record;
  v_negozio_id     uuid;
  v_negozi_distinti integer;
  v_qta_prod       integer;
  v_prezzo         numeric;
  v_totale         numeric := 0;
  v_costo_sped     numeric := 0;
  v_peso_grammi    integer := 0;
  v_peso_mancante  boolean := false;
  v_max_locale     numeric := null;
  v_locale_mancante boolean := false;
  v_tariffa        jsonb;
  v_tariffa_vers   text;
  v_gratuita       boolean;
  v_commissione_pct numeric;
  v_commissione    numeric;
begin
  v_key := p_payload ->> 'idempotencyKey';
  if v_key is null or length(v_key) = 0 or length(v_key) > 64 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Chiave di idempotenza non valida.');
  end if;

  v_modalita := p_payload ->> 'modalita';
  if v_modalita not in ('ritiro', 'spedizione') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Modalità di consegna non valida.');
  end if;

  v_cliente_nome := coalesce(p_payload ->> 'clienteNome', '');
  v_cliente_cognome := coalesce(p_payload ->> 'clienteCognome', '');
  if length(v_cliente_nome) = 0 or length(v_cliente_cognome) = 0
     or length(v_cliente_nome) > 80 or length(v_cliente_cognome) > 80 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Nome e cognome sono obbligatori.');
  end if;
  v_cliente_telefono := p_payload ->> 'clienteTelefono';
  v_cliente_email := p_payload ->> 'clienteEmail';
  v_cliente_ip := p_payload ->> 'clienteIp';
  v_ritiro_data := p_payload ->> 'ritiroData';
  v_ritiro_fascia := p_payload ->> 'ritiroFascia';
  v_sped_indirizzo := p_payload ->> 'spedizioneIndirizzo';
  v_sped_cap := p_payload ->> 'spedizioneCap';
  v_sped_citta := p_payload ->> 'spedizioneCitta';
  v_sped_prov := p_payload ->> 'spedizioneProvincia';
  v_sped_note := p_payload ->> 'spedizioneNote';
  v_carrier := p_payload ->> 'spedizioneCarrier';
  v_servizio := p_payload ->> 'spedizioneServizio';
  v_metodo_pag := p_payload ->> 'metodoPagamento';
  v_note := p_payload ->> 'note';

  if v_modalita = 'spedizione' then
    if v_sped_indirizzo is null or length(v_sped_indirizzo) = 0
       or v_sped_cap is null or v_sped_citta is null or length(v_sped_citta) = 0
       or v_sped_prov is null or length(v_sped_prov) = 0 then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Dati di spedizione incompleti.');
    end if;
    if v_sped_cap !~ '^[0-9]{5}$' then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il CAP deve essere composto da 5 cifre.');
    end if;
    if v_carrier not in ('poste_italiane', 'brt', 'locale', 'gls') then
      return jsonb_build_object('ok', false, 'codice', 'CORRIERE_NON_VALIDO', 'messaggio', 'Corriere di spedizione non valido.');
    end if;
    if (v_carrier = 'poste_italiane' and v_servizio not in ('standard', 'express'))
       or (v_carrier = 'brt' and v_servizio <> 'online')
       or (v_carrier = 'gls' and v_servizio <> 'standard')
       or (v_carrier = 'locale' and v_servizio <> 'locale') then
      return jsonb_build_object('ok', false, 'codice', 'SERVIZIO_NON_VALIDO', 'messaggio', 'Servizio di spedizione non valido per il corriere scelto.');
    end if;
    if v_metodo_pag not in ('carta', 'paypal', 'bonifico') then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Metodo di pagamento non valido.');
    end if;
  end if;

  begin
    v_cliente_user_id := nullif(p_payload ->> 'clienteUserId', '')::uuid;
  exception
    when invalid_text_representation then
      v_cliente_user_id := null;
  end;
  if v_cliente_user_id is not null then
    begin
      if not exists (select 1 from auth.users u where u.id = v_cliente_user_id) then
        v_cliente_user_id := null;
      end if;
    exception
      when others then
        v_cliente_user_id := null;
    end;
  end if;

  v_righe := p_payload -> 'righe';
  if jsonb_typeof(v_righe) <> 'array' then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Carrello non valido.');
  end if;
  v_n_righe := jsonb_array_length(v_righe);
  if v_n_righe < 2 or v_n_righe > 50 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il carrello deve contenere da 2 a 50 prodotti.');
  end if;

  select * into v_ordine
  from public.ordini
  where idempotency_key = v_key
  limit 1;
  if v_ordine.id is not null then
    return jsonb_build_object('ok', true, 'giaEsistente', true, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

  create temp table tt_carrello_righe (
    pos          integer primary key,
    prodotto_id  bigint not null,
    variante_id  uuid,
    quantita     integer not null
  ) on commit drop;

  v_pos := 0;
  for v_riga in select value from jsonb_array_elements(v_righe)
  loop
    v_pos := v_pos + 1;

    if v_riga ->> 'prodottoId' is null or v_riga ->> 'prodottoId' !~ '^[0-9]+$' then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Prodotto non valido (riga ' || v_pos || ').');
    end if;
    v_prodotto_id := (v_riga ->> 'prodottoId')::bigint;

    begin
      v_variante_id := nullif(v_riga ->> 'varianteId', '')::uuid;
    exception
      when invalid_text_representation then
        return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida (riga ' || v_pos || ').');
    end;

    v_quantita_num := (v_riga ->> 'quantita')::numeric;
    if v_quantita_num is null or v_quantita_num <> trunc(v_quantita_num)
       or v_quantita_num < 1 or v_quantita_num > 99 then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Quantità non valida (1-99) per la riga ' || v_pos || '.');
    end if;
    v_quantita := v_quantita_num::integer;

    insert into tt_carrello_righe (pos, prodotto_id, variante_id, quantita)
    values (v_pos, v_prodotto_id, v_variante_id, v_quantita);
  end loop;

  select array_agg(distinct prodotto_id order by prodotto_id)
  into v_prodotto_ids
  from tt_carrello_righe;

  create temp table tt_carrello_prodotti (
    id                   bigint primary key,
    negozio_id           uuid,
    nome                 text,
    prezzo               numeric,
    quantita_disponibile integer,
    immagine_principale  text,
    attivo               boolean,
    ha_varianti          boolean,
    peso_grammi          integer,
    costo_spedizione_locale numeric(10,2)
  ) on commit drop;

  foreach v_pid in array v_prodotto_ids
  loop
    select * into v_prodotto
    from public.prodotti
    where id = v_pid
    for update;

    if v_prodotto.id is null then
      return jsonb_build_object('ok', false, 'codice', 'PRODOTTO_NON_TROVATO', 'messaggio', 'Prodotto non trovato.');
    end if;
    if not coalesce(v_prodotto.attivo, false) then
      return jsonb_build_object('ok', false, 'codice', 'PRODOTTO_INATTIVO', 'messaggio', 'Un prodotto del carrello non è più disponibile.');
    end if;

    insert into tt_carrello_prodotti (id, negozio_id, nome, prezzo, quantita_disponibile, immagine_principale, attivo, ha_varianti, peso_grammi, costo_spedizione_locale)
    values (
      v_prodotto.id, v_prodotto.negozio_id, v_prodotto.nome, v_prodotto.prezzo,
      v_prodotto.quantita_disponibile, v_prodotto.immagine_principale,
      v_prodotto.attivo, coalesce(v_prodotto.ha_varianti, false),
      v_prodotto.peso_grammi, v_prodotto.costo_spedizione_locale
    );
  end loop;

  select count(distinct negozio_id) into v_negozi_distinti
  from tt_carrello_prodotti;
  if v_negozi_distinti <> 1 then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_DIVERSO', 'messaggio', 'Il carrello contiene prodotti di negozi diversi: completa l''acquisto per ogni negozio separatamente.');
  end if;

  select negozio_id into v_negozio_id
  from tt_carrello_prodotti
  limit 1;

  select * into v_negozio
  from public.negozi
  where id = v_negozio_id;

  if v_negozio.id is null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;
  if not coalesce(v_negozio.attivo, false) or v_negozio.deleted_at is not null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_INATTIVO', 'messaggio', 'Il negozio non è più attivo.');
  end if;

  create temp table tt_carrello_varianti (
    id                   uuid primary key,
    prodotto_id          bigint,
    nome                 text,
    prezzo               numeric,
    quantita_disponibile integer,
    quantita_riservata   integer,
    immagine_principale  text,
    attivo               boolean
  ) on commit drop;

  select array_agg(distinct variante_id order by variante_id)
  into v_variante_ids
  from tt_carrello_righe
  where variante_id is not null;

  if v_variante_ids is not null then
    foreach v_vid in array v_variante_ids
    loop
      select * into v_variante
      from public.prodotto_varianti
      where id = v_vid
      for update;

      if v_variante.id is null then
        return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non trovata.');
      end if;

      insert into tt_carrello_varianti (id, prodotto_id, nome, prezzo, quantita_disponibile, quantita_riservata, immagine_principale, attivo)
      values (
        v_variante.id, v_variante.prodotto_id, v_variante.nome, v_variante.prezzo,
        v_variante.quantita_disponibile, v_variante.quantita_riservata,
        v_variante.immagine_principale, v_variante.attivo
      );
    end loop;
  end if;

  for v_riga_row in
    select r.pos, r.prodotto_id, r.variante_id, r.quantita,
           p.nome as nome_prodotto, p.prezzo as prezzo_prodotto,
           p.quantita_disponibile as qta_prodotto, p.immagine_principale as imm_prodotto,
           p.ha_varianti, p.peso_grammi, p.costo_spedizione_locale
    from tt_carrello_righe r
    join tt_carrello_prodotti p on p.id = r.prodotto_id
    order by r.pos
  loop
    if v_riga_row.ha_varianti and v_riga_row.variante_id is null then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_OBBLIGATORIA', 'messaggio', 'Seleziona una variante del prodotto (riga ' || v_riga_row.pos || ').');
    end if;
    if not v_riga_row.ha_varianti and v_riga_row.variante_id is not null then
      return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto (riga ' || v_riga_row.pos || ').');
    end if;

    if v_riga_row.variante_id is not null then
      select * into v_variante
      from tt_carrello_varianti
      where id = v_riga_row.variante_id;
      if v_variante.id is null then
        return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non trovata (riga ' || v_riga_row.pos || ').');
      end if;
      if v_variante.prodotto_id <> v_riga_row.prodotto_id then
        return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Variante non valida per questo prodotto (riga ' || v_riga_row.pos || ').');
      end if;
      if not coalesce(v_variante.attivo, false) then
        return jsonb_build_object('ok', false, 'codice', 'VARIANTE_NON_VALIDA', 'messaggio', 'Questa variante non è più disponibile (riga ' || v_riga_row.pos || ').');
      end if;

      v_prezzo := coalesce(v_variante.prezzo, v_riga_row.prezzo_prodotto);
      if v_prezzo is null or v_prezzo < 0 then
        return jsonb_build_object('ok', false, 'codice', 'PREZZO_NON_VALIDO', 'messaggio', 'Prezzo del prodotto non valido (riga ' || v_riga_row.pos || ').');
      end if;
      if v_variante.quantita_disponibile - v_variante.quantita_riservata < v_riga_row.quantita then
        return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
          'messaggio', 'Disponibilità insufficiente per "' || coalesce(v_variante.nome, v_riga_row.nome_prodotto) || '" (riga ' || v_riga_row.pos || '): restano ' ||
          (v_variante.quantita_disponibile - v_variante.quantita_riservata) || ' pezzi.');
      end if;
    else
      v_prezzo := v_riga_row.prezzo_prodotto;
      if v_prezzo is null or v_prezzo < 0 then
        return jsonb_build_object('ok', false, 'codice', 'PREZZO_NON_VALIDO', 'messaggio', 'Prezzo del prodotto non valido (riga ' || v_riga_row.pos || ').');
      end if;
      if v_riga_row.qta_prodotto is not null and v_riga_row.qta_prodotto < v_riga_row.quantita then
        return jsonb_build_object('ok', false, 'codice', 'SCORTE_INSUFFICIENTI',
          'messaggio', 'Disponibilità insufficiente per "' || v_riga_row.nome_prodotto || '" (riga ' || v_riga_row.pos || '): restano ' || v_riga_row.qta_prodotto || ' pezzi.');
      end if;
    end if;

    v_totale := v_totale + round((v_prezzo * v_riga_row.quantita)::numeric, 2);

    -- Corriere locale: MAX tra le tariffe locali dei prodotti dell'ordine.
    if v_carrier = 'locale' then
      if v_riga_row.costo_spedizione_locale is null or v_riga_row.costo_spedizione_locale < 0 then
        v_locale_mancante := true;
      elsif v_max_locale is null or v_riga_row.costo_spedizione_locale > v_max_locale then
        v_max_locale := v_riga_row.costo_spedizione_locale;
      end if;
    end if;
  end loop;

  -- ── 7. Costo spedizione CALCOLATO DAL SISTEMA (mai dal client) ─────────
  if v_modalita = 'spedizione' then
    if v_carrier = 'poste_italiane' or v_carrier = 'brt' or v_carrier = 'gls' then
      select exists(
        select 1 from public.negozio_metodi_spedizione nms
        where nms.negozio_id = v_negozio.id
          and nms.carrier = v_carrier
          and nms.servizio = v_servizio
          and nms.spedizione_gratuita = true
      ) into v_gratuita;

      if coalesce(v_gratuita, false) then
        v_costo_sped := 0;
        v_tariffa_vers := null;
        v_peso_grammi := v_negozio.pacco_peso_grammi;
      else
        if v_negozio.pacco_peso_grammi is null or v_negozio.pacco_peso_grammi <= 0 then
          return jsonb_build_object('ok', false, 'codice', 'PESO_MANCANTE',
            'messaggio', 'Il pacco di spedizione di questo negozio non è ancora configurato.');
        end if;
        v_peso_grammi := v_negozio.pacco_peso_grammi;
        v_tariffa := public.calcola_tariffa_spedizione(v_carrier, v_servizio, v_peso_grammi);
        if coalesce(v_tariffa ->> 'ok', 'false') <> 'true' then
          return jsonb_build_object('ok', false, 'codice', v_tariffa ->> 'codice', 'messaggio', v_tariffa ->> 'messaggio');
        end if;
        v_costo_sped := (v_tariffa ->> 'prezzo')::numeric;
        v_tariffa_vers := v_tariffa ->> 'versione';
      end if;
    elsif v_carrier = 'locale' then
      if v_locale_mancante or v_max_locale is null then
        return jsonb_build_object('ok', false, 'codice', 'CORRIERE_LOCALE_NON_DISPONIBILE',
          'messaggio', 'Il corriere locale non è disponibile per uno o più prodotti del carrello.');
      end if;
      -- Un ordine = una consegna del corriere locale: si applica il prezzo
      -- MASSIMO tra le tariffe locali dei prodotti (mai la somma cieca).
      v_costo_sped := v_max_locale;
      v_tariffa_vers := null;
    end if;
    v_metodo_sped := case when v_servizio = 'express' then 'express' else 'standard' end;
  end if;
  v_totale := round((v_totale + v_costo_sped)::numeric, 2);

  -- ── 7bis. COMMISSIONE PIATTAFORMA (solo server, snapshot deterministico) ─
  v_commissione_pct := public.commissione_piattaforma_percentuale();
  v_commissione := round((v_totale * v_commissione_pct / 100.0)::numeric, 2);
  if v_commissione < 0 then v_commissione := 0; end if;
  if v_commissione > v_totale then v_commissione := v_totale; end if;

  -- ── 8. Insert ordine ────────────────────────────────────────────────────
  insert into public.ordini (
    idempotency_key, modalita, totale, negozio_id, negozio_nome,
    cliente_user_id, cliente_nome, cliente_cognome, cliente_telefono, cliente_email, cliente_ip,
    ritiro_data, ritiro_fascia,
    spedizione_indirizzo, spedizione_cap, spedizione_citta, spedizione_provincia, spedizione_note,
    metodo_spedizione, spedizione_carrier, spedizione_servizio,
    spedizione_tariffa_versione, spedizione_peso_grammi,
    costo_spedizione, commissione_percentuale, commissione_importo,
    metodo_pagamento, note
  ) values (
    v_key, v_modalita, v_totale, v_negozio.id, v_negozio.nome,
    v_cliente_user_id, v_cliente_nome, v_cliente_cognome, v_cliente_telefono, v_cliente_email, v_cliente_ip,
    case when v_modalita = 'ritiro' then v_ritiro_data else null end,
    case when v_modalita = 'ritiro' then v_ritiro_fascia else null end,
    case when v_modalita = 'spedizione' then v_sped_indirizzo else null end,
    case when v_modalita = 'spedizione' then v_sped_cap else null end,
    case when v_modalita = 'spedizione' then v_sped_citta else null end,
    case when v_modalita = 'spedizione' then v_sped_prov else null end,
    case when v_modalita = 'spedizione' then v_sped_note else null end,
    case when v_modalita = 'spedizione' then v_metodo_sped else null end,
    case when v_modalita = 'spedizione' then v_carrier else null end,
    case when v_modalita = 'spedizione' then v_servizio else null end,
    case when v_modalita = 'spedizione' then v_tariffa_vers else null end,
    case when v_modalita = 'spedizione' then v_peso_grammi else null end,
    v_costo_sped, v_commissione_pct, v_commissione,
    case when v_modalita = 'spedizione' then v_metodo_pag else null end,
    v_note
  )
  returning * into v_ordine;

  -- ── 9. Insert N righe ───────────────────────────────────────────────────
  for v_riga_row in
    select r.pos, r.prodotto_id, r.variante_id, r.quantita,
           p.nome as nome_prodotto,
           case when r.variante_id is not null then coalesce(v.prezzo, p.prezzo) else p.prezzo end as prezzo,
           case when r.variante_id is not null then coalesce(v.immagine_principale, p.immagine_principale) else p.immagine_principale end as immagine,
           v.nome as variante_nome
    from tt_carrello_righe r
    join tt_carrello_prodotti p on p.id = r.prodotto_id
    left join tt_carrello_varianti v on v.id = r.variante_id
    order by r.pos
  loop
    insert into public.ordini_righe (
      ordine_id, prodotto_id, variante_id, variante_nome,
      nome_prodotto, prezzo_unitario, quantita, immagine_url
    ) values (
      v_ordine.id, v_riga_row.prodotto_id, v_riga_row.variante_id, v_riga_row.variante_nome,
      v_riga_row.nome_prodotto, v_riga_row.prezzo, v_riga_row.quantita, v_riga_row.immagine
    );
  end loop;

  -- ── 10. Decremento ATOMICO stock ────────────────────────────────────────
  for v_riga_row in
    select r.prodotto_id, r.variante_id, r.quantita
    from tt_carrello_righe r
    order by r.pos
  loop
    if v_riga_row.variante_id is not null then
      update public.prodotto_varianti
      set quantita_disponibile = quantita_disponibile - v_riga_row.quantita
      where id = v_riga_row.variante_id
        and quantita_disponibile - v_riga_row.quantita >= 0;
      if not found then
        raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
      end if;
    else
      select quantita_disponibile into v_qta_prod
      from tt_carrello_prodotti
      where id = v_riga_row.prodotto_id;
      if v_qta_prod is not null then
        update public.prodotti
        set quantita_disponibile = quantita_disponibile - v_riga_row.quantita
        where id = v_riga_row.prodotto_id
          and quantita_disponibile - v_riga_row.quantita >= 0;
        if not found then
          raise exception 'SCORTE_INSUFFICIENTI' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'giaEsistente', false, 'ordine', public.ordine_to_json(v_ordine.id));

exception
  when unique_violation then
    select * into v_ordine
    from public.ordini
    where idempotency_key = v_key
    limit 1;
    if v_ordine.id is not null then
      return jsonb_build_object('ok', true, 'giaEsistente', true, 'ordine', public.ordine_to_json(v_ordine.id));
    end if;
    raise;
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare l''ordine.');
end;
$_$;


ALTER FUNCTION "public"."crea_ordine_carrello"("p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crea_reclamo_ordine"("p_ordine_id" "uuid", "p_cliente_user_id" "uuid", "p_tipo" "text" DEFAULT 'ordine_non_arrivato'::"text", "p_messaggio" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ordine    record;
  v_reclamo   record;
  v_messaggio text;
begin
  -- ── Guardie ──────────────────────────────────────────────────────────
  if p_cliente_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Reclami disponibili solo per utenti autenticati.');
  end if;
  if p_tipo is null or p_tipo not in ('ordine_non_arrivato') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Tipo di reclamo non valido.');
  end if;
  v_messaggio := nullif(trim(coalesce(p_messaggio, '')), '');
  if v_messaggio is not null and length(v_messaggio) > 1000 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Messaggio troppo lungo (max 1000 caratteri).');
  end if;

  -- ── Ordine + ownership (mai fidarsi di un id dal browser) ────────────
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  limit 1;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;
  if v_ordine.cliente_user_id is distinct from p_cliente_user_id then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi segnalare un ordine altrui.');
  end if;
  if v_ordine.stato = 'cancellato' then
    return jsonb_build_object('ok', false, 'codice', 'RECLAMO_NON_AMMESSO', 'messaggio', 'Gli ordini annullati non possono essere segnalati.');
  end if;

  -- ── Deduplicazione: reclamo ATTIVO già esistente → lo restituisce ────
  select * into v_reclamo
  from public.ordine_reclami
  where ordine_id = p_ordine_id
    and tipo = p_tipo
    and stato in ('aperto', 'in_gestione')
  limit 1;

  if v_reclamo.id is not null then
    return jsonb_build_object('ok', true, 'giaEsistente', true, 'reclamo', public.reclamo_to_json(v_reclamo.id));
  end if;

  -- ── Inserimento con snapshot dei dati cliente dall'ordine ────────────
  insert into public.ordine_reclami (
    ordine_id, negozio_id, cliente_user_id, cliente_nome, cliente_email, cliente_telefono,
    tipo, messaggio, stato
  ) values (
    v_ordine.id, v_ordine.negozio_id, p_cliente_user_id,
    trim(coalesce(v_ordine.cliente_nome, '') || ' ' || coalesce(v_ordine.cliente_cognome, '')),
    v_ordine.cliente_email, v_ordine.cliente_telefono,
    p_tipo, v_messaggio, 'aperto'
  )
  returning * into v_reclamo;

  return jsonb_build_object('ok', true, 'giaEsistente', false, 'reclamo', public.reclamo_to_json(v_reclamo.id));

exception
  when unique_violation then
    -- Corsa: qualcun altro ha appena creato il reclamo attivo → restituisci
    -- quello esistente (nessun secondo reclamo, nessun errore al cliente).
    select * into v_reclamo
    from public.ordine_reclami
    where ordine_id = p_ordine_id
      and tipo = p_tipo
      and stato in ('aperto', 'in_gestione')
    limit 1;
    if v_reclamo.id is not null then
      return jsonb_build_object('ok', true, 'giaEsistente', true, 'reclamo', public.reclamo_to_json(v_reclamo.id));
    end if;
    raise;
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il reclamo.');
end;
$$;


ALTER FUNCTION "public"."crea_reclamo_ordine"("p_ordine_id" "uuid", "p_cliente_user_id" "uuid", "p_tipo" "text", "p_messaggio" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crea_segnalazione"("p_user_id" "uuid", "p_user_email" "text", "p_tipo" "text", "p_titolo" "text", "p_descrizione" "text", "p_target_type" "text" DEFAULT NULL::"text", "p_target_id" "uuid" DEFAULT NULL::"uuid", "p_target_name" "text" DEFAULT NULL::"text", "p_negozio_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
begin
  insert into public.segnalazioni (
    user_id,
    user_email,
    tipo,
    titolo,
    descrizione,
    target_type,
    target_id,
    target_name,
    negozio_id
  ) values (
    p_user_id,
    p_user_email,
    p_tipo,
    p_titolo,
    p_descrizione,
    p_target_type,
    p_target_id,
    p_target_name,
    p_negozio_id
  )
  returning id into v_id;

  return v_id;
end $$;


ALTER FUNCTION "public"."crea_segnalazione"("p_user_id" "uuid", "p_user_email" "text", "p_tipo" "text", "p_titolo" "text", "p_descrizione" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_name" "text", "p_negozio_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;
$$;


ALTER FUNCTION "public"."get_user_id_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_merchant_for_store"("target_store_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.negozi
    where negozi.id = target_store_id::uuid
      and negozi.owner_user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_merchant_for_store"("target_store_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_admin_activity"("p_admin_user_id" "uuid", "p_admin_email" "text", "p_operation_type" "text", "p_target_type" "text", "p_target_id" "uuid" DEFAULT NULL::"uuid", "p_target_name" "text" DEFAULT NULL::"text", "p_negozio_id" "uuid" DEFAULT NULL::"uuid", "p_negozio_nome" "text" DEFAULT NULL::"text", "p_result" "text" DEFAULT 'success'::"text", "p_detail" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
begin
  insert into public.admin_activity_log (
    admin_user_id,
    admin_email,
    operation_type,
    target_type,
    target_id,
    target_name,
    negozio_id,
    negozio_nome,
    result,
    detail
  ) values (
    p_admin_user_id,
    p_admin_email,
    p_operation_type,
    p_target_type,
    p_target_id,
    p_target_name,
    p_negozio_id,
    p_negozio_nome,
    p_result,
    p_detail
  )
  returning id into v_id;

  return v_id;
end $$;


ALTER FUNCTION "public"."log_admin_activity"("p_admin_user_id" "uuid", "p_admin_email" "text", "p_operation_type" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_name" "text", "p_negozio_id" "uuid", "p_negozio_nome" "text", "p_result" "text", "p_detail" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ordine_to_json"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'id', o.id::text,
    'numero', o.numero,
    'stato', o.stato,
    'totale', o.totale,
    'createdAt', o.created_at::text,
    'modalita', o.modalita,
    'negozioId', o.negozio_id::text,
    'negozioNome', o.negozio_nome,
    'ritiroData', o.ritiro_data,
    'ritiroFascia', o.ritiro_fascia,
    'righe', coalesce((
      select jsonb_agg(jsonb_build_object(
        'prodottoId', r.prodotto_id::text,
        'nomeProdotto', r.nome_prodotto,
        'prezzoUnitario', r.prezzo_unitario,
        'quantita', r.quantita,
        'immagineUrl', r.immagine_url
      ) order by r.created_at)
      from public.ordini_righe r
      where r.ordine_id = o.id
    ), '[]'::jsonb)
  )
  from public.ordini o
  where o.id = p_id;
$$;


ALTER FUNCTION "public"."ordine_to_json"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ordini_eventi_trigger_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_label text;
begin
  if tg_op = 'INSERT' then
    insert into public.ordini_eventi (ordine_id, evento, dettaglio)
    values (new.id, 'ordine_ricevuto', 'Ordine ricevuto');
    return new;
  end if;

  -- Cambio stato ORDINE (invariato rispetto a 20260815).
  if tg_op = 'UPDATE' and new.stato is distinct from old.stato then
    v_label := case new.stato
      when 'in_preparazione' then 'Ordine ricevuto'
      when 'confermato'      then 'Ordine confermato'
      when 'in_lavorazione'  then 'Ordine in lavorazione'
      when 'pronto'          then 'Ordine pronto'
      when 'in_consegna'     then 'Ordine in consegna'
      when 'consegnato'      then 'Ordine completato'
      when 'cancellato'      then 'Ordine annullato'
      else 'Stato aggiornato'
    end;
    insert into public.ordini_eventi (ordine_id, evento, dettaglio, motivo, nota, autore_id)
    values (new.id, new.stato, v_label, new.annullato_motivo, new.annullato_nota, new.aggiornato_da);
    return new;
  end if;

  -- Cambio stato SPEDIZIONE (nuovo, 20260903).
  if tg_op = 'UPDATE' and new.stato_spedizione is distinct from old.stato_spedizione then
    v_label := case
      when new.stato_spedizione = 'non_affidata' then 'Spedizione da affidare'
      when new.stato_spedizione = 'affidata' and old.stato_spedizione = 'problema' then 'Spedizione nuovamente affidata'
      when new.stato_spedizione = 'affidata' then 'Spedizione affidata al corriere'
      when new.stato_spedizione = 'in_transito' then 'Spedizione in transito'
      when new.stato_spedizione = 'consegnata' then 'Spedizione consegnata'
      when new.stato_spedizione = 'problema' then 'Problema spedizione'
      else 'Spedizione aggiornata'
    end;
    insert into public.ordini_eventi (ordine_id, evento, dettaglio, autore_id)
    values (new.id, 'spedizione_' || coalesce(new.stato_spedizione, 'aggiornata'), v_label, new.aggiornato_da);
    return new;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."ordini_eventi_trigger_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagamenti_credenziali_leggi"("p_negozio_id" "uuid", "p_provider" "text", "p_decifra" boolean DEFAULT false, "p_chiave" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_riga public.negozio_pagamenti%rowtype;
  v_secret text;
  v_webhook_secret text;
begin
  if p_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Negozio non valido.');
  end if;
  if p_provider is null or p_provider not in ('klarna', 'scalapay', 'paypal', 'stripe', 'bonifico') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Provider non valido.');
  end if;

  select * into v_riga
  from public.negozio_pagamenti
  where negozio_id = p_negozio_id and provider = p_provider
  limit 1;

  if v_riga.id is null then
    return jsonb_build_object('ok', true, 'presente', false, 'provider', p_provider);
  end if;

  if p_decifra then
    if p_chiave is null or length(btrim(p_chiave)) = 0 then
      return jsonb_build_object('ok', false, 'codice', 'CHIAVE_MANCANTE', 'messaggio', 'Chiave di cifratura non configurata.');
    end if;
    begin
      -- NOTA: la colonna è TEXT; pgp_sym_decrypt richiede bytea → cast
      -- esplicito ::bytea (senza, 42883 "function does not exist").
      v_secret := case
        when v_riga.secret_encrypted is not null then pgp_sym_decrypt(v_riga.secret_encrypted::bytea, p_chiave)
        else null end;
      v_webhook_secret := case
        when v_riga.webhook_secret_encrypted is not null then pgp_sym_decrypt(v_riga.webhook_secret_encrypted::bytea, p_chiave)
        else null end;
    exception
      when others then
        return jsonb_build_object('ok', false, 'codice', 'CHIAVE_ERRATA', 'messaggio', 'Impossibile decifrare le credenziali (chiave non valida).');
    end;
    return jsonb_build_object(
      'ok', true, 'presente', true, 'provider', p_provider,
      'attivo', v_riga.attivo, 'test_mode', v_riga.test_mode, 'client_id', v_riga.client_id,
      'payee_email', v_riga.payee_email, 'iban', v_riga.iban,
      'account_id', v_riga.account_id, 'account_name', v_riga.account_name,
      'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null),
      'secret', v_secret, 'webhook_secret', v_webhook_secret
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'presente', true, 'provider', p_provider,
    'attivo', v_riga.attivo, 'test_mode', v_riga.test_mode, 'client_id', v_riga.client_id,
    'payee_email', v_riga.payee_email, 'iban', v_riga.iban,
    'account_id', v_riga.account_id, 'account_name', v_riga.account_name,
    'has_secret', (v_riga.secret_encrypted is not null or v_riga.webhook_secret_encrypted is not null)
  );
end;
$$;


ALTER FUNCTION "public"."pagamenti_credenziali_leggi"("p_negozio_id" "uuid", "p_provider" "text", "p_decifra" boolean, "p_chiave" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagamenti_credenziali_salva"("p_negozio_id" "uuid", "p_provider" "text", "p_attivo" boolean DEFAULT NULL::boolean, "p_test_mode" boolean DEFAULT NULL::boolean, "p_client_id" "text" DEFAULT NULL::"text", "p_payee_email" "text" DEFAULT NULL::"text", "p_iban" "text" DEFAULT NULL::"text", "p_secret" "text" DEFAULT NULL::"text", "p_webhook_secret" "text" DEFAULT NULL::"text", "p_chiave" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if p_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Negozio non valido.');
  end if;
  if p_provider is null or p_provider not in ('klarna', 'scalapay', 'paypal', 'stripe', 'bonifico') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Provider non valido.');
  end if;
  if not exists (select 1 from public.negozi where id = p_negozio_id) then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;

  if p_provider = 'bonifico' then
    p_secret := null;
    p_webhook_secret := null;
  end if;

  if (p_secret is not null and length(btrim(p_secret)) > 0)
     or (p_webhook_secret is not null and length(btrim(p_webhook_secret)) > 0) then
    if p_chiave is null or length(btrim(p_chiave)) = 0 then
      return jsonb_build_object('ok', false, 'codice', 'CHIAVE_MANCANTE', 'messaggio', 'Chiave di cifratura non configurata.');
    end if;
  end if;

  insert into public.negozio_pagamenti (
    negozio_id, provider, attivo, test_mode, client_id,
    secret_encrypted, webhook_secret_encrypted, payee_email, iban
  ) values (
    p_negozio_id, p_provider,
    coalesce(p_attivo, false),
    coalesce(p_test_mode, true),
    p_client_id,
    case when p_secret is not null and length(btrim(p_secret)) > 0
         then pgp_sym_encrypt(btrim(p_secret), p_chiave) else null end,
    case when p_webhook_secret is not null and length(btrim(p_webhook_secret)) > 0
         then pgp_sym_encrypt(btrim(p_webhook_secret), p_chiave) else null end,
    p_payee_email, p_iban
  )
  on conflict (negozio_id, provider) do update set
    attivo              = coalesce(p_attivo, public.negozio_pagamenti.attivo),
    test_mode           = coalesce(p_test_mode, public.negozio_pagamenti.test_mode),
    client_id           = coalesce(p_client_id, public.negozio_pagamenti.client_id),
    payee_email         = coalesce(p_payee_email, public.negozio_pagamenti.payee_email),
    iban                = coalesce(p_iban, public.negozio_pagamenti.iban),
    secret_encrypted    = case
      when excluded.secret_encrypted is not null then excluded.secret_encrypted
      else public.negozio_pagamenti.secret_encrypted end,
    webhook_secret_encrypted = case
      when excluded.webhook_secret_encrypted is not null then excluded.webhook_secret_encrypted
      else public.negozio_pagamenti.webhook_secret_encrypted end,
    updated_at          = now();

  return jsonb_build_object('ok', true, 'provider', p_provider);
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare le credenziali.');
end;
$$;


ALTER FUNCTION "public"."pagamenti_credenziali_salva"("p_negozio_id" "uuid", "p_provider" "text", "p_attivo" boolean, "p_test_mode" boolean, "p_client_id" "text", "p_payee_email" "text", "p_iban" "text", "p_secret" "text", "p_webhook_secret" "text", "p_chiave" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagamenti_ordine_scaduto"("p_ordine_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."pagamenti_ordine_scaduto"("p_ordine_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagamenti_prepara_rimborso"("p_ordine_id" "uuid", "p_importo" numeric, "p_merchant_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
     or v_ordine.payment_provider not in ('stripe', 'paypal', 'klarna')
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


ALTER FUNCTION "public"."pagamenti_prepara_rimborso"("p_ordine_id" "uuid", "p_importo" numeric, "p_merchant_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagamenti_rimborso_annulla"("p_ordine_id" "uuid", "p_importo" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ordine record;
  v_nuovo  numeric;
begin
  if p_ordine_id is null or p_importo is null or p_importo <= 0 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Parametri non validi.');
  end if;

  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  v_nuovo := greatest(0, round((coalesce(v_ordine.payment_refunded_amount, 0) - p_importo)::numeric, 2));
  update public.ordini
  set payment_refunded_amount = v_nuovo,
      updated_at = now()
  where id = p_ordine_id;

  return jsonb_build_object('ok', true, 'payment_refunded_amount', v_nuovo);
end;
$$;


ALTER FUNCTION "public"."pagamenti_rimborso_annulla"("p_ordine_id" "uuid", "p_importo" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagamenti_stripe_connect_disconnetti"("p_negozio_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.negozio_pagamenti
  set attivo = false, account_id = null, account_name = null, updated_at = now()
  where negozio_id = p_negozio_id and provider = 'stripe';
  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."pagamenti_stripe_connect_disconnetti"("p_negozio_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagamenti_stripe_connect_salva"("p_negozio_id" "uuid", "p_account_id" "text", "p_account_name" "text" DEFAULT NULL::"text", "p_test_mode" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Negozio non valido.');
  end if;
  if p_account_id is null or length(btrim(p_account_id)) = 0 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Account Stripe non valido.');
  end if;
  if not exists (select 1 from public.negozi where id = p_negozio_id) then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;

  insert into public.negozio_pagamenti (
    negozio_id, provider, attivo, test_mode, account_id, account_name
  ) values (
    p_negozio_id, 'stripe', true, coalesce(p_test_mode, false), btrim(p_account_id), p_account_name
  )
  on conflict (negozio_id, provider) do update set
    attivo       = true,
    test_mode    = coalesce(p_test_mode, public.negozio_pagamenti.test_mode),
    account_id   = excluded.account_id,
    account_name = coalesce(excluded.account_name, public.negozio_pagamenti.account_name),
    updated_at   = now();

  return jsonb_build_object('ok', true, 'provider', 'stripe');
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il collegamento Stripe.');
end;
$$;


ALTER FUNCTION "public"."pagamenti_stripe_connect_salva"("p_negozio_id" "uuid", "p_account_id" "text", "p_account_name" "text", "p_test_mode" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_annulla"("p_payout_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_payout public.payout%rowtype;
begin
  if p_payout_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Payout non valido.');
  end if;

  select * into v_payout from public.payout where id = p_payout_id for update;
  if v_payout.id is null then
    return jsonb_build_object('ok', false, 'codice', 'PAYOUT_NON_TROVATO', 'messaggio', 'Payout non trovato.');
  end if;

  if v_payout.stato = 'annullato' then
    return jsonb_build_object('ok', true, 'cambiato', false, 'stato', 'annullato');
  end if;

  if v_payout.stato <> 'calcolato' then
    return jsonb_build_object(
      'ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA',
      'messaggio', 'Solo un payout in stato calcolato può essere annullato (stato: ' || v_payout.stato || ').'
    );
  end if;

  -- Libera gli ordini timbrati da QUESTO payout: tornano disponibili.
  update public.ordini set payout_id = null, updated_at = now()
  where payout_id = p_payout_id;

  update public.payout
  set stato = 'annullato', updated_at = now()
  where id = p_payout_id;

  return jsonb_build_object('ok', true, 'cambiato', true, 'stato', 'annullato');
end;
$$;


ALTER FUNCTION "public"."payout_annulla"("p_payout_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_calcola"("p_negozio_id" "uuid", "p_periodo_da" "date", "p_periodo_a" "date", "p_creato_da" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_negozio public.negozi%rowtype;
  v_payout public.payout%rowtype;
  v_key text;
  v_lordo numeric(10,2) := 0;
  v_comm numeric(10,2) := 0;
  v_netto numeric(10,2) := 0;
  v_n int := 0;
  v_ordine record;
  v_pagato numeric;
  v_rimborsato numeric;
  v_netto_pagato numeric;
  v_maturata numeric;
  v_comm_eff numeric;
  v_netto_ord numeric;
begin
  -- ── Validazione ────────────────────────────────────────────────────────
  if p_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Negozio non valido.');
  end if;
  if p_periodo_da is null or p_periodo_a is null or p_periodo_da > p_periodo_a then
    return jsonb_build_object('ok', false, 'codice', 'PERIODO_NON_VALIDO', 'messaggio', 'Periodo non valido.');
  end if;

  select * into v_negozio from public.negozi where id = p_negozio_id;
  if v_negozio.id is null then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;

  -- Ownership (difesa in profondità): l'API già verifica canManageStore/admin.
  if p_creato_da is not null
     and not exists (
       select 1 from public.negozi n
       where n.id = p_negozio_id and n.owner_user_id = p_creato_da
     )
     and not exists (
       select 1 from public.user_roles ur
       where ur.user_id = p_creato_da and ur.role = 'admin'
     ) then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questo negozio.');
  end if;

  -- ── Idempotenza: retry → stessa riga ───────────────────────────────────
  v_key := 'payout:' || p_negozio_id::text || ':' || p_periodo_da::text || ':' || p_periodo_a::text;
  select * into v_payout from public.payout
  where idempotency_key = v_key
  limit 1;
  if v_payout.id is not null then
    return jsonb_build_object(
      'ok', true, 'giaEsistente', true,
      'payout', jsonb_build_object(
        'id', v_payout.id, 'stato', v_payout.stato, 'periodo_da', v_payout.periodo_da,
        'periodo_a', v_payout.periodo_a, 'importo_lordo', v_payout.importo_lordo,
        'commissione_importo', v_payout.commissione_importo, 'importo_netto', v_payout.importo_netto,
        'n_ordini', v_payout.n_ordini, 'errore', v_payout.errore
      )
    );
  end if;

  -- ── Payout già PAGATO per lo stesso negozio+periodo → non ricalcolabile ─
  select * into v_payout from public.payout
  where negozio_id = p_negozio_id
    and periodo_da = p_periodo_da and periodo_a = p_periodo_a
    and stato = 'pagato'
  limit 1;
  if v_payout.id is not null then
    return jsonb_build_object(
      'ok', false, 'codice', 'PAYOUT_GIA_PAGATO',
      'messaggio', 'Esiste già un payout pagato per questo negozio e periodo.'
    );
  end if;

  -- ── Calcolo: FOR UPDATE sulle righe ordini coinvolte (serializza) ──────
  -- Formula IDENTICA a lib/incassi.ts (commissione effettiva proporzionale
  -- ai rimborsi). Vengono esclusi gli ordini già timbrati (payout_id NOT
  -- NULL), così un ordine non può mai comparire in due payout.
  for v_ordine in
    select o.id, o.payment_amount, o.payment_refunded_amount, o.commissione_importo
    from public.ordini o
    where o.negozio_id = p_negozio_id
      and o.payment_status in ('paid', 'partially_refunded', 'refunded')
      and o.payment_paid_at is not null
      and o.payment_paid_at::date >= p_periodo_da
      and o.payment_paid_at::date <= p_periodo_a
      and o.payout_id is null
    order by o.id
    for update of o
  loop
    v_pagato := coalesce(v_ordine.payment_amount, 0);
    v_rimborsato := coalesce(v_ordine.payment_refunded_amount, 0);
    v_netto_pagato := round((v_pagato - v_rimborsato)::numeric, 2);
    if v_netto_pagato <= 0 then
      continue; -- ordine interamente rimborsato: nessun importo economico
    end if;
    v_maturata := coalesce(v_ordine.commissione_importo, 0);

    -- commissione effettiva (regola incassi): rimborso totale → 0;
    -- rimborso parziale → proporzionale al nettoPagato/pagato; altrimenti maturata.
    if v_rimborsato >= v_pagato or v_pagato <= 0 then
      v_comm_eff := 0;
    elsif v_rimborsato > 0 then
      v_comm_eff := round((v_maturata * (v_netto_pagato / v_pagato))::numeric, 2);
    else
      v_comm_eff := v_maturata;
    end if;
    v_comm_eff := greatest(0, least(v_comm_eff, v_netto_pagato));

    v_netto_ord := round((v_netto_pagato - v_comm_eff)::numeric, 2);
    if v_netto_ord <= 0 then
      continue; -- commissione = netto (es. clamp): nessun importo da erogare
    end if;

    v_lordo := round((v_lordo + v_netto_pagato)::numeric, 2);
    v_comm := round((v_comm + v_comm_eff)::numeric, 2);
    v_netto := round((v_netto + v_netto_ord)::numeric, 2);
    v_n := v_n + 1;
  end loop;

  -- ── Inserimento payout (stato iniziale: calcolato) ─────────────────────
  insert into public.payout (
    negozio_id, periodo_da, periodo_a,
    importo_lordo, commissione_importo, importo_netto, n_ordini,
    stato, idempotency_key, creato_da
  ) values (
    p_negozio_id, p_periodo_da, p_periodo_a,
    v_lordo, v_comm, v_netto, v_n,
    'calcolato', v_key, p_creato_da
  )
  returning * into v_payout;

  -- ── Timbratura ordini inclusi (anti doppio payout) ─────────────────────
  -- Tutti gli ordini maturati del periodo (anche quelli con netto 0, che non
  -- producono importi ma non vanno mai più riproposti) vengono timbrati con
  -- questo payout: nessun ordine può comparire in due payout.
  update public.ordini o
  set payout_id = v_payout.id,
      updated_at = now()
  where o.negozio_id = p_negozio_id
    and o.payment_status in ('paid', 'partially_refunded', 'refunded')
    and o.payment_paid_at is not null
    and o.payment_paid_at::date >= p_periodo_da
    and o.payment_paid_at::date <= p_periodo_a
    and o.payout_id is null;

  return jsonb_build_object(
    'ok', true, 'giaEsistente', false,
    'payout', jsonb_build_object(
      'id', v_payout.id, 'stato', v_payout.stato, 'periodo_da', v_payout.periodo_da,
      'periodo_a', v_payout.periodo_a, 'importo_lordo', v_payout.importo_lordo,
      'commissione_importo', v_payout.commissione_importo, 'importo_netto', v_payout.importo_netto,
      'n_ordini', v_payout.n_ordini, 'errore', v_payout.errore
    )
  );
exception
  when unique_violation then
    -- Concorrenza: un'altra richiesta ha già creato la riga → restituiscila.
    select * into v_payout from public.payout where idempotency_key = v_key limit 1;
    if v_payout.id is not null then
      return jsonb_build_object(
        'ok', true, 'giaEsistente', true,
        'payout', jsonb_build_object(
          'id', v_payout.id, 'stato', v_payout.stato, 'periodo_da', v_payout.periodo_da,
          'periodo_a', v_payout.periodo_a, 'importo_lordo', v_payout.importo_lordo,
          'commissione_importo', v_payout.commissione_importo, 'importo_netto', v_payout.importo_netto,
          'n_ordini', v_payout.n_ordini, 'errore', v_payout.errore
        )
      );
    end if;
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il payout.');
end;
$$;


ALTER FUNCTION "public"."payout_calcola"("p_negozio_id" "uuid", "p_periodo_da" "date", "p_periodo_a" "date", "p_creato_da" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_segna_erogato"("p_payout_id" "uuid", "p_nuovo_stato" "text", "p_stripe_payout_id" "text" DEFAULT NULL::"text", "p_stripe_payout_status" "text" DEFAULT NULL::"text", "p_errore" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_payout public.payout%rowtype;
  v_consentita boolean;
begin
  if p_payout_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Payout non valido.');
  end if;
  if p_nuovo_stato is null or p_nuovo_stato not in ('in_erogazione', 'pagato', 'fallito') then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato non valido.');
  end if;

  select * into v_payout from public.payout where id = p_payout_id for update;
  if v_payout.id is null then
    return jsonb_build_object('ok', false, 'codice', 'PAYOUT_NON_TROVATO', 'messaggio', 'Payout non trovato.');
  end if;

  -- Macchina a stati:
  --   calcolato      → in_erogazione | pagato | fallito
  --   in_erogazione  → pagato | fallito
  --   fallito        → in_erogazione (retry) | pagato
  --   pagato/annullato → terminale (solo stato identico = no-op idempotente)
  v_consentita := (
    (v_payout.stato = 'calcolato'     and p_nuovo_stato in ('in_erogazione', 'pagato', 'fallito'))
    or (v_payout.stato = 'in_erogazione' and p_nuovo_stato in ('pagato', 'fallito'))
    or (v_payout.stato = 'fallito'     and p_nuovo_stato in ('in_erogazione', 'pagato'))
  );

  if not v_consentita then
    -- Stato identico → no-op idempotente (retry sicuro).
    if v_payout.stato = p_nuovo_stato then
      return jsonb_build_object('ok', true, 'cambiato', false, 'stato', v_payout.stato);
    end if;
    return jsonb_build_object(
      'ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA',
      'messaggio', 'Transizione non consentita: ' || v_payout.stato || ' → ' || p_nuovo_stato || '.'
    );
  end if;

  update public.payout
  set stato = p_nuovo_stato,
      stripe_payout_id = coalesce(p_stripe_payout_id, stripe_payout_id),
      stripe_payout_status = coalesce(p_stripe_payout_status, stripe_payout_status),
      errore = case when p_nuovo_stato = 'fallito' then coalesce(p_errore, errore) else null end,
      erogato_at = case
        when p_nuovo_stato = 'pagato' then now()
        when p_nuovo_stato in ('in_erogazione', 'fallito') then null
        else erogato_at end,
      updated_at = now()
  where id = p_payout_id;

  return jsonb_build_object('ok', true, 'cambiato', true, 'stato', p_nuovo_stato);
end;
$$;


ALTER FUNCTION "public"."payout_segna_erogato"("p_payout_id" "uuid", "p_nuovo_stato" "text", "p_stripe_payout_id" "text", "p_stripe_payout_status" "text", "p_errore" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reclamo_messaggio_to_json"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'id', m.id::text,
    'reclamoId', m.reclamo_id::text,
    'mittente', m.mittente,
    'mittenteNome', m.mittente_nome,
    'corpo', m.corpo,
    'lettoAt', m.letto_at::text,
    'createdAt', m.created_at::text
  )
  from public.reclamo_comunicazioni m
  where m.id = p_id;
$$;


ALTER FUNCTION "public"."reclamo_messaggio_to_json"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reclamo_to_json"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'id', r.id::text,
    'ordineId', r.ordine_id::text,
    'negozioId', r.negozio_id::text,
    'clienteUserId', r.cliente_user_id::text,
    'clienteNome', r.cliente_nome,
    'clienteEmail', r.cliente_email,
    'clienteTelefono', r.cliente_telefono,
    'tipo', r.tipo,
    'messaggio', r.messaggio,
    'stato', r.stato,
    'createdAt', r.created_at::text,
    'updatedAt', r.updated_at::text,
    'gestitoAt', r.gestito_at::text,
    'gestitoDa', r.gestito_da::text,
    'gestitoNota', r.gestito_nota
  )
  from public.ordine_reclami r
  where r.id = p_id;
$$;


ALTER FUNCTION "public"."reclamo_to_json"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_eventi_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_eventi_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_offerte_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_offerte_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_ordine_reclami_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_ordine_reclami_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_piattaforma_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_piattaforma_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_segnalazioni_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_segnalazioni_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_roles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_user_roles_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify"("testo" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select nullif(
    trim(both '-' from regexp_replace(
      translate(
        lower(coalesce(testo, '')),
        'àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ',
        'aaaaaaaceeeeiiiinoooooouuuuyy'
      ),
      '[^a-z0-9]+', '-', 'g'
    )),
    ''
  );
$$;


ALTER FUNCTION "public"."slugify"("testo" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "admin_email" "text",
    "operation_type" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid",
    "target_name" "text",
    "negozio_id" "uuid",
    "negozio_nome" "text",
    "result" "text" DEFAULT 'success'::"text" NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb",
    "ip" "text",
    "user_agent" "text",
    CONSTRAINT "admin_activity_log_result_check" CHECK (("result" = ANY (ARRAY['success'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."admin_activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorie" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "descrizione" "text",
    "icona" "text",
    "immagine" "text",
    "sinonimi" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "ordine" integer DEFAULT 0 NOT NULL,
    "attivo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categorie" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_profili" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nome" "text" DEFAULT ''::"text" NOT NULL,
    "cognome" "text" DEFAULT ''::"text" NOT NULL,
    "telefono" "text",
    "avatar_url" "text",
    "indirizzo" "text",
    "citta" "text",
    "cap" "text",
    "provincia" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cliente_profili" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eventi" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "titolo" "text" NOT NULL,
    "descrizione" "text",
    "immagine_url" "text",
    "luogo" "text",
    "data_inizio" timestamp with time zone,
    "data_fine" timestamp with time zone,
    "attivo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."eventi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "public_url" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "alt_text" "text" DEFAULT ''::"text",
    "mime_type" "text",
    "file_size" integer,
    "width" integer,
    "height" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."merchant_profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."merchant_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moduli_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "descrizione" "text",
    "icona" "text",
    "ordinamento" integer DEFAULT 0 NOT NULL,
    "attivo" boolean DEFAULT true NOT NULL,
    "default_in_template" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."moduli_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."negozi" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "categoria" "text",
    "descrizione" "text",
    "indirizzo" "text",
    "telefono" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "whatsapp" "text",
    "sito_web" "text",
    "facebook" "text",
    "instagram" "text",
    "copertina_url" "text",
    "orari" "jsonb",
    "attivo" boolean DEFAULT true,
    "in_evidenza" boolean DEFAULT false,
    "slug" "text",
    "owner_user_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_negozio" "text",
    "logo_url" "text",
    "banner_url" "text",
    "orari_apertura" "jsonb" DEFAULT '{"sabato": {"chiuso": false, "apertura": "", "chiusura": ""}, "lunedì": {"chiuso": false, "apertura": "", "chiusura": ""}, "domenica": {"chiuso": true, "apertura": "", "chiusura": ""}, "giovedì": {"chiuso": false, "apertura": "", "chiusura": ""}, "martedì": {"chiuso": false, "apertura": "", "chiusura": ""}, "venerdì": {"chiuso": false, "apertura": "", "chiusura": ""}, "mercoledì": {"chiuso": false, "apertura": "", "chiusura": ""}}'::"jsonb" NOT NULL,
    "contatti_social" "jsonb" DEFAULT '{"tiktok": "", "facebook": "", "whatsapp": "", "instagram": ""}'::"jsonb" NOT NULL,
    "galleria" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "descrizione_completa" "text",
    "sottocategoria" "text",
    "citta" "text",
    "cap" "text",
    "provincia" "text",
    "coordinate" "text",
    "tiktok" "text",
    "youtube" "text",
    "mostra_telefono" boolean DEFAULT true NOT NULL,
    "mostra_indirizzo" boolean DEFAULT true NOT NULL,
    "mostra_orari" boolean DEFAULT true NOT NULL,
    "accetta_whatsapp" boolean DEFAULT true NOT NULL,
    "colori" "jsonb" DEFAULT '{"accent": "#f59e0b", "primary": "#2563eb", "secondary": "#f8fafc"}'::"jsonb" NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "seo_title" "text",
    "seo_description" "text",
    "seo_keywords" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "moduli_attivi" "jsonb" DEFAULT '["informazioni", "immagini", "prodotti", "servizi", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni"]'::"jsonb" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "servizi" "text"[] DEFAULT '{}'::"text"[],
    "parole_chiave" "text"[] DEFAULT '{}'::"text"[],
    "is_demo" boolean DEFAULT false NOT NULL,
    "pacco_peso_grammi" integer,
    "pacco_lunghezza_cm" integer,
    "pacco_larghezza_cm" integer,
    "pacco_altezza_cm" integer,
    "pacco_peso_max_grammi" integer
);


ALTER TABLE "public"."negozi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."negozio_metodi_pagamento" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "metodo" "text" NOT NULL,
    "ordine_mostra" smallint DEFAULT 0 NOT NULL,
    "attivo" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."negozio_metodi_pagamento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."negozio_metodi_spedizione" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "carrier" "text" NOT NULL,
    "servizio" "text" NOT NULL,
    "attivo" boolean DEFAULT false NOT NULL,
    "ordine_mostra" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "spedizione_gratuita" boolean DEFAULT false NOT NULL,
    CONSTRAINT "negozio_metodi_spedizione_carrier_check" CHECK (("carrier" = ANY (ARRAY['poste_italiane'::"text", 'brt'::"text", 'locale'::"text", 'gls'::"text"]))),
    CONSTRAINT "negozio_metodi_spedizione_servizio_check" CHECK (((("carrier" = 'poste_italiane'::"text") AND ("servizio" = ANY (ARRAY['standard'::"text", 'express'::"text"]))) OR (("carrier" = 'brt'::"text") AND ("servizio" = 'online'::"text")) OR (("carrier" = 'gls'::"text") AND ("servizio" = 'standard'::"text")) OR (("carrier" = 'locale'::"text") AND ("servizio" = 'locale'::"text"))))
);


ALTER TABLE "public"."negozio_metodi_spedizione" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."negozio_pagamenti" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "attivo" boolean DEFAULT false NOT NULL,
    "test_mode" boolean DEFAULT true NOT NULL,
    "client_id" "text",
    "secret_encrypted" "text",
    "webhook_secret_encrypted" "text",
    "payee_email" "text",
    "iban" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "text",
    "account_name" "text"
);


ALTER TABLE "public"."negozio_pagamenti" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offerte" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "titolo" "text" NOT NULL,
    "descrizione" "text",
    "prezzo_originale" numeric,
    "prezzo_offerta" numeric,
    "immagine_url" "text",
    "data_inizio" timestamp with time zone,
    "data_fine" timestamp with time zone,
    "attiva" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."offerte" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ordine_reclami" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ordine_id" "uuid" NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "cliente_user_id" "uuid",
    "cliente_nome" "text" DEFAULT ''::"text" NOT NULL,
    "cliente_email" "text",
    "cliente_telefono" "text",
    "tipo" "text" DEFAULT 'ordine_non_arrivato'::"text" NOT NULL,
    "messaggio" "text",
    "stato" "text" DEFAULT 'aperto'::"text" NOT NULL,
    "gestito_at" timestamp with time zone,
    "gestito_da" "uuid",
    "gestito_nota" "text",
    CONSTRAINT "ordine_reclami_stato_check" CHECK (("stato" = ANY (ARRAY['aperto'::"text", 'in_gestione'::"text", 'risolto'::"text", 'chiuso'::"text"]))),
    CONSTRAINT "ordine_reclami_tipo_check" CHECK (("tipo" = 'ordine_non_arrivato'::"text"))
);


ALTER TABLE "public"."ordine_reclami" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ordini_numero_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ordini_numero_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ordini" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero" "text" DEFAULT ('LH-'::"text" || "lpad"(("nextval"('"public"."ordini_numero_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "stato" "text" DEFAULT 'in_preparazione'::"text" NOT NULL,
    "modalita" "text" NOT NULL,
    "totale" numeric(10,2) NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "negozio_nome" "text" NOT NULL,
    "cliente_user_id" "uuid",
    "cliente_nome" "text" NOT NULL,
    "cliente_cognome" "text" NOT NULL,
    "cliente_telefono" "text",
    "cliente_email" "text",
    "ritiro_data" "text",
    "ritiro_fascia" "text",
    "spedizione_indirizzo" "text",
    "spedizione_cap" "text",
    "spedizione_citta" "text",
    "spedizione_provincia" "text",
    "spedizione_note" "text",
    "metodo_spedizione" "text",
    "costo_spedizione" numeric(10,2) DEFAULT 0 NOT NULL,
    "metodo_pagamento" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cliente_ip" "text",
    "aggiornato_da" "uuid",
    "annullato_motivo" "text",
    "annullato_nota" "text",
    "annullato_at" timestamp with time zone,
    "annullato_da" "uuid",
    "letto_at" timestamp with time zone,
    "payment_status" "text",
    "payment_provider" "text",
    "payment_id" "text",
    "payment_transaction_id" "text",
    "payment_amount" numeric(10,2),
    "payment_currency" "text",
    "payment_authorized_at" timestamp with time zone,
    "payment_paid_at" timestamp with time zone,
    "payment_expires_at" timestamp with time zone,
    "payment_refunded_at" timestamp with time zone,
    "payment_refunded_amount" numeric(10,2),
    "payment_metadata" "jsonb",
    "fatturazione_diversa" boolean DEFAULT false NOT NULL,
    "fatturazione_nome" "text",
    "fatturazione_cognome" "text",
    "fatturazione_indirizzo" "text",
    "fatturazione_numero_civico" "text",
    "fatturazione_cap" "text",
    "fatturazione_comune" "text",
    "fatturazione_provincia" "text",
    "fatturazione_nazione" "text",
    "spedizione_carrier" "text",
    "spedizione_servizio" "text",
    "spedizione_tariffa_versione" "text",
    "spedizione_peso_grammi" integer,
    "stato_spedizione" "text",
    "tracking_code" "text",
    "tracking_url" "text",
    "affidata_at" timestamp with time zone,
    "consegnata_at" timestamp with time zone,
    "consegna_stimata" "text",
    "commissione_percentuale" numeric(5,2),
    "commissione_importo" numeric(10,2),
    "payout_id" "uuid",
    CONSTRAINT "ordini_metodo_pagamento_check" CHECK (("metodo_pagamento" = ANY (ARRAY['carta'::"text", 'paypal'::"text", 'bonifico'::"text"]))),
    CONSTRAINT "ordini_metodo_spedizione_check" CHECK (("metodo_spedizione" = ANY (ARRAY['standard'::"text", 'express'::"text"]))),
    CONSTRAINT "ordini_modalita_check" CHECK (("modalita" = ANY (ARRAY['ritiro'::"text", 'spedizione'::"text"]))),
    CONSTRAINT "ordini_stato_check" CHECK (("stato" = ANY (ARRAY['in_preparazione'::"text", 'confermato'::"text", 'in_lavorazione'::"text", 'pronto'::"text", 'in_consegna'::"text", 'consegnato'::"text", 'cancellato'::"text"]))),
    CONSTRAINT "ordini_stato_spedizione_check" CHECK ((("stato_spedizione" IS NULL) OR ("stato_spedizione" = ANY (ARRAY['non_affidata'::"text", 'affidata'::"text", 'in_transito'::"text", 'consegnata'::"text", 'problema'::"text"]))))
);


ALTER TABLE "public"."ordini" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ordini_eventi" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ordine_id" "uuid" NOT NULL,
    "evento" "text" NOT NULL,
    "dettaglio" "text",
    "motivo" "text",
    "nota" "text",
    "autore_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ordini_eventi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ordini_righe" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ordine_id" "uuid" NOT NULL,
    "prodotto_id" bigint NOT NULL,
    "nome_prodotto" "text" NOT NULL,
    "prezzo_unitario" numeric(10,2) NOT NULL,
    "quantita" integer NOT NULL,
    "immagine_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "variante_id" "uuid",
    "variante_nome" "text",
    CONSTRAINT "ordini_righe_quantita_check" CHECK (("quantita" > 0))
);


ALTER TABLE "public"."ordini_righe" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pagamenti_eventi" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "event_type" "text",
    "ordine_id" "uuid",
    "negozio_id" "uuid",
    "payment_id" "text",
    "payload" "jsonb",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "error" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."pagamenti_eventi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pagamenti_sessioni" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ordine_id" "uuid" NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "payment_id" "text",
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "redirect_url" "text",
    "amount" numeric(10,2),
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "idempotency_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pagamenti_sessioni" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payout" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "periodo_da" "date" NOT NULL,
    "periodo_a" "date" NOT NULL,
    "importo_lordo" numeric(10,2) DEFAULT 0 NOT NULL,
    "commissione_importo" numeric(10,2) DEFAULT 0 NOT NULL,
    "importo_netto" numeric(10,2) DEFAULT 0 NOT NULL,
    "n_ordini" integer DEFAULT 0 NOT NULL,
    "stato" "text" NOT NULL,
    "stripe_transfer_id" "text",
    "stripe_payout_id" "text",
    "stripe_payout_status" "text",
    "errore" "text",
    "idempotency_key" "text" NOT NULL,
    "creato_da" "uuid",
    "creato_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "erogato_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payout_commissione_ck" CHECK (("commissione_importo" >= (0)::numeric)),
    CONSTRAINT "payout_importo_lordo_ck" CHECK (("importo_lordo" >= (0)::numeric)),
    CONSTRAINT "payout_importo_netto_ck" CHECK (("importo_netto" >= (0)::numeric)),
    CONSTRAINT "payout_netto_coerente_ck" CHECK (("importo_netto" = "round"(("importo_lordo" - "commissione_importo"), 2))),
    CONSTRAINT "payout_periodo_ordine_ck" CHECK (("periodo_da" <= "periodo_a")),
    CONSTRAINT "payout_stato_check" CHECK (("stato" = ANY (ARRAY['calcolato'::"text", 'in_erogazione'::"text", 'pagato'::"text", 'fallito'::"text", 'annullato'::"text"])))
);


ALTER TABLE "public"."payout" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."piattaforma_config" (
    "chiave" "text" NOT NULL,
    "valore_numeric" numeric(12,4),
    "valore_testo" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."piattaforma_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."piattaforma_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chiave" "text" NOT NULL,
    "valore" "text",
    "tipo" "text" DEFAULT 'text'::"text" NOT NULL,
    "descrizione" "text",
    "pubblico" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."piattaforma_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preferiti" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "riferimento_id" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "immagine_url" "text",
    "categoria" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "preferiti_tipo_check" CHECK (("tipo" = ANY (ARRAY['negozio'::"text", 'prodotto'::"text"])))
);


ALTER TABLE "public"."preferiti" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prodotti" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "negozio_id" "uuid",
    "nome" "text",
    "descrizione" "text",
    "prezzo" numeric,
    "categoria" "text",
    "immagine" "text",
    "disponibile" boolean DEFAULT true,
    "immagine_principale" "text",
    "quantita_disponibile" integer DEFAULT 1,
    "attivo" boolean DEFAULT true NOT NULL,
    "origine_pubblicazione" "text" DEFAULT 'manuale'::"text" NOT NULL,
    "marca" "text",
    "colore" "text",
    "materiale" "text",
    "parole_chiave" "text"[],
    "prezzo_suggerito" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sottocategoria" "text",
    "stato_condizione" "text",
    "descrizione_completa" "text",
    "caratteristiche" "text"[],
    "peso_volume" "text",
    "filtri_catalogo" "jsonb",
    "seo_title" "text",
    "seo_description" "text",
    "alt_text_immagine" "text",
    "slug" "text",
    "quantita_riservata" integer DEFAULT 0 NOT NULL,
    "ha_varianti" boolean DEFAULT false NOT NULL,
    "peso_grammi" integer,
    "costo_spedizione_locale" numeric(10,2),
    CONSTRAINT "prodotti_quantita_disponibile_non_negativa" CHECK ((("quantita_disponibile" IS NULL) OR ("quantita_disponibile" >= 0))),
    CONSTRAINT "prodotti_stato_condizione_check" CHECK (("stato_condizione" = ANY (ARRAY['nuovo'::"text", 'usato'::"text", 'ricondizionato'::"text"])))
);


ALTER TABLE "public"."prodotti" OWNER TO "postgres";


ALTER TABLE "public"."prodotti" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."prodotti_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."prodotto_varianti" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prodotto_id" bigint NOT NULL,
    "nome" "text",
    "attributi" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "prezzo" numeric(10,2),
    "quantita_disponibile" integer DEFAULT 0 NOT NULL,
    "quantita_riservata" integer DEFAULT 0 NOT NULL,
    "immagine_principale" "text",
    "attivo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prodotto_varianti_quantita_non_negativa" CHECK (("quantita_disponibile" >= 0)),
    CONSTRAINT "prodotto_varianti_riserva_non_negativa" CHECK (("quantita_riservata" >= 0))
);


ALTER TABLE "public"."prodotto_varianti" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "text" NOT NULL,
    "storage_bucket" "text",
    "storage_path" "text",
    "public_url" "text",
    "role" "text" DEFAULT 'primary'::"text" NOT NULL,
    "position" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_media_role_check" CHECK (("role" = ANY (ARRAY['primary'::"text", 'gallery'::"text", 'detail'::"text"])))
);


ALTER TABLE "public"."product_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_stock_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prodotto_id" bigint NOT NULL,
    "negozio_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "stato" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notified_at" timestamp with time zone,
    CONSTRAINT "product_stock_notifications_stato_check" CHECK (("stato" = ANY (ARRAY['active'::"text", 'notified'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."product_stock_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_vision_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "image_hash" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "brand" "text",
    "category" "text",
    "ean" "text",
    "suggested_price" numeric,
    "description" "text",
    "confidence" integer DEFAULT 0 NOT NULL,
    "model_used" "text" NOT NULL,
    "hit_count" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_suggestion" "jsonb"
);


ALTER TABLE "public"."product_vision_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reclamo_comunicazioni" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reclamo_id" "uuid" NOT NULL,
    "mittente" "text" NOT NULL,
    "mittente_nome" "text" DEFAULT ''::"text" NOT NULL,
    "corpo" "text" NOT NULL,
    "letto_at" timestamp with time zone,
    CONSTRAINT "reclamo_comunicazioni_mittente_check" CHECK (("mittente" = ANY (ARRAY['cliente'::"text", 'venditore'::"text"])))
);


ALTER TABLE "public"."reclamo_comunicazioni" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reset_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone
);


ALTER TABLE "public"."reset_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scan_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "negozio_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider" "text" NOT NULL,
    "response_time_ms" integer DEFAULT 0 NOT NULL,
    "confidence" integer,
    "cache_hit" boolean DEFAULT false NOT NULL,
    "error_code" "text",
    "error_message" "text",
    "image_hash" "text",
    "model_used" "text",
    "total_tokens" integer,
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    CONSTRAINT "scan_log_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text", 'rate_limited'::"text"])))
);


ALTER TABLE "public"."scan_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."segnalazioni" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "tipo" "text" NOT NULL,
    "titolo" "text" NOT NULL,
    "descrizione" "text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "target_name" "text",
    "negozio_id" "uuid",
    "stato" "text" DEFAULT 'nuova'::"text" NOT NULL,
    "priorita" "text" DEFAULT 'normale'::"text" NOT NULL,
    "note_admin" "text",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    CONSTRAINT "segnalazioni_priorita_check" CHECK (("priorita" = ANY (ARRAY['bassa'::"text", 'normale'::"text", 'alta'::"text", 'urgente'::"text"]))),
    CONSTRAINT "segnalazioni_stato_check" CHECK (("stato" = ANY (ARRAY['nuova'::"text", 'presa_in_carico'::"text", 'risolta'::"text", 'archiviata'::"text"])))
);


ALTER TABLE "public"."segnalazioni" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_carriers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codice" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "attivo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shipping_carriers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "carrier_id" "uuid" NOT NULL,
    "codice" "text" NOT NULL,
    "tier" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "tempo_consegna" "text",
    "attivo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."shipping_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_tariff_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codice" "text" NOT NULL,
    "descrizione" "text",
    "attiva" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shipping_tariff_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_tariffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "peso_min_g" integer NOT NULL,
    "peso_max_g" integer NOT NULL,
    "prezzo" numeric(10,2) NOT NULL
);


ALTER TABLE "public"."shipping_tariffs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_negozi" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid",
    "nome" "text" NOT NULL,
    "descrizione" "text" DEFAULT ''::"text",
    "categoria" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."template_negozi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_activity_log"
    ADD CONSTRAINT "admin_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorie"
    ADD CONSTRAINT "categorie_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorie"
    ADD CONSTRAINT "categorie_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."cliente_profili"
    ADD CONSTRAINT "cliente_profili_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_profili"
    ADD CONSTRAINT "cliente_profili_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."eventi"
    ADD CONSTRAINT "eventi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."merchant_profiles"
    ADD CONSTRAINT "merchant_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moduli_registry"
    ADD CONSTRAINT "moduli_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moduli_registry"
    ADD CONSTRAINT "moduli_registry_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."negozi"
    ADD CONSTRAINT "negozi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."negozio_metodi_pagamento"
    ADD CONSTRAINT "negozio_metodi_pagamento_negozio_metodo_unq" UNIQUE ("negozio_id", "metodo");



ALTER TABLE ONLY "public"."negozio_metodi_pagamento"
    ADD CONSTRAINT "negozio_metodi_pagamento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."negozio_metodi_spedizione"
    ADD CONSTRAINT "negozio_metodi_spedizione_negozio_carrier_servizio_unq" UNIQUE ("negozio_id", "carrier", "servizio");



ALTER TABLE ONLY "public"."negozio_metodi_spedizione"
    ADD CONSTRAINT "negozio_metodi_spedizione_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."negozio_pagamenti"
    ADD CONSTRAINT "negozio_pagamenti_negozio_provider_unq" UNIQUE ("negozio_id", "provider");



ALTER TABLE ONLY "public"."negozio_pagamenti"
    ADD CONSTRAINT "negozio_pagamenti_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offerte"
    ADD CONSTRAINT "offerte_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordine_reclami"
    ADD CONSTRAINT "ordine_reclami_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordini_eventi"
    ADD CONSTRAINT "ordini_eventi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordini"
    ADD CONSTRAINT "ordini_idempotency_key_unq" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."ordini"
    ADD CONSTRAINT "ordini_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordini_righe"
    ADD CONSTRAINT "ordini_righe_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagamenti_eventi"
    ADD CONSTRAINT "pagamenti_eventi_event_id_key" UNIQUE ("event_id");



ALTER TABLE ONLY "public"."pagamenti_eventi"
    ADD CONSTRAINT "pagamenti_eventi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagamenti_sessioni"
    ADD CONSTRAINT "pagamenti_sessioni_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."pagamenti_sessioni"
    ADD CONSTRAINT "pagamenti_sessioni_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout"
    ADD CONSTRAINT "payout_idempotency_unq" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."payout"
    ADD CONSTRAINT "payout_negozio_periodo_unq" UNIQUE ("negozio_id", "periodo_da", "periodo_a");



ALTER TABLE ONLY "public"."payout"
    ADD CONSTRAINT "payout_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."piattaforma_config"
    ADD CONSTRAINT "piattaforma_config_pkey" PRIMARY KEY ("chiave");



ALTER TABLE ONLY "public"."piattaforma_settings"
    ADD CONSTRAINT "piattaforma_settings_chiave_key" UNIQUE ("chiave");



ALTER TABLE ONLY "public"."piattaforma_settings"
    ADD CONSTRAINT "piattaforma_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preferiti"
    ADD CONSTRAINT "preferiti_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preferiti"
    ADD CONSTRAINT "preferiti_user_tipo_rif_unq" UNIQUE ("user_id", "tipo", "riferimento_id");



ALTER TABLE ONLY "public"."prodotti"
    ADD CONSTRAINT "prodotti_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prodotto_varianti"
    ADD CONSTRAINT "prodotto_varianti_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_media"
    ADD CONSTRAINT "product_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_stock_notifications"
    ADD CONSTRAINT "product_stock_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_vision_cache"
    ADD CONSTRAINT "product_vision_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reclamo_comunicazioni"
    ADD CONSTRAINT "reclamo_comunicazioni_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reset_tokens"
    ADD CONSTRAINT "reset_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reset_tokens"
    ADD CONSTRAINT "reset_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."scan_log"
    ADD CONSTRAINT "scan_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."segnalazioni"
    ADD CONSTRAINT "segnalazioni_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_carriers"
    ADD CONSTRAINT "shipping_carriers_codice_key" UNIQUE ("codice");



ALTER TABLE ONLY "public"."shipping_carriers"
    ADD CONSTRAINT "shipping_carriers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_services"
    ADD CONSTRAINT "shipping_services_carrier_id_codice_key" UNIQUE ("carrier_id", "codice");



ALTER TABLE ONLY "public"."shipping_services"
    ADD CONSTRAINT "shipping_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_tariff_versions"
    ADD CONSTRAINT "shipping_tariff_versions_codice_key" UNIQUE ("codice");



ALTER TABLE ONLY "public"."shipping_tariff_versions"
    ADD CONSTRAINT "shipping_tariff_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_tariffs"
    ADD CONSTRAINT "shipping_tariffs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_tariffs"
    ADD CONSTRAINT "shipping_tariffs_version_id_service_id_peso_max_g_key" UNIQUE ("version_id", "service_id", "peso_max_g");



ALTER TABLE ONLY "public"."template_negozi"
    ADD CONSTRAINT "template_negozi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



CREATE INDEX "admin_activity_log_admin_user_id_idx" ON "public"."admin_activity_log" USING "btree" ("admin_user_id", "created_at" DESC);



CREATE INDEX "admin_activity_log_created_at_idx" ON "public"."admin_activity_log" USING "btree" ("created_at" DESC);



CREATE INDEX "admin_activity_log_negozio_id_idx" ON "public"."admin_activity_log" USING "btree" ("negozio_id", "created_at" DESC);



CREATE INDEX "admin_activity_log_operation_type_idx" ON "public"."admin_activity_log" USING "btree" ("operation_type");



CREATE INDEX "admin_activity_log_target_idx" ON "public"."admin_activity_log" USING "btree" ("target_type", "target_id");



CREATE INDEX "eventi_attivo_idx" ON "public"."eventi" USING "btree" ("attivo");



CREATE INDEX "eventi_negozio_id_idx" ON "public"."eventi" USING "btree" ("negozio_id");



CREATE INDEX "idx_cliente_profili_user_id" ON "public"."cliente_profili" USING "btree" ("user_id");



CREATE INDEX "idx_media_mime_type" ON "public"."media" USING "btree" ("mime_type");



CREATE INDEX "idx_media_negozio_id" ON "public"."media" USING "btree" ("negozio_id");



CREATE INDEX "idx_reset_tokens_expires_at" ON "public"."reset_tokens" USING "btree" ("expires_at");



CREATE INDEX "idx_reset_tokens_user_id" ON "public"."reset_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_template_negozi_categoria" ON "public"."template_negozi" USING "btree" ("categoria");



CREATE INDEX "idx_template_negozi_owner" ON "public"."template_negozi" USING "btree" ("owner_user_id");



CREATE INDEX "idx_user_roles_role" ON "public"."user_roles" USING "btree" ("role");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "negozi_attivi_no_deleted_idx" ON "public"."negozi" USING "btree" ("attivo", "deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "negozi_categoria_idx" ON "public"."negozi" USING "btree" ("categoria");



CREATE INDEX "negozi_deleted_at_idx" ON "public"."negozi" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "negozi_fts_idx" ON "public"."negozi" USING "gin" ("to_tsvector"('"italian"'::"regconfig", ((((((COALESCE("nome", ''::"text") || ' '::"text") || COALESCE("categoria", ''::"text")) || ' '::"text") || COALESCE("descrizione", ''::"text")) || ' '::"text") || COALESCE("citta", ''::"text"))));



CREATE INDEX "negozi_is_demo_idx" ON "public"."negozi" USING "btree" ("is_demo") WHERE ("is_demo" = true);



CREATE INDEX "negozi_owner_user_id_idx" ON "public"."negozi" USING "btree" ("owner_user_id");



CREATE UNIQUE INDEX "negozi_slug_unique_idx" ON "public"."negozi" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "negozio_metodi_pagamento_negozio_id_idx" ON "public"."negozio_metodi_pagamento" USING "btree" ("negozio_id");



CREATE INDEX "negozio_metodi_spedizione_negozio_id_idx" ON "public"."negozio_metodi_spedizione" USING "btree" ("negozio_id");



CREATE INDEX "negozio_pagamenti_account_idx" ON "public"."negozio_pagamenti" USING "btree" ("provider", "account_id") WHERE ("account_id" IS NOT NULL);



CREATE INDEX "negozio_pagamenti_negozio_id_idx" ON "public"."negozio_pagamenti" USING "btree" ("negozio_id");



CREATE INDEX "offerte_attiva_idx" ON "public"."offerte" USING "btree" ("attiva");



CREATE INDEX "offerte_negozio_id_idx" ON "public"."offerte" USING "btree" ("negozio_id");



CREATE UNIQUE INDEX "ordine_reclami_attivo_unico" ON "public"."ordine_reclami" USING "btree" ("ordine_id", "tipo") WHERE ("stato" = ANY (ARRAY['aperto'::"text", 'in_gestione'::"text"]));



CREATE INDEX "ordine_reclami_negozio_id_idx" ON "public"."ordine_reclami" USING "btree" ("negozio_id", "stato", "created_at" DESC);



CREATE INDEX "ordine_reclami_ordine_id_idx" ON "public"."ordine_reclami" USING "btree" ("ordine_id", "created_at" DESC);



CREATE INDEX "ordine_reclami_stato_idx" ON "public"."ordine_reclami" USING "btree" ("stato");



CREATE INDEX "ordini_cliente_ip_created_at_idx" ON "public"."ordini" USING "btree" ("cliente_ip", "created_at" DESC);



CREATE INDEX "ordini_cliente_user_id_idx" ON "public"."ordini" USING "btree" ("cliente_user_id", "created_at" DESC);



CREATE INDEX "ordini_created_at_idx" ON "public"."ordini" USING "btree" ("created_at" DESC);



CREATE INDEX "ordini_eventi_ordine_id_idx" ON "public"."ordini_eventi" USING "btree" ("ordine_id", "created_at");



CREATE INDEX "ordini_negozio_id_idx" ON "public"."ordini" USING "btree" ("negozio_id", "created_at" DESC);



CREATE INDEX "ordini_numero_idx" ON "public"."ordini" USING "btree" ("numero");



CREATE INDEX "ordini_payment_provider_idx" ON "public"."ordini" USING "btree" ("payment_provider");



CREATE INDEX "ordini_payment_status_idx" ON "public"."ordini" USING "btree" ("payment_status");



CREATE INDEX "ordini_payout_id_idx" ON "public"."ordini" USING "btree" ("payout_id") WHERE ("payout_id" IS NOT NULL);



CREATE INDEX "ordini_righe_ordine_id_idx" ON "public"."ordini_righe" USING "btree" ("ordine_id");



CREATE INDEX "ordini_righe_variante_id_idx" ON "public"."ordini_righe" USING "btree" ("variante_id");



CREATE INDEX "ordini_stato_spedizione_idx" ON "public"."ordini" USING "btree" ("stato_spedizione");



CREATE INDEX "pagamenti_eventi_negozio_id_idx" ON "public"."pagamenti_eventi" USING "btree" ("negozio_id");



CREATE INDEX "pagamenti_eventi_ordine_id_idx" ON "public"."pagamenti_eventi" USING "btree" ("ordine_id");



CREATE INDEX "pagamenti_eventi_payment_id_idx" ON "public"."pagamenti_eventi" USING "btree" ("payment_id");



CREATE INDEX "pagamenti_sessioni_negozio_id_idx" ON "public"."pagamenti_sessioni" USING "btree" ("negozio_id");



CREATE UNIQUE INDEX "pagamenti_sessioni_ordine_attiva_unq" ON "public"."pagamenti_sessioni" USING "btree" ("ordine_id") WHERE ("status" = ANY (ARRAY['created'::"text", 'pending'::"text"]));



CREATE INDEX "pagamenti_sessioni_ordine_id_idx" ON "public"."pagamenti_sessioni" USING "btree" ("ordine_id");



CREATE INDEX "pagamenti_sessioni_payment_id_idx" ON "public"."pagamenti_sessioni" USING "btree" ("payment_id");



CREATE INDEX "preferiti_rif_idx" ON "public"."preferiti" USING "btree" ("tipo", "riferimento_id");



CREATE INDEX "preferiti_user_created_idx" ON "public"."preferiti" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "preferiti_user_tipo_idx" ON "public"."preferiti" USING "btree" ("user_id", "tipo");



CREATE INDEX "prodotti_categoria_idx" ON "public"."prodotti" USING "btree" ("categoria");



CREATE INDEX "prodotti_created_at_idx" ON "public"."prodotti" USING "btree" ("created_at" DESC);



CREATE INDEX "prodotti_fts_idx" ON "public"."prodotti" USING "gin" ("to_tsvector"('"italian"'::"regconfig", ((((((((COALESCE("nome", ''::"text") || ' '::"text") || COALESCE("descrizione", ''::"text")) || ' '::"text") || COALESCE("categoria", ''::"text")) || ' '::"text") || COALESCE("sottocategoria", ''::"text")) || ' '::"text") || COALESCE("marca", ''::"text"))));



CREATE INDEX "prodotti_negozio_attivo_idx" ON "public"."prodotti" USING "btree" ("negozio_id", "attivo");



CREATE INDEX "prodotti_negozio_id_idx" ON "public"."prodotti" USING "btree" ("negozio_id");



CREATE INDEX "prodotti_nome_ilike_idx" ON "public"."prodotti" USING "btree" ("nome" "text_pattern_ops");



CREATE UNIQUE INDEX "prodotti_slug_unique_idx" ON "public"."prodotti" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "prodotto_varianti_prodotto_attivo_idx" ON "public"."prodotto_varianti" USING "btree" ("prodotto_id", "attivo");



CREATE UNIQUE INDEX "prodotto_varianti_prodotto_attributi_unq" ON "public"."prodotto_varianti" USING "btree" ("prodotto_id", (("attributi")::"text"));



CREATE INDEX "prodotto_varianti_prodotto_id_idx" ON "public"."prodotto_varianti" USING "btree" ("prodotto_id");



CREATE INDEX "product_media_product_id_idx" ON "public"."product_media" USING "btree" ("product_id");



CREATE INDEX "product_stock_notifications_negozio_stato" ON "public"."product_stock_notifications" USING "btree" ("negozio_id", "stato");



CREATE INDEX "product_stock_notifications_prodotto_stato" ON "public"."product_stock_notifications" USING "btree" ("prodotto_id", "stato");



CREATE UNIQUE INDEX "product_stock_notifications_unique_active" ON "public"."product_stock_notifications" USING "btree" ("prodotto_id", "email") WHERE ("stato" = 'active'::"text");



CREATE INDEX "product_vision_cache_brand_idx" ON "public"."product_vision_cache" USING "btree" ("brand");



CREATE INDEX "product_vision_cache_ean_idx" ON "public"."product_vision_cache" USING "btree" ("ean");



CREATE UNIQUE INDEX "product_vision_cache_hash_idx" ON "public"."product_vision_cache" USING "btree" ("image_hash");



CREATE INDEX "product_vision_cache_name_idx" ON "public"."product_vision_cache" USING "btree" ("product_name" "text_pattern_ops");



CREATE INDEX "reclamo_comunicazioni_reclamo_idx" ON "public"."reclamo_comunicazioni" USING "btree" ("reclamo_id", "created_at");



CREATE INDEX "scan_log_created_at_idx" ON "public"."scan_log" USING "btree" ("created_at" DESC);



CREATE INDEX "scan_log_provider_idx" ON "public"."scan_log" USING "btree" ("provider");



CREATE INDEX "scan_log_user_time_idx" ON "public"."scan_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "segnalazioni_created_at_idx" ON "public"."segnalazioni" USING "btree" ("created_at" DESC);



CREATE INDEX "segnalazioni_negozio_id_idx" ON "public"."segnalazioni" USING "btree" ("negozio_id", "created_at" DESC);



CREATE INDEX "segnalazioni_priorita_idx" ON "public"."segnalazioni" USING "btree" ("priorita");



CREATE INDEX "segnalazioni_stato_idx" ON "public"."segnalazioni" USING "btree" ("stato");



CREATE INDEX "segnalazioni_target_idx" ON "public"."segnalazioni" USING "btree" ("target_type", "target_id");



CREATE INDEX "segnalazioni_tipo_idx" ON "public"."segnalazioni" USING "btree" ("tipo");



CREATE INDEX "segnalazioni_user_id_idx" ON "public"."segnalazioni" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "cliente_profili_set_updated_at" BEFORE UPDATE ON "public"."cliente_profili" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "merchant_profiles_set_updated_at" BEFORE UPDATE ON "public"."merchant_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "negozi_set_updated_at" BEFORE UPDATE ON "public"."negozi" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ordini_eventi_trigger" AFTER INSERT OR UPDATE OF "stato", "stato_spedizione" ON "public"."ordini" FOR EACH ROW EXECUTE FUNCTION "public"."ordini_eventi_trigger_fn"();



CREATE OR REPLACE TRIGGER "ordini_set_updated_at" BEFORE UPDATE ON "public"."ordini" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "preferiti_set_updated_at" BEFORE UPDATE ON "public"."preferiti" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "prodotti_set_updated_at" BEFORE UPDATE ON "public"."prodotti" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "prodotto_varianti_aggiorna_prodotto" AFTER INSERT OR DELETE OR UPDATE ON "public"."prodotto_varianti" FOR EACH ROW EXECUTE FUNCTION "public"."aggiorna_prodotto_da_varianti"();



CREATE OR REPLACE TRIGGER "prodotto_varianti_set_updated_at" BEFORE UPDATE ON "public"."prodotto_varianti" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "product_vision_cache_set_updated_at" BEFORE UPDATE ON "public"."product_vision_cache" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_eventi_updated_at" BEFORE UPDATE ON "public"."eventi" FOR EACH ROW EXECUTE FUNCTION "public"."set_eventi_updated_at"();



CREATE OR REPLACE TRIGGER "trg_offerte_updated_at" BEFORE UPDATE ON "public"."offerte" FOR EACH ROW EXECUTE FUNCTION "public"."set_offerte_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ordine_reclami_updated_at" BEFORE UPDATE ON "public"."ordine_reclami" FOR EACH ROW EXECUTE FUNCTION "public"."set_ordine_reclami_updated_at"();



CREATE OR REPLACE TRIGGER "trg_piattaforma_settings_updated_at" BEFORE UPDATE ON "public"."piattaforma_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_piattaforma_settings_updated_at"();



CREATE OR REPLACE TRIGGER "trg_segnalazioni_updated_at" BEFORE UPDATE ON "public"."segnalazioni" FOR EACH ROW EXECUTE FUNCTION "public"."set_segnalazioni_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_roles_updated_at" BEFORE UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_roles_updated_at"();



ALTER TABLE ONLY "public"."admin_activity_log"
    ADD CONSTRAINT "admin_activity_log_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cliente_profili"
    ADD CONSTRAINT "cliente_profili_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eventi"
    ADD CONSTRAINT "eventi_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."merchant_profiles"
    ADD CONSTRAINT "merchant_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."negozi"
    ADD CONSTRAINT "negozi_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."negozio_metodi_pagamento"
    ADD CONSTRAINT "negozio_metodi_pagamento_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."negozio_metodi_spedizione"
    ADD CONSTRAINT "negozio_metodi_spedizione_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."negozio_pagamenti"
    ADD CONSTRAINT "negozio_pagamenti_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offerte"
    ADD CONSTRAINT "offerte_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ordine_reclami"
    ADD CONSTRAINT "ordine_reclami_cliente_user_id_fkey" FOREIGN KEY ("cliente_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordine_reclami"
    ADD CONSTRAINT "ordine_reclami_gestito_da_fkey" FOREIGN KEY ("gestito_da") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordine_reclami"
    ADD CONSTRAINT "ordine_reclami_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ordine_reclami"
    ADD CONSTRAINT "ordine_reclami_ordine_id_fkey" FOREIGN KEY ("ordine_id") REFERENCES "public"."ordini"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ordini"
    ADD CONSTRAINT "ordini_aggiornato_da_fkey" FOREIGN KEY ("aggiornato_da") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordini"
    ADD CONSTRAINT "ordini_annullato_da_fkey" FOREIGN KEY ("annullato_da") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordini"
    ADD CONSTRAINT "ordini_cliente_user_id_fkey" FOREIGN KEY ("cliente_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordini_eventi"
    ADD CONSTRAINT "ordini_eventi_autore_id_fkey" FOREIGN KEY ("autore_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordini_eventi"
    ADD CONSTRAINT "ordini_eventi_ordine_id_fkey" FOREIGN KEY ("ordine_id") REFERENCES "public"."ordini"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ordini"
    ADD CONSTRAINT "ordini_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ordini"
    ADD CONSTRAINT "ordini_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."payout"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordini_righe"
    ADD CONSTRAINT "ordini_righe_ordine_id_fkey" FOREIGN KEY ("ordine_id") REFERENCES "public"."ordini"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ordini_righe"
    ADD CONSTRAINT "ordini_righe_prodotto_id_fkey" FOREIGN KEY ("prodotto_id") REFERENCES "public"."prodotti"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ordini_righe"
    ADD CONSTRAINT "ordini_righe_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "public"."prodotto_varianti"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pagamenti_eventi"
    ADD CONSTRAINT "pagamenti_eventi_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pagamenti_eventi"
    ADD CONSTRAINT "pagamenti_eventi_ordine_id_fkey" FOREIGN KEY ("ordine_id") REFERENCES "public"."ordini"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pagamenti_sessioni"
    ADD CONSTRAINT "pagamenti_sessioni_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pagamenti_sessioni"
    ADD CONSTRAINT "pagamenti_sessioni_ordine_id_fkey" FOREIGN KEY ("ordine_id") REFERENCES "public"."ordini"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout"
    ADD CONSTRAINT "payout_creato_da_fkey" FOREIGN KEY ("creato_da") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payout"
    ADD CONSTRAINT "payout_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."preferiti"
    ADD CONSTRAINT "preferiti_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prodotto_varianti"
    ADD CONSTRAINT "prodotto_varianti_prodotto_id_fkey" FOREIGN KEY ("prodotto_id") REFERENCES "public"."prodotti"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_stock_notifications"
    ADD CONSTRAINT "product_stock_notifications_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_stock_notifications"
    ADD CONSTRAINT "product_stock_notifications_prodotto_id_fkey" FOREIGN KEY ("prodotto_id") REFERENCES "public"."prodotti"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_stock_notifications"
    ADD CONSTRAINT "product_stock_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reclamo_comunicazioni"
    ADD CONSTRAINT "reclamo_comunicazioni_reclamo_id_fkey" FOREIGN KEY ("reclamo_id") REFERENCES "public"."ordine_reclami"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reset_tokens"
    ADD CONSTRAINT "reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."segnalazioni"
    ADD CONSTRAINT "segnalazioni_negozio_id_fkey" FOREIGN KEY ("negozio_id") REFERENCES "public"."negozi"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."segnalazioni"
    ADD CONSTRAINT "segnalazioni_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."segnalazioni"
    ADD CONSTRAINT "segnalazioni_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shipping_services"
    ADD CONSTRAINT "shipping_services_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "public"."shipping_carriers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipping_tariffs"
    ADD CONSTRAINT "shipping_tariffs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."shipping_services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipping_tariffs"
    ADD CONSTRAINT "shipping_tariffs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."shipping_tariff_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_negozi"
    ADD CONSTRAINT "template_negozi_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Enable read access for all users" ON "public"."negozi" FOR SELECT USING (true);



CREATE POLICY "Policy prodotti" ON "public"."prodotti" FOR SELECT USING (true);



CREATE POLICY "Utente legge i propri ruoli" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."admin_activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_activity_log admin insert" ON "public"."admin_activity_log" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "admin_activity_log admin select" ON "public"."admin_activity_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



ALTER TABLE "public"."categorie" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categorie public read" ON "public"."categorie" FOR SELECT USING (true);



CREATE POLICY "cliente profilo self insert" ON "public"."cliente_profili" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "cliente profilo self select" ON "public"."cliente_profili" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "cliente profilo self update" ON "public"."cliente_profili" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."cliente_profili" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."eventi" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "eventi admin manage" ON "public"."eventi" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "eventi owner read" ON "public"."eventi" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "eventi"."negozio_id") AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "eventi owner write" ON "public"."eventi" USING ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "eventi"."negozio_id") AND ("n"."owner_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "eventi"."negozio_id") AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "eventi public read" ON "public"."eventi" FOR SELECT USING ((("attivo" = true) AND (("data_fine" IS NULL) OR ("data_fine" >= "now"())) AND (("data_inizio" IS NULL) OR ("data_inizio" <= "now"())) AND (EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "eventi"."negozio_id") AND ("n"."attivo" = true) AND ("n"."deleted_at" IS NULL))))));



ALTER TABLE "public"."media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media merchant delete" ON "public"."media" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."negozi"
  WHERE (("negozi"."id" = "media"."negozio_id") AND ("negozi"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "media merchant insert" ON "public"."media" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."negozi"
  WHERE (("negozi"."id" = "media"."negozio_id") AND ("negozi"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "media merchant select" ON "public"."media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."negozi"
  WHERE (("negozi"."id" = "media"."negozio_id") AND ("negozi"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "media merchant update" ON "public"."media" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."negozi"
  WHERE (("negozi"."id" = "media"."negozio_id") AND ("negozi"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "merchant own products insert" ON "public"."prodotti" FOR INSERT WITH CHECK ("public"."is_merchant_for_store"(("negozio_id")::"text"));



CREATE POLICY "merchant own products read" ON "public"."prodotti" FOR SELECT USING ("public"."is_merchant_for_store"(("negozio_id")::"text"));



CREATE POLICY "merchant own products update" ON "public"."prodotti" FOR UPDATE USING ("public"."is_merchant_for_store"(("negozio_id")::"text")) WITH CHECK ("public"."is_merchant_for_store"(("negozio_id")::"text"));



CREATE POLICY "merchant own store select" ON "public"."negozi" FOR SELECT USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "merchant own store update" ON "public"."negozi" FOR UPDATE USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "merchant product media write" ON "public"."product_media" USING (true) WITH CHECK (true);



CREATE POLICY "merchant profiles self select" ON "public"."merchant_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "merchant profiles self update" ON "public"."merchant_profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."merchant_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moduli_registry" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "moduli_registry public read" ON "public"."moduli_registry" FOR SELECT USING (true);



ALTER TABLE "public"."negozi" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "negozi public read" ON "public"."negozi" FOR SELECT USING ((("attivo" = true) AND ("deleted_at" IS NULL)));



CREATE POLICY "negozio metodi admin select all" ON "public"."negozio_metodi_pagamento" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "negozio metodi merchant select" ON "public"."negozio_metodi_pagamento" FOR SELECT USING ("public"."is_merchant_for_store"(("negozio_id")::"text"));



CREATE POLICY "negozio metodi spedizione admin select all" ON "public"."negozio_metodi_spedizione" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "negozio metodi spedizione merchant select" ON "public"."negozio_metodi_spedizione" FOR SELECT USING ("public"."is_merchant_for_store"(("negozio_id")::"text"));



CREATE POLICY "negozio pagamenti admin select all" ON "public"."negozio_pagamenti" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "negozio pagamenti merchant select" ON "public"."negozio_pagamenti" FOR SELECT USING ("public"."is_merchant_for_store"(("negozio_id")::"text"));



ALTER TABLE "public"."negozio_metodi_pagamento" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."negozio_metodi_spedizione" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."negozio_pagamenti" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."offerte" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offerte admin manage" ON "public"."offerte" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "offerte owner read" ON "public"."offerte" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "offerte"."negozio_id") AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "offerte owner write" ON "public"."offerte" USING ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "offerte"."negozio_id") AND ("n"."owner_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "offerte"."negozio_id") AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "offerte public read" ON "public"."offerte" FOR SELECT USING ((("attiva" = true) AND (("data_fine" IS NULL) OR ("data_fine" >= "now"())) AND (("data_inizio" IS NULL) OR ("data_inizio" <= "now"())) AND (EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "offerte"."negozio_id") AND ("n"."attivo" = true) AND ("n"."deleted_at" IS NULL))))));



ALTER TABLE "public"."ordine_reclami" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ordine_reclami admin select all" ON "public"."ordine_reclami" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "ordine_reclami admin update all" ON "public"."ordine_reclami" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "ordine_reclami insert own" ON "public"."ordine_reclami" FOR INSERT WITH CHECK (("cliente_user_id" = "auth"."uid"()));



CREATE POLICY "ordine_reclami merchant select" ON "public"."ordine_reclami" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "ordine_reclami"."negozio_id") AND ("n"."deleted_at" IS NULL) AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "ordine_reclami merchant update" ON "public"."ordine_reclami" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "ordine_reclami"."negozio_id") AND ("n"."deleted_at" IS NULL) AND ("n"."owner_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "ordine_reclami"."negozio_id") AND ("n"."deleted_at" IS NULL) AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "ordine_reclami select own" ON "public"."ordine_reclami" FOR SELECT USING (("cliente_user_id" = "auth"."uid"()));



ALTER TABLE "public"."ordini" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ordini admin select all" ON "public"."ordini" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "ordini eventi admin select all" ON "public"."ordini_eventi" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "ordini eventi merchant select" ON "public"."ordini_eventi" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."ordini" "o"
     JOIN "public"."negozi" "n" ON (("n"."id" = "o"."negozio_id")))
  WHERE (("o"."id" = "ordini_eventi"."ordine_id") AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "ordini eventi self select" ON "public"."ordini_eventi" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ordini" "o"
  WHERE (("o"."id" = "ordini_eventi"."ordine_id") AND ("o"."cliente_user_id" = "auth"."uid"())))));



CREATE POLICY "ordini merchant select" ON "public"."ordini" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "ordini"."negozio_id") AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "ordini righe admin select all" ON "public"."ordini_righe" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."ordini" "o"
  WHERE ("o"."id" = "ordini_righe"."ordine_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text"))))));



CREATE POLICY "ordini righe merchant select" ON "public"."ordini_righe" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."ordini" "o"
     JOIN "public"."negozi" "n" ON (("n"."id" = "o"."negozio_id")))
  WHERE (("o"."id" = "ordini_righe"."ordine_id") AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "ordini righe self select" ON "public"."ordini_righe" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ordini" "o"
  WHERE (("o"."id" = "ordini_righe"."ordine_id") AND ("o"."cliente_user_id" = "auth"."uid"())))));



CREATE POLICY "ordini self select" ON "public"."ordini" FOR SELECT USING (("cliente_user_id" = "auth"."uid"()));



ALTER TABLE "public"."ordini_eventi" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ordini_righe" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pagamenti eventi admin select all" ON "public"."pagamenti_eventi" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "pagamenti eventi merchant select" ON "public"."pagamenti_eventi" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."ordini" "o"
     JOIN "public"."negozi" "n" ON (("n"."id" = "o"."negozio_id")))
  WHERE (("o"."id" = "pagamenti_eventi"."ordine_id") AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "pagamenti eventi self select" ON "public"."pagamenti_eventi" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ordini" "o"
  WHERE (("o"."id" = "pagamenti_eventi"."ordine_id") AND ("o"."cliente_user_id" = "auth"."uid"())))));



CREATE POLICY "pagamenti sessioni admin select all" ON "public"."pagamenti_sessioni" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "pagamenti sessioni merchant select" ON "public"."pagamenti_sessioni" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."ordini" "o"
     JOIN "public"."negozi" "n" ON (("n"."id" = "o"."negozio_id")))
  WHERE (("o"."id" = "pagamenti_sessioni"."ordine_id") AND ("n"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "pagamenti sessioni self select" ON "public"."pagamenti_sessioni" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ordini" "o"
  WHERE (("o"."id" = "pagamenti_sessioni"."ordine_id") AND ("o"."cliente_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."pagamenti_eventi" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagamenti_sessioni" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payout" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payout admin select" ON "public"."payout" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "payout merchant select" ON "public"."payout" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."negozi" "n"
  WHERE (("n"."id" = "payout"."negozio_id") AND ("n"."owner_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."piattaforma_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."piattaforma_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "piattaforma_settings admin manage" ON "public"."piattaforma_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));



CREATE POLICY "piattaforma_settings public read" ON "public"."piattaforma_settings" FOR SELECT USING (("pubblico" = true));



ALTER TABLE "public"."preferiti" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "preferiti self delete" ON "public"."preferiti" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "preferiti self insert" ON "public"."preferiti" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "preferiti self select" ON "public"."preferiti" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "preferiti self update" ON "public"."preferiti" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."prodotti" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prodotto_varianti" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_stock_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_vision_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public active products read" ON "public"."prodotti" FOR SELECT USING ((("attivo" = true) AND (EXISTS ( SELECT 1
   FROM "public"."negozi"
  WHERE (("negozi"."id" = "prodotti"."negozio_id") AND ("negozi"."deleted_at" IS NULL))))));



CREATE POLICY "public product media read" ON "public"."product_media" FOR SELECT USING (true);



ALTER TABLE "public"."reclamo_comunicazioni" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reclamo_comunicazioni admin all" ON "public"."reclamo_comunicazioni" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "reclamo_comunicazioni admin insert" ON "public"."reclamo_comunicazioni" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "reclamo_comunicazioni client insert own" ON "public"."reclamo_comunicazioni" FOR INSERT WITH CHECK ((("mittente" = 'cliente'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."ordine_reclami" "r"
  WHERE (("r"."id" = "reclamo_comunicazioni"."reclamo_id") AND ("r"."cliente_user_id" = "auth"."uid"()))))));



CREATE POLICY "reclamo_comunicazioni client select own" ON "public"."reclamo_comunicazioni" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ordine_reclami" "r"
  WHERE (("r"."id" = "reclamo_comunicazioni"."reclamo_id") AND ("r"."cliente_user_id" = "auth"."uid"())))));



CREATE POLICY "reclamo_comunicazioni merchant insert" ON "public"."reclamo_comunicazioni" FOR INSERT WITH CHECK ((("mittente" = 'venditore'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."ordine_reclami" "r"
     JOIN "public"."negozi" "n" ON (("n"."id" = "r"."negozio_id")))
  WHERE (("r"."id" = "reclamo_comunicazioni"."reclamo_id") AND ("n"."deleted_at" IS NULL) AND ("n"."owner_user_id" = "auth"."uid"()))))));



CREATE POLICY "reclamo_comunicazioni merchant select" ON "public"."reclamo_comunicazioni" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."ordine_reclami" "r"
     JOIN "public"."negozi" "n" ON (("n"."id" = "r"."negozio_id")))
  WHERE (("r"."id" = "reclamo_comunicazioni"."reclamo_id") AND ("n"."deleted_at" IS NULL) AND ("n"."owner_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."reset_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scan_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scan_log admin select all" ON "public"."scan_log" FOR SELECT USING (true);



CREATE POLICY "scan_log insert own" ON "public"."scan_log" FOR INSERT WITH CHECK (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "scan_log select own" ON "public"."scan_log" FOR SELECT USING (("user_id" = ("auth"."uid"())::"text"));



ALTER TABLE "public"."segnalazioni" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "segnalazioni admin select all" ON "public"."segnalazioni" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "segnalazioni admin update all" ON "public"."segnalazioni" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "segnalazioni insert own" ON "public"."segnalazioni" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "segnalazioni select own" ON "public"."segnalazioni" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."shipping_carriers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shipping_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shipping_tariff_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shipping_tariffs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock notif delete own" ON "public"."product_stock_notifications" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR ("lower"("email") = "lower"("auth"."email"()))));



CREATE POLICY "stock notif insert own" ON "public"."product_stock_notifications" FOR INSERT WITH CHECK ((("user_id" IS NULL) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "stock notif select own" ON "public"."product_stock_notifications" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("lower"("email") = "lower"("auth"."email"()))));



CREATE POLICY "stock notif update own" ON "public"."product_stock_notifications" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR ("lower"("email") = "lower"("auth"."email"())))) WITH CHECK ((("user_id" = "auth"."uid"()) OR ("lower"("email") = "lower"("auth"."email"()))));



ALTER TABLE "public"."template_negozi" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "varianti merchant write" ON "public"."prodotto_varianti" USING ((EXISTS ( SELECT 1
   FROM "public"."prodotti" "p"
  WHERE (("p"."id" = "prodotto_varianti"."prodotto_id") AND "public"."is_merchant_for_store"(("p"."negozio_id")::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."prodotti" "p"
  WHERE (("p"."id" = "prodotto_varianti"."prodotto_id") AND "public"."is_merchant_for_store"(("p"."negozio_id")::"text")))));



CREATE POLICY "varianti pubbliche read" ON "public"."prodotto_varianti" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."prodotti" "p"
     JOIN "public"."negozi" "n" ON (("n"."id" = "p"."negozio_id")))
  WHERE (("p"."id" = "prodotto_varianti"."prodotto_id") AND ("p"."attivo" = true) AND ("n"."attivo" = true) AND ("n"."deleted_at" IS NULL)))));



CREATE POLICY "vision_cache_public_insert" ON "public"."product_vision_cache" FOR INSERT WITH CHECK (true);



CREATE POLICY "vision_cache_public_read" ON "public"."product_vision_cache" FOR SELECT USING (true);



CREATE POLICY "vision_cache_public_update" ON "public"."product_vision_cache" FOR UPDATE USING (true) WITH CHECK (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."aggiorna_payment_status"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_payment_id" "text", "p_transaction_id" "text", "p_importo" numeric, "p_valuta" "text", "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aggiorna_payment_status"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_payment_id" "text", "p_transaction_id" "text", "p_importo" numeric, "p_valuta" "text", "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."aggiorna_prodotto_da_varianti"() TO "anon";
GRANT ALL ON FUNCTION "public"."aggiorna_prodotto_da_varianti"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."aggiorna_prodotto_da_varianti"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."aggiorna_stato_ordine"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_motivo" "text", "p_nota" "text", "p_merchant_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aggiorna_stato_ordine"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_motivo" "text", "p_nota" "text", "p_merchant_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."aggiorna_stato_reclamo"("p_reclamo_id" "uuid", "p_nuovo_stato" "text", "p_merchant_user_id" "uuid", "p_nota" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aggiorna_stato_reclamo"("p_reclamo_id" "uuid", "p_nuovo_stato" "text", "p_merchant_user_id" "uuid", "p_nota" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."aggiorna_stato_spedizione"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_tracking_code" "text", "p_tracking_url" "text", "p_consegna_stimata" "text", "p_merchant_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aggiorna_stato_spedizione"("p_ordine_id" "uuid", "p_nuovo_stato" "text", "p_tracking_code" "text", "p_tracking_url" "text", "p_consegna_stimata" "text", "p_merchant_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."aggiungi_messaggio_reclamo_cliente"("p_reclamo_id" "uuid", "p_cliente_user_id" "uuid", "p_corpo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aggiungi_messaggio_reclamo_cliente"("p_reclamo_id" "uuid", "p_cliente_user_id" "uuid", "p_corpo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."aggiungi_messaggio_reclamo_venditore"("p_reclamo_id" "uuid", "p_merchant_user_id" "uuid", "p_corpo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aggiungi_messaggio_reclamo_venditore"("p_reclamo_id" "uuid", "p_merchant_user_id" "uuid", "p_corpo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."calcola_tariffa_spedizione"("p_carrier" "text", "p_service" "text", "p_peso_grammi" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calcola_tariffa_spedizione"("p_carrier" "text", "p_service" "text", "p_peso_grammi" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."commissione_piattaforma_percentuale"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."commissione_piattaforma_percentuale"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_reset_token"("p_token_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_reset_token"("p_token_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crea_ordine"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crea_ordine"("p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crea_ordine_carrello"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crea_ordine_carrello"("p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crea_reclamo_ordine"("p_ordine_id" "uuid", "p_cliente_user_id" "uuid", "p_tipo" "text", "p_messaggio" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crea_reclamo_ordine"("p_ordine_id" "uuid", "p_cliente_user_id" "uuid", "p_tipo" "text", "p_messaggio" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."crea_segnalazione"("p_user_id" "uuid", "p_user_email" "text", "p_tipo" "text", "p_titolo" "text", "p_descrizione" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_name" "text", "p_negozio_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."crea_segnalazione"("p_user_id" "uuid", "p_user_email" "text", "p_tipo" "text", "p_titolo" "text", "p_descrizione" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_name" "text", "p_negozio_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crea_segnalazione"("p_user_id" "uuid", "p_user_email" "text", "p_tipo" "text", "p_titolo" "text", "p_descrizione" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_name" "text", "p_negozio_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_merchant_for_store"("target_store_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_merchant_for_store"("target_store_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_merchant_for_store"("target_store_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_admin_activity"("p_admin_user_id" "uuid", "p_admin_email" "text", "p_operation_type" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_name" "text", "p_negozio_id" "uuid", "p_negozio_nome" "text", "p_result" "text", "p_detail" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_admin_activity"("p_admin_user_id" "uuid", "p_admin_email" "text", "p_operation_type" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_name" "text", "p_negozio_id" "uuid", "p_negozio_nome" "text", "p_result" "text", "p_detail" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_admin_activity"("p_admin_user_id" "uuid", "p_admin_email" "text", "p_operation_type" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_name" "text", "p_negozio_id" "uuid", "p_negozio_nome" "text", "p_result" "text", "p_detail" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ordine_to_json"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ordine_to_json"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ordini_eventi_trigger_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."ordini_eventi_trigger_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ordini_eventi_trigger_fn"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pagamenti_credenziali_leggi"("p_negozio_id" "uuid", "p_provider" "text", "p_decifra" boolean, "p_chiave" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pagamenti_credenziali_leggi"("p_negozio_id" "uuid", "p_provider" "text", "p_decifra" boolean, "p_chiave" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pagamenti_credenziali_salva"("p_negozio_id" "uuid", "p_provider" "text", "p_attivo" boolean, "p_test_mode" boolean, "p_client_id" "text", "p_payee_email" "text", "p_iban" "text", "p_secret" "text", "p_webhook_secret" "text", "p_chiave" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pagamenti_credenziali_salva"("p_negozio_id" "uuid", "p_provider" "text", "p_attivo" boolean, "p_test_mode" boolean, "p_client_id" "text", "p_payee_email" "text", "p_iban" "text", "p_secret" "text", "p_webhook_secret" "text", "p_chiave" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pagamenti_ordine_scaduto"("p_ordine_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pagamenti_ordine_scaduto"("p_ordine_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pagamenti_prepara_rimborso"("p_ordine_id" "uuid", "p_importo" numeric, "p_merchant_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pagamenti_prepara_rimborso"("p_ordine_id" "uuid", "p_importo" numeric, "p_merchant_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pagamenti_rimborso_annulla"("p_ordine_id" "uuid", "p_importo" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pagamenti_rimborso_annulla"("p_ordine_id" "uuid", "p_importo" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pagamenti_stripe_connect_disconnetti"("p_negozio_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pagamenti_stripe_connect_disconnetti"("p_negozio_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pagamenti_stripe_connect_salva"("p_negozio_id" "uuid", "p_account_id" "text", "p_account_name" "text", "p_test_mode" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pagamenti_stripe_connect_salva"("p_negozio_id" "uuid", "p_account_id" "text", "p_account_name" "text", "p_test_mode" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."payout_annulla"("p_payout_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."payout_annulla"("p_payout_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."payout_calcola"("p_negozio_id" "uuid", "p_periodo_da" "date", "p_periodo_a" "date", "p_creato_da" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."payout_calcola"("p_negozio_id" "uuid", "p_periodo_da" "date", "p_periodo_a" "date", "p_creato_da" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."payout_segna_erogato"("p_payout_id" "uuid", "p_nuovo_stato" "text", "p_stripe_payout_id" "text", "p_stripe_payout_status" "text", "p_errore" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."payout_segna_erogato"("p_payout_id" "uuid", "p_nuovo_stato" "text", "p_stripe_payout_id" "text", "p_stripe_payout_status" "text", "p_errore" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reclamo_messaggio_to_json"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reclamo_messaggio_to_json"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reclamo_to_json"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reclamo_to_json"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_eventi_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_eventi_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_eventi_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_offerte_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_offerte_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_offerte_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_ordine_reclami_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_ordine_reclami_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_ordine_reclami_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_piattaforma_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_piattaforma_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_piattaforma_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_segnalazioni_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_segnalazioni_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_segnalazioni_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_roles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_roles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_roles_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify"("testo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify"("testo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify"("testo" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."admin_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."categorie" TO "anon";
GRANT ALL ON TABLE "public"."categorie" TO "authenticated";
GRANT ALL ON TABLE "public"."categorie" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_profili" TO "anon";
GRANT ALL ON TABLE "public"."cliente_profili" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_profili" TO "service_role";



GRANT ALL ON TABLE "public"."eventi" TO "anon";
GRANT ALL ON TABLE "public"."eventi" TO "authenticated";
GRANT ALL ON TABLE "public"."eventi" TO "service_role";



GRANT ALL ON TABLE "public"."media" TO "anon";
GRANT ALL ON TABLE "public"."media" TO "authenticated";
GRANT ALL ON TABLE "public"."media" TO "service_role";



GRANT ALL ON TABLE "public"."merchant_profiles" TO "anon";
GRANT ALL ON TABLE "public"."merchant_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."merchant_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."moduli_registry" TO "anon";
GRANT ALL ON TABLE "public"."moduli_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."moduli_registry" TO "service_role";



GRANT ALL ON TABLE "public"."negozi" TO "anon";
GRANT ALL ON TABLE "public"."negozi" TO "authenticated";
GRANT ALL ON TABLE "public"."negozi" TO "service_role";



GRANT ALL ON TABLE "public"."negozio_metodi_pagamento" TO "anon";
GRANT ALL ON TABLE "public"."negozio_metodi_pagamento" TO "authenticated";
GRANT ALL ON TABLE "public"."negozio_metodi_pagamento" TO "service_role";



GRANT ALL ON TABLE "public"."negozio_metodi_spedizione" TO "anon";
GRANT ALL ON TABLE "public"."negozio_metodi_spedizione" TO "authenticated";
GRANT ALL ON TABLE "public"."negozio_metodi_spedizione" TO "service_role";



GRANT ALL ON TABLE "public"."negozio_pagamenti" TO "anon";
GRANT ALL ON TABLE "public"."negozio_pagamenti" TO "authenticated";
GRANT ALL ON TABLE "public"."negozio_pagamenti" TO "service_role";



GRANT ALL ON TABLE "public"."offerte" TO "anon";
GRANT ALL ON TABLE "public"."offerte" TO "authenticated";
GRANT ALL ON TABLE "public"."offerte" TO "service_role";



GRANT ALL ON TABLE "public"."ordine_reclami" TO "anon";
GRANT ALL ON TABLE "public"."ordine_reclami" TO "authenticated";
GRANT ALL ON TABLE "public"."ordine_reclami" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ordini_numero_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ordini_numero_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ordini_numero_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ordini" TO "anon";
GRANT ALL ON TABLE "public"."ordini" TO "authenticated";
GRANT ALL ON TABLE "public"."ordini" TO "service_role";



GRANT ALL ON TABLE "public"."ordini_eventi" TO "anon";
GRANT ALL ON TABLE "public"."ordini_eventi" TO "authenticated";
GRANT ALL ON TABLE "public"."ordini_eventi" TO "service_role";



GRANT ALL ON TABLE "public"."ordini_righe" TO "anon";
GRANT ALL ON TABLE "public"."ordini_righe" TO "authenticated";
GRANT ALL ON TABLE "public"."ordini_righe" TO "service_role";



GRANT ALL ON TABLE "public"."pagamenti_eventi" TO "anon";
GRANT ALL ON TABLE "public"."pagamenti_eventi" TO "authenticated";
GRANT ALL ON TABLE "public"."pagamenti_eventi" TO "service_role";



GRANT ALL ON TABLE "public"."pagamenti_sessioni" TO "anon";
GRANT ALL ON TABLE "public"."pagamenti_sessioni" TO "authenticated";
GRANT ALL ON TABLE "public"."pagamenti_sessioni" TO "service_role";



GRANT ALL ON TABLE "public"."payout" TO "anon";
GRANT ALL ON TABLE "public"."payout" TO "authenticated";
GRANT ALL ON TABLE "public"."payout" TO "service_role";



GRANT ALL ON TABLE "public"."piattaforma_config" TO "anon";
GRANT ALL ON TABLE "public"."piattaforma_config" TO "authenticated";
GRANT ALL ON TABLE "public"."piattaforma_config" TO "service_role";



GRANT ALL ON TABLE "public"."piattaforma_settings" TO "anon";
GRANT ALL ON TABLE "public"."piattaforma_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."piattaforma_settings" TO "service_role";



GRANT ALL ON TABLE "public"."preferiti" TO "anon";
GRANT ALL ON TABLE "public"."preferiti" TO "authenticated";
GRANT ALL ON TABLE "public"."preferiti" TO "service_role";



GRANT ALL ON TABLE "public"."prodotti" TO "anon";
GRANT ALL ON TABLE "public"."prodotti" TO "authenticated";
GRANT ALL ON TABLE "public"."prodotti" TO "service_role";



GRANT ALL ON SEQUENCE "public"."prodotti_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."prodotti_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."prodotti_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."prodotto_varianti" TO "anon";
GRANT ALL ON TABLE "public"."prodotto_varianti" TO "authenticated";
GRANT ALL ON TABLE "public"."prodotto_varianti" TO "service_role";



GRANT ALL ON TABLE "public"."product_media" TO "anon";
GRANT ALL ON TABLE "public"."product_media" TO "authenticated";
GRANT ALL ON TABLE "public"."product_media" TO "service_role";



GRANT ALL ON TABLE "public"."product_stock_notifications" TO "anon";
GRANT ALL ON TABLE "public"."product_stock_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."product_stock_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."product_vision_cache" TO "anon";
GRANT ALL ON TABLE "public"."product_vision_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."product_vision_cache" TO "service_role";



GRANT ALL ON TABLE "public"."reclamo_comunicazioni" TO "anon";
GRANT ALL ON TABLE "public"."reclamo_comunicazioni" TO "authenticated";
GRANT ALL ON TABLE "public"."reclamo_comunicazioni" TO "service_role";



GRANT ALL ON TABLE "public"."reset_tokens" TO "anon";
GRANT ALL ON TABLE "public"."reset_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."reset_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."scan_log" TO "anon";
GRANT ALL ON TABLE "public"."scan_log" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_log" TO "service_role";



GRANT ALL ON TABLE "public"."segnalazioni" TO "anon";
GRANT ALL ON TABLE "public"."segnalazioni" TO "authenticated";
GRANT ALL ON TABLE "public"."segnalazioni" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_carriers" TO "anon";
GRANT ALL ON TABLE "public"."shipping_carriers" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_carriers" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_services" TO "anon";
GRANT ALL ON TABLE "public"."shipping_services" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_services" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_tariff_versions" TO "anon";
GRANT ALL ON TABLE "public"."shipping_tariff_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_tariff_versions" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_tariffs" TO "anon";
GRANT ALL ON TABLE "public"."shipping_tariffs" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_tariffs" TO "service_role";



GRANT ALL ON TABLE "public"."template_negozi" TO "anon";
GRANT ALL ON TABLE "public"."template_negozi" TO "authenticated";
GRANT ALL ON TABLE "public"."template_negozi" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































