begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED — Prodotti Tipici demo (Castrovillari / Pollino)
--
-- Idempotente e non distruttiva. Upsert per slug (gli indici parziali
-- negozi_slug_unique_idx / prodotti_slug_unique_idx esistono sul remoto).
-- Standard SQL escaping ('' per l'apostrofo): portabile tra psql, Supabase
-- SQL Editor e Management API. I negozi demo hanno is_demo = true.
--
-- Negozi territoriali chiaramente DEMO (nome con "- DEMO"), ownership
-- assegnata all'utente demo 3ec07260-... (come gli altri negozi demo).
-- Prodotti SOLO con denominazioni territoriali verificabili, nessuna
-- certificazione non verificata, nessuna duplicazione (8 prodotti unici).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- NEGOZI DEMO TERRITORIALI (3) — colonne reali del remoto, 35:35.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.negozi (
  id, slug, nome, categoria, descrizione,
  sottocategoria, indirizzo, telefono, email, whatsapp, sito_web,
  logo_url, copertina_url, orari, facebook, instagram, tiktok, youtube,
  citta, cap, provincia, coordinate, attivo, mostra_telefono,
  mostra_indirizzo, mostra_orari, accetta_whatsapp, in_evidenza,
  servizi, colori, parole_chiave, data, moduli_attivi, created_at, updated_at
) values
(
  '20000000-0000-4000-8000-000000000001',
  'demo-bottega-pollino',
  'Bottega del Pollino – DEMO',
  'Alimentari',
  'Bottega DEMO che raccoglie le Eccellenze del territorio di Castrovillari e del Pollino. Ambiente dimostrativo, non un''attività reale aderente a LocalHub.',
  'Prodotti tipici',
  'Corso Garibaldi 52, Castrovillari (CS)',
  '333 1000101',
  'demo@localhub.it',
  '333 1000101',
  'www.localhub.it',
  'panificio.png',
  '',
  '{"lunedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"martedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', '', '', '',
  'Castrovillari', '87012', 'CS', '', true, true, true, true, true, false,
  ARRAY['Prodotti tipici', 'Il territorio', 'Consulenza'],
  '{"primary":"#2563eb","secondary":"#f8fafc","accent":"#f59e0b"}',
  ARRAY['bottega', 'prodotti tipici', 'territorio', 'pollino', 'castrovillari', 'eccellenze', 'alimentari'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
),
(
  '20000000-0000-4000-8000-000000000002',
  'demo-terre-pollino',
  'Terre del Pollino – DEMO',
  'Alimentari',
  'Vetrina DEMO dei sapori del Parco Nazionale del Pollino: miele, olio e vino del territorio. Ambiente dimostrativo, non un''attività reale aderente a LocalHub.',
  'Prodotti tipici',
  'Via Roma 8, Castrovillari (CS)',
  '333 1000102',
  'demo@localhub.it',
  '333 1000102',
  'www.localhub.it',
  'panificio.png',
  '',
  '{"lunedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"martedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', '', '', '',
  'Castrovillari', '87012', 'CS', '', true, true, true, true, true, false,
  ARRAY['Miele del Pollino', 'Olio EVO', 'Vino del territorio', 'Prodotti tipici'],
  '{"primary":"#2563eb","secondary":"#f8fafc","accent":"#f59e0b"}',
  ARRAY['territorio', 'pollino', 'miele', 'olio', 'vino', 'prodotti tipici', 'castrovillari'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
),
(
  '20000000-0000-4000-8000-000000000003',
  'demo-sapori-castrovillari',
  'Sapori di Castrovillari – DEMO',
  'Panificio',
  'Negozio DEMO dedicato ai dolci e ai sapori tradizionali di Castrovillari. Ambiente dimostrativo, non un''attività reale aderente a LocalHub.',
  'Dolci tipici',
  'Piazza Giovanni XXIII 3, Castrovillari (CS)',
  '333 1000103',
  'demo@localhub.it',
  '333 1000103',
  'www.localhub.it',
  'panificio.png',
  '',
  '{"lunedì":{"chiuso":false,"apertura1":"07:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"martedì":{"chiuso":false,"apertura1":"07:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"07:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"07:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"07:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"07:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', '', '', '',
  'Castrovillari', '87012', 'CS', '', true, true, true, true, true, false,
  ARRAY['Dolci tipici', 'Prodotti da forno', 'Il territorio'],
  '{"primary":"#2563eb","secondary":"#f8fafc","accent":"#f59e0b"}',
  ARRAY['dolci tipici', 'ciotaredda', 'castrovillari', 'prodotti da forno', 'territorio'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
)
on conflict (slug) where slug is not null do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  descrizione = excluded.descrizione,
  sottocategoria = excluded.sottocategoria,
  indirizzo = excluded.indirizzo,
  telefono = excluded.telefono,
  email = excluded.email,
  whatsapp = excluded.whatsapp,
  sito_web = excluded.sito_web,
  logo_url = excluded.logo_url,
  orari = excluded.orari,
  servizi = excluded.servizi,
  colori = excluded.colori,
  parole_chiave = excluded.parole_chiave,
  attivo = true,
  deleted_at = null;

-- Marca i negozi demo territoriali come DEMO (colonna is_demo, presente sul remoto).
update public.negozi
set is_demo = true
where slug in ('demo-bottega-pollino', 'demo-terre-pollino', 'demo-sapori-castrovillari');

-- Associa i negozi demo territoriali all'utente demo (come gli altri negozi
-- demo). Idempotente: ri-eseguibile senza effetti.
update public.negozi
set owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where slug in ('demo-bottega-pollino', 'demo-terre-pollino', 'demo-sapori-castrovillari');

-- ───────────────────────────────────────────────────────────────────────────
-- PRODOTTI TIPICI DEMO (8) — upsert per slug (idempotente).
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Cipolla Bianca di Castrovillari → Bottega del Pollino
--    Denominazione REALE verificata: Denominazione Comunale (De.Co.) conferita
--    dal Comune di Castrovillari (fonte: ARSAC Calabria, 2022).
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_tipico, created_at, updated_at)
select 'cipolla-bianca-castrovillari', n.id, 'Cipolla Bianca di Castrovillari', 'Prodotto agricolo De.Co. del territorio di Castrovillari, ecotipo locale di Allium cepa L. coltivato alle pendici del Massiccio del Pollino. Dolce e delicata.', 'Alimentari', 3.50, true, 40, 'https://images.pexels.com/photos/15442015/pexels-photo-15442015.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-bottega-pollino'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true, prodotto_tipico = true, immagine_principale = excluded.immagine_principale;

-- 2) Filetti di Cipolla Bianca di Castrovillari → Bottega del Pollino
--    Prodotto COMMERCIALE trasformato a base della Cipolla De.Co. (NO PAT,
--    NO denominazione ufficiale: solo materia prima locale).
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_tipico, created_at, updated_at)
select 'filetti-cipolla-bianca', n.id, 'Filetti di Cipolla Bianca di Castrovillari', 'Conserva artigianale a base di cipolla bianca di Castrovillari, tagliata e conservata in olio extravergine. Prodotto commerciale del territorio.', 'Alimentari', 6.90, true, 25, 'https://images.pexels.com/photos/12181051/pexels-photo-12181051.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-bottega-pollino'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true, prodotto_tipico = true, immagine_principale = excluded.immagine_principale;

-- 3) Dolcezza di Cipolla Bianca di Castrovillari → Bottega del Pollino
--    Conserva dolce (confettura) a base della Cipolla De.Co. di Castrovillari:
--    prodotto COMMERCIALE trasformato, nessuna certificazione dichiarata.
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_tipico, created_at, updated_at)
select 'dolcezza-cipolla-bianca', n.id, 'Dolcezza di Cipolla Bianca di Castrovillari', 'Confettura dolce a base di cipolla bianca di Castrovillari, caramellata lentamente. Ottima con formaggi e carni. Prodotto commerciale del territorio.', 'Alimentari', 7.90, true, 20, 'https://images.pexels.com/photos/36198456/pexels-photo-36198456.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-bottega-pollino'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true, prodotto_tipico = true, immagine_principale = excluded.immagine_principale;

-- 4) Miele Millefiori del Pollino → Terre del Pollino
--    Denominazione REALE verificata: miele del Parco Nazionale del Pollino
--    (fonte: parks.it). Demo senza bio/certificazioni non verificate.
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_tipico, created_at, updated_at)
select 'miele-millefiori-pollino', n.id, 'Miele Millefiori del Pollino', 'Miele millefiori raccolto dagli apicoltori del Parco Nazionale del Pollino. Dolce e aromatico, nota floreale.', 'Alimentari', 9.90, true, 30, 'https://images.pexels.com/photos/5634210/pexels-photo-5634210.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-terre-pollino'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true, prodotto_tipico = true, immagine_principale = excluded.immagine_principale;

-- 5) Miele di Castagno del Pollino → Terre del Pollino
--    Miele di castagno citato tra i mieli del Parco Nazionale del Pollino
--    (fonte: parks.it / atlanteparchi). Varietà distinta dal Millefiori.
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_tipico, created_at, updated_at)
select 'miele-castagno-pollino', n.id, 'Miele di Castagno del Pollino', 'Miele di castagno del Parco Nazionale del Pollino, dal sapore deciso e leggermente amaro. Tipico dei boschi di castagno del territorio.', 'Alimentari', 11.90, true, 22, 'https://images.pexels.com/photos/16112044/pexels-photo-16112044.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-terre-pollino'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true, prodotto_tipico = true, immagine_principale = excluded.immagine_principale;

-- 6) Olio Extra Vergine di Oliva del Pollino → Terre del Pollino
--    Denom. commerciale del territorio (olio EVO calabrese). Demo: nessuna DOP/IGP dichiarata.
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_tipico, created_at, updated_at)
select 'olio-evo-pollino', n.id, 'Olio Extra Vergine di Oliva del Pollino', 'Olio extravergine di oliva di oliveti del territorio del Pollino. Fruttato su erba, dal colore verde intenso.', 'Alimentari', 12.50, true, 35, 'https://images.pexels.com/photos/9814618/pexels-photo-9814618.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-terre-pollino'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true, prodotto_tipico = true, immagine_principale = excluded.immagine_principale;

-- 7) Magliocco del Pollino → Terre del Pollino
--    Vino Rosso Terre di Cosenza DOC da uve Magliocco (fonte: disciplinare
--    Terre di Cosenza, Quattrocalici). Il vitigno Magliocco è autoctono del Pollino.
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_tipico, created_at, updated_at)
select 'magliocco-pollino', n.id, 'Magliocco del Pollino', 'Rosso del Pollino da uve autoctone di Magliocco, vitigno delle pendici del Massiccio. Corpo, secco, armonico.', 'Alimentari', 14.90, true, 20, 'https://images.pexels.com/photos/31094805/pexels-photo-31094805.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-terre-pollino'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true, prodotto_tipico = true, immagine_principale = excluded.immagine_principale;

-- 8) Ciotaredda di Castrovillari → Sapori di Castrovillari
--    Dolce tradizionale REALE di Castrovillari (fonte: ricette calabresi,
--    fattorie locali). NO PAT/De.Co. dichiarata: solo tradizione documentata.
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_tipico, created_at, updated_at)
select 'ciotaredda-castrovillari', n.id, 'Ciotaredda di Castrovillari', 'Dolcetto tradizionale di Castrovillari preparato con farina, noci, mosto cotto, miele e scorza di limone. Simile ai mostaccioli.', 'Alimentari', 7.50, true, 18, 'https://images.pexels.com/photos/7909873/pexels-photo-7909873.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-sapori-castrovillari'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true, prodotto_tipico = true, immagine_principale = excluded.immagine_principale;

notify pgrst, 'reload schema';

commit;