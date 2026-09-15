-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — STATO SPEDIZIONE + TRACKING V1
--
-- Obiettivo: completare il ciclo operativo della spedizione tra VENDITORE
-- e CLIENTE, SENZA fondere lo stato ordine con lo stato spedizione:
--   - STATO ORDINE (20260815):      in_preparazione → confermato →
--                                    in_lavorazione → pronto → consegnato /
--                                    cancellato;
--   - STATO SPEDIZIONE (questa):    NULL/non_affidata → affidata →
--                                    in_transito → consegnata; affidata/
--                                    in_transito → problema → rientro.
--
-- Principi:
--   1. Migration ESCLUSIVAMENTE additiva: nessun ordine storico valorizzato,
--      nessun dato toccato. Per modalita='ritiro' stato_spedizione resta NULL.
--   2. Tracking MANUALE nella V1 (nessuna integrazione Poste/BRT): il
--      venditore inserisce codice/URL di tracking; il cliente lo vede e segue.
--   3. RPC SECURITY DEFINER `aggiorna_stato_spedizione` (stesso modello di
--      `aggiorna_stato_ordine`): lock riga, ownership merchant/admin,
--      macchina a stati, tracking OBBLIGATORIO per "affidata",
--      affidata_at/consegnata_at automatici. Mai UPDATE diretto della tabella.
--   4. Storico: RIUSA `ordini_eventi` (trigger esteso a `update of
--      stato_spedizione`), nessuna tabella eventi separata.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Colonne operative della spedizione (tutte nullable, nessun default) ──
alter table public.ordini
  add column if not exists stato_spedizione text;
alter table public.ordini
  add column if not exists tracking_code text;
alter table public.ordini
  add column if not exists tracking_url text;
alter table public.ordini
  add column if not exists affidata_at timestamptz;
alter table public.ordini
  add column if not exists consegnata_at timestamptz;
alter table public.ordini
  add column if not exists consegna_stimata text;

-- ── 2. CHECK stato spedizione (NULL = ordini storici / non gestita) ─────────
alter table public.ordini drop constraint if exists ordini_stato_spedizione_check;
alter table public.ordini add constraint ordini_stato_spedizione_check
  check (
    stato_spedizione is null
    or stato_spedizione in ('non_affidata', 'affidata', 'in_transito', 'consegnata', 'problema')
  );

create index if not exists ordini_stato_spedizione_idx
  on public.ordini (stato_spedizione);

-- ── 3. Trigger storico: estende ordini_eventi_trigger_fn (20260815) per     ──
--    registrare anche il cambio di stato spedizione. RIUSA ordini_eventi.   ──
create or replace function public.ordini_eventi_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists ordini_eventi_trigger on public.ordini;
create trigger ordini_eventi_trigger
  after insert or update of stato, stato_spedizione on public.ordini
  for each row execute function public.ordini_eventi_trigger_fn();

-- ── 4. RPC atomica: aggiornamento stato spedizione + tracking ───────────────
create or replace function public.aggiorna_stato_spedizione(
  p_ordine_id uuid,
  p_nuovo_stato text,
  p_tracking_code text default null,
  p_tracking_url text default null,
  p_consegna_stimata text default null,
  p_merchant_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- ── 5. Permessi: RPC usata SOLO dal server (service role) ───────────────────
revoke execute on function public.aggiorna_stato_spedizione(uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aggiorna_stato_spedizione(uuid, text, text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
