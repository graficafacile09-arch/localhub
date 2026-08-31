-- =================================================================
-- Cestino ORDINI — Soft delete
-- Segue lo stesso pattern di 20260801_trash_cestino.sql (negozi):
-- colonne deleted_at / deleted_by + indice parziale.
-- L'eliminazione di un ordine dall'Area Amministratore è un soft-delete:
-- l'ordine sparisce dalla lista ordinaria ma resta recuperabile dal Cestino.
-- =================================================================
begin;

alter table if exists public.ordini
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- Indice per la query del cestino ordini (ordinati per data eliminazione)
create index if not exists ordini_deleted_at_idx
  on public.ordini (deleted_at)
  where deleted_at is not null;

notify pgrst, 'reload schema';

commit;