-- ═══════════════════════════════════════════════════════════════════════
-- RADICISCAN — FASE 2T: CORREZIONI PROPOSTE ALLE DIECI FONTI DELLA 2S
-- ═══════════════════════════════════════════════════════════════════════
-- STATO: PROPOSTA. NON ESEGUIRE.
--   * Il file della FASE 2S NON è stato modificato: questo file è separato.
--   * Perché servono UPDATE e non INSERT: `ON CONFLICT (slug) DO NOTHING`
--     salta in silenzio le righe già presenti, quindi non può correggere un
--     URL o un riferimento sbagliato già inserito.
--   * Applicare in un'unica transazione dopo la 2S e verificare che ogni
--     UPDATE tocchi esattamente 1 riga. Se una riga manca, annullare tutto.
--
-- CORREZIONI
--   1. Fichi di Cosenza: esiste la scheda puntuale eAmbrosia, EUGI00000013864
--      (PDO-IT-0682). L'URL di ricerca della 2S va sostituito.
--   2. Cedro: scheda puntuale EUGI00000018602 (PDO-IT-02847), più stabile del
--      PDF MASAF usato nella 2S.
--   3. Pecorino Crotonese: mancava la modifica non minore approvata con
--      Reg. di esecuzione (UE) 2023/2728 (GUUE L 2023/2728 del 5.12.2023;
--      domanda PDO-IT-1111-AM01, GUUE C 288/2023).
--   4. Liquirizia di Calabria: mancava la modifica non minore
--      Reg. (UE) n. 1403/2013 (GUUE L 349 del 21.12.2013).
--   * Clementine di Calabria e Patata della Sila restano invariate: manca
--     l'elenco ufficiale dei comuni, che non va inventato.
-- ═══════════════════════════════════════════════════════════════════════

begin;

update public.radiscan_fonti
set url_ufficiale =
      'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013864',
    note =
      'Scheda eAmbrosia EUGI00000013864 (PDO-IT-0682) consultata il 18/11/2026. Registrazione: GUUE L 162 del 22.6.2011. Zona: provincia di Cosenza, 0–800 m, pendenze fino al 35%.'
where slug = 'fichi-di-cosenza-dop';

update public.radiscan_fonti
set url_ufficiale =
      'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000018602',
    note =
      'Scheda eAmbrosia EUGI00000018602 (PDO-IT-02847) consultata il 18/11/2026. Disciplinare MASAF: BLOB:ID=3343. 18 comuni della Riviera dei Cedri in provincia di Cosenza.'
where slug = 'cedro-di-santa-maria-del-cedro-dop';

update public.radiscan_fonti
set riferimento_normativo =
      'Reg. (UE) n. 1262/2014 (GUUE L 341 del 27.11.2014); modifica non minore Reg. di esecuzione (UE) 2023/2728 (GUUE L 2023/2728 del 5.12.2023)',
    note =
      'Scheda eAmbrosia EUGI00000014301 (PDO-IT-1111) consultata il 18/11/2026. Modifica 2023 su forma e classificazione dei pesi (domanda PDO-IT-1111-AM01, GUUE C 288/2023); zona invariata: 52 comuni.'
where slug = 'pecorino-crotonese-dop';

update public.radiscan_fonti
set riferimento_normativo =
      'Reg. (UE) n. 1072/2011 (GUUE L 278 del 25.10.2011); modifiche non minori Reg. (UE) n. 1403/2013 (GUUE L 349 del 21.12.2013) e Reg. (UE) 2019/611 (GUUE L 105 del 16.4.2019)',
    note =
      'Scheda eAmbrosia EUGI00000013887 (PDO-IT-0644) consultata il 18/11/2026. 208 comuni sotto i 650 m; elenco nel disciplinare consolidato.'
where slug = 'liquirizia-di-calabria-dop';

-- Controllo di lettura: deve restituire 4 righe con URL e riferimento aggiornati.
select slug, url_ufficiale, riferimento_normativo
from public.radiscan_fonti
where slug in (
  'fichi-di-cosenza-dop',
  'cedro-di-santa-maria-del-cedro-dop',
  'pecorino-crotonese-dop',
  'liquirizia-di-calabria-dop'
)
order by slug;

commit;
