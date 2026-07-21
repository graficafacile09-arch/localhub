begin;

create table if not exists public.merchant_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merchant_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  negozio_id text not null,
  role text not null default 'manager' check (role in ('owner', 'manager')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, negozio_id)
);

alter table if exists public.negozi
  add column if not exists slug text,
  add column if not exists owner_user_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.prodotti
  add column if not exists immagine_principale text,
  add column if not exists quantita_disponibile integer,
  add column if not exists attivo boolean not null default true,
  add column if not exists origine_pubblicazione text not null default 'manuale',
  add column if not exists marca text,
  add column if not exists colore text,
  add column if not exists materiale text,
  add column if not exists parole_chiave text[],
  add column if not exists prezzo_suggerito numeric,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.prodotti
set attivo = true
where attivo is null;

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  storage_bucket text,
  storage_path text,
  public_url text,
  role text not null default 'primary' check (role in ('primary', 'gallery', 'detail')),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists merchant_memberships_user_id_idx on public.merchant_memberships(user_id);
create index if not exists merchant_memberships_negozio_id_idx on public.merchant_memberships(negozio_id);
create index if not exists prodotti_negozio_id_idx on public.prodotti(negozio_id);
create index if not exists product_media_product_id_idx on public.product_media(product_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists merchant_profiles_set_updated_at on public.merchant_profiles;
create trigger merchant_profiles_set_updated_at
before update on public.merchant_profiles
for each row execute function public.set_updated_at();

drop trigger if exists merchant_memberships_set_updated_at on public.merchant_memberships;
create trigger merchant_memberships_set_updated_at
before update on public.merchant_memberships
for each row execute function public.set_updated_at();

drop trigger if exists negozi_set_updated_at on public.negozi;
create trigger negozi_set_updated_at
before update on public.negozi
for each row execute function public.set_updated_at();

drop trigger if exists prodotti_set_updated_at on public.prodotti;
create trigger prodotti_set_updated_at
before update on public.prodotti
for each row execute function public.set_updated_at();

create or replace function public.is_merchant_for_store(target_store_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.merchant_memberships memberships
    where memberships.user_id = auth.uid()
      and memberships.negozio_id = target_store_id
      and memberships.is_active = true
  );
$$;

alter table public.merchant_profiles enable row level security;
alter table public.merchant_memberships enable row level security;
alter table public.prodotti enable row level security;
alter table public.product_media enable row level security;

create policy if not exists "merchant profiles self select"
on public.merchant_profiles
for select
using (auth.uid() = id);

create policy if not exists "merchant profiles self update"
on public.merchant_profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy if not exists "merchant memberships self select"
on public.merchant_memberships
for select
using (auth.uid() = user_id);

create policy if not exists "public active products read"
on public.prodotti
for select
using (attivo = true);

create policy if not exists "merchant own products read"
on public.prodotti
for select
using (public.is_merchant_for_store(negozio_id::text));

create policy if not exists "merchant own products insert"
on public.prodotti
for insert
with check (public.is_merchant_for_store(negozio_id::text));

create policy if not exists "merchant own products update"
on public.prodotti
for update
using (public.is_merchant_for_store(negozio_id::text))
with check (public.is_merchant_for_store(negozio_id::text));

create policy if not exists "public product media read"
on public.product_media
for select
using (true);

create policy if not exists "merchant product media write"
on public.product_media
for all
using (true)
with check (true);

commit;
