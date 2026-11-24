-- ═══════════════════════════════════════════════════════════════════════
-- RADICISCAN — FASE 2V: TRE FONTI `denominazione` LUCANE (versione 2)
-- ═══════════════════════════════════════════════════════════════════════
-- STATO: PROPOSTA. NON ESEGUIRE.
--   * File nuovo e separato: la versione 2T resta intatta.
--   * Da applicare solo DOPO la FASE 2S (10 denominazioni calabresi) e dopo
--     il file fonti-denominazioni-fase2v-correzioni.sql.
--
-- CONTEGGI ATTESI DOPO L'APPLICAZIONE COMPLETA
--   * 9 fonti `registro` già presenti.
--   * 10 denominazioni calabresi (FASE 2S).
--   * 3 denominazioni lucane (questo file).
--   * 13 denominazioni complessive.
--   * 22 fonti complessive (9 + 10 + 3).
--
-- DIFFERENZA RISPETTO ALLA VERSIONE 2T
--   * Nessun `on conflict (slug) do nothing`.
--   * Prima di inserire, un blocco PL/pgSQL verifica ogni slug:
--       - slug assente                      → inserisce;
--       - slug presente e dati identici     → non fa nulla e lo segnala;
--       - slug presente e dati discordanti  → ECCEZIONE, transazione annullata;
--       - stessa denominazione con altro slug → ECCEZIONE (nessun duplicato).
--   * La nota dei Fagioli registra l'organismo di controllo documentato,
--     dichiarando che il numero del decreto non è stato reperito.
--
-- VERIFICHE DEL 18/11/2026
--   * Identificativi e file number letti dall'API eAmbrosia:
--       Peperoni di Senise      EUGI00000013409 / PGI-IT-1532
--       Fagioli Bianchi         EUGI00000013841 / PDO-IT-0683
--       Melanzana Rossa         EUGI00000013907 / PDO-IT-0662
--   * Nome legale vigente dei Peperoni: plurale, per Reg. (UE) 2020/1718.
--     L'API eAmbrosia espone ancora il singolare: è un ritardo del registro.
--     L'etichetta prescrive il singolare ("Peperone di Senise" I.G.P.):
--     va gestito come alias, NON come seconda fonte (vedi nota nella riga).
--   * Zone di produzione:
--       Peperoni: 12 comuni (6 Potenza, 6 Matera); Rotonda NON è compresa.
--       Fagioli e Melanzana: 4 comuni della Valle del Mercure; Senise NON è
--       compresa.
--   * `territorio` elenca regione, province e comuni; nessuna macro-area
--     generica usata da sola.
--   * "Lucania" è alias di Basilicata, non un comune.
-- ═══════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  v record;
  r record;
  v_righe integer;
begin
  for v in
    select *
      from (values
        (
          'peperoni-di-senise-igp',
          'Peperoni di Senise',
          'denominazione',
          'IGP',
          'Basilicata (Lucania) — province di Potenza e Matera: Senise, Chiaromonte, Francavilla in Sinni, Noepoli, Sant''Arcangelo, Roccanova (PZ); Valsinni, Colobraro, Tursi, San Giorgio Lucano, Montalbano Jonico, Craco (MT)',
          'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
          'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013409',
          'Reg. (CE) n. 1263/96 (GUCE L 163 del 2.7.1996); modifica non minore Reg. (UE) 2020/1718 (GUUE L 386 del 18.11.2020)',
          date '2026-11-18',
          true,
          'Scheda eAmbrosia EUGI00000013409 (PGI-IT-1532) consultata il 18/11/2026. Il Reg. 2020/1718 ha cambiato il nome da "Peperone di Senise" a "Peperoni di Senise"; il registro eAmbrosia mostra ancora il singolare. L''etichetta prescrive "Peperone di Senise" I.G.P.: forma da gestire come alias, non come seconda fonte. 12 comuni; Rotonda NON è compresa.'
        ),
        (
          'fagioli-bianchi-di-rotonda-dop',
          'Fagioli Bianchi di Rotonda',
          'denominazione',
          'DOP',
          'Basilicata (Lucania) — provincia di Potenza: Rotonda, Viggianello, Castelluccio Inferiore, Castelluccio Superiore',
          'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
          'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013841',
          'Reg. (UE) n. 240/2011 (GUUE L 66 del 12.3.2011); modifica ordinaria D.M. 14.6.2024 (GU n. 146 del 24.6.2024), registrata il 24.1.2025 (GUUE C/2025/505)',
          date '2026-11-18',
          true,
          'Scheda eAmbrosia EUGI00000013841 (PDO-IT-0683) consultata il 18/11/2026. Comprende solo i quattro comuni della Valle del Mercure; Senise NON è compresa. Nome ufficiale plurale. Organismo di controllo: RINA AGRIFOOD S.p.A., autorizzato dal MASAF il 25/07/2025 in sostituzione della CCIAA della Basilicata; il numero del decreto non è stato reperito nella documentazione consultata.'
        ),
        (
          'melanzana-rossa-di-rotonda-dop',
          'Melanzana Rossa di Rotonda',
          'denominazione',
          'DOP',
          'Basilicata (Lucania) — provincia di Potenza: Rotonda, Viggianello, Castelluccio Inferiore, Castelluccio Superiore',
          'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
          'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013907',
          'Reg. (UE) n. 624/2010 (GUUE L 182 del 16.7.2010)',
          date '2026-11-18',
          true,
          'Scheda eAmbrosia EUGI00000013907 (PDO-IT-0662) consultata il 18/11/2026. Nessuna modifica registrata. Comprende solo i quattro comuni della Valle del Mercure; Senise NON è compresa.'
        )
      ) as t (
        slug, denominazione, tipo_atto, schema_qualita, territorio, ente,
        url_ufficiale, riferimento_normativo, consultata_il, attiva, note
      )
  loop
    -- Nessun duplicato: la stessa denominazione non può vivere sotto due slug.
    perform 1
      from public.radiscan_fonti f
     where f.slug <> v.slug
       and lower(btrim(f.denominazione)) = lower(btrim(v.denominazione));
    if found then
      raise exception
        'RadiciScan 2V: denominazione "%" già presente con slug diverso da "%"; nessuna scrittura.',
        v.denominazione, v.slug
        using errcode = '23505';
    end if;

    select * into r
      from public.radiscan_fonti f
     where f.slug = v.slug;

    if found then
      if (r.denominazione, r.tipo_atto, r.schema_qualita, r.territorio,
          r.ente, r.url_ufficiale, r.riferimento_normativo,
          r.consultata_il, r.attiva, r.note)
         is distinct from
         (v.denominazione, v.tipo_atto, v.schema_qualita, v.territorio,
          v.ente, v.url_ufficiale, v.riferimento_normativo,
          v.consultata_il, v.attiva, v.note)
      then
        raise exception
          'RadiciScan 2V: slug "%" già presente con dati discordanti; nessuna scrittura.',
          v.slug
          using errcode = '23505';
      end if;

      raise notice
        'RadiciScan 2V: slug "%" già presente e identico; nessuna azione.',
        v.slug;
    else
      insert into public.radiscan_fonti
        (slug, denominazione, tipo_atto, schema_qualita, territorio, ente,
         url_ufficiale, riferimento_normativo, consultata_il, attiva, note)
      values
        (v.slug, v.denominazione, v.tipo_atto, v.schema_qualita, v.territorio,
         v.ente, v.url_ufficiale, v.riferimento_normativo, v.consultata_il,
         v.attiva, v.note);

      get diagnostics v_righe = row_count;
      if v_righe <> 1 then
        raise exception
          'RadiciScan 2V: inserimento di "%" ha modificato % righe invece di 1.',
          v.slug, v_righe
          using errcode = '23514';
      end if;
    end if;
  end loop;
end
$$;

-- Controllo di lettura: dopo 2S + correzioni + questo file devono risultare
-- 13 denominazioni e 22 fonti complessive.
select
  count(*) filter (where tipo_atto = 'denominazione') as denominazioni,
  count(*) as fonti_totali
from public.radiscan_fonti;

commit;
