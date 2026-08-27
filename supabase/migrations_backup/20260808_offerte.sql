-- ═══════════════════════════════════════════════════════════════════════
-- Offerte / Promozioni — tabella strutturale
-- Sostituisce l'array JSONB (negozi.data->'offerte') con una gestione
-- relazionale: ricerca, filtro per stato/negozio e toggle attiva.
-- RLS: venditore solo proprie offerte, admin tutte, pubblico solo attive.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Tabella
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.offerte (
  id                uuid primary key default gen_random_uuid(),
  negozio_id        uuid not null references public.negozi (id) on delete cascade,
  titolo            text not null,
  descrizione       text,
  prezzo_originale  numeric,
  prezzo_offerta    numeric,
  immagine_url      text,
  data_inizio       timestamptz,
  data_fine         timestamptz,
  attiva            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists offerte_negozio_id_idx on public.offerte (negozio_id);
create index if not exists offerte_attiva_idx on public.offerte (attiva);

-- ───────────────────────────────────────────────────────────────────────
-- 2. Trigger updated_at
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.set_offerte_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_offerte_updated_at on public.offerte;
create trigger trg_offerte_updated_at
  before update on public.offerte
  for each row execute function public.set_offerte_updated_at();

-- ───────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ───────────────────────────────────────────────────────────────────────
alter table public.offerte enable row level security;

drop policy if exists "offerte public read" on public.offerte;
create policy "offerte public read"
  on public.offerte
  for select
  using (
    attiva = true
    and (data_fine is null or data_fine >= now())
    and (data_inizio is null or data_inizio <= now())
    and exists (
      select 1 from public.negozi n
      where n.id = offerte.negozio_id
        and n.attivo = true
        and n.deleted_at is null
    )
  );

drop policy if exists "offerte owner read" on public.offerte;
create policy "offerte owner read"
  on public.offerte
  for select
  using (
    exists (
      select 1 from public.negozi n
      where n.id = offerte.negozio_id
        and n.owner_user_id = auth.uid()
    )
  );

drop policy if exists "offerte owner write" on public.offerte;
create policy "offerte owner write"
  on public.offerte
  for all
  using (
    exists (
      select 1 from public.negozi n
      where n.id = offerte.negozio_id
        and n.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.negozi n
      where n.id = offerte.negozio_id
        and n.owner_user_id = auth.uid()
    )
  );

drop policy if exists "offerte admin manage" on public.offerte;
create policy "offerte admin manage"
  on public.offerte
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
-- 4. Migrazione dati esistenti: da negozi.data->'offerte' (JSONB) alla
-- tabella. Ogni riga JSON con un titolo diventa un'offerta. L'array JSONB
-- viene MANTENUTO per compatibilità, ma la fonte ufficiale diventa offre.
-- Nessun dato a doppia copiatura: migra SOLO se la tabella è ancora vuota.
-- ───────────────────────────────────────────────────────────────────────
insert into public.offerte (
  negozio_id, titolo, descrizione,
  prezzo_originale, prezzo_offerta, immagine_url,
  data_inizio, data_fine, attiva
)
select
  n.id,
  coalesce(e->>'titolo', 'Offerta'),
  nullif(e->>'descrizione', ''),
  case when e->>'prezzo_originale' ~ '^[0-9]+(\.[0-9]+)?$'
    then (e->>'prezzo_originale')::numeric end,
  case when e->>'prezzo_offerta' ~ '^[0-9]+(\.[0-9]+)?$'
    then (e->>'prezzo_offerta')::numeric end,
  nullif(e->>'immagine_url', ''),
  nullif(e->>'valido_dal', '')::timestamptz,
  nullif(e->>'valido_al', '')::timestamptz,
  case when e->>'attiva' is null then true else (e->>'attiva')::boolean end
from public.negozi n
cross join lateral jsonb_array_elements(coalesce(n.data->'offerte', '[]'::jsonb)) as e
where coalesce(e->>'titolo', '') <> ''
  and not exists (select 1 from public.offerte)
on conflict do nothing;

notify pgrst, 'reload schema';

commit;