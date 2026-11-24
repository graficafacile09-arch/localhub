-- NON APPLICARE: migrazione preparata per la Fase A di Pino (conoscenza testuale).
-- Crea l'archivio unico FTS italiano dei contenuti informativi del sito.
-- Non contiene prodotti, negozi, prezzi, offerte o eventi.
-- Rimozione solo logica (stato = 'rimosso'). Nessun embedding, nessun pgvector.

begin;

create table if not exists public.pino_conoscenza (
  id           bigint generated always as identity primary key,
  chiave       text not null,
  sezione      text not null check (sezione in ('territorio','filiera','stagionalita','faq','attrazione','pagina','contenuto')),
  fonte_url    text not null,
  titolo       text not null,
  contenuto    text not null,
  hash         text not null,
  stato        text not null default 'attivo' check (stato in ('attivo','rimosso')),
  visto_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  fts          tsvector generated always as (
    to_tsvector('italian', coalesce(titolo, '') || ' ' || coalesce(contenuto, ''))
  ) stored,
  constraint pino_conoscenza_chiave_key unique (chiave)
);

create index if not exists pino_conoscenza_fts_idx
  on public.pino_conoscenza using gin (fts);

create index if not exists pino_conoscenza_stato_idx
  on public.pino_conoscenza (stato);

-- Accesso solo lato server (service role); nessuna lettura pubblica diretta.
alter table public.pino_conoscenza enable row level security;

commit;
