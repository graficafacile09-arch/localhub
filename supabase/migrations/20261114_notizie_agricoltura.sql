-- ═══════════════════════════════════════════════════════════════════════
-- NOTIZIE — NUOVA LINEA EDITORIALE: AGRICOLTURA CALABRESE (20261114)
--
-- ADDITIVA: nessuna modifica di schema. Le categorie editoriali sono già
-- testo libero in public.notizie.category e la tipologia del contenuto
-- (notizia / evento / fiera / bollettino / opportunità) è calcolata in
-- lettura da lib/notizie/editoriale.ts, quindi l'archivio esistente resta
-- valido senza nuove colonne né backfill.
--
-- Cosa fa:
--   1. disattiva le vecchie fonti di cronaca cittadina (Comune, Provincia,
--      Protezione Civile, Parco del Pollino, due query Google News su
--      Castrovillari). Le righe NON vengono cancellate: le notizie storiche
--      continuano a puntare a una fonte valida e la disattivazione è
--      reversibile con un semplice UPDATE di `attiva`.
--   2. inserisce/aggiorna le fonti della nuova sezione: ARSAC, Regione
--      Calabria (già presente, solo cambio di categoria di default) e dodici
--      ricerche tematiche Google News.
--
-- Le query di discovery sono a tema singolo e vincolate al titolo
-- (intitle:Calabria): le ricerche con molti OR restituiscono feed poveri o
-- vuoti e, senza il vincolo sul titolo, arrivano articoli nazionali che
-- citano la Calabria solo nel corpo (verificato il 14/11/2026).
--
-- Gli stessi valori sono in lib/notizie/fonti.ts (whitelist statica SSRF):
-- se cambia una query qui va aggiornata anche la whitelist, e viceversa.
-- Lo stesso risultato si ottiene con scripts/notizie-agricoltura-setup.mjs.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Vecchie fonti di cronaca locale: disattivate, non cancellate.
update public.notizie_fonti
   set attiva = false
 where id in (
   'a0000000-0000-4000-8000-000000000001', -- Comune di Castrovillari
   'a0000000-0000-4000-8000-000000000002', -- Provincia di Cosenza
   'a0000000-0000-4000-8000-000000000004', -- Parco Nazionale del Pollino
   'a0000000-0000-4000-8000-000000000005', -- Protezione Civile Calabria
   'a0000000-0000-4000-8000-000000000006', -- Google News · Castrovillari
   'a0000000-0000-4000-8000-000000000007'  -- Google News · Castrovillari Comune
 );

-- 2) Fonti ufficiali del settore.
insert into public.notizie_fonti
  (id, nome, tipo, url_feed, url_lista, url_base, categoria_default,
   attiva, frequenza_minuti, scoperta)
values
  (
    'b0000000-0000-4000-8000-000000000001',
    'ARSAC Servizi in Agricoltura Calabria',
    'rss',
    'https://www.arsacweb.it/feed/',
    null,
    'https://www.arsacweb.it',
    'Agricoltura',
    true,
    720,
    false
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    'Regione Calabria',
    'rss',
    'https://www.regione.calabria.it/feed/',
    null,
    'https://www.regione.calabria.it',
    'Politiche agricole e finanziamenti',
    true,
    360,
    false
  )
on conflict (id) do update set
  nome = excluded.nome,
  tipo = excluded.tipo,
  url_feed = excluded.url_feed,
  url_lista = excluded.url_lista,
  url_base = excluded.url_base,
  categoria_default = excluded.categoria_default,
  attiva = excluded.attiva,
  frequenza_minuti = excluded.frequenza_minuti,
  scoperta = excluded.scoperta;

-- 3) Ricerche tematiche (discovery): una per area editoriale.
insert into public.notizie_fonti
  (id, nome, tipo, url_feed, url_lista, url_base, categoria_default,
   attiva, frequenza_minuti, scoperta)
values
  ('b0000000-0000-4000-8000-000000000002', 'Google News · Agricoltura Calabria', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+agricoltura',
   null, 'https://news.google.com', 'Agricoltura', true, 240, true),
  ('b0000000-0000-4000-8000-000000000003', 'Google News · Olio e olivicoltura', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+olio',
   null, 'https://news.google.com', 'Olio e olivicoltura', true, 240, true),
  ('b0000000-0000-4000-8000-000000000004', 'Google News · Vino e viticoltura', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+vino',
   null, 'https://news.google.com', 'Vino e viticoltura', true, 240, true),
  ('b0000000-0000-4000-8000-000000000005', 'Google News · Agrumi e ortofrutta', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+agrumi',
   null, 'https://news.google.com', 'Filiere e produzioni', true, 240, true),
  ('b0000000-0000-4000-8000-000000000006', 'Google News · DOP e prodotti tipici', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+DOP',
   null, 'https://news.google.com', 'Prodotti tipici e qualità', true, 240, true),
  ('b0000000-0000-4000-8000-000000000007', 'Google News · CSR e sviluppo rurale', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+CSR',
   null, 'https://news.google.com', 'Politiche agricole e finanziamenti', true, 240, true),
  ('b0000000-0000-4000-8000-000000000008', 'Google News · PAC e finanziamenti agricoli', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+PAC',
   null, 'https://news.google.com', 'Politiche agricole e finanziamenti', true, 240, true),
  ('b0000000-0000-4000-8000-000000000009', 'Google News · Fiere agricole', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+fiera',
   null, 'https://news.google.com', 'Eventi e fiere', true, 240, true),
  ('b0000000-0000-4000-8000-000000000010', 'Google News · Sagre e manifestazioni', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+sagra',
   null, 'https://news.google.com', 'Eventi e fiere', true, 240, true),
  ('b0000000-0000-4000-8000-000000000011', 'Google News · Vinitaly e vino italiano', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+Vinitaly',
   null, 'https://news.google.com', 'Eventi e fiere', true, 240, true),
  ('b0000000-0000-4000-8000-000000000012', 'Google News · Export agroalimentare', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+export',
   null, 'https://news.google.com', 'Mercati ed esportazioni', true, 240, true),
  ('b0000000-0000-4000-8000-000000000013', 'Google News · ARSAC e ricerca agricola', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+ARSAC',
   null, 'https://news.google.com', 'Innovazione e ricerca', true, 240, true)
on conflict (id) do update set
  nome = excluded.nome,
  tipo = excluded.tipo,
  url_feed = excluded.url_feed,
  url_lista = excluded.url_lista,
  url_base = excluded.url_base,
  categoria_default = excluded.categoria_default,
  attiva = excluded.attiva,
  frequenza_minuti = excluded.frequenza_minuti,
  scoperta = excluded.scoperta;

notify pgrst, 'reload schema';
