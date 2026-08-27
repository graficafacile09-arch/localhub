begin;

alter table if exists public.negozi
  add column if not exists servizi text[] not null default '{}',
  add column if not exists colori jsonb not null default '{"primary": "#2563eb", "secondary": "#f8fafc", "accent": "#f59e0b"}'::jsonb,
  add column if not exists parole_chiave text[] not null default '{}';

notify pgrst, 'reload schema';

commit;
