-- Pino — apprendimento dalle correzioni e telemetria dei turni.
--
-- Due tabelle, nessuna policy: sono lette e scritte solo dal service role
-- (l'endpoint /api/assistente lato server). RLS attiva senza policy impedisce
-- l'accesso anonimo, senza toccare il resto del catalogo.
--
-- Se le tabelle non esistono, Pino continua a rispondere: lettura e scrittura
-- sono in try/catch e non bloccano il turno.

create table if not exists public.pino_correzioni (
  chiave text primary key,
  domanda text not null,
  correzione text not null,
  tipo text not null default 'altro',
  frequenza integer not null default 1,
  created_at timestamptz not null default now(),
  ultima_utilizzazione timestamptz not null default now()
);

comment on table public.pino_correzioni is
  'Correzioni esplicite dell''utente, riapplicate quando la stessa domanda torna.';
comment on column public.pino_correzioni.chiave is
  'Domanda normalizzata che ha prodotto la risposta sbagliata.';

alter table public.pino_correzioni enable row level security;

create table if not exists public.pino_turni (
  id bigserial primary key,
  domanda text not null,
  intent text,
  esito text not null,
  negozi integer not null default 0,
  prodotti integer not null default 0,
  ms integer not null default 0,
  percorso text,
  lingua text,
  created_at timestamptz not null default now()
);

comment on table public.pino_turni is
  'Una riga per risposta di Pino: esito, quantità, latenza e percorso.';

alter table public.pino_turni enable row level security;

create index if not exists pino_turni_created_at_idx
  on public.pino_turni (created_at desc);
create index if not exists pino_turni_esito_idx
  on public.pino_turni (esito);
