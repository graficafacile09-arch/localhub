-- RadiciScan — tre denominazioni DOP nel registro curato
--
-- Nuova migration, separata da 20261118_radiscan_core.sql.
-- Inserisce le righe tipo_atto = 'denominazione' necessarie al livello
-- VERIFICATO. Non modifica schema, policy RLS, funzioni o altre tabelle.
--
-- Fonti verificate:
-- - eAmbrosia: schede EUGI00000012985, EUGI00000013864, EUGI00000014301
-- - OJ L 163, 02.07.1996; OJ L 162, 22.06.2011; OJ L 341, 27.11.2014
-- - ARSAC: areali di produzione delle tre denominazioni
--
-- L'id viene lasciato al default gen_random_uuid(): nessun UUID inventato.
-- La migration è idempotente: su slug già presente aggiorna la riga esistente
-- senza cambiarne l'id, dopo aver verificato che sia una denominazione.

begin;

-- Sicurezza: non sovrascrivere un eventuale slug già usato da un registro.
do $$
begin
  if exists (
    select 1
      from public.radiscan_fonti
     where slug in (
       'caciocavallo-silano-dop',
       'fichi-di-cosenza-dop',
       'pecorino-crotonese-dop'
     )
       and tipo_atto <> 'denominazione'
  ) then
    raise exception
      'Uno degli slug RadiciScan è già usato da una fonte non-denominazione';
  end if;
end
$$;

insert into public.radiscan_fonti as f
  (slug, denominazione, tipo_atto, schema_qualita, territorio, ente,
   url_ufficiale, riferimento_normativo, consultata_il, attiva, note)
values
  (
    'caciocavallo-silano-dop',
    'Caciocavallo Silano',
    'denominazione',
    'DOP',
    'Calabria, Basilicata, Campania, Molise e Puglia, nei territori indicati dal disciplinare',
    'Commissione europea — DG Agricoltura e sviluppo rurale (eAmbrosia)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000012985',
    'Official Journal L 163, 02.07.1996',
    date '2026-11-19',
    true,
    'Scheda eAmbrosia EUGI00000012985; areale del disciplinare; verifica del 2026-11-19.'
  ),
  (
    'fichi-di-cosenza-dop',
    'Fichi di Cosenza',
    'denominazione',
    'DOP',
    'Valle del Crati e versante destro del Savuto, provincia di Cosenza, fino a 800 m s.l.m.',
    'Commissione europea — DG Agricoltura e sviluppo rurale (eAmbrosia)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013864',
    'Official Journal L 162, 22.06.2011',
    date '2026-11-19',
    true,
    'Scheda eAmbrosia EUGI00000013864; areale del disciplinare; verifica del 2026-11-19.'
  ),
  (
    'pecorino-crotonese-dop',
    'Pecorino Crotonese',
    'denominazione',
    'DOP',
    'Calabria, 52 comuni delle province di Crotone (Cutro, KR), Catanzaro e Cosenza',
    'Commissione europea — DG Agricoltura e sviluppo rurale (eAmbrosia)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000014301',
    'Official Journal L 341, 27.11.2014',
    date '2026-11-19',
    true,
    'Scheda eAmbrosia EUGI00000014301; areale del disciplinare; verifica del 2026-11-19.'
  )
on conflict (slug) do update
set
  denominazione = excluded.denominazione,
  tipo_atto = excluded.tipo_atto,
  schema_qualita = excluded.schema_qualita,
  territorio = excluded.territorio,
  ente = excluded.ente,
  url_ufficiale = excluded.url_ufficiale,
  riferimento_normativo = excluded.riferimento_normativo,
  consultata_il = excluded.consultata_il,
  attiva = excluded.attiva,
  note = excluded.note,
  aggiornato_il = now()
where f.tipo_atto = 'denominazione';

notify pgrst, 'reload schema';

commit;
