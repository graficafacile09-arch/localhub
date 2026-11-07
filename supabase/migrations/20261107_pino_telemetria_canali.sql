-- Pino — telemetria dei turni: canale, streaming, release e tempo contesto.
--
-- La tabella registrava solo il turno non-streaming: la chat usa NDJSON e
-- usciva dalla route prima del blocco di scrittura. Queste colonne rendono
-- distinguibili UI, API e test, e permettono di misurare il costo del contesto
-- dinamico separatamente dal resto del turno.

alter table if exists public.pino_turni
  add column if not exists origine text,
  add column if not exists streaming boolean not null default false,
  add column if not exists release text,
  add column if not exists ms_contesto integer;

create index if not exists pino_turni_origine_idx
  on public.pino_turni (origine, created_at desc);
