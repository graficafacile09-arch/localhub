-- ═══════════════════════════════════════════════════════════════════════
-- AGGREGATORE NOTIZIE CV — V2: GOOGLE NEWS DISCOVERY (20260903)
--
-- ADDITIVA: non tocca né la migration 20260903_notizie_aggregatore.sql né
-- le 5 fonti istituzionali V1 già presenti (stessi id, stessi vincoli).
--
-- Cosa fa:
--   1. aggiunge a notizie_fonti la colonna `scoperta` (default false):
--      identifica le fonti di DISCOVERY (Google News RSS). Le righe V1
--      restano con scoperta = false, quindi il loro comportamento non cambia.
--   2. inserisce 2 nuove fonti Google News RSS (tipo 'rss', compatibile con
--      il vincolo esistente tipo IN ('rss','html')), con UUID statici nuovi:
--      a0000000-0000-4000-8000-000000000006 → query "Castrovillari"
--      a0000000-0000-4000-8000-000000000007 → query "Castrovillari Comune"
--
-- La whitelist SSRF resta statica e derivata da url_base nel codice
-- (lib/notizie/fonti.ts): url_base = https://news.google.com fa entrare
-- news.google.com tra gli host consentiti, come per tutte le altre fonti.
-- Nessun URL arbitrario viene mai accettato.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Colonna additiva: nessun vincolo esistente viene modificato.
alter table public.notizie_fonti
  add column if not exists scoperta boolean not null default false;

-- 2) Seed delle due fonti di discovery (id statici nuovi, tipo 'rss').
insert into public.notizie_fonti
  (id, nome, tipo, url_feed, url_lista, url_base, categoria_default, attiva, frequenza_minuti, scoperta)
values
  (
    'a0000000-0000-4000-8000-000000000006',
    'Google News · Castrovillari',
    'rss',
    'https://news.google.com/rss/search?q=%22Castrovillari%22&hl=it&gl=IT&ceid=IT:it',
    null,
    'https://news.google.com',
    'Territorio',
    true,
    60,
    true
  ),
  (
    'a0000000-0000-4000-8000-000000000007',
    'Google News · Castrovillari Comune',
    'rss',
    'https://news.google.com/rss/search?q=Castrovillari%20Comune&hl=it&gl=IT&ceid=IT:it',
    null,
    'https://news.google.com',
    'Comune',
    true,
    60,
    true
  )
on conflict (id) do nothing;

notify pgrst, 'reload schema';
