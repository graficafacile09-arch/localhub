-- ═══════════════════════════════════════════════════════════════════════
-- Impostazioni Piattaforma — config pubblica di InCittà
-- Archivio chiave/valore per le informazioni pubbliche del sito.
-- SOLO configurazione pubblica: nessun secret, token o chiave API.
-- Lettura pubblica GARANTITA solo delle righe con `pubblico = true`;
-- scrittura SOLO tramite admin (service role / role admin).
-- ═══════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.piattaforma_settings (
  id          uuid primary key default gen_random_uuid(),
  chiave      text not null unique,
  valore      text,
  tipo        text not null default 'text',
  descrizione text,
  pubblico    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.piattaforma_settings enable row level security;

-- Lettura pubblica SOLO delle impostazioni marcate come pubbliche.
drop policy if exists "piattaforma_settings public read" on public.piattaforma_settings;
create policy "piattaforma_settings public read"
  on public.piattaforma_settings
  for select
  using (pubblico = true);

-- Scrittura riservata agli amministratori (echo del pannello logico: anche
-- il client admin utilizza il service role, che bypassa comunque la RLS).
drop policy if exists "piattaforma_settings admin manage" on public.piattaforma_settings;
create policy "piattaforma_settings admin manage"
  on public.piattaforma_settings
  for all
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

-- Trigger: aggiorna updated_at a ogni modifica.
create or replace function public.set_piattaforma_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_piattaforma_settings_updated_at on public.piattaforma_settings;
create trigger trg_piattaforma_settings_updated_at
  before update on public.piattaforma_settings
  for each row execute function public.set_piattaforma_settings_updated_at();

-- ───────────────────────────────────────────────────────────────────────
-- Valori iniziali = valori attualmente hardcoded nel codice, così il sito
-- non cambia aspetto dopo il passaggio. Nessun valore inventato: ciò che
-- non esiste rimane vuoto.
-- ───────────────────────────────────────────────────────────────────────
insert into public.piattaforma_settings (chiave, valore, tipo, descrizione, pubblico)
select * from (values
  ('site_name',             'InCittà',                          'text', 'Nome della piattaforma',        true),
  ('site_tagline',          'Amazon della tua città',           'text', 'Sottotitolo della piattaforma', true),
  ('city_name',             'Castrovillari',                    'text', 'Città/territorio di riferimento', true),
  ('public_email',          '',                                 'text', 'Email pubblica di contatto',    true),
  ('public_phone',          '',                                 'text', 'Telefono pubblico di contatto', true),
  ('footer_text',           '© 2026 InCittà · Castrovillari',   'text', 'Copyright del sito',            true),
  ('site_logo_url',         '',                                 'text', 'Se vuoto usa /logo.png',        false)
) as seed(chiave, valore, tipo, descrizione, pubblico)
on conflict (chiave) do nothing;

notify pgrst, 'reload schema';

commit;