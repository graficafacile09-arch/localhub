-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — COMUNICAZIONI RECLAMO (dialogo venditore ↔ cliente)
--
-- Obiettivo: il venditore può contattare il cliente su un reclamo aperto
-- e il cliente può rispondere. Il dialogo è un vero flusso operativo:
--
--   RECLAMO APERTO
--     → PRENDI IN CARICO
--     → CONTATTA CLIENTE (messaggio) → risposta del cliente → ...
--     → PROBLEMA RISOLTO
--     → CHIUDI RECLAMO
--
-- SICUREZZA:
--   - il CLIENTE può scrivere SOLO su reclami PROPRI (la RPC verifica
--     ordine_reclami.cliente_user_id = utente della sessione, mai un id
--     dal browser);
--   - il VENDITORE può scrivere SOLO su reclami di ordini dei PROPRI
--     negozi (la RPC verifica negozi.owner_user_id, o admin autorizzato);
--   - i messaggi sono IMMUTABILI (nessun UPDATE): chi scrive, scrive.
--     Nessuna policy UPDATE/DELETE.
--   - le RPC sono eseguibili SOLO via service role (revoke da anon/…).
--
-- Best-effort: email/ntfy di notifica NON fanno mai fallire il messaggio.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Tabella comunicazioni ────────────────────────────────────────────
create table if not exists public.reclamo_comunicazioni (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  reclamo_id    uuid not null references public.ordine_reclami (id) on delete cascade,
  mittente      text not null check (mittente in ('cliente', 'venditore')),
  mittente_nome text not null default '',
  corpo         text not null,
  letto_at      timestamptz
);

create index if not exists reclamo_comunicazioni_reclamo_idx
  on public.reclamo_comunicazioni (reclamo_id, created_at asc);

-- ── 2. Helper: messaggio → jsonb (risposta alle RPC) ────────────────────
create or replace function public.reclamo_messaggio_to_json(p_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
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

-- ── 3. RPC aggiungi_messaggio_reclamo_cliente (cliente, service role) ───
create or replace function public.aggiungi_messaggio_reclamo_cliente(
  p_reclamo_id       uuid,
  p_cliente_user_id  uuid,
  p_corpo            text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reclamo  record;
  v_corpo    text;
  v_messaggio record;
begin
  -- ── Guardie ──────────────────────────────────────────────────────────
  if p_cliente_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Operazione consentita solo a clienti autenticati.');
  end if;
  v_corpo := nullif(trim(coalesce(p_corpo, '')), '');
  if v_corpo is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il messaggio non può essere vuoto.');
  end if;
  if length(v_corpo) > 2000 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Messaggio troppo lungo (max 2000 caratteri).');
  end if;

  -- ── Reclamo + ownership (mai fidarsi di un id dal browser) ───────────
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
    return jsonb_build_object('ok', false, 'codice', 'RECLAMO_CHIUSO', 'messaggio', 'Il reclamo è chiuso: non è possibile inviare nuovi messaggi.');
  end if;

  -- ── Inserimento (mittente_nome = snapshot cliente del reclamo) ───────
  insert into public.reclamo_comunicazioni (reclamo_id, mittente, mittente_nome, corpo)
  values (v_reclamo.id, 'cliente', coalesce(nullif(trim(v_reclamo.cliente_nome), ''), 'Cliente'), v_corpo)
  returning * into v_messaggio;

  return jsonb_build_object('ok', true, 'messaggio', public.reclamo_messaggio_to_json(v_messaggio.id));

exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il messaggio.');
end;
$$;

-- ── 4. RPC aggiungi_messaggio_reclamo_venditore (venditore, service role) ─
create or replace function public.aggiungi_messaggio_reclamo_venditore(
  p_reclamo_id        uuid,
  p_merchant_user_id  uuid,
  p_corpo             text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reclamo   record;
  v_ownership boolean;
  v_corpo     text;
  v_nome      text;
  v_messaggio record;
begin
  -- ── Guardie ──────────────────────────────────────────────────────────
  if p_merchant_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Operazione consentita solo a venditori autenticati.');
  end if;
  v_corpo := nullif(trim(coalesce(p_corpo, '')), '');
  if v_corpo is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il messaggio non può essere vuoto.');
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

  -- ── Ownership ATOMICAMENTE: negozio di proprietà del venditore ───────
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
    return jsonb_build_object('ok', false, 'codice', 'RECLAMO_CHIUSO', 'messaggio', 'Il reclamo è chiuso: non è possibile inviare nuovi messaggi.');
  end if;

  -- Nome mittente dal profilo auth (fallback: prefisso email).
  select coalesce(
    nullif(trim(coalesce(a.raw_user_meta_data ->> 'full_name', '')), ''),
    split_part(coalesce(a.email, ''), '@', 1),
    'Venditore'
  ) into v_nome
  from auth.users a
  where a.id = p_merchant_user_id;

  -- ── Inserimento ──────────────────────────────────────────────────────
  insert into public.reclamo_comunicazioni (reclamo_id, mittente, mittente_nome, corpo)
  values (v_reclamo.id, 'venditore', v_nome, v_corpo)
  returning * into v_messaggio;

  return jsonb_build_object('ok', true, 'messaggio', public.reclamo_messaggio_to_json(v_messaggio.id));

exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare il messaggio.');
end;
$$;

-- ── 5. RLS ───────────────────────────────────────────────────────────────
alter table public.reclamo_comunicazioni enable row level security;

-- Cliente: inserisce SOLO su reclami propri e SOLO come mittente 'cliente'
-- (mai forgiare messaggi del venditore).
drop policy if exists "reclamo_comunicazioni client insert own" on public.reclamo_comunicazioni;
create policy "reclamo_comunicazioni client insert own"
  on public.reclamo_comunicazioni for insert
  with check (
    mittente = 'cliente'
    and exists (
      select 1 from public.ordine_reclami r
      where r.id = reclamo_id and r.cliente_user_id = auth.uid()
    )
  );

-- Cliente: legge SOLO le comunicazioni dei propri reclami
drop policy if exists "reclamo_comunicazioni client select own" on public.reclamo_comunicazioni;
create policy "reclamo_comunicazioni client select own"
  on public.reclamo_comunicazioni for select
  using (
    exists (
      select 1 from public.ordine_reclami r
      where r.id = reclamo_id and r.cliente_user_id = auth.uid()
    )
  );

-- Venditore: inserisce su reclami dei propri negozi e SOLO come mittente
-- 'venditore' (mai forgiare messaggi del cliente).
drop policy if exists "reclamo_comunicazioni merchant insert" on public.reclamo_comunicazioni;
create policy "reclamo_comunicazioni merchant insert"
  on public.reclamo_comunicazioni for insert
  with check (
    mittente = 'venditore'
    and exists (
      select 1
      from public.ordine_reclami r
      join public.negozi n on n.id = r.negozio_id
      where r.id = reclamo_id and n.deleted_at is null
        and n.owner_user_id = auth.uid()
    )
  );

-- Venditore: legge le comunicazioni dei reclami dei propri negozi
drop policy if exists "reclamo_comunicazioni merchant select" on public.reclamo_comunicazioni;
create policy "reclamo_comunicazioni merchant select"
  on public.reclamo_comunicazioni for select
  using (
    exists (
      select 1
      from public.ordine_reclami r
      join public.negozi n on n.id = r.negozio_id
      where r.id = reclamo_id and n.deleted_at is null
        and n.owner_user_id = auth.uid()
    )
  );

-- Admin: legge e inserisce tutto
drop policy if exists "reclamo_comunicazioni admin all" on public.reclamo_comunicazioni;
create policy "reclamo_comunicazioni admin all"
  on public.reclamo_comunicazioni for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

drop policy if exists "reclamo_comunicazioni admin insert" on public.reclamo_comunicazioni;
create policy "reclamo_comunicazioni admin insert"
  on public.reclamo_comunicazioni for insert
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

-- ── 6. Permessi: le RPC sono usate SOLO dal server (service role) ────────
revoke execute on function public.aggiungi_messaggio_reclamo_cliente(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.aggiungi_messaggio_reclamo_cliente(uuid, uuid, text) to service_role;

revoke execute on function public.aggiungi_messaggio_reclamo_venditore(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.aggiungi_messaggio_reclamo_venditore(uuid, uuid, text) to service_role;

revoke execute on function public.reclamo_messaggio_to_json(uuid) from public, anon, authenticated;
grant execute on function public.reclamo_messaggio_to_json(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
