-- Tabella indipendente per testare la manutenzione sulle preview Vercel.
-- La tabella site_maintenance rimane riservata alla produzione.
create table if not exists public.site_maintenance_preview (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  message text not null default 'Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.site_maintenance_preview (id, enabled, message)
values (1, false, 'Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.')
on conflict (id) do nothing;

alter table public.site_maintenance_preview enable row level security;

drop policy if exists "site maintenance preview readable by visitors" on public.site_maintenance_preview;
create policy "site maintenance preview readable by visitors"
  on public.site_maintenance_preview for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.site_maintenance_preview from anon, authenticated;
grant select on public.site_maintenance_preview to anon, authenticated;
grant all on public.site_maintenance_preview to service_role;
