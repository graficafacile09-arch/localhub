-- Area Corriere Locale: assegnazione, coordinate di consegna e stato operativo.
-- La struttura è separata dai corrieri nazionali: non modifica shipping_carriers/services.

create table if not exists public.corrieri_locali (
  ordine_id uuid primary key references public.ordini(id) on delete cascade,
  corriere_user_id uuid references auth.users(id) on delete set null,
  stato text not null default 'da_assegnare',
  latitudine numeric(9,6),
  longitudine numeric(9,6),
  assegnata_at timestamptz,
  accettata_at timestamptz,
  ritirata_at timestamptz,
  in_consegna_at timestamptz,
  consegnata_at timestamptz,
  problema_at timestamptz,
  problema_nota text,
  note_corriere text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corrieri_locali_stato_check check (stato in ('da_assegnare','assegnata','accettata','ritirata','in_consegna','consegnata','annullata','problema_consegna')),
  constraint corrieri_locali_coordinate_check check (
    (latitudine is null and longitudine is null)
    or (latitudine between -90 and 90 and longitudine between -180 and 180)
  )
);

create index if not exists corrieri_locali_corriere_idx on public.corrieri_locali(corriere_user_id);
create index if not exists corrieri_locali_stato_idx on public.corrieri_locali(stato);

alter table public.corrieri_locali enable row level security;

create or replace function public.corrieri_locali_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists corrieri_locali_updated_at on public.corrieri_locali;
create trigger corrieri_locali_updated_at
before update on public.corrieri_locali
for each row execute function public.corrieri_locali_set_updated_at();
