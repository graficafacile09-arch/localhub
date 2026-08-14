-- ═══════════════════════════════════════════════════════════════════════
-- 20260828_categorie_negozi_estese.sql
--
-- Elenco ESTESO e professionale delle categorie negozio per l'Editor.
--
-- PRINCIPIO:
--   - ADDITIVO: NON elimina le categorie già esistenti (nessun negozio
--     esistente viene "orfanizzato", nessun riferimento rotto).
--   - Idempotente: `on conflict (slug) do nothing` → ri-eseguibile.
--   - La colonna `negozi.categoria` resta testo libero: una categoria
--     personalizzata scritta a mano dal commerciante viene salvata e mostrata
--     esattamente come una categoria predefinita (vedi lib/categorie-negozio.ts).
--   - Le categorie già presenti nel catalogo (stesso slug) non vengono
--     duplicate: il conflitto su `slug` le lascia invariate.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO public.categorie (nome, slug, sinonimi, ordine) VALUES
  -- 01 — Moda & persona
  ('Abbigliamento',            'abbigliamento',              ARRAY['moda','boutique','fashion','vestiti','outfit','elegante'],           100),
  ('Calzature',                'calzature',                  ARRAY['scarpe','footwear','sneakers','sandali','stivali'],                 101),
  ('Accessori',                'accessori',                  ARRAY['borse','cinture','cappelli','occhiali','bijoux'],                   102),
  ('Gioielleria',              'gioielleria',                ARRAY['gioielli','orologeria','oro','argento','pietre preziose'],         103),
  ('Oreficeria',               'oreficeria',                 ARRAY['orafo','orefice','gioielli','gioielleria','oro'],                   104),
  ('Profumeria',               'profumeria',                 ARRAY['profumi','fragranze','cosmesi','cosmetica','bellezza'],            105),
  ('Cosmetica',                'cosmetica',                  ARRAY['cosmesi','makeup','make-up','trucco','skincare','bellezza'],        106),
  ('Ottica',                   'ottica',                     ARRAY['occhiali','ottico','lenti','lenti a contatto','vista'],            107),
  ('Pelletteria',              'pelletteria',                ARRAY['pelle','borse','valigeria','cuoio','cinture'],                     108),
  ('Intimo',                   'intimo',                     ARRAY['biancheria','lingerie','pigiameria','calze','costumi'],            109),

  -- 02 — Sport & tempo libero
  ('Sport',                    'sport',                      ARRAY['abbigliamento sportivo','attrezzatura sportiva','running','outdoor'], 110),

  -- 03 — Tech
  ('Elettronica',              'elettronica',                ARRAY['tech','tecnologia','gadget','elettronica di consumo'],             111),
  ('Informatica',              'informatica',                ARRAY['computer','pc','software','assistenza informatica','periferiche'], 112),
  ('Telefonia',                'telefonia',                  ARRAY['telefoni','cellulari','smartphone','riparazione cellulari'],       113),
  ('Elettrodomestici',         'elettrodomestici',           ARRAY['elettrodomestico','grandi elettrodomestici','piccoli elettrodomestici','cucina'], 114),

  -- 04 — Casa & fai da te
  ('Casa',                     'casa',                       ARRAY['arredo','arredamento','mobili','decorazioni','cucina'],            115),
  ('Arredamento',              'arredamento',                ARRAY['arredo','mobili','design','interior','decorazioni'],               116),
  ('Mobili',                   'mobili',                     ARRAY['mobilio','arredamento','armadi','cucine','complementi'],          117),
  ('Illuminazione',            'illuminazione',              ARRAY['lampade','lampadari','luci','plafoniere','lampade a led'],         118),
  ('Ferramenta',               'ferramenta',                 ARRAY['utensili','attrezzi','ferramenta e utensileria','bricolage'],      119),
  ('Edilizia',                 'edilizia',                   ARRAY['materiali edili','costruzioni','cemento','mattoni','impresa edile'], 120),
  ('Fai da te',                'fai-da-te',                  ARRAY['bricolage','diy','hobbistica','utensileria','giardinaggio'],       121),

  -- 05 — Auto & moto
  ('Auto',                     'auto',                       ARRAY['officina','meccanico','gomme','pneumatici','concessionaria'],      122),
  ('Moto',                     'moto',                       ARRAY['motocicli','scooter','moto d''epoca','officina moto'],             123),
  ('Ricambi auto',             'ricambi-auto',               ARRAY['ricambi','autoricambi','parti auto','pezzi di ricambio'],          124),
  ('Biciclette',               'biciclette',                 ARRAY['bici','cicli','ciclista','ebike','riparazione bici'],             125),

  -- 06 — Alimentari & ristorazione
  ('Alimentari',               'alimentari',                 ARRAY['generi alimentari','drogheria','alimenti','minimarket'],          126),
  ('Supermercato',             'supermercato',               ARRAY['spesa','gdo','market','ipermercato','discount'],                  127),
  ('Macelleria',               'macelleria',                 ARRAY['macellaio','carne','salumi','bovino','pollame'],                  128),
  ('Pescheria',                'pescheria',                  ARRAY['pesce','frutti di mare','pescivendolo','crostacei'],              129),
  ('Panetteria',               'panetteria',                 ARRAY['panificio','forno','pane','pizza','focaccia'],                    130),
  ('Pasticceria',              'pasticceria',                ARRAY['pasticcere','dolci','torte','cake','dessert'],                    131),
  ('Gelateria',                'gelateria',                  ARRAY['gelato','gelati','gelataio','sorbetti'],                          132),
  ('Gastronomia',              'gastronomia',                ARRAY['rosticceria','tavola calda','piatti pronti','catering','delicatessen'], 133),
  ('Enoteca',                  'enoteca',                    ARRAY['vini','vino','cantina','vinoteca','degustazione'],                134),
  ('Bar',                      'bar',                        ARRAY['caffetteria','caffe','caffè','colazione','aperitivo'],            135),
  ('Ristorante',               'ristorante',                 ARRAY['trattoria','osteria','cucina','tavola calda'],                    136),
  ('Pizzeria',                 'pizzeria',                   ARRAY['pizza','pizzeria al taglio','focaccia'],                          137),
  ('Pub',                      'pub',                        ARRAY['birreria','birra','brewpub','pub e birreria'],                    138),

  -- 07 — Natura & animali
  ('Agricoltura',              'agricoltura',                ARRAY['azienda agricola','prodotti agricoli','fattoria','campagna'],     139),
  ('Fiori e piante',           'fiori-e-piante',             ARRAY['fioraio','fiori','florist','piante','giardino'],                  140),
  ('Animali e pet shop',       'animali-e-pet-shop',         ARRAY['pet','animali','cane','gatto','veterinario','crocchette'],       141),

  -- 08 — Salute & benessere
  ('Farmacia',                 'farmacia',                   ARRAY['parafarmacia','pharmacy','farmacista','medicinale'],              142),
  ('Parafarmacia',             'parafarmacia',               ARRAY['farmacia','integratori','benessere','cosmetici','sanitaria'],     143),
  ('Salute e benessere',       'salute-e-benessere',         ARRAY['salute','benessere','wellness','centro benessere','spa'],         144),
  ('Parrucchiere',             'parrucchiere',               ARRAY['parrucchiera','hair','hairstylist','capelli','acconciature'],     145),
  ('Barbiere',                 'barbiere',                   ARRAY['barber','barbershop','barba','rasatura','capelli'],              146),
  ('Estetica',                 'estetica',                   ARRAY['estetista','centro estetico','trattamenti','bellezza','unghie'],  147),
  ('Palestre e fitness',       'palestre-e-fitness',         ARRAY['palestra','fitness','gym','yoga','pilates','crossfit'],           148),

  -- 09 — Turismo & ospitalità
  ('Turismo',                  'turismo',                    ARRAY['agenzia turistica','tour','escursioni','vacanze'],                149),
  ('Hotel',                    'hotel',                      ARRAY['albergo','residence','struttura ricettiva','pernottamento'],      150),
  ('B&B',                      'bed-and-breakfast',          ARRAY['b&b','bed and breakfast','affittacamere','guest house'],          151),
  ('Agenzia immobiliare',      'agenzia-immobiliare',        ARRAY['immobiliare','agenzia immobili','case','vendita','affitto'],      152),
  ('Agenzia viaggi',           'agenzia-viaggi',             ARRAY['agenzia di viaggio','viaggi','biglietti','tour operator'],       153),

  -- 10 — Servizi & professioni
  ('Servizi professionali',    'servizi-professionali',      ARRAY['professionisti','consulenza','servizi','attivita professionali'], 154),
  ('Studi professionali',      'studi-professionali',        ARRAY['studio','avvocato','commercialista','architetto','ingegnere'],   155),
  ('Assicurazioni',            'assicurazioni',              ARRAY['assicurazione','agenzia assicurativa','polizze','rc auto'],       156),
  ('Banche e servizi finanziari', 'banche-e-servizi-finanziari', ARRAY['banca','istituto di credito','finanza','finanziaria','consulente finanziario'], 157),

  -- 11 — Artigianato & creatività
  ('Artigianato',              'artigianato',                ARRAY['artigiano','manufatti','fatto a mano','bottega'],                 158),
  ('Fotografia',               'fotografia',                 ARRAY['fotografo','studio fotografico','servizi fotografici','ritratti'], 159),
  ('Grafica e comunicazione',  'grafica-e-comunicazione',    ARRAY['grafica','comunicazione','design grafico','agenzia comunicazione','stampa digitale'], 160),
  ('Stampa',                   'stampa',                     ARRAY['tipografia','stamperia','stampa digitale','cartotecnica','copisteria'], 161),

  -- 12 — Shopping & regali
  ('Regali',                   'regali',                     ARRAY['bomboniere','articoli da regalo','gift','pensieri'],               162),
  ('Giocattoli',               'giocattoli',                 ARRAY['giochi','giocattolo','bambini','infanzia','neonati'],             163),
  ('Libreria',                 'libreria',                   ARRAY['libri','libreria cartoleria','bookstore','editoria'],             164),
  ('Cartoleria',               'cartoleria',                 ARRAY['cancelleria','scuola','ufficio','forniture'],                     165),
  ('Musica e strumenti musicali', 'musica-e-strumenti-musicali', ARRAY['strumenti musicali','dischi','negozio di musica','scuola di musica'], 166),
  ('Cultura e intrattenimento','cultura-e-intrattenimento',  ARRAY['eventi','spettacolo','teatro','cinema','museo','tempo libero'],   167),

  -- 13 — Servizi
  ('Servizi alla persona',     'servizi-alla-persona',       ARRAY['servizi personali','lavanderia','sartoria','centro servizi'],      168),
  ('Servizi per aziende',      'servizi-per-aziende',        ARRAY['servizi b2b','consulenza aziendale','imprese','servizi imprese'],  169),

  -- 14 — Altro
  ('Altro',                    'altro',                      ARRAY['generico','varie','servizi'],                                      170)
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
