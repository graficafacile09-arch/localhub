-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — GESTIONE ORDINI AREA VENDITORE
--
-- Obiettivo:
--   Dare al venditore il controllo completo sugli ordini dei propri negozi:
--   workflow di stato (NUOVO → CONFERMATO → IN LAVORAZIONE → PRONTO →
--   COMPLETATO, con ANNULLATO da ogni fase compatibile), tracciabilità
--   (storico eventi), annullamento con motivo/nota e ripristino ATOMICO
--   dello stock in caso di annullamento.
--
-- Principi:
--   1. NON si crea un secondo sistema di stati: si ADATTA quello esistente
--      (20260812/20260813) estendendo il CHECK con 'confermato',
--      'in_lavorazione', 'pronto' e mantenendo i valori legacy
--      ('in_preparazione', 'in_consegna', 'consegnato', 'cancellato').
--   2. Ogni operazione critica (cambio stato, annullamento, ripristino
--      stock) è ATOMICA e IDEMPOTENTE, dentro la RPC aggiorna_stato_ordine:
--      - lock della riga ordine (SELECT ... FOR UPDATE);
--      - macchina a stati validata (transizioni non logiche → rifiutate);
--      - stessa stato richiesto → no-op (retry idempotente: nessun doppio
--        effetto, nessuna seconda email, nessun doppio ripristino stock);
--      - annullamento → ripristino stock SOLO se la quantità era tracciata
--        (stessa guardia della creazione: quantita_disponibile IS NOT NULL),
--        con lock delle righe; la transizione cancellato→cancellato è
--        impossibile, quindi il ripristino avviene UNA sola volta.
--   3. Ownership server-side: la RPC verifica che negozi.owner_user_id =
--      l'utente chiamante (o che l'utente abbia il ruolo admin); la route
--      applica già requireApiArea("merchant") + canManageStore.
--   4. Storico eventi: tabella ordini_eventi popolata da un TRIGGER (nessuna
--      logica duplicata nel codice): insert → "ordine ricevuto"; update di
--      stato → evento con etichetta, motivo/nota (annullamento) e autore.
--   5. Lo stock NON viene MAI decrementato due volte: la conferma e gli
--      altri avanzamenti non toccano lo stock (già decrementato alla
--      creazione dalla RPC atomica 20260813).
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Nuovi stati ordine (backward-compatible con i valori esistenti) ──────
alter table public.ordini drop constraint if exists ordini_stato_check;
alter table public.ordini add constraint ordini_stato_check
  check (stato in (
    'in_preparazione', 'confermato', 'in_lavorazione', 'pronto',
    'in_consegna', 'consegnato', 'cancellato'
  ));

-- ── 2. Campi di tracciabilità del workflow ───────────────────────────────────
-- aggiornato_da   → ultimo utente che ha cambiato lo stato
-- annullato_*     → motivo, nota, data/ora e autore dell'annullamento
-- letto_at        → primo momento in cui il venditore ha aperto il dettaglio
--                   (indicazione "nuovo/non letto" nella lista)
alter table public.ordini
  add column if not exists aggiornato_da uuid references auth.users (id) on delete set null;
alter table public.ordini
  add column if not exists annullato_motivo text;
alter table public.ordini
  add column if not exists annullato_nota text;
alter table public.ordini
  add column if not exists annullato_at timestamptz;
alter table public.ordini
  add column if not exists annullato_da uuid references auth.users (id) on delete set null;
alter table public.ordini
  add column if not exists letto_at timestamptz;

-- ── 3. Storico eventi ordine ─────────────────────────────────────────────────
create table if not exists public.ordini_eventi (
  id          uuid primary key default gen_random_uuid(),
  ordine_id   uuid not null references public.ordini (id) on delete cascade,
  evento      text not null,
  dettaglio   text,
  motivo      text,
  nota        text,
  autore_id   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists ordini_eventi_ordine_id_idx
  on public.ordini_eventi (ordine_id, created_at asc);

-- ── 4. Trigger che popola lo storico (insert + cambio stato) ────────────────
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

  return new;
end;
$$;

drop trigger if exists ordini_eventi_trigger on public.ordini;
create trigger ordini_eventi_trigger
  after insert or update of stato on public.ordini
  for each row execute function public.ordini_eventi_trigger_fn();

-- ── 5. RLS ordini_eventi (sola lettura: cliente proprietario, merchant del  ─
--    negozio, admin) — le scritture avvengono SOLO via trigger definer. ──────
alter table public.ordini_eventi enable row level security;

drop policy if exists "ordini eventi self select" on public.ordini_eventi;
create policy "ordini eventi self select"
  on public.ordini_eventi for select
  using (
    exists (
      select 1 from public.ordini o
      where o.id = ordini_eventi.ordine_id
        and o.cliente_user_id = auth.uid()
    )
  );

drop policy if exists "ordini eventi merchant select" on public.ordini_eventi;
create policy "ordini eventi merchant select"
  on public.ordini_eventi for select
  using (
    exists (
      select 1 from public.ordini o
      join public.negozi n on n.id = o.negozio_id
      where o.id = ordini_eventi.ordine_id
        and n.owner_user_id = auth.uid()
    )
  );

drop policy if exists "ordini eventi admin select all" on public.ordini_eventi;
create policy "ordini eventi admin select all"
  on public.ordini_eventi for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- ── 6. RPC atomica: cambio stato / annullamento + ripristino stock ───────────
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
  -- Il venditore può gestire SOLO ordini dei propri negozi; l'admin
  -- autorizzato (ruolo admin) può gestire qualunque ordine. Il chiamante è
  -- OBBLIGATORIO: senza un utente autenticato l'operazione viene rifiutata
  -- (la RPC è service-role, ultima linea di difesa).
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
  -- NUOVO→CONFERMATO→IN_LAVORAZIONE→PRONTO→COMPLETATO; ANNULLATO da ogni fase
  -- compatibile. COMPLETATO e ANNULLATO sono terminali.
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
  -- Solo per quantità tracciate (stessa guardia della creazione). La
  -- transizione cancellato→cancellato è impossibile → il ripristino avviene
  -- UNA sola volta. Lock delle righe per serializzare.
  if p_nuovo_stato = 'cancellato' then
    for v_riga in
      select *
      from public.ordini_righe
      where ordine_id = p_ordine_id
      for update
    loop
      update public.prodotti
      set quantita_disponibile = quantita_disponibile + v_riga.quantita,
          updated_at = now()
      where id = v_riga.prodotto_id
        and quantita_disponibile is not null;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'cambiato', true, 'ordine', public.ordine_to_json(v_ordine.id));

exception
  when others then
    -- Rollback totale: nessuna modifica parziale a stato/stock/eventi.
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare l''ordine.');
end;
$$;

-- ── 7. Permessi: la RPC è usata SOLO dal server (service role) ───────────────
revoke execute on function public.aggiorna_stato_ordine(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aggiorna_stato_ordine(uuid, text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
