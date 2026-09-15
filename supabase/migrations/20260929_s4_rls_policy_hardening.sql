-- ============================================================================
-- InCittà — S4 FASE 2: RLS/POLICY HARDENING
-- ============================================================================
-- Controlled, idempotent security hardening for the remote database.
--
-- Scope:
--   - revoke public execution of internal SECURITY DEFINER functions;
--   - restrict scan_log reads to own rows or authorized admins;
--   - enforce product_media ownership through product -> store -> owner;
--   - remove unrestricted public reads of inactive stores/products;
--   - remove public writes to the AI vision cache;
--   - add explicit authorized-admin policies where direct authenticated access
--     is part of the existing platform model.
--
-- This migration intentionally does not reconcile the remote migration ledger,
-- touch payments/checkout/orders/bookings, or modify application code.
-- ============================================================================

begin;

-- ── 1. Internal SECURITY DEFINER functions: service_role only ───────────────
revoke execute on function public.log_admin_activity(
  uuid, text, text, text, uuid, text, uuid, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.log_admin_activity(
  uuid, text, text, text, uuid, text, uuid, text, text, jsonb
) to service_role;

revoke execute on function public.crea_segnalazione(
  uuid, text, text, text, text, text, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.crea_segnalazione(
  uuid, text, text, text, text, text, uuid, text, uuid
) to service_role;

-- Trigger/event-trigger entry points are not client RPCs. PostgreSQL invokes
-- them through their triggers as the owning database role.
revoke execute on function public.aggiorna_prodotto_da_varianti() from public, anon, authenticated;
grant execute on function public.aggiorna_prodotto_da_varianti() to service_role;

revoke execute on function public.ordini_eventi_trigger_fn() from public, anon, authenticated;
grant execute on function public.ordini_eventi_trigger_fn() to service_role;


-- The activity log is an internal backend-owned table; its public policies are
-- not a client API. Service-role access remains available to the server.
revoke all on table public.admin_activity_log from public, anon, authenticated;
grant all on table public.admin_activity_log to service_role;

-- ── 2. scan_log: own authenticated rows or authorized admin only ───────────
drop policy if exists "scan_log admin select all" on public.scan_log;

create policy "scan_log admin select all"
  on public.scan_log
  for select
  to authenticated
  using (public.is_admin_authorized());

-- The application logs through its authenticated server session and needs
-- authenticated INSERT plus own-row SELECT. Anonymous clients need neither.
revoke select on table public.scan_log from public, anon;

-- ── 3. product_media: ownership through product -> store -> owner ─────────
drop policy if exists "merchant product media write" on public.product_media;

create policy "merchant product media write"
  on public.product_media
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.prodotti p
      join public.negozi n on n.id = p.negozio_id
      where p.id::text = product_media.product_id
        and n.owner_user_id = auth.uid()
        and n.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.prodotti p
      join public.negozi n on n.id = p.negozio_id
      where p.id::text = product_media.product_id
        and n.owner_user_id = auth.uid()
        and n.deleted_at is null
    )
  );

drop policy if exists "product media admin manage" on public.product_media;

create policy "product media admin manage"
  on public.product_media
  for all
  to authenticated
  using (public.is_admin_authorized())
  with check (public.is_admin_authorized());

-- Public media SELECT is retained because the product page uses this table's
-- public gallery. Anonymous/authenticated direct writes are not required: the
-- application performs mutations through the server/service-role path.
revoke insert, update, delete on table public.product_media from public, anon;

-- ── 4. negozi: public reads only for active, non-deleted stores ────────────
drop policy if exists "Enable read access for all users" on public.negozi;

drop policy if exists "negozi admin manage" on public.negozi;

create policy "negozi admin manage"
  on public.negozi
  for all
  to authenticated
  using (public.is_admin_authorized())
  with check (public.is_admin_authorized());

-- Existing policies retained:
--   negozi public read       → attivo=true AND deleted_at IS NULL
--   merchant own store ...   → owner-based merchant access

-- ── 5. prodotti: public reads only for published products ─────────────────
drop policy if exists "Policy prodotti" on public.prodotti;

drop policy if exists "prodotti admin manage" on public.prodotti;

create policy "prodotti admin manage"
  on public.prodotti
  for all
  to authenticated
  using (public.is_admin_authorized())
  with check (public.is_admin_authorized());

-- Ensure public products belong to an active, non-deleted store.
drop policy if exists "public active products read" on public.prodotti;

create policy "public active products read"
  on public.prodotti
  for select
  to public
  using (
    attivo = true
    and exists (
      select 1
      from public.negozi n
      where n.id = prodotti.negozio_id
        and n.attivo = true
        and n.deleted_at is null
    )
  );

-- Replace the legacy membership-based predicates with the concrete ownership
-- chain used by the application. This also works on the remote schema where
-- merchant_memberships is not present.
drop policy if exists "merchant own products read" on public.prodotti;
create policy "merchant own products read"
  on public.prodotti
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.negozi n
      where n.id = prodotti.negozio_id
        and n.owner_user_id = auth.uid()
        and n.deleted_at is null
    )
  );

drop policy if exists "merchant own products insert" on public.prodotti;
create policy "merchant own products insert"
  on public.prodotti
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.negozi n
      where n.id = prodotti.negozio_id
        and n.owner_user_id = auth.uid()
        and n.deleted_at is null
    )
  );

drop policy if exists "merchant own products update" on public.prodotti;
create policy "merchant own products update"
  on public.prodotti
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.negozi n
      where n.id = prodotti.negozio_id
        and n.owner_user_id = auth.uid()
        and n.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.negozi n
      where n.id = prodotti.negozio_id
        and n.owner_user_id = auth.uid()
        and n.deleted_at is null
    )
  );

-- ── 6. product_vision_cache: backend writes only, optional public read ─────
revoke insert, update, delete on table public.product_vision_cache
  from public, anon, authenticated;

-- SELECT remains public for the existing cache lookup contract. The backend
-- uses service_role for INSERT/UPDATE and therefore continues to work.

notify pgrst, 'reload schema';

commit;
