-- ═══════════════════════════════════════════════════════════════════════
-- Eventi — tabella strutturale
-- Sostituisce l'array JSONB (negozi.data->'eventi') con una gestione
-- relazionale: ricerca, filtro per stato/negozio e toggle attivo.
-- RLS: venditore solo propri eventi, admin tutti, pubblico solo attivi.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Tabella
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.eventi (
  id                uuid primary key default gen_random_uuid(),
  negozio_id        uuid not null references public.negozi (id) on delete cascade,
  titolo            text not null,
  descrizione       text,
  immagine_url      text,
  luogo             text,
  data_inizio       timestamptz,
  data_fine         timestamptz,
  attivo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists eventi_negozio_id_idx on public.eventi (negozio_id);
create index if not exists eventi_attivo_idx on public.eventi (attivo);

-- ───────────────────────────────────────────────────────────────────────
-- 2. Trigger updated_at
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.set_eventi_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_eventi_updated_at on public.eventi;
create trigger trg_eventi_updated_at
  before update on public.eventi
  for each row execute function public.set_eventi_updated_at();

-- ───────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ───────────────────────────────────────────────────────────────────────
alter table public.eventi enable row level security;

drop policy if exists "eventi public read" on public.eventi;
create policy "eventi public read"
  on public.eventi
  for select
  using (
    attivo = true
    and (data_fine is null or data_fine >= now())
    and (data_inizio is null or data_inizio <= now())
    and exists (
      select 1 from public.negozi n
      where n.id = eventi.negozio_id
        and n.attivo = true
        and n.deleted_at is null
    )
  );

drop policy if exists "eventi owner read" on public.eventi;
create policy "eventi owner read"
  on public.eventi
  for select
  using (
    exists (
      select 1 from public.negozi n
      where n.id = eventi.negozio_id
        and n.owner_user_id = auth.uid()
    )
  );

drop policy if exists "eventi owner write" on public.eventi;
create policy "eventi owner write"
  on public.eventi
  for all
  using (
    exists (
      select 1 from public.negozi n
      where n.id = eventi.negozio_id
        and n.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.negozi n
      where n.id = eventi.negozio_id
        and n.owner_user_id = auth.uid()
    )
  );

drop policy if exists "eventi admin manage" on public.eventi;
create policy "eventi admin manage"
  on public.eventi
  for all
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- ───────────────────────────────────────────────────────────────────────
-- 4. Migrazione dati esistenti: da negozi.data->'eventi' (JSONB) alla
-- tabella. Ogni riga JSON con un titolo diventa un evento. Data e ora
-- separate del JSON vengono unite in data_inizio. L'array JSONB viene
-- MANTENUTO per compatibilità, ma la fonte ufficiale diventa la tabella.
-- Nessun dato a doppia copiatura: migra SOLO se la tabella è ancora vuota.
-- ───────────────────────────────────────────────────────────────────────
insert into public.eventi (
  negozio_id, titolo, descrizione,
  immagine_url, luogo,
  data_inizio, data_fine,
  attivo
)
select
  n.id,
  coalesce(e->>'titolo', 'Evento'),
  nullif(e->>'descrizione', ''),
  nullif(e->>'immagine_url', ''),
  nullif(e->>'luogo', ''),
  case
    when nullif(e->>'data', '') is not null and nullif(e->>'ora', '') is not null
      then (concat(e->>'data', ' ', e->>'ora'))::timestamptz
    when nullif(e->>'data', '') is not null
      then (e->>'data')::timestamptz
    else null
  end,
  nullif(e->>'data_fine', '')::timestamptz,
  case when e->>'attivo' is null then true else (e->>'attivo')::boolean end
from public.negozi n
cross join lateral jsonb_array_elements(coalesce(n.data->'eventi', '[]'::jsonb)) as e
where coalesce(e->>'titolo', '') <> ''
  and not exists (select 1 from public.eventi)
on conflict do nothing;

notify pgrst, 'reload schema';

commit;