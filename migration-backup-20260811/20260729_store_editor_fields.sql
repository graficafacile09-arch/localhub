begin;

-- Nuovi campi per l'editor completo del negozio
alter table if exists public.negozi
  add column if not exists descrizione_completa text,
  add column if not exists sottocategoria text,
  add column if not exists citta text,
  add column if not exists cap text,
  add column if not exists provincia text,
  add column if not exists coordinate text,
  add column if not exists tiktok text,
  add column if not exists youtube text,
  add column if not exists mostra_telefono boolean not null default true,
  add column if not exists mostra_indirizzo boolean not null default true,
  add column if not exists mostra_orari boolean not null default true,
  add column if not exists accetta_whatsapp boolean not null default true,
  add column if not exists in_evidenza boolean not null default false;

commit;
