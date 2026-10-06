-- Enforce the one-store-per-merchant rule at the database boundary.
-- Existing legacy duplicates are left untouched; new active stores are blocked.

create or replace function public.enforce_one_merchant_store()
returns trigger
language plpgsql
as $$
begin
  if new.owner_user_id is null or new.deleted_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.negozi n
    where n.owner_user_id = new.owner_user_id
      and n.deleted_at is null
      and n.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception using
      errcode = '23505',
      message = 'Un venditore può avere un solo negozio attivo';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_one_merchant_store on public.negozi;

create trigger enforce_one_merchant_store
before insert or update of owner_user_id, deleted_at on public.negozi
for each row
execute function public.enforce_one_merchant_store();
