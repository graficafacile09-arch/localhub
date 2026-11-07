-- Pino — memoria minima di sessione per i follow-up dopo un reload.
--
-- Conserva solo stato canonico (soggetto, attributi, budget), mai il testo
-- della domanda. La chiave è generata dal client e validata in codice.
-- RLS attiva senza policy: accesso solo con service role (backend).

create table if not exists public.pino_sessioni (
  session_id text primary key,
  soggetto text not null,
  attributi text[] not null default '{}',
  max_price numeric,
  aggiornato_at timestamptz not null default now()
);

alter table public.pino_sessioni enable row level security;

create index if not exists pino_sessioni_aggiornato_idx
  on public.pino_sessioni (aggiornato_at desc);

comment on table public.pino_sessioni is
  'Pino: soggetto/attributi/budget dell''ultima ricerca per sessione. Nessun testo della domanda.';
