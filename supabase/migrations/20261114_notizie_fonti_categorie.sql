-- ═══════════════════════════════════════════════════════════════════════
-- NOTIZIE — COPERTURA DI TUTTE LE CATEGORIE EDITORIALI (20261114)
--
-- ADDITIVA: solo insert/upsert su public.notizie_fonti, nessuna modifica di
-- schema. Aggiunge nove ricerche tematiche Google News alle dodici della
-- migration 20261114_notizie_agricoltura.sql, perché Innovazione e ricerca e
-- Mercati ed esportazioni restavano senza contenuti e Filiere e produzioni e
-- Territori e biodiversità ne avevano pochissimi.
--
-- Query verificate il 14/11/2026: ognuna restituisce fra 5 e 65 item, tutte
-- vincolate al titolo (intitle:Calabria) e a tema singolo.
--
-- Gli stessi valori sono in lib/notizie/fonti.ts (whitelist statica SSRF) e in
-- scripts/notizie-agricoltura-setup.mjs.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.notizie_fonti
  (id, nome, tipo, url_feed, url_lista, url_base, categoria_default,
   attiva, frequenza_minuti, scoperta)
values
  ('b0000000-0000-4000-8000-000000000014', 'Google News · Innovazione e ricerca agricola', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+innovazione',
   null, 'https://news.google.com', 'Innovazione e ricerca', true, 240, true),
  ('b0000000-0000-4000-8000-000000000015', 'Google News · Biodiversità e territori', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+biodiversit%C3%A0',
   null, 'https://news.google.com', 'Territori e biodiversità', true, 240, true),
  ('b0000000-0000-4000-8000-000000000016', 'Google News · Parchi e aree protette', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+parco',
   null, 'https://news.google.com', 'Territori e biodiversità', true, 240, true),
  ('b0000000-0000-4000-8000-000000000017', 'Google News · Ortofrutta e produzioni', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+ortofrutta',
   null, 'https://news.google.com', 'Filiere e produzioni', true, 240, true),
  ('b0000000-0000-4000-8000-000000000018', 'Google News · Zootecnia e allevamenti', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+zootecnia',
   null, 'https://news.google.com', 'Filiere e produzioni', true, 240, true),
  ('b0000000-0000-4000-8000-000000000019', 'Google News · Agricoltura biologica', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+biologico',
   null, 'https://news.google.com', 'Filiere e produzioni', true, 240, true),
  ('b0000000-0000-4000-8000-000000000020', 'Google News · Prezzi e mercati agricoli', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+prezzi',
   null, 'https://news.google.com', 'Mercati ed esportazioni', true, 240, true),
  ('b0000000-0000-4000-8000-000000000021', 'Google News · Agroalimentare e mercati', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+agroalimentare',
   null, 'https://news.google.com', 'Mercati ed esportazioni', true, 240, true),
  ('b0000000-0000-4000-8000-000000000022', 'Google News · Agriturismo e territori rurali', 'rss',
   'https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=intitle:Calabria+agriturismo',
   null, 'https://news.google.com', 'Territori e biodiversità', true, 240, true)
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
