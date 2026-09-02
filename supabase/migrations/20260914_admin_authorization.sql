-- ============================================================================
-- SICUREZZA RUOLI ADMIN — 20260914
-- ============================================================================
-- Obiettivo: in PRODUZIONE l'UNICO amministratore è graficafacile09@gmail.com.
--
-- Prima di questa migration il gate admin a livello DATABASE (policy RLS e
-- RPC SECURITY DEFINER) verificava SOLO `user_roles.role = 'admin'`, senza
-- controllare l'email autorizzata: admin.test@localhub.it (ruolo admin in
-- user_roles) risultava admin a livello DB pur non essendolo a livello app.
--
-- Cosa fa:
--   1. Crea la funzione centralizzata public.is_admin_authorized(p_user_id
--      DEFAULT auth.uid()): ruolo 'admin' in user_roles PER quell'utente E
--      email = graficafacile09@gmail.com (l'admin autorizzato, allineato a
--      NEXT_PUBLIC_ADMIN_EMAIL / lib/auth/roles.ts).
--      - Nessun argomento (policy RLS)  → verifica il CHIAMANTE (auth.uid()).
--      - Con argomento (RPC service-role) → verifica l'id passato dalla
--        sessione (le route verificano sempre userId di sessione).
--   2. Ricrea le 20 policy RLS "admin" usando is_admin_authorized().
--      NON tocca le policy customer/merchant/ownership.
--   3. Aggiorna il controllo admin delle 6 RPC SECURITY DEFINER
--      (aggiorna_stato_ordine, aggiorna_stato_reclamo, aggiorna_stato_spedizione,
--      aggiungi_messaggio_reclamo_venditore, pagamenti_prepara_rimborso,
--      payout_calcola) sostituendo il solo `exists(user_roles ... role='admin')`
--      con is_admin_authorized(<param>). Nessun altro cambiamento funzionale.
--   4. PRODUZIONE: rimuove il ruolo 'admin' da admin.test@localhub.it
--      (account NON cancellato; E2E può riassegnarlo nel proprio ambiente —
--      in produzione è comunque inerte perché il gate richiede l'email).
--
-- Idempotente: le policy usano drop-if-exists, la funzione create-or-replace,
-- il delete è un no-op se già rimosso. Tutto in un'unica transazione.
-- ============================================================================

begin;

-- ── 1) FUNZIONE CENTRALIZZATA ──────────────────────────────────────────────
create or replace function public.is_admin_authorized(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    where ur.user_id = p_user_id
      and ur.role = 'admin'
      and lower(u.email) = 'graficafacile09@gmail.com'
  );
$$;

-- Eseguibile da qualunque ruolo per le policy RLS (anon/authenticated
-- ottengono false: senza JWT auth.uid() è null e l'email non matcha).
revoke all on function public.is_admin_authorized(uuid) from public;
grant execute on function public.is_admin_authorized(uuid) to public;

comment on function public.is_admin_authorized(uuid) is
  'True se l''utente indicato (default auth.uid()) ha ruolo admin in user_roles '
  'E email = amministratore autorizzato (graficafacile09@gmail.com). '
  'Fonte unica per il gate admin a livello DB. Mantenere allineato a '
  'NEXT_PUBLIC_ADMIN_EMAIL in lib/auth/roles.ts (stesso default).';

-- ── 4) PRODUZIONE: rimuovi ruolo admin da admin.test (idempotente) ─────────
delete from public.user_roles
where role = 'admin'
  and user_id = (select id from auth.users where email = 'admin.test@localhub.it');

-- ── 2) POLICY RLS: ricrea con is_admin_authorized() ────────────────────────
-- admin_activity_log
drop policy if exists "admin_activity_log admin insert" on public.admin_activity_log;
create policy "admin_activity_log admin insert" on public.admin_activity_log
  for insert to public
  with check (public.is_admin_authorized());

drop policy if exists "admin_activity_log admin select" on public.admin_activity_log;
create policy "admin_activity_log admin select" on public.admin_activity_log
  for select to public
  using (public.is_admin_authorized());

-- eventi
drop policy if exists "eventi admin manage" on public.eventi;
create policy "eventi admin manage" on public.eventi
  for all to public
  using (public.is_admin_authorized())
  with check (public.is_admin_authorized());

-- negozio_metodi_pagamento
drop policy if exists "negozio metodi admin select all" on public.negozio_metodi_pagamento;
create policy "negozio metodi admin select all" on public.negozio_metodi_pagamento
  for select to public
  using (public.is_admin_authorized());

-- negozio_metodi_spedizione
drop policy if exists "negozio metodi spedizione admin select all" on public.negozio_metodi_spedizione;
create policy "negozio metodi spedizione admin select all" on public.negozio_metodi_spedizione
  for select to public
  using (public.is_admin_authorized());

-- negozio_pagamenti
drop policy if exists "negozio pagamenti admin select all" on public.negozio_pagamenti;
create policy "negozio pagamenti admin select all" on public.negozio_pagamenti
  for select to public
  using (public.is_admin_authorized());

-- offerte
drop policy if exists "offerte admin manage" on public.offerte;
create policy "offerte admin manage" on public.offerte
  for all to public
  using (public.is_admin_authorized())
  with check (public.is_admin_authorized());

-- ordine_reclami
drop policy if exists "ordine_reclami admin select all" on public.ordine_reclami;
create policy "ordine_reclami admin select all" on public.ordine_reclami
  for select to public
  using (public.is_admin_authorized());

drop policy if exists "ordine_reclami admin update all" on public.ordine_reclami;
create policy "ordine_reclami admin update all" on public.ordine_reclami
  for update to public
  using (public.is_admin_authorized())
  with check (public.is_admin_authorized());

-- ordini
drop policy if exists "ordini admin select all" on public.ordini;
create policy "ordini admin select all" on public.ordini
  for select to public
  using (public.is_admin_authorized());

-- ordini_eventi
drop policy if exists "ordini eventi admin select all" on public.ordini_eventi;
create policy "ordini eventi admin select all" on public.ordini_eventi
  for select to public
  using (public.is_admin_authorized());

-- ordini_righe (mantiene il vincolo esistente sull'ordine + admin autorizzato)
drop policy if exists "ordini righe admin select all" on public.ordini_righe;
create policy "ordini righe admin select all" on public.ordini_righe
  for select to public
  using (
    (exists (select 1 from public.ordini o where o.id = ordini_righe.ordine_id))
    and (public.is_admin_authorized())
  );

-- pagamenti_eventi
drop policy if exists "pagamenti eventi admin select all" on public.pagamenti_eventi;
create policy "pagamenti eventi admin select all" on public.pagamenti_eventi
  for select to public
  using (public.is_admin_authorized());

-- pagamenti_sessioni
drop policy if exists "pagamenti sessioni admin select all" on public.pagamenti_sessioni;
create policy "pagamenti sessioni admin select all" on public.pagamenti_sessioni
  for select to public
  using (public.is_admin_authorized());

-- payout (originariamente solo ruolo authenticated)
drop policy if exists "payout admin select" on public.payout;
create policy "payout admin select" on public.payout
  for select to authenticated
  using (public.is_admin_authorized());

-- piattaforma_settings
drop policy if exists "piattaforma_settings admin manage" on public.piattaforma_settings;
create policy "piattaforma_settings admin manage" on public.piattaforma_settings
  for all to public
  using (public.is_admin_authorized())
  with check (public.is_admin_authorized());

-- reclamo_comunicazioni
drop policy if exists "reclamo_comunicazioni admin all" on public.reclamo_comunicazioni;
create policy "reclamo_comunicazioni admin all" on public.reclamo_comunicazioni
  for select to public
  using (public.is_admin_authorized());

drop policy if exists "reclamo_comunicazioni admin insert" on public.reclamo_comunicazioni;
create policy "reclamo_comunicazioni admin insert" on public.reclamo_comunicazioni
  for insert to public
  with check (public.is_admin_authorized());

-- segnalazioni
drop policy if exists "segnalazioni admin select all" on public.segnalazioni;
create policy "segnalazioni admin select all" on public.segnalazioni
  for select to public
  using (public.is_admin_authorized());

drop policy if exists "segnalazioni admin update all" on public.segnalazioni;
create policy "segnalazioni admin update all" on public.segnalazioni
  for update to public
  using (public.is_admin_authorized())
  with check (public.is_admin_authorized());

-- ── 3) RPC SECURITY DEFINER: solo il controllo admin viene sostituito ──────
-- Le definizioni vengono rilette dal DB (pg_get_functiondef), il pattern
-- admin `exists (select 1 from public.user_roles ur where ur.user_id =
-- p_<x> and ur.role='admin')` viene sostituito con
-- `public.is_admin_authorized(p_<x>)` e la funzione viene ricreata
-- identica in tutto il resto (firma, corpo, grant service_role preservati
-- da CREATE OR REPLACE).
do $$
declare
  r record;
  def text;
  nuova text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_get_functiondef(p.oid) ilike '%user_roles%'
    order by p.proname
  loop
    select pg_get_functiondef(r.oid) into def;
    nuova := regexp_replace(
      def,
      'exists \(\s*select 1 from public\.user_roles ur\s*where ur\.user_id = (p_[a-z_]+)\s*and\s+ur\.role = ''admin''\s*\)',
      'public.is_admin_authorized(\1)',
      'g'
    );
    if nuova <> def then
      execute nuova;
      raise notice 'RPC aggiornata: %', r.proname;
    else
      raise warning 'RPC SENZA MATCH (verificare manualmente): %', r.proname;
    end if;
  end loop;
end $$;

commit;
