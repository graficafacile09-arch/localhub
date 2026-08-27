-- =================================================================
-- Media Manager — Libreria centralizzata per negozi
-- =================================================================

-- Tabella media
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  negozio_id uuid not null references public.negozi(id) on delete cascade,
  file_path text not null,
  public_url text not null,
  nome text not null,
  alt_text text default '',
  mime_type text,
  file_size integer,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_media_negozio_id on public.media(negozio_id);
create index if not exists idx_media_mime_type on public.media(mime_type);

-- RLS
alter table public.media enable row level security;

drop policy if exists "media merchant select" on public.media;
create policy "media merchant select"
  on public.media for select
  using (
    exists (
      select 1 from public.negozi
      where negozi.id = media.negozio_id
        and negozi.owner_user_id = auth.uid()
    )
  );

drop policy if exists "media merchant insert" on public.media;
create policy "media merchant insert"
  on public.media for insert
  with check (
    exists (
      select 1 from public.negozi
      where negozi.id = media.negozio_id
        and negozi.owner_user_id = auth.uid()
    )
  );

drop policy if exists "media merchant update" on public.media;
create policy "media merchant update"
  on public.media for update
  using (
    exists (
      select 1 from public.negozi
      where negozi.id = media.negozio_id
        and negozi.owner_user_id = auth.uid()
    )
  );

drop policy if exists "media merchant delete" on public.media;
create policy "media merchant delete"
  on public.media for delete
  using (
    exists (
      select 1 from public.negozi
      where negozi.id = media.negozio_id
        and negozi.owner_user_id = auth.uid()
    )
  );
