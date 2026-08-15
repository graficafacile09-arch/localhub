-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — PAYOUT V1: calcolo e tracciamento interno (nessun Transfer/Payout Stripe)
--
-- Il Payout V1 è il sistema INTERNO di calcolo e tracciamento del netto da
-- erogare a ciascun venditore per periodo. NON crea transfer né payout reali
-- su Stripe: l'erogazione resta gestita da Stripe sul saldo del connected
-- account; qui si registra il calcolo e lo stato del processo interno.
--
-- FONTE ECONOMICA: SOLO gli snapshot già presenti su `ordini`:
--   - payment_status ∈ (paid, partially_refunded, refunded) = maturato;
--   - payment_paid_at = data economica (inclusa nel periodo);
--   - payment_amount / payment_refunded_amount / commissione_importo.
-- La formula del netto è IDENTICA a lib/incassi.ts (commissione effettiva
-- proporzionale ai rimborsi; rimborso totale → netto 0). Mai ricalcolata la
-- percentuale: si usa lo snapshot commissione_importo.
--
-- ANTI-DOPPIO PAYOUT (soluzione più semplice e robusta, documentata):
--   1) UNIQUE(negozio_id, periodo_da, periodo_a) → un solo payout per
--      negozio+periodo (retry idempotente via idempotency_key deterministica);
--   2) colonna `ordini.payout_id` (FK → payout, ON DELETE SET NULL): ogni
--      ordine incluso in un payout viene TIMBRATO, così non può essere
--      incluso in un payout successivo (anche con periodi sovrapposti).
--      Un payout ANNULLATO libera i propri ordini (payout_id = NULL) che
--      tornano disponibili per un nuovo periodo. Nessuna tabella join:
--      una singola colonna FK è la soluzione minima e sicura.
--
-- Nessun backfill: gli ordini storici restano senza payout.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Tabella payout ───────────────────────────────────────────────────────
create table if not exists public.payout (
  id uuid primary key default gen_random_uuid(),
  negozio_id uuid not null references public.negozi (id) on delete cascade,
  periodo_da date not null,
  periodo_a date not null,
  importo_lordo numeric(10,2) not null default 0,
  commissione_importo numeric(10,2) not null default 0,
  importo_netto numeric(10,2) not null default 0,
  n_ordini integer not null default 0,
  stato text not null check (
    stato in ('calcolato', 'in_erogazione', 'pagato', 'fallito', 'annullato')
  ),
  stripe_transfer_id text,
  stripe_payout_id text,
  stripe_payout_status text,
  errore text,
  idempotency_key text not null,
  creato_da uuid references auth.users (id) on delete set null,
  creato_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  erogato_at timestamptz
);

-- Vincoli di coerenza economica.
alter table public.payout
  add constraint payout_negozio_periodo_unq unique (negozio_id, periodo_da, periodo_a),
  add constraint payout_periodo_ordine_ck check (periodo_da <= periodo_a),
  add constraint payout_importo_lordo_ck check (importo_lordo >= 0),
  add constraint payout_commissione_ck check (commissione_importo >= 0),
  add constraint payout_importo_netto_ck check (importo_netto >= 0),
  add constraint payout_idempotency_unq unique (idempotency_key),
  -- importo_netto = importo_lordo − commissione_importo (invariante).
  add constraint payout_netto_coerente_ck
    check (importo_netto = round((importo_lordo - commissione_importo)::numeric, 2));

-- ── 2. Timbratura ordini (anti doppio payout, soluzione minima) ─────────────
alter table public.ordini
  add column if not exists payout_id uuid references public.payout (id) on delete set null;

create index if not exists ordini_payout_id_idx
  on public.ordini (payout_id)
  where payout_id is not null;

-- ── 3. RLS payout: merchant (propri negozi) + admin (tutto); scritture solo RPC ──
alter table public.payout enable row level security;

create policy "payout merchant select" on public.payout
  for select to authenticated
  using (
    exists (
      select 1 from public.negozi n
      where n.id = payout.negozio_id and n.owner_user_id = auth.uid()
    )
  );

create policy "payout admin select" on public.payout
  for select to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

-- Nessuna policy INSERT/UPDATE/DELETE: l'accesso in scrittura passa
-- ESCLUSIVAMENTE dalle RPC (security definer, service_role).

-- ── 4. RPC payout_calcola ───────────────────────────────────────────────────
create or replace function public.payout_calcola(
  p_negozio_id uuid,
  p_periodo_da date,
  p_periodo_a date,
  p_creato_da uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- ── 5. RPC payout_segna_erogato ─────────────────────────────────────────────
create or replace function public.payout_segna_erogato(
  p_payout_id uuid,
  p_nuovo_stato text,
  p_stripe_payout_id text default null,
  p_stripe_payout_status text default null,
  p_errore text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- ── 6. RPC payout_annulla (solo da calcolato; libera gli ordini) ────────────
create or replace function public.payout_annulla(p_payout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- ── 7. Permessi: SOLO service_role (pattern esistente) ──────────────────────
revoke execute on function public.payout_calcola(uuid, date, date, uuid) from public, anon, authenticated;
grant execute on function public.payout_calcola(uuid, date, date, uuid) to service_role;

revoke execute on function public.payout_segna_erogato(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.payout_segna_erogato(uuid, text, text, text, text) to service_role;

revoke execute on function public.payout_annulla(uuid) from public, anon, authenticated;
grant execute on function public.payout_annulla(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
