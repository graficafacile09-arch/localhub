-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — RECLAMI ORDINE "ORDINE NON ARRIVATO"
--
-- Obiettivo: il cliente autenticato può segnalare un ordine non arrivato.
-- Il reclamo viene salvato nel DB (fonte di verità); notifiche venditore +
-- admin (ntfy) e gestione da parte del venditore sono canali di avviso.
--
-- SICUREZZA:
--   - il cliente può creare reclami SOLO per ordini PROPRI (la RPC
--     verifica ordini.cliente_user_id = utente della sessione, mai un id
--     dal browser);
--   - il venditore può gestire SOLO reclami di ordini dei PROPRI negozi
--     (la RPC verifica negozi.owner_user_id, o admin autorizzato);
--   - un solo reclamo ATTIVO per (ordine, tipo): vincolo UNIQUE parziale
--     su stato in ('aperto','in_gestione') + guardia nella RPC (la RPC
--     restituisce il reclamo esistente: mai un secondo reclamo);
--   - le RPC sono eseguibili SOLO via service role (revoke da anon/…).
--
-- Stati: aperto → in_gestione → risolto → chiuso (risolto→chiuso;
-- anche aperto/in_gestione → risolto/chiuso). chiuso è terminale.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Tabella reclami ──────────────────────────────────────────────────
create table if not exists public.ordine_reclami (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Riferimenti (negozio_id sempre risolto dal SERVER dall'ordine)
  ordine_id        uuid not null references public.ordini (id) on delete cascade,
  negozio_id       uuid not null references public.negozi (id) on delete cascade,

  -- Cliente (snapshot dall'ordine; null per sicurezza se l'account sparisce)
  cliente_user_id  uuid references auth.users (id) on delete set null,
  cliente_nome     text not null default '',
  cliente_email    text,
  cliente_telefono text,

  -- Contenuto
  tipo             text not null default 'ordine_non_arrivato'
    check (tipo in ('ordine_non_arrivato')),
  messaggio        text,

  -- Stato e gestione
  stato            text not null default 'aperto'
    check (stato in ('aperto', 'in_gestione', 'risolto', 'chiuso')),
  gestito_at       timestamptz,
  gestito_da       uuid references auth.users (id) on delete set null,
  gestito_nota     text
);

-- Blocco reclami ATTIVI duplicati: stesso ordine + stesso tipo non può
-- avere più di un reclamo aperto/in gestione (dopo risolto/chiuso il
-- cliente può eventualmente aprirne uno nuovo).
create unique index if not exists ordine_reclami_attivo_unico
  on public.ordine_reclami (ordine_id, tipo)
  where stato in ('aperto', 'in_gestione');

create index if not exists ordine_reclami_ordine_id_idx
  on public.ordine_reclami (ordine_id, created_at desc);

create index if not exists ordine_reclami_negozio_id_idx
  on public.ordine_reclami (negozio_id, stato, created_at desc);

create index if not exists ordine_reclami_stato_idx
  on public.ordine_reclami (stato);

-- ── 2. Trigger updated_at ────────────────────────────────────────────────
create or replace function public.set_ordine_reclami_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_ordine_reclami_updated_at on public.ordine_reclami;
create trigger trg_ordine_reclami_updated_at
  before update on public.ordine_reclami
  for each row execute function public.set_ordine_reclami_updated_at();

-- ── 3. Helper: reclamo → jsonb (risposta alle RPC) ───────────────────────
create or replace function public.reclamo_to_json(p_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
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

-- ── 4. RPC crea_reclamo_ordine (cliente, service role) ───────────────────
create or replace function public.crea_reclamo_ordine(
  p_ordine_id        uuid,
  p_cliente_user_id  uuid,
  p_tipo             text default 'ordine_non_arrivato',
  p_messaggio        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- ── 5. RPC aggiorna_stato_reclamo (venditore, service role) ──────────────
create or replace function public.aggiorna_stato_reclamo(
  p_reclamo_id        uuid,
  p_nuovo_stato       text,
  p_merchant_user_id  uuid,
  p_nota              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- ── 6. RLS ───────────────────────────────────────────────────────────────
alter table public.ordine_reclami enable row level security;

-- Cliente: può creare SOLO i propri reclami
drop policy if exists "ordine_reclami insert own" on public.ordine_reclami;
create policy "ordine_reclami insert own"
  on public.ordine_reclami for insert
  with check (cliente_user_id = auth.uid());

-- Cliente: vede SOLO i propri reclami
drop policy if exists "ordine_reclami select own" on public.ordine_reclami;
create policy "ordine_reclami select own"
  on public.ordine_reclami for select
  using (cliente_user_id = auth.uid());

-- Venditore: vede i reclami degli ordini dei propri negozi
drop policy if exists "ordine_reclami merchant select" on public.ordine_reclami;
create policy "ordine_reclami merchant select"
  on public.ordine_reclami for select
  using (
    exists (
      select 1 from public.negozi n
      where n.id = negozio_id and n.deleted_at is null
        and n.owner_user_id = auth.uid()
    )
  );

-- Venditore: aggiorna i reclami dei propri negozi
drop policy if exists "ordine_reclami merchant update" on public.ordine_reclami;
create policy "ordine_reclami merchant update"
  on public.ordine_reclami for update
  using (
    exists (
      select 1 from public.negozi n
      where n.id = negozio_id and n.deleted_at is null
        and n.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.negozi n
      where n.id = negozio_id and n.deleted_at is null
        and n.owner_user_id = auth.uid()
    )
  );

-- Admin: vede e aggiorna tutto
drop policy if exists "ordine_reclami admin select all" on public.ordine_reclami;
create policy "ordine_reclami admin select all"
  on public.ordine_reclami for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

drop policy if exists "ordine_reclami admin update all" on public.ordine_reclami;
create policy "ordine_reclami admin update all"
  on public.ordine_reclami for update
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

-- ── 7. Permessi: le RPC sono usate SOLO dal server (service role) ────────
revoke execute on function public.crea_reclamo_ordine(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.crea_reclamo_ordine(uuid, uuid, text, text) to service_role;

revoke execute on function public.aggiorna_stato_reclamo(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.aggiorna_stato_reclamo(uuid, text, uuid, text) to service_role;

revoke execute on function public.reclamo_to_json(uuid) from public, anon, authenticated;
grant execute on function public.reclamo_to_json(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
