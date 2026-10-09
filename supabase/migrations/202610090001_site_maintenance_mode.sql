-- Modalità manutenzione gestita dall'amministrazione.
-- Lettura pubblica consentita al proxy; le scritture passano solo dal service role
-- dietro l'API protetta da requireApiArea("admin").
create table if not exists public.site_maintenance (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  message text not null default 'Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.site_maintenance (id, enabled, message)
values (
  1,
  false,
  'Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.'
)
on conflict (id) do nothing;

alter table public.site_maintenance enable row level security;

drop policy if exists "site maintenance readable by visitors" on public.site_maintenance;
create policy "site maintenance readable by visitors"
  on public.site_maintenance for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.site_maintenance from anon, authenticated;
grant select on public.site_maintenance to anon, authenticated;
grant all on public.site_maintenance to service_role;
