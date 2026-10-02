-- APPROVAZIONE AMMINISTRATIVA ACCOUNT — 20261002
-- Layer additive: NON modifica /api/auth/register.
-- I nuovi auth.users vengono marcati pending dal trigger; gli account
-- esistenti vengono marcati approved per non interrompere gli utenti attuali.

create table if not exists public.account_approvazioni (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stato text not null default 'pending'
    check (stato in ('pending','approved','rejected')),
  richiesto_il timestamptz not null default now(),
  deciso_il timestamptz,
  deciso_da uuid references auth.users(id) on delete set null,
  motivo text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_account_approvazioni_stato
  on public.account_approvazioni(stato);

alter table public.account_approvazioni enable row level security;

drop policy if exists "account approvazioni self select" on public.account_approvazioni;
create policy "account approvazioni self select"
  on public.account_approvazioni
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.account_approvazione_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists account_approvazioni_set_updated_at on public.account_approvazioni;
create trigger account_approvazioni_set_updated_at
before update on public.account_approvazioni
for each row execute function public.account_approvazione_set_updated_at();

create or replace function public.inizializza_approvazione_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_approvazioni (user_id, stato)
  values (new.id, 'pending')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.inizializza_approvazione_account() from public, anon, authenticated;
grant execute on function public.inizializza_approvazione_account() to supabase_auth_admin;

drop trigger if exists on_auth_user_created_account_approval on auth.users;
create trigger on_auth_user_created_account_approval
after insert on auth.users
for each row execute function public.inizializza_approvazione_account();

insert into public.account_approvazioni (user_id, stato, richiesto_il, deciso_il)
select u.id, 'approved', coalesce(u.created_at, now()), coalesce(u.created_at, now())
from auth.users u
on conflict (user_id) do nothing;
