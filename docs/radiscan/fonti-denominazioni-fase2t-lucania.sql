-- ═══════════════════════════════════════════════════════════════════════
-- RADICISCAN — FASE 2T: PROPOSTA DI TRE FONTI `denominazione` LUCANE
-- ═══════════════════════════════════════════════════════════════════════
-- STATO: PROPOSTA. NON ESEGUIRE.
--   * Nessuna riga è stata inserita. File nuovo, fuori da supabase/migrations/.
--   * `ON CONFLICT (slug) DO NOTHING`: non sovrascrive righe esistenti.
--   * Da applicare solo DOPO la FASE 2S e dopo le correzioni del file
--     fonti-denominazioni-fase2t-correzioni.sql.
--
-- VERIFICHE DEL 18/11/2026
--   * Identificativi e file number letti dall'API eAmbrosia.
--   * Nomi ufficiali: il registro eAmbrosia mostra "Peperone di Senise", ma il
--     Reg. (UE) 2020/1718 ha cambiato il nome in "Peperoni di Senise": qui si
--     usa la forma vigente, quella stampata sulle etichette.
--   * "Fagioli Bianchi di Rotonda" è plurale: il singolare "Fagiolo Bianco di
--     Rotonda" non è il nome registrato.
--   * Zone di produzione lette dai disciplinari MASAF/GURI:
--       Peperoni: 12 comuni (6 Potenza, 6 Matera); Rotonda NON è compresa.
--       Fagioli e Melanzana: 4 comuni della Valle del Mercure; Senise NON è
--       compresa.
--   * `territorio` elenca regione, province e comuni: nessuna macro-area
--     generica ("Pollino", "Lucania") usata da sola, perché il confronto del
--     codice è per contenimento e una stringa generica allargherebbe la verifica.
--   * "Lucania" è presente come alias di Basilicata: senza alias una lettura
--     "Lucania" non sarebbe coerente con "Basilicata".
-- ═══════════════════════════════════════════════════════════════════════

insert into public.radiscan_fonti
  (slug, denominazione, tipo_atto, schema_qualita, territorio, ente,
   url_ufficiale, riferimento_normativo, consultata_il, attiva, note)
values
  (
    'peperoni-di-senise-igp',
    'Peperoni di Senise',
    'denominazione', 'IGP',
    'Basilicata (Lucania) — province di Potenza e Matera: Senise, Chiaromonte, Francavilla in Sinni, Noepoli, Sant''Arcangelo, Roccanova (PZ); Valsinni, Colobraro, Tursi, San Giorgio Lucano, Montalbano Jonico, Craco (MT)',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013409',
    'Reg. (CE) n. 1263/96 (GUCE L 163 del 2.7.1996); modifica non minore Reg. (UE) 2020/1718 (GUUE L 386 del 18.11.2020)',
    '2026-11-18', true,
    'Scheda eAmbrosia EUGI00000013409 (PGI-IT-1532) consultata il 18/11/2026. Il Reg. 2020/1718 ha cambiato il nome da "Peperone di Senise" a "Peperoni di Senise"; il registro eAmbrosia mostra ancora il singolare. 12 comuni; Rotonda NON è compresa.'
  ),
  (
    'fagioli-bianchi-di-rotonda-dop',
    'Fagioli Bianchi di Rotonda',
    'denominazione', 'DOP',
    'Basilicata (Lucania) — provincia di Potenza: Rotonda, Viggianello, Castelluccio Inferiore, Castelluccio Superiore',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013841',
    'Reg. (UE) n. 240/2011 (GUUE L 66 del 12.3.2011); modifica ordinaria D.M. 14.6.2024 (GU n. 146 del 24.6.2024), registrata il 24.1.2025 (GUUE C/2025/505)',
    '2026-11-18', true,
    'Scheda eAmbrosia EUGI00000013841 (PDO-IT-0683) consultata il 18/11/2026. Comprende solo i quattro comuni della Valle del Mercure; Senise NON è compresa. Nome ufficiale plurale.'
  ),
  (
    'melanzana-rossa-di-rotonda-dop',
    'Melanzana Rossa di Rotonda',
    'denominazione', 'DOP',
    'Basilicata (Lucania) — provincia di Potenza: Rotonda, Viggianello, Castelluccio Inferiore, Castelluccio Superiore',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013907',
    'Reg. (UE) n. 624/2010 (GUUE L 182 del 16.7.2010)',
    '2026-11-18', true,
    'Scheda eAmbrosia EUGI00000013907 (PDO-IT-0662) consultata il 18/11/2026. Nessuna modifica registrata. Comprende solo i quattro comuni della Valle del Mercure; Senise NON è compresa.'
  )
on conflict (slug) do nothing;
