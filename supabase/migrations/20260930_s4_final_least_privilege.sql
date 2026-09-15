-- ============================================================================
-- InCittà — S4 FASE 2: FINAL LEAST-PRIVILEGE HARDENING
-- ============================================================================
-- Scope is intentionally limited to the three residual S4 findings:
--   - remove all anonymous table privileges from scan_log;
--   - retain only authenticated SELECT/INSERT on scan_log, required by the
--     existing own-row/admin-read policies and authenticated server logging;
--   - remove the two permissive public write policies from
--     product_vision_cache while preserving public read and service_role.
--
-- This migration does not modify table structure, RLS predicates, service_role
-- privileges, the migration ledger, application code, or unrelated objects.
-- It is safe to run more than once.
-- ============================================================================

begin;

-- scan_log: anonymous clients have no required read or write path.
revoke insert, update, delete, truncate, references, trigger
  on table public.scan_log
  from anon;

-- scan_log: authenticated callers need INSERT for their own log rows and
-- SELECT for their own rows/admin reporting. All other direct table privileges
-- are unnecessary; server-side rate-limit mutations use the existing RPC path
-- and backend/service-role access.
revoke update, delete, truncate, references, trigger
  on table public.scan_log
  from authenticated;

-- product_vision_cache: retain the public read policy only. Writes continue
-- through the existing service_role-backed server-side cache path.
drop policy if exists "vision_cache_public_insert" on public.product_vision_cache;
drop policy if exists "vision_cache_public_update" on public.product_vision_cache;

notify pgrst, 'reload schema';

commit;
