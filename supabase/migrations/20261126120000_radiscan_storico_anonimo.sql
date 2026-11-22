-- RadiciScan: identità privata per lo storico delle analisi anonime.
-- Non riutilizza sessione_id: quella colonna è una FK alle sessioni operative.
begin;

alter table public.radiscan_analisi
  add column if not exists sessione_anonima_hash text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'radiscan_analisi_sessione_anonima_hash_formato'
       and conrelid = 'public.radiscan_analisi'::regclass
  ) then
    alter table public.radiscan_analisi
      add constraint radiscan_analisi_sessione_anonima_hash_formato
      check (sessione_anonima_hash is null or sessione_anonima_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'radiscan_analisi_sessione_anonima_coerente'
       and conrelid = 'public.radiscan_analisi'::regclass
  ) then
    alter table public.radiscan_analisi
      add constraint radiscan_analisi_sessione_anonima_coerente
      check (sessione_anonima_hash is null or (modalita = 'anonimo' and utente_id is null));
  end if;
end;
$$;

create index if not exists radiscan_analisi_sessione_anonima_idx
  on public.radiscan_analisi (sessione_anonima_hash, creato_il desc)
  where sessione_anonima_hash is not null;

comment on column public.radiscan_analisi.sessione_anonima_hash is
  'SHA-256 del cookie casuale HttpOnly usato per mostrare lo storico anonimo; il token originale non viene salvato.';

notify pgrst, 'reload schema';
commit;
