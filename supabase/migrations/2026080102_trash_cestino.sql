-- =================================================================
-- Cestino — Soft delete negozi
-- Garantisce (in modo idempotente) la presenza delle colonne
-- deleted_at / deleted_by già introdotte dalla CMS Foundation.
-- =================================================================
begin;

alter table if exists public.negozi
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- Indice per la query del cestino (negozi eliminati)
create index if not exists negozi_deleted_at_idx
  on public.negozi (deleted_at)
  where deleted_at is not null;

notify pgrst, 'reload schema';

commit;
