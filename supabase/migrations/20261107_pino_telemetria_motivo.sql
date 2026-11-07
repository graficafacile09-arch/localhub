-- Pino — motivo di uscita nella telemetria dei turni.
--
-- `percorso` diceva solo "assistente"; `motivo` dice QUALE ramo ha chiuso il
-- turno (faq, servizio_non_coperto, conteggio_attivita, …). È il campo che
-- distingue una risposta deterministica da una ricerca andata a vuoto.
-- Idempotente: riapplicabile senza modificare i dati esistenti.

alter table public.pino_turni
  add column if not exists motivo text;

comment on column public.pino_turni.motivo is
  'Ramo deterministico che ha chiuso il turno (es. faq, info_attivita, servizio_non_coperto).';

create index if not exists pino_turni_motivo_idx
  on public.pino_turni (motivo);
