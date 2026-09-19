create table if not exists public.venditori_termini_accettazioni (
  id uuid primary key default gen_random_uuid(),
  negozio_id uuid not null references public.negozi(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  versione text not null,
  accettato_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (negozio_id, user_id, versione)
);
alter table public.venditori_termini_accettazioni enable row level security;
create index if not exists idx_venditori_termini_accettazioni_negozio on public.venditori_termini_accettazioni(negozio_id);
create index if not exists idx_venditori_termini_accettazioni_user on public.venditori_termini_accettazioni(user_id);
