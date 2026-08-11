begin;

-- ═══════════════════════════════════════════════════════════════════════
-- Seed negozi demo — riscritta per l'ORDINE CRONOLOGICO reale delle migration
--
-- ORDINE DI ESECUZIONE (Supabase CLI: confronto stringa sul prefisso-versione):
--   ... 20260729_store_editor_fields  <  20260730_seed_demo_stores  <
--       2026073002_store_servizi_colori  <  20260731_cms_foundation  ...
--
-- Quindi AL MOMENTO dell'esecuzione di questa seed:
--   ✅ esistono già: immagine, copertina (rinominate SOLO in
--     20260731_cms_foundation in logo_url/copertina_url), orari, facebook,
--     instagram, tiktok, youtube, citta, cap, provincia, coordinate,
--     mostra_*, accetta_whatsapp, in_evidenza, indirizzo, telefono, sito_web
--   ❌ NON esistono ancora (migration SUCCESSIVE, non usate qui):
--     servizi, colori, parole_chiave (2026073002),
--     logo_url/copertina_url/deleted_at/data/moduli_attivi/seo_*/version
--     (20260731), is_demo (20260806)
--
-- I valori servizi/colori/parole_chiave verranno applicati dalla seed
-- canonica 20260802_seed_demo_completo.sql (che gira dopo 2026073002).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Indice unique su slug per upsert ─────────────────────────────────────
-- Compatibile con l'indice UNIQUE parziale sullo slug (predicato obbligatorio
-- per l'inferenza ON CONFLICT): idempotente con 20260802_url_slug_schema.
create unique index if not exists negozi_slug_unique_idx on public.negozi (slug)
where slug is not null;

-- ── Seed negozi demo nel database ─────────────────────────────────────────
-- Mantiene gli stessi slug (demo-panificio-1, demo-beauty-1, ...)
-- Genera UUID per la chiave primaria
-- Se il record esiste già (stesso slug), aggiorna i dati

insert into public.negozi (
  id, slug, nome, categoria, descrizione, descrizione_completa,
  sottocategoria, indirizzo, telefono, email, whatsapp, sito_web,
  immagine, copertina, orari, facebook, instagram, tiktok, youtube,
  citta, cap, provincia, coordinate, attivo, mostra_telefono,
  mostra_indirizzo, mostra_orari, accetta_whatsapp, in_evidenza,
  created_at, updated_at
) values
(
  gen_random_uuid(), 'demo-panificio-1', 'Panificio Rossi', 'Panificio',
  'Forno artigianale con pane fresco ogni giorno, dolci tradizionali e specialità da forno preparate secondo le ricette di famiglia dal 1968.',
  'Forno artigianale con pane fresco ogni giorno, dolci tradizionali e specialità da forno preparate secondo le ricette di famiglia dal 1968. Aperto dal 1968, il Panificio Rossi è un punto di riferimento per gli abitanti del centro. Offriamo pane, dolci, pizza al taglio e focaccia fatta in casa ogni giornata.',
  'Forno', 'Corso Garibaldi 42, Centro Storico', '393 2145678', 'info@panificiorossi.it', '393 2145678', 'www.panificiorossi.it',
  'panificio.png', '',
  '{"lunedì":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""},"martedì":{"chiuso":false,"apertura1":"07:00","chiusura1":"13:30","apertura2":"16:30","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"07:00","chiusura1":"13:30","apertura2":"16:30","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"07:00","chiusura1":"13:30","apertura2":"16:30","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"07:00","chiusura1":"13:30","apertura2":"16:30","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"07:00","chiusura1":"13:30","apertura2":"16:30","chiusura2":"20:00"},"domenica":{"chiuso":false,"apertura1":"07:30","chiusura1":"12:30","apertura2":"","chiusura2":""}}',
  '', '', '', '', '', '', '', '',
  true, true, true, true, true, false,
  now(), now()
),
(
  gen_random_uuid(), 'demo-beauty-1', 'Atelier Bellezza', 'Beauty',
  'Centro beauty specializzato in skincare, make-up e trattamenti viso personalizzati.',
  'Centro beauty specializzato in skincare, make-up e trattamenti viso personalizzati. Offriamo servizi completi per il viso, capelli e corpo con prodotti di marca.',
  'Estetica', 'Via Roma 24, Centro', '333 1200456', 'ciao@atelierbellezza.it', '333 1200456', 'www.atelierbellezza.it',
  'beauty.svg', '',
  '{"lunedì":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""},"martedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"12:30","apertura2":"15:00","chiusura2":"19:30"},"mercoledì":{"chiuso":false,"apertura1":"09:00","chiusura1":"12:30","apertura2":"15:00","chiusura2":"19:30"},"giovedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"12:30","apertura2":"15:00","chiusura2":"19:30"},"venerdì":{"chiuso":false,"apertura1":"09:00","chiusura1":"12:30","apertura2":"15:00","chiusura2":"19:30"},"sabato":{"chiuso":false,"apertura1":"09:00","chiusura1":"12:30","apertura2":"15:00","chiusura2":"19:30"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'nome.negozio', '', '', '', '', '', '',
  true, true, true, true, true, false,
  now(), now()
),
(
  gen_random_uuid(), 'demo-casa-1', 'Casa Moderna', 'Casa',
  'Showroom di arredo contemporaneo con complementi, luci decorative e consulenza d''interni.',
  'Showroom di arredo contemporaneo con complementi, luci decorative e consulenza d''interni. Mostriamo le ultime tendenze in arredi, illuminazione e design per valorizzare i tuoi spazi.',
  'Arredo', 'Corso Italia 81, Centro', '333 4821907', 'info@casamoderna.it', '333 4821907', 'www.casamoderna.it',
  'casa.svg', '',
  '{"lunedì":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""},"martedì":{"chiuso":false,"apertura1":"10:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"10:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"10:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"10:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"10:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'casamoderna', '', '', '', '', '', '',
  true, true, true, true, true, false,
  now(), now()
),
(
  gen_random_uuid(), 'demo-auto-1', 'Auto Point Service', 'Auto',
  'Officina e centro servizi auto per manutenzione, pneumatici, check-up e assistenza rapida.',
  'Officina e centro servizi auto per manutenzione, pneumatici, check-up e assistenza rapida. Offriamo interventi per auto private e professionali con ricambi di marca.',
  'Officina', 'Viale Europa 12, Zona Sud', '333 7745102', 'service@autopoint.it', '333 7745102', 'www.autopointservice.it',
  'auto.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"14:00","chiusura2":"18:30"},"martedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"14:00","chiusura2":"18:30"},"mercoledì":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"14:00","chiusura2":"18:30"},"giovedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"14:00","chiusura2":"18:30"},"venerdì":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"14:00","chiusura2":"18:30"},"sabato":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"","chiusura2":""},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'autopointservice', '', '', '', '', '', '',
  true, true, true, true, true, false,
  now(), now()
),
(
  gen_random_uuid(), 'demo-salute-1', 'Salus Farma', 'Salute',
  'Farmacia di quartiere con prodotti benessere, parafarmacia e consulenza professionale.',
  'Farmacia di quartiere con prodotti benessere, parafarmacia e consulenza professionale. Aperta tutti i giorni, offriamo servizi di consegna e autoanalisi rapida.',
  'Farmacia', 'Piazza Garibaldi 5, Centro', '333 9081176', 'contatti@salusfarma.it', '333 9081176', 'www.salusfarma.it',
  'salute.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"martedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"","chiusura2":""},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'salusfarma', '', '', '', '', '', '',
  true, true, true, true, true, false,
  now(), now()
),
(
  gen_random_uuid(), 'demo-tech-1', 'Tech Lab Store', 'Tech & Elettronica',
  'Negozio di tecnologia con smartphone, accessori, assistenza e configurazioni su misura.',
  'Negozio di tecnologia con smartphone, accessori, assistenza e configurazioni su misura. Offriamo prodotti di ultima generazione e servizi di riparazione per privati e aziende.',
  'Elettronica', 'Via Verdi 37, Centro', '333 6512088', 'hello@techlabstore.it', '333 6512088', 'www.techlabstore.it',
  'elettronica.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"martedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"mercoledì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"giovedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"venerdì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"sabato":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'techlabstore', '', '', '', '', '', '',
  true, true, true, true, true, false,
  now(), now()
),
(
  gen_random_uuid(), 'demo-bimbi-1', 'Mondo Bimbi', 'Bimbi & Giocattoli',
  'Articoli per l''infanzia, giochi educativi, idee regalo e prodotti per la scuola.',
  'Articoli per l''infanzia, giochi educativi, idee regalo e prodotti per la scuola. Offriamo articoli selezionati per bimbi e neonati con consigli personalizzati.',
  'Infanzia', 'Via Manzoni 18, Quartiere Nord', '333 3402214', 'info@mondobimbi.it', '333 3402214', 'www.mondobimbi.it',
  'bimbi.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"martedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"mercoledì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"giovedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"venerdì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"sabato":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'mondobimbi', '', '', '', '', '', '',
  true, true, true, true, true, false,
  now(), now()
),
(
  gen_random_uuid(), 'demo-sport-1', 'Urban Sport Hub', 'Sport & Fitness',
  'Abbigliamento sportivo, accessori training e consulenza per fitness e attività outdoor.',
  'Abbigliamento sportivo, accessori training e consulenza per fitness e attività outdoor. Offriamo prodotti per running, yoga, palestra e sport in al aperto.',
  'Abbigliamento Sportivo', 'Via Torino 55, Zona Ovest', '333 2198740', 'team@urbansporthub.it', '333 2198740', 'www.urbansporthub.it',
  'sport.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"martedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'urbansporthub', '', '', '', '', '', '',
  true, true, true, true, true, false,
  now(), now()
),
(
  gen_random_uuid(), 'demo-pet-1', 'Amici a Quattro Zampe', 'Pet Shop & Animali',
  'Pet shop con alimentazione, giochi, accessori e servizi dedicati a cane, gatto, cani e gatti.',
  'Pet shop con alimentazione, giochi, accessori e servizi dedicati a cane e gatto. Offriamo prodotti di qualità e servizi di toelettatura per il tuo animale da compagnia.',
  'Animali', 'Via Leopardi 9, Quartiere Est', '333 7614509', 'shop@4zampe.it', '333 7614509', 'www.amicia4zampe.it',
  'pet.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"martedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"mercoledì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"giovedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"venerdì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"sabato":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'amicia4zampe', '', '', '', '', '', '',
  true, true, true, true, true, false,
  now(), now()
)
on conflict (slug) where slug is not null do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  descrizione = excluded.descrizione,
  descrizione_completa = excluded.descrizione_completa,
  sottocategoria = excluded.sottocategoria,
  indirizzo = excluded.indirizzo,
  telefono = excluded.telefono,
  email = excluded.email,
  whatsapp = excluded.whatsapp,
  sito_web = excluded.sito_web,
  immagine = excluded.immagine,
  orari = excluded.orari,
  facebook = excluded.facebook,
  instagram = excluded.instagram,
  attivo = true;

-- ── Assegna i negozi demo al merchant esistente ───────────────────────────
-- L'utente 3ec07260-... è il merchant già presente nel sistema
update public.negozi
set owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where owner_user_id is null
  and slug like 'demo-%';

notify pgrst, 'reload schema';

commit;
