-- ═══════════════════════════════════════════════════════════════════════
-- RADICISCAN — FASE 2V: CORREZIONI ALLE DIECI FONTI DELLA 2S (versione 2)
-- ═══════════════════════════════════════════════════════════════════════
-- STATO: PROPOSTA. NON ESEGUIRE.
--   * File nuovo e separato: la versione 2T resta intatta.
--   * Va applicato dopo la FASE 2S e prima del file lucano 2V.
--   * Tutto in una transazione: un'eccezione annulla l'intero blocco.
--
-- CONTEGGI (invariati da questo file)
--   * 9 fonti `registro` esistenti.
--   * 10 denominazioni calabresi dopo la 2S.
--   * 3 denominazioni lucane dopo il file 2V lucano.
--   * 13 denominazioni complessive; 22 fonti complessive.
--
-- CORREZIONI
--   1. Fichi di Cosenza: URL puntuale EUGI00000013864 (PDO-IT-0682).
--   2. Cedro: URL puntuale EUGI00000018602 (PDO-IT-02847). La nota conserva
--      tutti e 18 i comuni già elencati nella 2S e non cita più l'identificativo
--      del PDF MASAF usato nella 2S, che non identifica un documento (lo stesso
--      numero compare in URL diversi che restituiscono atti diversi).
--   3. Pecorino Crotonese: aggiunge la modifica non minore 2023/2728 e
--      conserva "52 comuni elencati nel disciplinare".
--   4. Liquirizia di Calabria: aggiunge la modifica non minore 1403/2013 e
--      conserva l'ambito (radice fresca, essiccata, estratto).
--
-- GARANZIE
--   * Ogni UPDATE valorizza `aggiornato_il = now()`.
--   * Dopo ogni UPDATE, `get diagnostics` verifica `row_count = 1`.
--     Se la 2S non è stata applicata, o se uno slug manca, la transazione
--     fallisce: nessuna modifica parziale e nessun successo silenzioso.
-- ═══════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  v_righe integer;
begin
  -- ── 1. Fichi di Cosenza ────────────────────────────────────────────────
  update public.radiscan_fonti
     set url_ufficiale =
           'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000013864',
         note =
           'Scheda eAmbrosia EUGI00000013864 (PDO-IT-0682) consultata il 18/11/2026. Registrazione: GUUE L 162 del 22.6.2011. Zona: provincia di Cosenza, area tra Pollino e Sila, 0–800 m s.l.m., pendenze fino al 35%.',
         aggiornato_il = now()
   where slug = 'fichi-di-cosenza-dop';

  get diagnostics v_righe = row_count;
  if v_righe <> 1 then
    raise exception
      'RadiciScan 2V: Fichi di Cosenza, attese 1 riga, modificate %.',
      v_righe
      using errcode = '23514';
  end if;

  -- ── 2. Cedro di Santa Maria del Cedro ──────────────────────────────────
  update public.radiscan_fonti
     set url_ufficiale =
           'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000018602',
         note =
           'Scheda eAmbrosia EUGI00000018602 (PDO-IT-02847) consultata il 18/11/2026. Registrazione: GUUE L 132 del 17.5.2023. 18 comuni della Riviera dei Cedri, provincia di Cosenza: Aieta, Belvedere Marittimo, Bonifati, Buonvicino, Cetraro, Diamante, Grisolia, Maierà, Orsomarso, Papasidero, Praia a Mare, Sangineto, San Nicola Arcella, Santa Domenica Talao, Santa Maria del Cedro, Scalea, Tortora, Verbicaro.',
         aggiornato_il = now()
   where slug = 'cedro-di-santa-maria-del-cedro-dop';

  get diagnostics v_righe = row_count;
  if v_righe <> 1 then
    raise exception
      'RadiciScan 2V: Cedro, attese 1 riga, modificate %.',
      v_righe
      using errcode = '23514';
  end if;

  -- ── 3. Pecorino Crotonese ──────────────────────────────────────────────
  update public.radiscan_fonti
     set riferimento_normativo =
           'Reg. (UE) n. 1262/2014 (GUUE L 341 del 27.11.2014); modifica non minore Reg. di esecuzione (UE) 2023/2728 (GUUE L 2023/2728 del 5.12.2023)',
         note =
           'Scheda eAmbrosia EUGI00000014301 (PDO-IT-1111) consultata il 18/11/2026. La modifica 2023 riguarda forma e classificazione dei pesi (domanda PDO-IT-1111-AM01, GUUE C 288/2023); zona: 52 comuni elencati nel disciplinare.',
         aggiornato_il = now()
   where slug = 'pecorino-crotonese-dop';

  get diagnostics v_righe = row_count;
  if v_righe <> 1 then
    raise exception
      'RadiciScan 2V: Pecorino Crotonese, attese 1 riga, modificate %.',
      v_righe
      using errcode = '23514';
  end if;

  -- ── 4. Liquirizia di Calabria ──────────────────────────────────────────
  update public.radiscan_fonti
     set riferimento_normativo =
           'Reg. (UE) n. 1072/2011 (GUUE L 278 del 25.10.2011); modifiche non minori Reg. (UE) n. 1403/2013 (GUUE L 349 del 21.12.2013) e Reg. (UE) 2019/611 (GUUE L 105 del 16.4.2019)',
         note =
           'Scheda eAmbrosia EUGI00000013887 (PDO-IT-0644) consultata il 18/11/2026. La denominazione copre radice fresca, essiccata ed estratto. 208 comuni sotto i 650 m; elenco nel disciplinare consolidato.',
         aggiornato_il = now()
   where slug = 'liquirizia-di-calabria-dop';

  get diagnostics v_righe = row_count;
  if v_righe <> 1 then
    raise exception
      'RadiciScan 2V: Liquirizia di Calabria, attese 1 riga, modificate %.',
      v_righe
      using errcode = '23514';
  end if;
end
$$;

-- Controllo di lettura: 4 righe, URL e riferimenti aggiornati, aggiornato_il di oggi.
select slug, url_ufficiale, riferimento_normativo, aggiornato_il
from public.radiscan_fonti
where slug in (
  'fichi-di-cosenza-dop',
  'cedro-di-santa-maria-del-cedro-dop',
  'pecorino-crotonese-dop',
  'liquirizia-di-calabria-dop'
)
order by slug;

commit;
