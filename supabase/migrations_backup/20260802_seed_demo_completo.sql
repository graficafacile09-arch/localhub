begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- Architettura URL pubbliche basate su slug (FASE 1 — seed demo COMPLETO)
-- Auto-contenuta e idempotente: chiunque cloni il repo e applichi le
-- migration ottiene lo stesso ambiente (negozi demo + prodotti demo) senza
-- alcun inserimento manuale.
--
-- Nota: usa le colonne REALI del database (logo_url/copertina_url, non
-- immagine/copertina). Idempotente: upsert per slug.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- NEGOZI DEMO (9) — UUID fissi deterministici, upsert per slug.
-- ───────────────────────────────────────────────────────────────────────────

insert into public.negozi (
  id, slug, nome, categoria, descrizione, descrizione_completa,
  sottocategoria, indirizzo, telefono, email, whatsapp, sito_web,
  logo_url, copertina_url, orari, facebook, instagram, tiktok, youtube,
  citta, cap, provincia, coordinate, attivo, mostra_telefono,
  mostra_indirizzo, mostra_orari, accetta_whatsapp, in_evidenza,
  servizi, colori, parole_chiave, data, moduli_attivi, created_at, updated_at
) values
(
  '10000000-0000-4000-8000-000000000001', 'demo-panificio-1', 'Panificio Rossi', 'Panificio',
  'Forno artigianale con pane fresco ogni giorno, dolci tradizionali e specialità da forno preparate secondo le ricette di famiglia dal 1968.',
  'Forno artigianale con pane fresco ogni giorno, dolci tradizionali e specialità da forno preparate secondo le ricette di famiglia dal 1968. Aperto dal 1968, il Panificio Rossi è un punto di riferimento per gli abitanti del centro. Offriamo pane, dolci, pizza al taglio e focaccia fatta in casa ogni giornata.',
  'Forno', 'Corso Garibaldi 42, Centro Storico', '393 2145678', 'info@panificiorossi.it', '393 2145678', 'www.panificiorossi.it',
  'panificio.png', '',
  '{"lunedì":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""},"martedì":{"chiuso":false,"apertura1":"07:00","chiusura1":"13:30","apertura2":"16:30","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"07:00","chiusura1":"13:30","apertura2":"16:30","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"07:00","chiusura1":"13:30","apertura2":"16:30","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"07:00","chiusura1":"13:30","apertura2":"16:30","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"07:00","chiusura1":"13:30","apertura2":"16:30","chiusura2":"20:00"},"domenica":{"chiuso":false,"apertura1":"07:30","chiusura1":"12:30","apertura2":"","chiusura2":""}}',
  '', '', '', '', '', '', '', '',
  true, true, true, true, true, false,
  ARRAY['Consegna a domicilio', 'Parcheggio', 'Pagamento contanti'],
  '{"primary":"#2563eb","secondary":"#f8fafc","accent":"#f59e0b"}',
  ARRAY['panificio', 'forno', 'pane', 'pasticceria', 'cornetti', 'pizza al taglio', 'focaccia', 'grissini', 'dolci tipici', 'pane casereccio', 'pasticcini', 'torte', 'bakery'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
),
(
  '10000000-0000-4000-8000-000000000002', 'demo-beauty-1', 'Atelier Bellezza', 'Beauty',
  'Centro beauty specializzato in skincare, make-up e trattamenti viso personalizzati.',
  'Centro beauty specializzato in skincare, make-up e trattamenti viso personalizzati. Offriamo servizi completi per il viso, capelli e corpo con prodotti di marca.',
  'Estetica', 'Via Roma 24, Centro', '333 1200456', 'ciao@atelierbellezza.it', '333 1200456', 'www.atelierbellezza.it',
  'beauty.svg', '',
  '{"lunedì":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""},"martedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"12:30","apertura2":"15:00","chiusura2":"19:30"},"mercoledì":{"chiuso":false,"apertura1":"09:00","chiusura1":"12:30","apertura2":"15:00","chiusura2":"19:30"},"giovedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"12:30","apertura2":"15:00","chiusura2":"19:30"},"venerdì":{"chiuso":false,"apertura1":"09:00","chiusura1":"12:30","apertura2":"15:00","chiusura2":"19:30"},"sabato":{"chiuso":false,"apertura1":"09:00","chiusura1":"12:30","apertura2":"15:00","chiusura2":"19:30"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'nome.negozio', '', '', '', '', '', '',
  true, true, true, true, true, false,
  ARRAY['Skincare', 'Make-up', 'Trattamenti viso', 'Consulenza personale'],
  '{"primary":"#db2777","secondary":"#faf5f4","accent":"#f59e0b"}',
  ARRAY['parrucchiere', 'barber', 'estetista', 'trucco', 'make-up', 'skincare', 'viso', 'beauty center'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
),
(
  '10000000-0000-4000-8000-000000000003', 'demo-casa-1', 'Casa Moderna', 'Casa',
  'Showroom di arredo contemporaneo con complementi, luci decorative e consulenza d''interni.',
  'Showroom di arredo contemporaneo con complementi, luci decorative e consulenza d''interni. Mostriamo le ultime tendenze in arredi, illuminazione e design per valorizzare i tuoi spazi.',
  'Arredo', 'Corso Italia 81, Centro', '333 4821907', 'info@casamoderna.it', '333 4821907', 'www.casamoderna.it',
  'casa.svg', '',
  '{"lunedì":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""},"martedì":{"chiuso":false,"apertura1":"10:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"10:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"10:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"10:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"10:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'casamoderna', '', '', '', '', '', '',
  true, true, true, true, true, false,
  ARRAY['Consulenza d''interni', 'Montaggio su misura', 'Consegna e posizionamento'],
  '{"primary":"#059669","secondary":"#f0fdf4","accent":"#d97706"}',
  ARRAY['arredamento', 'mobili', 'interior design', 'decorazioni', 'lampade', 'showroom', 'cucine', 'salotto'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
),
(
  '10000000-0000-4000-8000-000000000004', 'demo-auto-1', 'Auto Point Service', 'Auto',
  'Officina e centro servizi auto per manutenzione, pneumatici, check-up e assistenza rapida.',
  'Officina e centro servizi auto per manutenzione, pneumatici, check-up e assistenza rapida. Offriamo interventi per auto private e professionali con ricambi di marca.',
  'Officina', 'Viale Europa 12, Zona Sud', '333 7745102', 'service@autopoint.it', '333 7745102', 'www.autopointservice.it',
  'auto.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"14:00","chiusura2":"18:30"},"martedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"14:00","chiusura2":"18:30"},"mercoledì":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"14:00","chiusura2":"18:30"},"giovedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"14:00","chiusura2":"18:30"},"venerdì":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"14:00","chiusura2":"18:30"},"sabato":{"chiuso":false,"apertura1":"08:30","chiusura1":"12:30","apertura2":"","chiusura2":""},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'autopointservice', '', '', '', '', '', '',
  true, true, true, true, true, false,
  ARRAY['Tagliando completo', 'Cambio pneumatici', 'Check-up', 'Riparazioni diurne'],
  '{"primary":"#dc2626","secondary":"#fef2f2","accent":"#d97706"}',
  ARRAY['officina', 'meccanico', 'tagliando', 'pneumatici', 'gomme', 'batteria', 'revisione', 'assistenza auto'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
),
(
  '10000000-0000-4000-8000-000000000005', 'demo-salute-1', 'Salus Farma', 'Salute',
  'Farmacia di quartiere con prodotti benessere, parafarmacia e consulenza professionale.',
  'Farmacia di quartiere con prodotti benessere, parafarmacia e consulenza professionale. Aperta tutti i giorni, offriamo servizi di consegna e autoanalisi rapida.',
  'Farmacia', 'Piazza Garibaldi 5, Centro', '333 9081176', 'contatti@salusfarma.it', '333 9081176', 'www.salusfarma.it',
  'salute.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"martedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"","chiusura2":""},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'salusfarma', '', '', '', '', '', '',
  true, true, true, true, true, false,
  ARRAY['Consegna farmaci', 'Autoanalisi rapida', 'Consulenza sanitaria'],
  '{"primary":"#0ea5e9","secondary":"#f0f9ff","accent":"#f59e0b"}',
  ARRAY['farmacia', 'parafarmacia', 'integratori', 'medicinali', 'vitamine', 'autoanalisi', 'salute', 'benessere'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
),
(
  '10000000-0000-4000-8000-000000000006', 'demo-tech-1', 'Tech Lab Store', 'Tech & Elettronica',
  'Negozio di tecnologia con smartphone, accessori, assistenza e configurazioni su misura.',
  'Negozio di tecnologia con smartphone, accessori, assistenza e configurazioni su misura. Offriamo prodotti di ultima generazione e servizi di riparazione per privati e aziende.',
  'Elettronica', 'Via Verdi 37, Centro', '333 6512088', 'hello@techlabstore.it', '333 6512088', 'www.techlabstore.it',
  'elettronica.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"martedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"mercoledì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"giovedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"venerdì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"sabato":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"19:30"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'techlabstore', '', '', '', '', '', '',
  true, true, true, true, true, false,
  ARRAY['Assistenza hardware', 'Configurazione su misura', 'Ricarica batterie', 'Trasferimento dati'],
  '{"primary":"#7c3aed","secondary":"#f5f3ff","accent":"#f59e0b"}',
  ARRAY['smartphone', 'cellulari', 'telefonia', 'computer', 'pc', 'tablet', 'riparazioni', 'accessori tech'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
),
(
  '10000000-0000-4000-8000-000000000007', 'demo-bimbi-1', 'Mondo Bimbi', 'Bimbi & Giocattoli',
  'Articoli per l''infanzia, giochi educativi, idee regalo e prodotti per la scuola.',
  'Articoli per l''infanzia, giochi educativi, idee regalo e prodotti per la scuola. Offriamo articoli selezionati per bimbi e neonati con consigli personalizzati.',
  'Infanzia', 'Via Manzoni 18, Quartiere Nord', '333 3402214', 'info@mondobimbi.it', '333 3402214', 'www.mondobimbi.it',
  'bimbi.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"martedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"mercoledì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"giovedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"venerdì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"sabato":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'mondobimbi', '', '', '', '', '', '',
  true, true, true, true, true, false,
  ARRAY['Consegna a domicilio', 'Packaging regalo', 'Consulenza età', 'Restituzioni gratuite'],
  '{"primary":"#ec4899","secondary":"#fdf2f8","accent":"#f59e0b"}',
  ARRAY['giocattoli', 'bambini', 'infanzia', 'scuola', 'cartoleria', 'zaini', 'regali bimbi', 'prima infanzia'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
),
(
  '10000000-0000-4000-8000-000000000008', 'demo-sport-1', 'Urban Sport Hub', 'Sport & Fitness',
  'Abbigliamento sportivo, accessori training e consulenza per fitness e attività outdoor.',
  'Abbigliamento sportivo, accessori training e consulenza per fitness e attività outdoor. Offriamo prodotti per running, yoga, palestra e sport in al aperto.',
  'Abbigliamento Sportivo', 'Via Torino 55, Zona Ovest', '333 2198740', 'team@urbansporthub.it', '333 2198740', 'www.urbansporthub.it',
  'sport.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"martedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"09:30","chiusura1":"13:00","apertura2":"15:30","chiusura2":"20:00"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'urbansporthub', '', '', '', '', '', '',
  true, true, true, true, true, false,
  ARRAY['Prova a casa', 'Reso gratuito', 'Personalizzazione maglie', 'Spedizione express'],
  '{"primary":"#082f49","secondary":"#f0f9ff","accent":"#d97706"}',
  ARRAY['palestra', 'fitness', 'running', 'yoga', 'pilates', 'abbigliamento sportivo', 'training', 'workout'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
  now(), now()
),
(
  '10000000-0000-4000-8000-000000000009', 'demo-pet-1', 'Amici a Quattro Zampe', 'Pet Shop & Animali',
  'Pet shop con alimentazione, giochi, accessori e servizi dedicati a cane, gatto, cani e gatti.',
  'Pet shop con alimentazione, giochi, accessori e servizi dedicati a cane e gatto. Offriamo prodotti di qualità e servizi di toelettatura per il tuo animale da compagnia.',
  'Animali', 'Via Leopardi 9, Quartiere Est', '333 7614509', 'shop@4zampe.it', '333 7614509', 'www.amicia4zampe.it',
  'pet.svg', '',
  '{"lunedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"martedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"mercoledì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"giovedì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"venerdì":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"sabato":{"chiuso":false,"apertura1":"09:00","chiusura1":"13:00","apertura2":"16:00","chiusura2":"19:30"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', 'amicia4zampe', '', '', '', '', '', '',
  true, true, true, true, true, false,
  ARRAY['Consegna animali', 'Toelettatura completa', 'Visita veterinaria', 'Crocchette personalizzate'],
  '{"primary":"#059669","secondary":"#ecfdf5","accent":"#d97706"}',
  ARRAY['pet shop', 'animali', 'cane', 'gatto', 'cani', 'gatti', 'crocchette', 'toelettatura', 'guinzagli', 'accessori pet'],
  '{}'::jsonb,
  '["informazioni","immagini","prodotti","servizi","contatti","posizione","orari","social","seo","ai","impostazioni"]'::jsonb,
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
  logo_url = excluded.logo_url,
  orari = excluded.orari,
  servizi = excluded.servizi,
  colori = excluded.colori,
  parole_chiave = excluded.parole_chiave,
  attivo = true,
  deleted_at = null;

-- ── Assegna i negozi demo al merchant esistente (coerente con la seed 20260730) ──
update public.negozi
set owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where owner_user_id is null
  and slug like 'demo-%';

-- ───────────────────────────────────────────────────────────────────────────
-- PRODOTTI DEMO — upsert per slug. Il negozio di riferimento viene risolto
-- tramite subquery sullo slug del negozio (robusto anche con UUID differenti).
-- ───────────────────────────────────────────────────────────────────────────

-- Panificio Rossi
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'pane-casereccio', n.id, 'Pane Casereccio', 'Pane casereccio cotto a legna, crosta dorata e mollica soffice. Preparato ogni mattina con lievito madre.',
       'Panificio', 3.50, true, 20, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-panificio-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'cornetti-al-burro', n.id, 'Cornetti al Burro', 'Cornetti artigianali al burro, sfogliati e dorati. Disponibili vuoti o farciti con crema, marmellata e cioccolato.',
       'Panificio', 1.80, true, 30, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-panificio-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

-- Atelier Bellezza (prodotto richiesto dal test acquista-flow)
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'trattamento-glow-viso', n.id, 'Trattamento Glow Viso', 'Trattamento viso completo con pulizia profonda, esfoliazione e maschera illuminante. Effetto glow immediato e duraturo.',
       'Beauty', 39.90, true, 10, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-beauty-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

-- Casa Moderna
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'lampada-da-terra-nordic', n.id, 'Lampada da Terra Nordic', 'Lampada da terra in legno e tessuto, luce calda e diffusione morbida. Design scandinavo per ambienti contemporanei.',
       'Casa', 89.00, true, 5, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-casa-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

-- Auto Point Service
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'tagliando-completo-auto', n.id, 'Tagliando Completo Auto', 'Tagliando completo con cambio olio, filtri, controllo freni e diagnosi elettronica. Include ricambi di marca.',
       'Auto', 120.00, true, 15, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-auto-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

-- Salus Farma
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'integratore-vitamina-d', n.id, 'Integratore Vitamina D', 'Integratore di vitamina D3 ad alta biodisponibilità. 60 capsule, utile per il sostegno del sistema immunitario e delle ossa.',
       'Salute', 14.90, true, 40, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-salute-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

-- Tech Lab Store
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'iphone-16-pro', n.id, 'iPhone 16 Pro', 'Smartphone di ultima generazione con display ProMotion, fotocamera professionale e chip A18 Pro. Colore Titanio.',
       'Tech & Elettronica', 1299.00, true, 8, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-tech-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'smart-tv-55-4k', n.id, 'Smart TV 55" 4K', 'Smart TV 55 pollici 4K Ultra HD con HDR, sistema operativo integrato e telecomando vocale.',
       'Tech & Elettronica', 549.00, true, 6, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-tech-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

-- Mondo Bimbi
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'peluche-orsetto-morbido', n.id, 'Peluche Orsetto Morbido', 'Peluche orsetto extra morbido, adatto dalla nascita. Tessuti certificati e lavabili in lavatrice.',
       'Bimbi & Giocattoli', 19.90, true, 25, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-bimbi-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

-- Urban Sport Hub
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'scarpe-running-pro', n.id, 'Scarpe Running Pro', 'Scarpe da running con ammortizzazione avanzata e suola in gomma ad alta aderenza. Ideali per corsa su strada e tapis roulant.',
       'Sport & Fitness', 129.00, true, 12, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-sport-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

-- Amici a Quattro Zampe
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, prezzo, attivo, quantita_disponibile, origine_pubblicazione, created_at, updated_at)
select 'crocchette-premium-cane', n.id, 'Crocchette Premium Cane', 'Crocchette premium per cani adulti, con pollo e riso. Ricette bilanciate senza coloranti artificiali.',
       'Pet Shop & Animali', 24.50, true, 30, 'manuale', now(), now()
from public.negozi n where n.slug = 'demo-pet-1'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  prezzo = excluded.prezzo, attivo = true;

notify pgrst, 'reload schema';

commit;
