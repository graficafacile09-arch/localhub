begin;

-- =================================================================
-- Migration strutturale: owner_user_id per negozi
-- =================================================================

alter table if exists public.negozi
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

create index if not exists negozi_owner_user_id_idx on public.negozi(owner_user_id);

drop policy if exists "merchant memberships self select" on public.merchant_memberships;
drop trigger if exists merchant_memberships_set_updated_at on public.merchant_memberships;
drop index if exists merchant_memberships_user_id_idx;
drop index if exists merchant_memberships_negozio_id_idx;
drop table if exists public.merchant_memberships;

create or replace function public.is_merchant_for_store(target_store_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.negozi
    where negozi.id = target_store_id::uuid
      and negozi.owner_user_id = auth.uid()
  );
$$;

alter table public.negozi enable row level security;

drop policy if exists "merchant own store select" on public.negozi;
create policy "merchant own store select"
on public.negozi
for select
using (owner_user_id = auth.uid());

drop policy if exists "merchant own store update" on public.negozi;
create policy "merchant own store update"
on public.negozi
for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

do $$
declare
  cnt int;
begin
  select count(*) into cnt from public.negozi where owner_user_id is null;
  if cnt > 0 then
    raise notice 'Attenzione: % negozi senza proprietario. Esegui assign_store_owners.sql.', cnt;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
