begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED — Prodotti del Pollino acquistabili (schede complete)
--
-- Completa la vetrina territoriale già avviata da
-- 2026091202_seed_prodotti_tipici.sql: porta a catalogo i 53 prodotti della
-- selezione demo (47 alimentari + 6 vini) descritti in
-- docs/eccellenze-calabresi-catalogo.md (sez. 12.1 e 12.2) e nelle schede
-- docs/schede-vini-calabria.md.
--
-- Idempotente e non distruttiva: upsert per slug (indice parziale
-- prodotti_slug_unique_idx / negozi_slug_unique_idx). Nessun DELETE.
-- Stesse colonne, stesso formato di descrizione e stessa grafica dei prodotti
-- già a catalogo (ProductCard per la vetrina, /prodotto/[slug] per la scheda).
--
-- Regole del demo rispettate: solo denominazioni reali e verificabili
-- (DOP/IGP/PAT solo dove esistono), nessun nome di azienda o marchio,
-- nessuna certificazione aggiunta, esclusivamente area del Pollino.
-- I testi usano il dollar-quoting ($$testo$$) così gli apostrofi italiani
-- non richiedono escaping.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) NEGOZIO DEMO — Enoteca del Pollino
--    Stesse 35 colonne, stesso blocco orari, stessi colori, stessi moduli
--    attivi degli altri negozi demo: la pagina negozio e le card prodotto
--    risultano identiche a quelle esistenti.
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
  '20000000-0000-4000-8000-000000000004',
  'demo-enoteca-pollino',
  'Enoteca del Pollino – DEMO',
  'Enoteca',
  'Enoteca DEMO dedicata ai vini dell''area del Pollino: le sottozone di Terre di Cosenza e il Moscato al governo di Saracena. Ambiente dimostrativo, non un''attività reale aderente a LocalHub.',
  'Vini del territorio',
  'Via delle Cantine 4, Castrovillari (CS)',
  '333 1000104',
  'demo@localhub.it',
  '333 1000104',
  'www.localhub.it',
  'panificio.png',
  '',
  '{"lunedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"martedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"mercoledì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"giovedì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"venerdì":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"sabato":{"chiuso":false,"apertura1":"08:30","chiusura1":"13:00","apertura2":"16:00","chiusura2":"20:00"},"domenica":{"chiuso":true,"apertura1":"","chiusura1":"","apertura2":"","chiusura2":""}}',
  '', '', '', '',
  'Castrovillari', '87012', 'CS', '', true, true, true, true, true, false,
  ARRAY['Vini del territorio', 'Abbinamenti', 'Prodotti tipici'],
  '{"primary":"#2563eb","secondary":"#f8fafc","accent":"#f59e0b"}',
  ARRAY['enoteca', 'vino', 'vini', 'pollino', 'terre di cosenza', 'verbicaro', 'moscato', 'saracena', 'castrovillari'],
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

update public.negozi
set is_demo = true,
    owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where slug = 'demo-enoteca-pollino';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) PRODOTTI ALIMENTARI (47) — distribuiti sui tre negozi demo esistenti
--    Bottega del Pollino = freschi, conserve, formaggi, salumi, pasta
--    Terre del Pollino  = miele, olio, frutta secca, funghi, dispensa
--    Sapori di Castrovillari = pane e dolci tradizionali
--
--    L'immagine è indicata con l'id Pexels e composta nell'URL, come fa
--    lib/prodotti-immagini.ts: stessa foto 600x600 per tutte le schede.
-- ───────────────────────────────────────────────────────────────────────────

with dati (slug, negozio_slug, nome, categoria, sottocategoria, prezzo, quantita, img, descrizione, descrizione_completa) as (
  values
  ($$melanzana-rossa-rotonda-dop$$, $$demo-bottega-pollino$$, $$Melanzana Rossa di Rotonda DOP$$, $$Alimentari$$, $$Verdure$$, 4.50, 30, 15442015,
   $$Ortaggio DOP dell'area di Rotonda, polpa compatta e sapore dolce. Venduta al kg.$$,
   $$La Melanzana Rossa di Rotonda è un ortaggio a denominazione di origine protetta coltivato nel versante del Pollino che guarda la valle del Lao, a pochi chilometri da Castrovillari. Ha buccia sottile, polpa chiara e pochi semi, quindi regge bene la cottura al forno e la frittura. In cucina è la base della parmigiana e degli involtini, oppure si conserva sott'olio per l'inverno. Prezzo indicativo al chilogrammo.$$),
  ($$peperone-di-senise-igp-fresco$$, $$demo-bottega-pollino$$, $$Peperone di Senise IGP (fresco)$$, $$Alimentari$$, $$Verdure$$, 8.00, 25, 15442015,
   $$Peperone IGP dolce e dalla buccia sottile, ideale per peperonata e ripieni. Al kg.$$,
   $$Il Peperone di Senise ha indicazione geografica protetta e matura tra agosto e ottobre nella valle del Sinni, alle porte del Pollino. La buccia è sottile, la forma allungata e il sapore dolce: si presta alla peperonata, ai ripieni e alle conserve di famiglia. Consumato fresco oppure essiccato diventa il Crusco. Prezzo indicativo al chilogrammo.$$),
  ($$crusco-di-senise-in-polvere$$, $$demo-bottega-pollino$$, $$Crusco di Senise (in polvere)$$, $$Alimentari$$, $$Dispensa$$, 10.00, 40, 15442015,
   $$Peperone di Senise IGP essiccato e macinato: il condimento piccante della tradizione.$$,
   $$Il Crusco è il Peperone di Senise IGP essiccato al sole e poi tostato in forno; qui lo trovi già macinato in polvere, pronto da usare. L'aroma parte dolce e chiude piccante, e si sposa con pasta e legumi, uova e carne alla brace. Una spolverata basta a dare carattere a un piatto di lenticchie o a una pasta e fagioli. Confezione da 100 g.$$),
  ($$pomodoro-costoluto-pollino$$, $$demo-bottega-pollino$$, $$Pomodoro Costoluto del Pollino$$, $$Alimentari$$, $$Verdure$$, 4.00, 35, 15442015,
   $$Pomodoro da salsa, polpa densa e pochi semi. Venduto al kg.$$,
   $$Il costoluto è la varietà che le famiglie del Pollino coltivano per la salsa di fine estate. La polpa è carnosa e zuccherina, con pochi semi, e si restringe bene sul fuoco: ottimo per conserve, passate e insalate di pomodoro. Si raccoglie tra luglio e agosto nei campi del territorio. Prezzo indicativo al chilogrammo.$$),
  ($$lenticchia-di-mormanno$$, $$demo-bottega-pollino$$, $$Lenticchia di Mormanno$$, $$Alimentari$$, $$Legumi$$, 7.50, 45, 15442015,
   $$Lenticchia minuta dell'altopiano di Mormanno, cuoce in pochi minuti.$$,
   $$La lenticchia di Mormanno cresce sull'altopiano che chiude il Pollino, dove l'aria fresca e i terreni drenanti danno un legume minuto e dalla buccia sottile. Cuoce in una ventina di minuti senza ammollo e non si sfalda: ideale per zuppe, contorni e polpette di legumi. Confezione da 500 g.$$),
  ($$fagioli-bianchi-rotonda-dop$$, $$demo-bottega-pollino$$, $$Fagioli Bianchi di Rotonda DOP$$, $$Alimentari$$, $$Legumi$$, 8.00, 40, 15442015,
   $$Fagiolo bianco DOP dall'area di Rotonda, buccia fine e sapore delicato.$$,
   $$I Fagioli Bianchi di Rotonda sono un legume a denominazione di origine protetta coltivato nel territorio di Rotonda, nel cuore del Pollino. Il seme è bianco e allungato, la buccia sottile: cuoce in modo uniforme e addensa il brodo. Sono la base di pasta e fagioli, zuppe e contorni in umido. Confezione da 500 g.$$),
  ($$asparagi-selvatici-pollino$$, $$demo-bottega-pollino$$, $$Asparagi selvatici del Pollino$$, $$Alimentari$$, $$Verdure$$, 12.00, 15, 15442015,
   $$Asparagi di campo raccolti in primavera, amari al punto giusto. Al kg.$$,
   $$Gli asparagi selvatici si raccolgono tra marzo e maggio nei pascoli e ai margini dei boschi del Pollino. Sono sottili, con un amaro vegetale che si addolcisce in padella: ottimi per frittate, risotti, primi con la salsiccia o conservati sott'olio. Prodotto di raccolta, disponibile solo in stagione. Prezzo indicativo al chilogrammo.$$),
  ($$broccoli-del-pollino$$, $$demo-bottega-pollino$$, $$Broccoli del Pollino$$, $$Alimentari$$, $$Verdure$$, 4.00, 22, 15442015,
   $$Broccoli del periodo natalizio, da lessare e ripassare in padella. Al kg.$$,
   $$I broccoli del Pollino arrivano sul mercato con il freddo, tra novembre e febbraio, ed è il contorno delle tavole natalizie. Le infiorescenze sono compatte e il sapore più dolce di quello del cavolfiore: si lessano e si ripassano con olio e peperoncino, oppure si abbinano alle orecchiette. Prezzo indicativo al chilogrammo.$$),
  ($$finocchietto-selvatico-pollino$$, $$demo-bottega-pollino$$, $$Finocchietto selvatico del Pollino$$, $$Alimentari$$, $$Aromi$$, 5.50, 20, 15442015,
   $$Foglioline e semi di finocchietto per pasta, salsicce e verdure al forno.$$,
   $$Il finocchietto selvatico cresce spontaneo lungo i sentieri del Pollino e si raccoglie da marzo a novembre. Le foglie hanno un profumo di anice che resta anche dopo l'essiccazione: si usa per la pasta con le sarde, per aromatizzare le salsicce e per insaporire le verdure al forno. Confezione da 50 g di prodotto essiccato.$$),
  ($$origano-selvatico-pollino$$, $$demo-bottega-pollino$$, $$Origano selvatico del Pollino$$, $$Alimentari$$, $$Aromi$$, 6.00, 25, 15442015,
   $$Origano raccolto a mano sulle alture del Pollino ed essiccato all'ombra.$$,
   $$L'origano del Pollino si raccoglie in piena estate, quando la pianta è più aromatica, e si essicca all'ombra per trattenere gli oli essenziali. Il profumo è più intenso di quello del prodotto commerciale: basta poco per condire pomodori, carni alla brace e verdure grigliate. Confezione da 30 g.$$),
  ($$peperoncino-vamp-i-fuc-cerchiara$$, $$demo-bottega-pollino$$, $$Peperoncino "Vamp i fuc" di Cerchiara$$, $$Alimentari$$, $$Aromi$$, 7.00, 18, 15442015,
   $$Peperoncino piccante di Cerchiara di Calabria, fresco o da essiccare. Al kg.$$,
   $$«Vamp i fuc» è il nome dialettale del peperoncino coltivato a Cerchiara di Calabria, borgo ai piedi del Pollino: piccolo, conico e molto piccante. Si raccoglie da agosto a ottobre e si usa fresco per l'olio aromatizzato, oppure appeso a essiccare per l'inverno. Prezzo indicativo al chilogrammo.$$),
  ($$pomodori-secchi-sott-olio-pollino$$, $$demo-bottega-pollino$$, $$Pomodori secchi sott'olio del Pollino$$, $$Alimentari$$, $$Dispensa$$, 9.00, 28, 12181051,
   $$Pomodori essiccati al sole e conservati in olio: per antipasti e bruschette.$$,
   $$I pomodori vengono essiccati al sole, poi ammorbiditi e conservati in olio di oliva con origano e peperoncino. Il sapore è concentrato e la consistenza carnosa: si servono sui crostini, si aggiungono alla pasta o farciscono una focaccia. Vasetto da 280 g.$$),
  ($$melanzane-sott-olio-pollino$$, $$demo-bottega-pollino$$, $$Melanzane sott'olio del Pollino$$, $$Alimentari$$, $$Dispensa$$, 9.00, 26, 12181051,
   $$Melanzane a fette conservate in olio, pronte per l'antipasto.$$,
   $$Le melanzane vengono affettate sottili, lasciate perdere l'acqua amara e conservate in olio di oliva con aglio e peperoncino. Sono un antipasto pronto da portare in tavola con il pane, ma stanno bene anche su una bruschetta o accanto a un tagliere di formaggi. Vasetto da 280 g.$$),
  ($$funghi-porcini-sott-olio$$, $$demo-bottega-pollino$$, $$Funghi porcini sott'olio$$, $$Alimentari$$, $$Dispensa$$, 11.50, 20, 12181051,
   $$Porcini del Pollino conservati in olio, per crostini e condimenti.$$,
   $$I porcini raccolti nei boschi del Pollino vengono puliti, sbollentati e conservati in olio di oliva. Mantengono il profumo del bosco e si usano sui crostini caldi, per condire una pasta o per arricchire un sugo di carne. Vasetto da 180 g.$$),
  ($$olive-nere-salamoia-pollino$$, $$demo-bottega-pollino$$, $$Olive nere in salamoia del Pollino$$, $$Alimentari$$, $$Dispensa$$, 8.00, 30, 12181051,
   $$Olive nere degli oliveti del Pollino, in salamoia. Per antipasti e pizza.$$,
   $$Sono le olive nere degli oliveti che coprono le colline del Pollino, raccolte a maturazione e messe in salamoia con acqua, sale ed erbe. La polpa è soda e il sapore pieno, leggermente amaro: si servono come antipasto, sulla pizza o in un'insalata. Vasetto da 400 g.$$),
  ($$peperoncino-vamp-i-fuc-in-olio$$, $$demo-bottega-pollino$$, $$Peperoncino "Vamp i fuc" in olio$$, $$Alimentari$$, $$Dispensa$$, 7.50, 24, 12181051,
   $$Peperoncino di Cerchiara in olio di oliva: condimento piccante pronto.$$,
   $$Il peperoncino «Vamp i fuc» di Cerchiara di Calabria viene affettato fresco e coperto di olio di oliva, così il piccante si distribuisce senza prevaricare. Si usa a crudo su pasta e legumi, sulle uova o su una bruschetta con i pomodori. Bottiglietta da 200 ml.$$),
  ($$giardiniera-di-verdure-pollino$$, $$demo-bottega-pollino$$, $$Giardiniera di verdure del Pollino$$, $$Alimentari$$, $$Dispensa$$, 7.50, 22, 12181051,
   $$Verdure di stagione in agrodolce, contorno e antipasto.$$,
   $$La giardiniera raccoglie le verdure dell'orto del Pollino — carote, peperoni, zucchine, cipolline — tagliate e conservate in agrodolce con aceto e spezie. Croccante e fresca, accompagna i salumi, un tagliere di formaggi o una grigliata. Vasetto da 350 g.$$),
  ($$mischiglio-pat$$, $$demo-bottega-pollino$$, $$Mischiglio PAT$$, $$Alimentari$$, $$Pasta e farine$$, 4.00, 35, 10907746,
   $$Pasta rustica di farine miste, tradizionale delle tavole del Pollino.$$,
   $$Il mischiglio è una pasta rustica preparata con farine miste di grano e legumi, lavorata a mano e tagliata grossolanamente. Ha una consistenza ruvida che trattiene il condimento e si usa nelle minestre, con i fagioli o con un semplice sugo di pomodoro e salsiccia. Confezione da 500 g.$$),
  ($$farina-di-grani-antichi-pollino$$, $$demo-bottega-pollino$$, $$Farina di grani antichi del Pollino$$, $$Alimentari$$, $$Pasta e farine$$, 4.50, 40, 10907746,
   $$Farina macinata da grani antichi coltivati nel territorio.$$,
   $$È la farina macinata da varietà di grano coltivate da generazioni nei campi del Pollino, macinate a pietra per conservare il germe. Ha un colore più scuro e un profumo di grano tostato: si usa per pane, pasta fresca e pizza, con un impasto che richiede più acqua. Confezione da 1 kg.$$),
  ($$caciocavallo-silano-dop$$, $$demo-bottega-pollino$$, $$Caciocavallo Silano DOP$$, $$Alimentari$$, $$Formaggi$$, 16.00, 20, 10907746,
   $$Formaggio DOP a pasta filata, stagionato: da gratinare o alla piastra. Al kg.$$,
   $$Il Caciocavallo Silano è un formaggio a denominazione di origine protetta a pasta filata, prodotto con latte vaccino e stagionato a coppie legate. La zona di produzione comprende il versante del Pollino: la pasta è compatta, il sapore va dal dolce del fresco al piccante del molto stagionato. Si taglia a fette per la piastra, si gratinano i primi piatti o si porta in tavola sul tagliere. Prezzo indicativo al chilogrammo.$$),
  ($$pecorino-pollino-pat$$, $$demo-bottega-pollino$$, $$Pecorino del Pollino PAT$$, $$Alimentari$$, $$Formaggi$$, 19.00, 18, 10907746,
   $$Pecorino di latte ovino stagionato, sapore pieno e sapido. Al kg.$$,
   $$Il pecorino del Pollino è un formaggio tradizionale riconosciuto come prodotto agroalimentare tradizionale: latte di pecora degli allevamenti del massiccio, caglio e stagionatura in ambiente fresco. La pasta è granulosa e il sapore pieno, con una nota sapida che cresce con i mesi. Si serve con il miele di castagno, si grattugia sui primi o si abbina al Moscato al governo di Saracena. Prezzo indicativo al chilogrammo.$$),
  ($$caprino-di-morano$$, $$demo-bottega-pollino$$, $$Caprino di Morano$$, $$Alimentari$$, $$Formaggi$$, 15.00, 16, 10907746,
   $$Formaggio di capra di Morano Calabro, fresco e dal sapore deciso. Al kg.$$,
   $$Il caprino di Morano Calabro nasce dal latte delle capre che pascolano sui rilievi del Pollino, tra il borgo e il massiccio. Ha pasta bianca e morbida, con un sapore acidulo e una nota di latte crudo che si sente subito. Si mangia fresco sui crostini, in insalata o con un filo di olio; con qualche settimana di stagionatura diventa più asciutto e piccante. Prezzo indicativo al chilogrammo.$$),
  ($$felciata-di-morano-pat$$, $$demo-bottega-pollino$$, $$Felciata di Morano PAT$$, $$Alimentari$$, $$Formaggi$$, 15.00, 12, 10907746,
   $$Formaggio tradizionale avvolto nelle felci, dal profilo erbaceo. Al kg.$$,
   $$La felciata è un formaggio tradizionale di Morano Calabro riconosciuto come prodotto agroalimentare tradizionale: durante la stagionatura le forme vengono avvolte nelle foglie di felce, che proteggono la crosta e le lasciano un profumo vegetale. Il sapore è intenso, con note di erba e di sottobosco. Si serve a fette sottili come secondo piatto o su un tagliere con il pane di Cerchiara. Prezzo indicativo al chilogrammo.$$),
  ($$ricotta-affumicata-pollino$$, $$demo-bottega-pollino$$, $$Ricotta affumicata del Pollino$$, $$Alimentari$$, $$Formaggi$$, 12.00, 20, 10907746,
   $$Ricotta di latte ovino affumicata, ideale per ripieni e ravioli. Al kg.$$,
   $$La ricotta del Pollino viene lavorata con il siero del latte di pecora e poi affumicata, così la superficie si colora e il profumo di legna si lega al sapore dolce del latte. Si grattugia sui primi, si usa per il ripieno dei ravioli o si serve a scaglie con i fichi. Prezzo indicativo al chilogrammo.$$),
  ($$cacioricotta-pollino$$, $$demo-bottega-pollino$$, $$Cacioricotta del Pollino$$, $$Alimentari$$, $$Formaggi$$, 14.00, 15, 10907746,
   $$Formaggio estivo di latte di capra e pecora, da tavola o da grattugia. Al kg.$$,
   $$La cacioricotta nasce in estate, quando il latte delle greggi è più scarso: si lavora il latte di capra e di pecora con il caglio e si stagiona la forma fino a farla diventare asciutta. Il sapore è intenso e leggermente piccante; si taglia a scaglie sul tagliere oppure si grattugia sulla pasta al forno. Prezzo indicativo al chilogrammo.$$),
  ($$moretto-del-pollino$$, $$demo-bottega-pollino$$, $$Moretto del Pollino$$, $$Alimentari$$, $$Funghi$$, 17.00, 14, 10907746,
   $$Fungo di sottobosco della macchia mediterranea, da contorno e da condimento. Al kg.$$,
   $$Il moretto è un fungo di sottobosco che cresce nella macchia mediterranea e nei boschi radi del Pollino, dove si raccoglie in autunno. Ha cappello bruno e carne soda, con profumo di terra e un sapore pieno che regge la cottura: si cucina trifolato in padella con aglio e prezzemolo, si aggiunge al ragù o si conserva sott'olio. Si serve come contorno o per condire la pasta. Prezzo indicativo al chilogrammo.$$),
  ($$giuncata-del-pollino$$, $$demo-bottega-pollino$$, $$Giuncata del Pollino$$, $$Alimentari$$, $$Formaggi$$, 10.00, 10, 10907746,
   $$Latte cagliato fresco, dolce e senza stagionatura: primavera. Al kg.$$,
   $$La giuncata è il formaggio fresco per eccellenza: latte cagliato e lasciato sgocciolare in un cestino di giunco, senza stagionatura. Ha consistenza morbida, sapore dolce di latte e va consumata in pochi giorni. Si serve con il miele millefiori, con le confetture del Pollino o con una spolverata di pepe. Prezzo indicativo al chilogrammo.$$),
  ($$guanciale-del-pollino$$, $$demo-bottega-pollino$$, $$Guanciale del Pollino$$, $$Alimentari$$, $$Salumi$$, 14.00, 20, 10907746,
   $$Guanciale di suino stagionato, base del soffritto e dei sughi. Al kg.$$,
   $$Il guanciale si ricava dalla guancia del suino, salata e stagionata con pepe nero. È il grasso che dà avvio a un soffritto: si scioglie in padella e lascia il fondo saporito per sughi, zuppe e legumi. Si taglia a listarelle e si consuma cotto. Prezzo indicativo al chilogrammo.$$),
  ($$soppressata-del-pollino$$, $$demo-bottega-pollino$$, $$Soppressata del Pollino$$, $$Alimentari$$, $$Salumi$$, 15.00, 25, 10907746,
   $$Salume di suino a grana grossa, da tagliere e da panino. Al kg.$$,
   $$La soppressata è il salume che si prepara con il freddo, macinando la carne di suino a grana grossa con pepe e peperoncino, poi pressata e stagionata. Il sapore è pieno e leggermente piccante, la fetta compatta. Si serve sul tagliere con le olive nere, sulla pizza o in un panino con il caciocavallo. Prezzo indicativo al chilogrammo.$$),
  ($$capocollo-del-pollino$$, $$demo-bottega-pollino$$, $$Capocollo del Pollino$$, $$Alimentari$$, $$Salumi$$, 17.00, 18, 10907746,
   $$Salume di capocollo stagionato, dolce e profumato. Al tagliere. Al kg.$$,
   $$Il capocollo si ricava dal muscolo del collo del suino, insaporito con sale e pepe e stagionato a lungo. La fetta è rosata, il sapore dolce e il profumo speziato: è il salume da mettere al centro del tagliere, con il pane di Cerchiara e un bicchiere di rosato del Pollino. Prezzo indicativo al chilogrammo.$$),
  ($$salsiccia-del-pollino$$, $$demo-bottega-pollino$$, $$Salsiccia del Pollino$$, $$Alimentari$$, $$Salumi$$, 11.50, 30, 10907746,
   $$Salsiccia di suino al finocchietto, da brace o da sugo. Al kg.$$,
   $$La salsiccia del Pollino si prepara con carne di suino macinata, sale, pepe e semi di finocchietto selvatico. Si cuoce alla brace, in padella con i broccoli o sbriciolata in un sugo per la pasta. Il finocchietto le dà un profumo di anice che la distingue dalle salsicce comuni. Prezzo indicativo al chilogrammo.$$),
  ($$pancetta-del-pollino$$, $$demo-bottega-pollino$$, $$Pancetta del Pollino$$, $$Alimentari$$, $$Salumi$$, 12.00, 22, 10907746,
   $$Pancetta stagionata a cubetti o a fette, per sughi e bruschette. Al kg.$$,
   $$La pancetta si ricava dal ventre del suino, salata e stagionata con pepe e aromi. Tagliata a cubetti è l'avvio di un soffritto per i legumi e per la pasta; a fette sottili diventa un antipasto con il pane caldo. Prezzo indicativo al chilogrammo.$$),
  ($$agnello-del-pollino$$, $$demo-bottega-pollino$$, $$Agnello del Pollino$$, $$Alimentari$$, $$Carni$$, 17.00, 12, 10907746,
   $$Carne di agnello degli allevamenti del Pollino, per arrosto e ragù. Al kg.$$,
   $$L'agnello del Pollino arriva dagli allevamenti che ancora portano le greggi sui pascoli del massiccio, con carne magra e sapore deciso. Si cucina al forno con le patate, alla brace a pezzi, oppure in un ragù bianco da servire con il mischiglio. Con il Terre di Cosenza DOC Pollino Rosso è l'abbinamento classico. Prezzo indicativo al chilogrammo.$$),
  ($$capretto-del-pollino$$, $$demo-bottega-pollino$$, $$Capretto del Pollino$$, $$Alimentari$$, $$Carni$$, 17.00, 12, 10907746,
   $$Carne di capretto da arrosto o in umido, tipica della primavera. Al kg.$$,
   $$Il capretto è la carne delle feste di primavera nel Pollino: più saporita e asciutta dell'agnello, va bene arrostita al forno con le erbe o cucinata in umido con il pomodoro. Le ossa danno un brodo robusto per le minestre. Prezzo indicativo al chilogrammo.$$),
  ($$cinghiale-del-pollino$$, $$demo-bottega-pollino$$, $$Cinghiale del Pollino$$, $$Alimentari$$, $$Carni$$, 15.00, 10, 10907746,
   $$Carne di cinghiale da umido e ragù, nel periodo autunno-inverno. Al kg.$$,
   $$Il cinghiale vive nei boschi del Pollino e la sua carne, scura e magra, si cucina a lungo: in umido con il vino, in ragù per la pasta o marinata con le erbe di montagna. È il piatto dell'autunno e dell'inverno, da accompagnare con il Terre di Cosenza DOC Pollino Riserva. Prezzo indicativo al chilogrammo.$$),
  ($$olio-evo-monocultivar-roggianella$$, $$demo-terre-pollino$$, $$Olio EVO monocultivar Roggianella$$, $$Alimentari$$, $$Olio$$, 17.00, 25, 9814618,
   $$Olio extravergine da sola cultivar Roggianella, da usare a crudo. 500 ml.$$,
   $$La Roggianella è una cultivar di olivo che cresce sulle colline del Pollino e dà un olio dal frutto delicato, con sentori di mandorla e carciofo. Essendo monocultivar, il profilo resta riconoscibile anno dopo anno: è un olio da usare a crudo, sulle bruschette, sulle verdure lessate o su una zuppa di lenticchie. Bottiglia da 500 ml.$$),
  ($$miele-di-sulla-pollino$$, $$demo-terre-pollino$$, $$Miele di sulla del Pollino$$, $$Alimentari$$, $$Miele$$, 11.50, 24, 5634210,
   $$Miele chiaro e delicato di sulla, raccolto nei prati del Pollino. 500 g.$$,
   $$Il miele di sulla si ottiene dal nettare dei prati di sulla che fioriscono tra la primavera e l'inizio dell'estate nel territorio del Pollino. È chiaro, quasi trasparente, con un profumo floreale leggero e un sapore dolce che non copre: perfetto a colazione, sui formaggi freschi come la giuncata o per dolcificare uno yogurt. Vasetto da 500 g.$$),
  ($$funghi-porcini-del-pollino$$, $$demo-terre-pollino$$, $$Funghi porcini del Pollino$$, $$Alimentari$$, $$Funghi$$, 16.00, 15, 10907746,
   $$Porcini dei boschi del Pollino, freschi in stagione ed essiccati fuori stagione. Al kg.$$,
   $$I porcini crescono nei boschi di faggio e castagno del Pollino da agosto a novembre, quando l'umidità e il fresco li fanno uscire. Hanno cappello carnoso e gambo sodo, profumo di sottobosco e sapore pieno: si cucinano trifolati, con la pasta, sotto l'arrosto o si essiccano per l'inverno. Prezzo indicativo al chilogrammo.$$),
  ($$castagne-del-pollino$$, $$demo-terre-pollino$$, $$Castagne del Pollino$$, $$Alimentari$$, $$Frutta secca$$, 6.50, 40, 10907746,
   $$Castagne dei castagneti del Pollino, da arrostire o per farina. Al kg.$$,
   $$I castagneti coprono ampie fasce del Pollino e le castagne si raccolgono tra ottobre e dicembre. Sono grandi e farinose: si arrostiscono sul fuoco, si lessano con l'alloro o si trasformano in farina per dolci e polenta. Con il miele di castagno sono l'abbinamento d'autunno. Prezzo indicativo al chilogrammo.$$),
  ($$noci-del-pollino$$, $$demo-terre-pollino$$, $$Noci del Pollino$$, $$Alimentari$$, $$Frutta secca$$, 10.00, 30, 10907746,
   $$Noci sgusciate dei noci del Pollino, per dolci e condimenti. Al kg.$$,
   $$Le noci del Pollino si raccolgono a fine autunno e si sgusciano a mano. La polpa è chiara e compatta, con un sapore dolce che resta anche dopo l'essiccazione: si usano nei dolci tradizionali come la ciotaredda, nel pesto di noci, sui taglieri di formaggio o tritate su una pasta di zucca. Prezzo indicativo al chilogrammo.$$),
  ($$farina-di-castagne-del-pollino$$, $$demo-terre-pollino$$, $$Farina di castagne del Pollino$$, $$Alimentari$$, $$Farine$$, 8.00, 20, 10907746,
   $$Farina dolce di castagne essiccate, per dolci e polenta. 500 g.$$,
   $$La farina si ottiene dalle castagne del Pollino essiccate lentamente e macinate: ha colore bruno, profumo tostato e un sapore naturalmente dolce. Si usa per il castagnaccio, per i dolci della tradizione, per la polenta con il latte o mescolata al pane. Confezione da 500 g.$$),
  ($$mosto-cotto-saba$$, $$demo-terre-pollino$$, $$Mosto cotto (saba)$$, $$Alimentari$$, $$Dispensa$$, 8.00, 18, 12181051,
   $$Mosto d'uva cotto fino a diventare sciroppo: dolcificante e condimento.$$,
   $$La saba è mosto d'uva fatto bollire lentamente fino a ridursi a uno sciroppo scuro, dolce e leggermente acidulo. Nel Pollino si usa per i dolci tradizionali — la pitta 'mpigliata e la ciotaredda lo prevedono tra gli ingredienti — e per condire gli arrosti o accompagnare il formaggio. Bottiglietta da 500 ml.$$),
  ($$confetture-del-pollino$$, $$demo-terre-pollino$$, $$Confetture del Pollino$$, $$Alimentari$$, $$Confetture$$, 9.00, 25, 36198456,
   $$Confetture di fichi, prugne e more lavorate in casa. 350 g.$$,
   $$Le confetture del Pollino nascono dalla frutta dei campi e degli alberi del territorio — fichi, prugne, more — cotta con zucchero e qualche goccia di limone. Restano dense e con pezzi di frutta visibili: si servono a colazione, con lo yogurt o in abbinamento ai formaggi stagionati come il pecorino. Vasetto da 350 g.$$),
  ($$pane-di-cerchiara$$, $$demo-sapori-castrovillari$$, $$Pane di Cerchiara$$, $$Alimentari$$, $$Pane$$, 7.00, 25, 10907746,
   $$Pane a lievitazione naturale del borgo di Cerchiara, cotto a legna. Al kg.$$,
   $$Il pane di Cerchiara è il pane del borgo ai piedi del Pollino: farina di grano, lievito madre e una lunga lievitazione, poi cottura in forno a legna. La crosta è scura e croccante, la mollica alveolata e profumata. Si taglia per le bruschette, si conserva per giorni e, raffermo, diventa la base delle polpette di pane e delle panzanelle. Prezzo indicativo al chilogrammo.$$),
  ($$bocconotto-di-mormanno$$, $$demo-sapori-castrovillari$$, $$Bocconotto di Mormanno$$, $$Alimentari$$, $$Dolci$$, 11.50, 20, 7909873,
   $$Dolcetto di pasta frolla con ripieno di cioccolato e frutta secca. Al kg.$$,
   $$Il bocconotto di Mormanno è un dolce tradizionale dello stesso paese che dà il nome alla lenticchia: un guscio di pasta frolla che racchiude cioccolato, noci e spezie, cotto al forno fino a scurire la superficie. Si serve come dessert di fine pasto, meglio con un bicchiere di Moscato al governo di Saracena. Prezzo indicativo al chilogrammo.$$),
  ($$cannaritoli-di-morano$$, $$demo-sapori-castrovillari$$, $$Cannaritoli di Morano$$, $$Alimentari$$, $$Dolci$$, 12.00, 18, 7909873,
   $$Dolce natalizio fritto e glassato al miele, tipico di Morano Calabro. Al kg.$$,
   $$I cannaritoli sono il dolce del Natale di Morano Calabro: una sfoglia arrotolata e fritta, poi passata nel miele caldo, che diventa croccante e lucida. Il sapore ricorda il mosto cotto e il miele del Pollino, due ingredienti che il territorio produce. Si preparano per le feste e si conservano per qualche giorno in una scatola di latta. Prezzo indicativo al chilogrammo.$$),
  ($$pitta-mpigliata-pollino$$, $$demo-sapori-castrovillari$$, $$Pitta 'mpigliata del Pollino$$, $$Alimentari$$, $$Dolci$$, 15.00, 15, 7909873,
   $$Torta natalizia di sfoglia arrotolata con noci, miele e mosto cotto. Al kg.$$,
   $$La pitta 'mpigliata è il dolce delle feste del Pollino: sfoglie sottili arrotolate su se stesse e farcite con noci, uvetta, miele e mosto cotto, poi cotte al forno fino a diventare dorate. Si taglia a fette sottili e si accompagna con il Moscato al governo di Saracena, che ne esalta il profumo di fico e di spezie. Prezzo indicativo al chilogrammo.$$)
)
insert into public.prodotti (
  slug, negozio_id, nome, descrizione, descrizione_completa, categoria, sottocategoria,
  prezzo, attivo, quantita_disponibile, immagine, immagine_principale, alt_text_immagine,
  origine_pubblicazione, prodotto_tipico, ha_varianti, created_at, updated_at
)
select
  d.slug,
  n.id,
  d.nome,
  d.descrizione,
  d.descrizione_completa,
  d.categoria,
  d.sottocategoria,
  d.prezzo,
  true,
  d.quantita,
  'https://images.pexels.com/photos/' || d.img::text || '/pexels-photo-' || d.img::text || '.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2',
  'https://images.pexels.com/photos/' || d.img::text || '/pexels-photo-' || d.img::text || '.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2',
  d.nome,
  'manuale',
  true,
  false,
  now(),
  now()
from dati d
join public.negozi n on n.slug = d.negozio_slug
on conflict (slug) where slug is not null do update set
  negozio_id = excluded.negozio_id,
  nome = excluded.nome,
  descrizione = excluded.descrizione,
  descrizione_completa = excluded.descrizione_completa,
  categoria = excluded.categoria,
  sottocategoria = excluded.sottocategoria,
  prezzo = excluded.prezzo,
  immagine = excluded.immagine,
  immagine_principale = excluded.immagine_principale,
  alt_text_immagine = excluded.alt_text_immagine,
  attivo = true,
  prodotto_tipico = true,
  updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- 3) VINI (6) — tutti nell'Enoteca del Pollino, categoria Vini
--    Solo denominazioni, mai aziende o etichette. Niente annata.
-- ───────────────────────────────────────────────────────────────────────────

with vini (slug, nome, sottocategoria, prezzo, quantita, img, descrizione, descrizione_completa) as (
  values
  ($$terre-di-cosenza-doc-pollino-rosso$$, $$Terre di Cosenza DOC Pollino Rosso$$, $$Vini rossi$$, 14.00, 24, 31094805,
   $$Rosso DOC della sottozona Pollino, da uve Magliocco: frutto scuro e tannino morbido.$$,
   $$Il Terre di Cosenza DOC nella sottozona Pollino è il rosso del versante cosentino del massiccio, prodotto con Magliocco per almeno il 60 per cento. Al naso ha frutta scura e una spezia dolce, in bocca un corpo medio e un tannino morbido che non asciuga. Si serve a 16-18 gradi in un calice ampio e regge sia l'arrosto d'agnello sia un ragù di cinghiale. Bottiglia da 750 ml.$$),
  ($$terre-di-cosenza-doc-pollino-riserva$$, $$Terre di Cosenza DOC Pollino Riserva$$, $$Vini rossi$$, 22.00, 12, 2696064,
   $$La Riserva della sottozona Pollino: più struttura e affinamento lungo.$$,
   $$La versione Riserva del Terre di Cosenza DOC Pollino nasce dallo stesso Magliocco ma con un affinamento più lungo, che arrotonda il tannino e allunga il finale. Il frutto maturo si accompagna a note di cuoio e di spezie. Si beve a 18 gradi con le cotture lunghe: brasato d'agnello con il mosto cotto, caciocavallo Silano DOP stagionato, funghi porcini. Bottiglia da 750 ml.$$),
  ($$terre-di-cosenza-doc-pollino-rosato$$, $$Terre di Cosenza DOC Pollino Rosato$$, $$Vini rosati$$, 11.00, 18, 1407846,
   $$Rosato secco e fresco della sottozona Pollino, da servire giovane.$$,
   $$Il rosato della sottozona Pollino si ottiene da uve a bacca nera della denominazione, con una macerazione breve che dà colore ciliegia e profumo di frutta rossa. In bocca è secco e fresco, con buona acidità: si serve a 10-12 gradi e apre il pasto con i salumi, la felciata di Morano e una frittata con gli asparagi selvatici. Bottiglia da 750 ml.$$),
  ($$terre-di-cosenza-doc-verbicaro-rosso$$, $$Terre di Cosenza DOC Verbicaro Rosso$$, $$Vini rossi$$, 15.00, 16, 1123260,
   $$Rosso della sottozona Verbicaro, caldo e speziato, da Magliocco dolce.$$,
   $$La sottozona Verbicaro è l'angolo tirrenico del Pollino, un comune del Parco affacciato sull'alto Tirreno cosentino. Il rosso si fa con Magliocco dolce, chiamato localmente Guarnaccia nera, e si presenta caldo, con frutto maturo, spezia e una nota balsamica. Funziona con il capretto al forno, la salsiccia e le melanzane rosse di Rotonda cotte al forno. Bottiglia da 750 ml.$$),
  ($$terre-di-cosenza-doc-verbicaro-bianco$$, $$Terre di Cosenza DOC Verbicaro Bianco$$, $$Vini bianchi$$, 13.00, 18, 2912108,
   $$Bianco sapido e agrumato della sottozona Verbicaro.$$,
   $$Il bianco della sottozona Verbicaro nasce dalle uve bianche del territorio e si distingue per la sapidità: al naso agrumi e fiori bianchi, in bocca un finale salino che invita a bere. Si serve a 10-12 gradi con il caprino di Morano, i broccoli del Pollino saltati in padella e una frittata di asparagi selvatici. Bottiglia da 750 ml.$$),
  ($$moscato-al-governo-di-saracena$$, $$Moscato al governo di Saracena$$, $$Vini dolci$$, 22.00, 14, 5947015,
   $$Vino dolce e ossidativo di Saracena, da uve Moscato e mosto cotto.$$,
   $$Il Moscato al governo di Saracena è un vino dolce del borgo di Saracena, ai piedi del Pollino, riconosciuto Presidio Slow Food dal 2004. Si produce con Moscato bianco e uve bianche locali, governate con il mosto cotto: il risultato è un vino ossidativo, con note di fico secco, miele e mandorla. Non è una DOC, quindi va scritto solo con il suo nome. Si serve a 12-14 gradi in un calice piccolo, con il bocconotto di Mormanno, i cannaritoli, la ciotaredda o un pecorino stagionato. Bottiglia da 500 ml.$$)
)
insert into public.prodotti (
  slug, negozio_id, nome, descrizione, descrizione_completa, categoria, sottocategoria,
  prezzo, attivo, quantita_disponibile, immagine, immagine_principale, alt_text_immagine,
  origine_pubblicazione, prodotto_tipico, ha_varianti, created_at, updated_at
)
select
  v.slug,
  n.id,
  v.nome,
  v.descrizione,
  v.descrizione_completa,
  'Vini',
  v.sottocategoria,
  v.prezzo,
  true,
  v.quantita,
  'https://images.pexels.com/photos/' || v.img::text || '/pexels-photo-' || v.img::text || '.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2',
  'https://images.pexels.com/photos/' || v.img::text || '/pexels-photo-' || v.img::text || '.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2',
  v.nome,
  'manuale',
  true,
  false,
  now(),
  now()
from vini v
join public.negozi n on n.slug = 'demo-enoteca-pollino'
on conflict (slug) where slug is not null do update set
  negozio_id = excluded.negozio_id,
  nome = excluded.nome,
  descrizione = excluded.descrizione,
  descrizione_completa = excluded.descrizione_completa,
  categoria = excluded.categoria,
  sottocategoria = excluded.sottocategoria,
  prezzo = excluded.prezzo,
  immagine = excluded.immagine,
  immagine_principale = excluded.immagine_principale,
  alt_text_immagine = excluded.alt_text_immagine,
  attivo = true,
  prodotto_tipico = true,
  updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- 4) PRODOTTI GIÀ A CATALOGO — completamento della scheda
--    Erano nel seed iniziale con la sola descrizione breve: qui ricevono
--    descrizione_completa, sottocategoria e alt text, con lo stesso taglio
--    dei prodotti nuovi. Prezzi e giacenze non vengono toccati.
-- ───────────────────────────────────────────────────────────────────────────

update public.prodotti set
  sottocategoria = $$Verdure$$,
  alt_text_immagine = $$Cipolla Bianca di Castrovillari$$,
  descrizione_completa = $$La Cipolla Bianca di Castrovillari è un prodotto agricolo con Denominazione Comunale conferita dal Comune di Castrovillari, ecotipo locale di Allium cepa coltivato alle pendici del Pollino. Ha forma schiacciata, tunica bianca e un sapore dolce che non fa piangere: si usa cruda in insalata, nei soffritti, nelle zuppe e per la confettura. Si conserva a lungo in un luogo asciutto e ventilato. Prezzo indicativo al chilogrammo.$$,
  updated_at = now()
where slug = $$cipolla-bianca-castrovillari$$;

update public.prodotti set
  sottocategoria = $$Dispensa$$,
  alt_text_immagine = $$Dolcezza di Cipolla Bianca di Castrovillari$$,
  descrizione_completa = $$La dolcezza di cipolla è una confettura preparata con la Cipolla Bianca di Castrovillari, caramellata lentamente con zucchero e aceto fino a diventare densa e ambrata. Non è un prodotto certificato: è una conserva di laboratorio che usa la materia prima del territorio. Si abbina ai formaggi stagionati, alle carni arrosto e al pecorino, oppure si spalma su una bruschetta calda. Vasetto da 250 g.$$,
  updated_at = now()
where slug = $$dolcezza-cipolla-bianca$$;

update public.prodotti set
  sottocategoria = $$Olio$$,
  alt_text_immagine = $$Olio Extra Vergine di Oliva del Pollino$$,
  descrizione_completa = $$L'olio extravergine di oliva del Pollino nasce dagli oliveti che coprono le colline intorno al massiccio, con olive raccolte a mano o con agevolatori e molite in giornata. Il colore è verde intenso, il fruttato su erba e carciofo, l'amaro e il piccante presenti ma composti. È l'olio di base della cucina del territorio e si usa anche a crudo sulle verdure lessate. Bottiglia da 1 litro.$$,
  updated_at = now()
where slug = $$olio-evo-pollino$$;

update public.prodotti set
  sottocategoria = $$Miele$$,
  alt_text_immagine = $$Miele Millefiori del Pollino$$,
  descrizione_completa = $$Il miele millefiori del Pollino è il miele delle fioriture che si susseguono sui pascoli del massiccio tra la primavera e l'estate: il risultato cambia di anno in anno e di apiario in apiario. Ha colore ambrato, profumo floreale e un sapore dolce e rotondo, con una lieve nota aromatica. Si usa a colazione, per dolcificare lo yogurt, sui formaggi freschi o per glassare un dolce. Vasetto da 500 g.$$,
  updated_at = now()
where slug = $$miele-millefiori-pollino$$;

update public.prodotti set
  sottocategoria = $$Miele$$,
  alt_text_immagine = $$Miele di Castagno del Pollino$$,
  descrizione_completa = $$Il miele di castagno si ottiene dal nettare dei castagneti che ricoprono le fasce più alte del Pollino e si raccoglie tra giugno e luglio. È scuro, quasi bruno, con un profumo di legno e un sapore deciso, leggermente amaro: per questo si abbina ai formaggi stagionati, al pecorino e al caciocavallo, più che ai dolci. Vasetto da 500 g.$$,
  updated_at = now()
where slug = $$miele-castagno-pollino$$;

update public.prodotti set
  sottocategoria = $$Dolci$$,
  alt_text_immagine = $$Ciotaredda di Castrovillari$$,
  descrizione_completa = $$La ciotaredda è il dolcetto tradizionale di Castrovillari, preparato con farina, noci, mosto cotto, miele e scorza di limone. La forma ricorda quella dei mostaccioli, la pasta è compatta e il sapore arriva dal mosto cotto e dal miele del Pollino. Si prepara per le feste e si accompagna con il Moscato al governo di Saracena. Prezzo indicativo al chilogrammo.$$,
  updated_at = now()
where slug = $$ciotaredda-castrovillari$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Magliocco del Pollino — è un vino: passa all'Enoteca e alla categoria
--    Vini, mantenendo la scheda già pubblicata.
-- ───────────────────────────────────────────────────────────────────────────
update public.prodotti p set
  negozio_id = (select n.id from public.negozi n where n.slug = 'demo-enoteca-pollino'),
  categoria = $$Vini$$,
  sottocategoria = $$Vini rossi$$,
  alt_text_immagine = $$Magliocco del Pollino$$,
  descrizione_completa = $$Il Magliocco è il vitigno autoctono del Pollino, chiamato localmente Lagrima, e sta alla base del Terre di Cosenza DOC nella sottozona Pollino. Questo rosso è vinificato in purezza: colore rubino, frutto scuro e una spezia dolce al naso, tannino morbido e finale asciutto. Si serve a 16-18 gradi con l'agnello al forno, il cinghiale in umido e il pecorino stagionato. Bottiglia da 750 ml.$$,
  updated_at = now()
where p.slug = $$magliocco-pollino$$;

notify pgrst, 'reload schema';

commit;
