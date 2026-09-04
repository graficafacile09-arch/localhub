-- =================================================================
-- LocalHub — Fix P1 Sicurezza DB: permessi minimi (FASE 7)
-- =================================================================
-- Corregge tre problemi individuati dagli audit:
--
--   1. scan_log: la policy "scan_log admin select all" usava `using (true)`,
--      quindi chiunque avesse il grant di tabella (anon incluso, per i
--      default di Supabase) poteva leggere TUTTE le scansioni. La policy
--      viene ristretta al ruolo admin (user_roles), coerente con le altre
--      tabelle (segnalazioni, admin_activity_log). Defense-in-depth:
--      REVOKE SELECT da anon.
--
--   2. log_admin_activity (SECURITY DEFINER): funzione INTERNA, invocata
--      solo dal server (service role) via lib/amministratore/activity-log.ts.
--      REVOKE EXECUTE da public/anon/authenticated + GRANT a service_role.
--
--   3. crea_segnalazione (SECURITY DEFINER): funzione INTERNA, invocata
--      solo dal server (service role) via lib/segnalazioni.ts, dietro la
--      route autenticata /api/cliente/segnalazioni che ricava user_id ed
--      email dalla SESSIONE (mai dal client). REVOKE EXECUTE da
--      public/anon/authenticated + GRANT a service_role: nessun client può
--      più fornire user_id/user_email arbitrari (anti-spoof).
--
-- Migration additiva/idempotente. Nessun DROP di dati, nessuna modifica
-- strutturale, nessuna riscrittura di funzione, nessun UPDATE/DELETE.
-- =================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. scan_log — lettura globale SOLO per admin autenticato
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "scan_log admin select all" on public.scan_log;

create policy "scan_log admin select all"
  on public.scan_log for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- Defense-in-depth: anon non deve avere alcuna SELECT sulla tabella.
-- (Il logging avviene come utente autenticato via RLS "scan_log insert own".)
revoke select on table public.scan_log from anon;

-- ─────────────────────────────────────────────────────────────────────
-- 2. log_admin_activity — solo service_role (uso server interno)
-- ─────────────────────────────────────────────────────────────────────
revoke all on function public.log_admin_activity(uuid, text, text, text, uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_admin_activity(uuid, text, text, text, uuid, text, uuid, text, text, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 3. crea_segnalazione — solo service_role (uso server interno)
-- ─────────────────────────────────────────────────────────────────────
revoke all on function public.crea_segnalazione(uuid, text, text, text, text, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.crea_segnalazione(uuid, text, text, text, text, text, uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
