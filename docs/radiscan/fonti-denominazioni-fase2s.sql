-- ═══════════════════════════════════════════════════════════════════════
-- RADICISCAN — FASE 2S: PROPOSTA DI DIECI FONTI `denominazione`
-- ═══════════════════════════════════════════════════════════════════════
-- STATO: PROPOSTA. NON ESEGUIRE.
--   * Nessuna riga è stata inserita: questo file non è una migration e non
--     è stato applicato né eseguito, né in locale né su Supabase.
--   * Va rivisto e spostato in supabase/migrations/ solo dopo approvazione,
--     con un nome proprio e un SHA-256 registrato.
--   * `ON CONFLICT (slug) DO NOTHING`: non sovrascrive eventuali righe
--     esistenti, ma con INSERT esplicito è comunque una scrittura.
--
-- VERIFICHE EFFETTUATE IL 18/11/2026
--   * Schema di public.radiscan_fonti e vincoli letti dalla migration
--     20261118_radiscan_core.sql.
--   * Whitelist URL del database: solo https://ec.europa.eu,
--     https://www.masaf.gov.it, https://www.regione.calabria.it,
--     https://www.arsacweb.it. Gli URL EUR-Lex indicati nella richiesta
--     (eur-lex.europa.eu) NON sono ammessi da questo vincolo: per questo
--     le fonti puntano a eAmbrosia (ec.europa.eu) o al disciplinare MASAF.
--   * Codice: lib/radiscan/verifica.ts confronta la denominazione
--     normalizzata (minuscole, senza diacritici, sigla di qualità finale
--     rimossa) e richiede tipo_atto = 'denominazione', attiva, territorio,
--     schema, URL in whitelist, riferimento > 3 caratteri e consultata_il.
--   * `territorio` inizia sempre con "Calabria": il confronto
--     territoriCoerenti() usa anche il contenimento, quindi una lettura
--     "Calabria" o una provincia contenuta nella stringa resta coerente.
--
-- DATI NON INSERITI PERCHÉ NON VERIFICATI
--   * Numero UE / file number eAmbrosia di "Fichi di Cosenza": la scheda
--     puntuale non è stata reperita; l'URL è la ricerca del registro
--     ufficiale filtrata per denominazione (da sostituire con la scheda).
--   * Conteggio ufficiale dei comuni di "Clementine di Calabria" e
--     "Patata della Sila": non riportato, per non inventare.
--   * Estremi dell'ultima modifica del disciplinare del Pecorino Crotonese
--     (pubblicazione C 288/2023 e regolamento di esecuzione 2023/2728):
--     presenti nelle fonti consultate, non riportati come riferimento
--     principale perché non letti integralmente.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.radiscan_fonti
  (slug, denominazione, tipo_atto, schema_qualita, territorio, ente,
   url_ufficiale, riferimento_normativo, consultata_il, attiva, note)
values
  (
    'pecorino-crotonese-dop',
    'Pecorino Crotonese',
    'denominazione', 'DOP',
    'Calabria — province di Crotone (27 comuni), Catanzaro (12) e Cosenza (13): 52 comuni',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000014301',
    'Reg. (UE) n. 1262/2014 (GUUE L 341 del 27.11.2014)',
    '2026-11-18', true,
    'Scheda eAmbrosia EUGI00000014301 consultata il 18/11/2026. Zona: 52 comuni elencati nel disciplinare.'
  ),
  (
    'pecorino-del-monte-poro-dop',
    'Pecorino del Monte Poro',
    'denominazione', 'DOP',
    'Calabria — provincia di Vibo Valentia: 27 comuni del comprensorio del Monte Poro',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000016178',
    'Reg. (UE) 2020/974 (GUUE L 215 del 7.7.2020); modifica C/2024/1059',
    '2026-11-18', true,
    'Scheda eAmbrosia PDO-IT-02420 consultata il 18/11/2026. Territorio: comuni del comprensorio del Monte Poro.'
  ),
  (
    'liquirizia-di-calabria-dop',
    'Liquirizia di Calabria',
    'denominazione', 'DOP',
    'Calabria — 208 comuni in tutte le province, sotto i 650 m di altitudine',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013887',
    'Reg. (UE) n. 1072/2011 (GUUE L 278 del 25.10.2011); modifica Reg. (UE) 2019/611',
    '2026-11-18', true,
    'Scheda eAmbrosia PDO-IT-0644 consultata il 18/11/2026. La denominazione copre radice fresca, essiccata ed estratto.'
  ),
  (
    'cedro-di-santa-maria-del-cedro-dop',
    'Cedro di Santa Maria del Cedro',
    'denominazione', 'DOP',
    'Calabria — provincia di Cosenza: 18 comuni della Riviera dei Cedri',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://www.masaf.gov.it/flex/cm/pages/ServeAttachment.php/L/IT/D/1%2F4%2Fb%2FD.f7eaf9cffb8660ca7c32/P/BLOB%3AID%3D3343/E/pdf?mode=download',
    'Reg. (UE) 2023/971 (GUUE L 132 del 17.5.2023)',
    '2026-11-18', true,
    'Disciplinare MASAF consultato il 18/11/2026. Comuni: Aieta, Belvedere Marittimo, Bonifati, Buonvicino, Cetraro, Diamante, Grisolia, Maierà, Orsomarso, Papasidero, Praia a Mare, Sangineto, San Nicola Arcella, Santa Domenica Talao, Santa Maria del Cedro, Scalea, Tortora, Verbicaro.'
  ),
  (
    'cipolla-rossa-di-tropea-calabria-igp',
    'Cipolla Rossa di Tropea Calabria',
    'denominazione', 'IGP',
    'Calabria — fascia costiera tirrenica: 23 comuni (5 Cosenza, 5 Catanzaro, 13 Vibo Valentia)',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013725',
    'Reg. (CE) n. 284/2008 (GUUE L 86 del 28.3.2008); modifica Reg. (UE) n. 264/2013',
    '2026-11-18', true,
    'Scheda eAmbrosia EUGI00000013725 consultata il 18/11/2026. Territorio: terreni idonei in parte dei comuni elencati nel disciplinare.'
  ),
  (
    'clementine-di-calabria-igp',
    'Clementine di Calabria',
    'denominazione', 'IGP',
    'Calabria — comuni costieri e collinari delle province di Reggio Calabria, Catanzaro, Cosenza, Vibo Valentia e Crotone',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013331',
    'Reg. (CE) n. 2325/97 (GUCE L 322 del 25.11.1997); modifica C/2024/6999',
    '2026-11-18', true,
    'Scheda eAmbrosia PGI-IT-1548 consultata il 18/11/2026. Il disciplinare consolidato 2024 elenca i comuni; il numero complessivo non è riportato perché non confermato su fonte istituzionale.'
  ),
  (
    'fichi-di-cosenza-dop',
    'Fichi di Cosenza',
    'denominazione', 'DOP',
    'Calabria — provincia di Cosenza: area tra Pollino e Sila, 0–800 m s.l.m., pendenze fino al 35%',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/?denomination=Fichi%20di%20Cosenza',
    'Reg. (UE) n. 596/2011 (GUUE L 162 del 22.6.2011)',
    '2026-11-18', true,
    'DATI INCOMPLETI: URL di ricerca nel registro ufficiale, non scheda puntuale; numero UE/file number eAmbrosia non reperito. Sostituire prima dell''uso.'
  ),
  (
    'limone-di-rocca-imperiale-igp',
    'Limone di Rocca Imperiale',
    'denominazione', 'IGP',
    'Calabria — comune di Rocca Imperiale (Cosenza)',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013787',
    'Reg. (UE) n. 149/2012 (GUUE L 48 del 21.2.2012); modifica Reg. (UE) n. 738/2014',
    '2026-11-18', true,
    'Scheda eAmbrosia EUGI00000013787 consultata il 18/11/2026. Zona di produzione coincidente con il territorio comunale.'
  ),
  (
    'patata-della-sila-igp',
    'Patata della Sila',
    'denominazione', 'IGP',
    'Calabria — altopiano della Sila, comuni delle province di Cosenza e Catanzaro',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013924',
    'Reg. (UE) n. 898/2010 (GUUE L 266 del 9.10.2010)',
    '2026-11-18', true,
    'Scheda eAmbrosia PGI-IT-0643 consultata il 18/11/2026. L''elenco del disciplinare comprende toponimi precedenti alla fusione nel comune di Casali del Manco.'
  ),
  (
    'peperoncino-di-calabria-igp',
    'Peperoncino di Calabria',
    'denominazione', 'IGP',
    'Calabria — intero territorio amministrativo regionale (tutte e cinque le province)',
    'Ministero dell''agricoltura, della sovranità alimentare e delle foreste (MASAF)',
    'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000021367',
    'Reg. di esecuzione (UE) 2026/1273 (GUUE L dell''11.6.2026)',
    '2026-11-18', true,
    'Scheda eAmbrosia PGI-IT-03421 consultata il 18/11/2026. Registrazione pubblicata in GUUE l''11/06/2026.'
  )
on conflict (slug) do nothing;
