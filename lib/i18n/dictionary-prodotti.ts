/**
 * PRODOTTI — traduzione inglese di /prodotti e /prodotto/[slug].
 *
 * Nomi di prodotto, descrizioni brevi (schede), descrizioni complete,
 * categorie e testi dei negozi demo. Restano in italiano i nomi propri:
 * insegne dei negozi, indirizzi, marchi, denominazioni dei vini e i nomi
 * degli ecotipi locali (es. "Fagiolo Cervineddru di Cariglio Fuscaldo").
 */
export const DIZIONARIO_PRODOTTI: Record<string, string> = {
  // ── Elenco / filtri ───────────────────────────────────────────────────
  "Tutti (": "All (",
  "I prodotti dei negozi e delle imprese del territorio, con prezzi e negozio di provenienza.":
    "The products of local shops and businesses, with prices and the shop they come from.",
  "Pasta fatta in casa con farine del territorio del Pollino":
    "Homemade pasta with flours from the Pollino area",
  "Pane, pizza e prodotti da forno artigianali e farina":
    "Bread, pizza, artisan baked goods and flour",

  // ── Distintivi di denominazione ───────────────────────────────────────
  DOP: "PDO",
  IGP: "PGI",
  PAT: "PAT",

  // ── Negozi (testi demo) ───────────────────────────────────────────────
  "Bottega DEMO che raccoglie le Eccellenze del territorio di Castrovillari e del Pollino. Ambiente dimostrativo, non un'attività reale aderente a LocalHub.":
    "DEMO shop bringing together the specialities of the Castrovillari and Pollino area. Demonstration environment, not a real business belonging to LocalHub.",
  "Negozio DEMO dedicato ai dolci e ai sapori tradizionali di Castrovillari. Ambiente dimostrativo, non un'attività reale aderente a LocalHub.":
    "DEMO shop devoted to the traditional sweets and flavours of Castrovillari. Demonstration environment, not a real business belonging to LocalHub.",
  "Vetrina DEMO dei sapori del Parco Nazionale del Pollino: miele, olio e vino del territorio. Ambiente dimostrativo, non un'attività reale aderente a LocalHub.":
    "DEMO showcase of the flavours of the Pollino National Park: honey, oil and wine from the area. Demonstration environment, not a real business belonging to LocalHub.",
  "Enoteca DEMO dedicata ai vini dell'area del Pollino: le sottozone di Terre di Cosenza e il Moscato al governo di Saracena. Ambiente dimostrativo, non un'attività reale aderente a LocalHub.":
    "DEMO wine shop devoted to the wines of the Pollino area: the Terre di Cosenza sub-zones and the Moscato al governo di Saracena. Demonstration environment, not a real business belonging to LocalHub.",

  // ── Nomi di prodotto ──────────────────────────────────────────────────
  "Fette di bottarga di tonno": "Sliced tuna bottarga",
  "Liquore di finocchietto selvatico": "Wild fennel liqueur",
  "Stocco di Mammola": "Mammola stockfish",
  "Alicette intere al peperoncino": "Whole anchovies with chilli",
  "Fagiolo Cervineddru di Cariglio coltivato a Fuscaldo":
    "Fagiolo Cervineddru di Cariglio grown in Fuscaldo",
  "Stroncatura calabrese": "Calabrian stroncatura pasta",
  "Porcini freschi del Pollino": "Fresh porcini from the Pollino",
  "Tartufo nero del Pollino": "Black truffle from the Pollino",
  "Riso Carnaroli della Piana di Sibari": "Carnaroli rice from the Piana di Sibari",
  "Cedro di Santa Maria del Cedro DOP": "Cedro di Santa Maria del Cedro PDO",
  "Bergamotto di Reggio Calabria DOP": "Bergamotto di Reggio Calabria PDO",
  "Olio EVO Lametia DOP": "Lametia PDO extra virgin olive oil",
  "Olio EVO Bruzio DOP": "Bruzio PDO extra virgin olive oil",
  "Olio EVO Alto Crotonese DOP": "Alto Crotonese PDO extra virgin olive oil",
  "Peperoncino di Calabria IGP": "Calabrian chilli PGI",
  "Limone di Rocca Imperiale IGP": "Rocca Imperiale lemon PGI",
  "Giardiniera di verdure del Pollino": "Giardiniera of Pollino vegetables",
  "Farina di grani antichi del Pollino": "Ancient grain flour from the Pollino",
  "Pecorino del Pollino PAT": "Pecorino del Pollino PAT",
  "Caprino di Morano": "Goat cheese of Morano",
  "Felciata di Morano PAT": "Felciata di Morano PAT",
  "Ricotta affumicata del Pollino": "Smoked ricotta from the Pollino",
  "Peperone di Senise IGP (fresco)": "Senise pepper PGI (fresh)",
  "Crusco di Senise (in polvere)": "Crusco di Senise (ground)",
  "Pomodoro Costoluto del Pollino": "Costoluto tomato from the Pollino",
  "Lenticchia di Mormanno": "Mormanno lentil",
  "Fagioli Bianchi di Rotonda DOP": "Fagioli Bianchi di Rotonda PDO",
  "Origano selvatico del Pollino": "Wild oregano from the Pollino",
  "Pomodori secchi sott'olio del Pollino": "Sun-dried tomatoes in oil from the Pollino",
  "Guanciale del Pollino": "Guanciale from the Pollino",
  "Soppressata del Pollino": "Soppressata from the Pollino",
  "Miele di sulla del Pollino": "Sulla honey from the Pollino",
  "Olio EVO monocultivar Roggianella": "Roggianella single-variety extra virgin olive oil",
  "Patate della Sila D.O.P.": "Sila potatoes PDO",
  "Confetture di fichi": "Fig preserves",
  "Pane di Cerchiara": "Cerchiara bread",
  "Bocconotto di Mormanno": "Bocconotto of Mormanno",
  "Cannaritoli di Castrovillari": "Cannaritoli of Castrovillari",
  "Melanzane sott'olio del Pollino": "Aubergines in oil from the Pollino",
  "Pitta 'mpigliata del Pollino": "Pitta 'mpigliata from the Pollino",
  "Cacioricotta del Pollino": "Cacioricotta from the Pollino",
  "Melanzana Rossa di Rotonda DOP": "Melanzana Rossa di Rotonda PDO",
  "Biscotti tradizionali calabresi": "Traditional Calabrian biscuits",
  "Taralli calabresi": "Calabrian taralli",
  "Olive schiacciate alla calabrese": "Crushed olives, Calabrian style",
  "Maccheroni al ferretto": "Maccheroni al ferretto",
  "Marmellata di bergamotto 200 g": "Bergamot jam 200 g",
  "Miele al bergamotto 250 g": "Bergamot honey 250 g",
  "Miele millefiori 500 g": "Wildflower honey 500 g",
  "Peperone secco dolce 100 g": "Dried sweet pepper 100 g",
  "’Nduja di Spilinga": "’Nduja di Spilinga",
  "Fileja di Tropea": "Fileja di Tropea",
  "Cipolla bianca di Castrovillari": "White onion of Castrovillari",
  "Torrone mielato di Bagnara Calabra": "Honey torrone of Bagnara Calabra",
  "Olio extravergine d’oliva calabrese": "Calabrian extra virgin olive oil",
  "Piparelle calabresi": "Calabrian piparelle",
  "Strascinati farina 00": "Strascinati with type 00 flour",
  "Lagane calabresi": "Calabrian lagane",
  "Pane Casereccio": "Homemade bread",
  "Ciotaredda di Castrovillari": "Ciotaredda of Castrovillari",
  "Dolcezza di Cipolla Bianca di Castrovillari D.E.C.O.":
    "White Onion Preserve of Castrovillari D.E.C.O.",
  "Filetti di Cipolla Bianca di Castrovillari D.E.C.O.":
    "White Onion Fillets of Castrovillari D.E.C.O.",
  "Cipolla Bianca di Castrovillari D.E.C.O.":
    "White Onion of Castrovillari D.E.C.O.",
  "Olio Extra Vergine di Oliva del Pollino": "Extra virgin olive oil from the Pollino",
  "Miele Millefiori del Pollino": "Wildflower honey from the Pollino",
  "Miele di Castagno del Pollino": "Chestnut honey from the Pollino",

  // ── Descrizioni brevi ─────────────────────────────────────────────────
  "pasta tipica calabrese": "typical Calabrian pasta",
  "Vuccalaru calabrese equivalente del guanciale":
    "Vuccalaru, the Calabrian equivalent of guanciale",
  "Porcini freschi del Pollino appena raccolti": "Freshly picked porcini from the Pollino",
  "Tartufo nero del Pollino dal profumo intenso":
    "Black truffle from the Pollino with an intense aroma",
  "Riso Carnaroli della Piana di Sibari biologico":
    "Organic Carnaroli rice from the Piana di Sibari",
  "Fichi essiccati di Cosenza DOP, naturalmente dolci, confezione 500 g.":
    "Dried figs of Cosenza PDO, naturally sweet, 500 g pack.",
  "Cedro dalla buccia spessa e profumata, coltivato in Calabria. Al kg.":
    "Citron with a thick, fragrant rind, grown in Calabria. Sold by the kg.",
  "Olio essenziale puro di bergamotto DOP, flacone da 10 ml.":
    "Pure bergamot essential oil PDO, 10 ml bottle.",
  "Olio extravergine di oliva IGP, gusto equilibrato, bottiglia 0,5 l.":
    "PGI extra virgin olive oil, balanced flavour, 0.5 l bottle.",
  "Olio extravergine di oliva DOP della piana lametina, bottiglia 0,5 l.":
    "PDO extra virgin olive oil from the Lametia plain, 0.5 l bottle.",
  "Olio extravergine di oliva DOP del territorio bruzio, bottiglia 0,5 l.":
    "PDO extra virgin olive oil from the Bruzio area, 0.5 l bottle.",
  "Olio extravergine di oliva DOP, fruttato medio, bottiglia 0,5 l.":
    "PDO extra virgin olive oil, medium fruitiness, 0.5 l bottle.",
  "Peperoncini piccanti essiccati in collana, confezione da 100 g.":
    "Hot chillies dried on a string, 100 g pack.",
  "Limone di Rocca Imperiale IGP, buccia profumata e succoso. Al kg.":
    "Rocca Imperiale lemon PGI, fragrant rind and juicy. Sold by the kg.",
  "Finocchio tondo e croccante dall'Isola Capo Rizzuto IGP. Al kg.":
    "Round, crunchy fennel from Isola Capo Rizzuto PGI. Sold by the kg.",
  "Clementine tardive di Calabria IGP, dolci e senza semi. Al kg.":
    "Late Calabrian clementines PGI, sweet and seedless. Sold by the kg.",
  "Pecorino di pecora crotonese, pasta compatta e sapore deciso. Al kg.":
    "Pecorino from Crotonese sheep, compact paste and bold flavour. Sold by the kg.",
  "Soppressata a grana grossa con stagionatura lenta, da tagliere. Al kg.":
    "Coarse-grained soppressata, slowly aged, for the board. Sold by the kg.",
  "Salsiccia di suino con pepe nero in budello naturale, stagionata. Al kg.":
    "Pork sausage with black pepper in natural casing, aged. Sold by the kg.",
  "Pancetta arrotolata e stagionata, da affettare sottile. Al kg.":
    "Rolled and aged pancetta, to slice thin. Sold by the kg.",
  "Capocollo di suino stagionato e leggermente affumicato, dolce e profumato. Al kg.":
    "Aged, lightly smoked pork capocollo, sweet and fragrant. Sold by the kg.",
  "Rosato secco e fresco della sottozona Pollino, da servire giovane.":
    "Dry, fresh rosé from the Pollino sub-zone, to serve young.",
  "Verdure di stagione in agrodolce, contorno e antipasto.":
    "Seasonal vegetables in sweet-and-sour brine, side dish and antipasto.",
  "Farina macinata da grani antichi coltivati nel territorio.":
    "Flour milled from ancient grains grown in the area.",
  "Pecorino di latte ovino stagionato, sapore pieno e sapido. Al kg.":
    "Aged pecorino from sheep's milk, full and savoury. Sold by the kg.",
  "Formaggio di capra di Morano Calabro, fresco e dal sapore deciso. Al kg.":
    "Goat cheese of Morano Calabro, fresh with a bold flavour. Sold by the kg.",
  "Formaggio tradizionale avvolto nelle felci, dal profilo erbaceo. Al kg.":
    "Traditional cheese wrapped in ferns, with a grassy character. Sold by the kg.",
  "Ricotta di latte ovino affumicata, ideale per ripieni e ravioli. Al kg.":
    "Smoked ricotta from sheep's milk, ideal for fillings and ravioli. Sold by the kg.",
  "Peperone IGP dolce e dalla buccia sottile, ideale per peperonata e ripieni. Al kg.":
    "Sweet PGI pepper with thin skin, ideal for peperonata and stuffed dishes. Sold by the kg.",
  "Peperone di Senise IGP essiccato e macinato: il condimento piccante della tradizione.":
    "Senise pepper PGI, dried and ground: the traditional hot seasoning.",
  "Pomodoro da salsa, polpa densa e pochi semi. Venduto al kg.":
    "Sauce tomato, dense flesh and few seeds. Sold by the kg.",
  "Lenticchia minuta dell'altopiano di Mormanno, cuoce in pochi minuti.":
    "Small lentil from the Mormanno plateau, cooks in a few minutes.",
  "Fagiolo bianco DOP dall'area di Rotonda, buccia fine e sapore delicato.":
    "White bean PDO from the Rotonda area, thin skin and delicate flavour.",
  "Origano raccolto a mano sulle alture del Pollino ed essiccato all'ombra.":
    "Oregano picked by hand on the heights of the Pollino and dried in the shade.",
  "Pomodori essiccati al sole e conservati in olio: per antipasti e bruschette.":
    "Tomatoes sun-dried and preserved in oil: for antipasti and bruschette.",
  "Guanciale di suino stagionato, base del soffritto e dei sughi. Al kg.":
    "Aged pork guanciale, the base of soffritto and sauces. Sold by the kg.",
  "Salume di suino a grana grossa, da tagliere e da panino. Al kg.":
    "Coarse-grained pork cured meat, for the board and for sandwiches. Sold by the kg.",
  "Miele chiaro e delicato di sulla, raccolto nei prati del Pollino. 500 g.":
    "Pale, delicate sulla honey, gathered in the meadows of the Pollino. 500 g.",
  "Olio extravergine da sola cultivar Roggianella, da usare a crudo. 500 ml.":
    "Extra virgin olive oil from the Roggianella variety alone, to use raw. 500 ml.",
  "Patate della sila senza pesticidi": "Sila potatoes with no pesticides",
  "Confetture di fichi 350 g.": "Fig preserves, 350 g.",
  "Pane a lievitazione naturale del borgo di Cerchiara, cotto a legna. Al kg.":
    "Naturally leavened bread from the village of Cerchiara, baked over wood. Sold by the kg.",
  "Dolcetto di pasta frolla con ripieno di cioccolato e frutta secca. Al kg.":
    "Shortcrust pastry sweet with a chocolate and dried fruit filling. Sold by the kg.",
  "Dolce natalizio fritto e glassato al miele, tipico di Castrovillari. Al kg.":
    "Christmas sweet, fried and glazed with honey, typical of Castrovillari. Sold by the kg.",
  "Melanzane a fette conservate in olio, pronte per l'antipasto.":
    "Sliced aubergines preserved in oil, ready for the antipasto.",
  "Torta natalizia di sfoglia arrotolata con noci, miele e mosto cotto. Al kg.":
    "Christmas cake of rolled pastry with walnuts, honey and mosto cotto. Sold by the kg.",
  "Formaggio estivo di latte di capra e pecora, da tavola o da grattugia. Al kg.":
    "Summer cheese of goat's and sheep's milk, for the table or for grating. Sold by the kg.",
  "Ortaggio DOP dell'area di Rotonda, polpa compatta e sapore dolce. Venduta al kg.":
    "PDO vegetable from the Rotonda area, firm flesh and sweet flavour. Sold by the kg.",
  "Formaggio DOP a pasta filata, stagionato: da gratinare o alla piastra. Al kg.":
    "Aged PDO stretched-curd cheese: for gratinating or the griddle. Sold by the kg.",
  "Biscotti da forno a base di farina, nella selezione demo di Mani in Pasta.":
    "Oven-baked biscuits made with flour, in the Mani in Pasta demo selection.",
  "Taralli da forno, prodotto a base di farina nella selezione demo di Mani in Pasta.":
    "Oven-baked taralli, a flour-based product in the Mani in Pasta demo selection.",
  "Olive schiacciate in stile calabrese, prodotto dimostrativo nella selezione delle eccellenze.":
    "Crushed olives, Calabrian style: a demonstration product in the specialities selection.",
  "Pasta tradizionale calabrese, proposta nella selezione demo di Mani in Pasta.":
    "Traditional Calabrian pasta, offered in the Mani in Pasta demo selection.",
  "Confettura di bergamotto, prodotto dimostrativo nella selezione delle eccellenze.":
    "Bergamot jam, a demonstration product in the specialities selection.",
  "Miele aromatizzato al bergamotto, prodotto dimostrativo nella selezione delle eccellenze.":
    "Bergamot-flavoured honey, a demonstration product in the specialities selection.",
  "Miele millefiori, prodotto dimostrativo nella selezione delle eccellenze.":
    "Wildflower honey, a demonstration product in the specialities selection.",
  "Peperone dolce essiccato, prodotto dimostrativo nella selezione delle eccellenze.":
    "Dried sweet pepper, a demonstration product in the specialities selection.",
  "Specialità calabrese spalmabile e piccante, con peperoncino. Formato indicativo circa 350 g.":
    "Spreadable, spicy Calabrian speciality with chilli. Indicative size about 350 g.",
  "Pasta tradizionale calabrese nel formato fileja, confezione da 500 g.":
    "Traditional Calabrian pasta in the fileja shape, 500 g pack.",
  "Cipolla dolce e croccante, tipica di Castrovillari":
    "Sweet, crunchy onion, typical of Castrovillari",
  "Torrone mielato della tradizione dolciaria di Bagnara Calabra, confezione da 500 g.":
    "Honey torrone from the confectionery tradition of Bagnara Calabra, 500 g pack.",
  "Pecorino del Monte Poro DOP, stagionato in forme tradizionali. Al kg.":
    "Pecorino del Monte Poro PDO, aged in traditional wheels. Sold by the kg.",
  "Olio extravergine d’oliva calabrese, bottiglia da 1 litro.":
    "Calabrian extra virgin olive oil, 1 litre bottle.",
  "Liquirizia pura di Calabria DOP, in confezione da 100 g.":
    "Pure Liquirizia di Calabria PDO, in a 100 g pack.",
  "Biscotti tradizionali calabresi, confezione da 300 g.":
    "Traditional Calabrian biscuits, 300 g pack.",
  "fatto con farine del Pollino": "made with flours from the Pollino",
  "Lagane fatte con farina e acqua del Pollino":
    "Lagane made with flour and water from the Pollino",
  "Pane casereccio con lievito madre": "Homemade bread with sourdough starter",
  "Dolcetto tradizionale di Castrovillari preparato con farina, noci, mosto cotto, miele e scorza di limone. Simile ai mostaccioli.":
    "Traditional sweet of Castrovillari made with flour, walnuts, mosto cotto, honey and lemon zest. Similar to mostaccioli.",
  "Confettura dolce a base di cipolla bianca di Castrovillari, caramellata lentamente. Ottima con formaggi e carni. Prodotto commerciale del territorio.":
    "Sweet preserve of white onion of Castrovillari, slowly caramelised. Excellent with cheeses and meat. Commercial product of the area.",
  "Conserva artigianale a base di cipolla bianca di Castrovillari, tagliata e conservata in olio extravergine. Prodotto commerciale del territorio.":
    "Artisan preserve of white onion of Castrovillari, sliced and kept in extra virgin olive oil. Commercial product of the area.",
  "Prodotto agricolo De.Co. del territorio di Castrovillari, ecotipo locale di Allium cepa L. coltivato alle pendici del Massiccio del Pollino. Dolce e delicata.":
    "De.Co. agricultural product of the Castrovillari area, a local ecotype of Allium cepa L. grown on the slopes of the Pollino massif. Sweet and delicate.",
  "Olio extravergine di oliva di oliveti del territorio del Pollino. Fruttato su erba, dal colore verde intenso.":
    "Extra virgin olive oil from olive groves in the Pollino area. Grassy fruitiness, deep green colour.",
  "Miele millefiori raccolto dagli apicoltori del Parco Nazionale del Pollino. Dolce e aromatico, nota floreale.":
    "Wildflower honey gathered by the beekeepers of the Pollino National Park. Sweet and aromatic, with a floral note.",
  "Miele di castagno del Parco Nazionale del Pollino, dal sapore deciso e leggermente amaro. Tipico dei boschi di castagno del territorio.":
    "Chestnut honey from the Pollino National Park, with a bold, slightly bitter flavour. Typical of the area's chestnut woods.",

  // ── Etichette dei vini in enoteca ─────────────────────────────────────
  "Vino dal sapore speziato, ottimo con carne arrostita":
    "Wine with a spicy flavour, excellent with roast meat",
  "Vino rosso tipico del Pollino": "Typical red wine of the Pollino",
  "Vino rosso sapore deciso": "Red wine with a bold flavour",
  "Vino rosè fruttato": "Fruity rosé wine",
  "La Riserva della sottozona Pollino: più struttura e affinamento lungo.":
    "The Riserva of the Pollino sub-zone: more structure and longer ageing.",
  "Rosso DOC della sottozona Pollino, da uve Magliocco: frutto scuro e tannino morbido.":
    "DOC red from the Pollino sub-zone, from Magliocco grapes: dark fruit and soft tannin.",
  "Bianco sapido e agrumato della sottozona Verbicaro.":
    "Savoury, citrusy white from the Verbicaro sub-zone.",
  "Rosso della sottozona Verbicaro, caldo e speziato, da Magliocco dolce.":
    "Red from the Verbicaro sub-zone, warm and spicy, from Magliocco dolce.",
  "Vino dolce e ossidativo di Saracena, da uve Moscato e mosto cotto.":
    "Sweet, oxidative wine of Saracena, from Moscato grapes and mosto cotto.",
  "Rosso del Pollino da uve autoctone di Magliocco, vitigno delle pendici del Massiccio. Corpo, secco, armonico.":
    "Pollino red from native Magliocco grapes, a vine of the slopes of the massif. Full-bodied, dry, harmonious.",

  // ── Descrizioni complete ──────────────────────────────────────────────
  "Il rosato della sottozona Pollino si ottiene da uve a bacca nera della denominazione, con una macerazione breve che dà colore ciliegia e profumo di frutta rossa. In bocca è secco e fresco, con buona acidità: si serve a 10-12 gradi e apre il pasto con i salumi, la felciata di Morano e una frittata con gli asparagi selvatici. Bottiglia da 750 ml.":
    "The rosé of the Pollino sub-zone is made from black-skinned grapes of the denomination, with a short maceration that gives cherry colour and red-fruit aroma. On the palate it is dry and fresh, with good acidity: serve it at 10-12 degrees and open the meal with cured meats, the felciata of Morano and an omelette with wild asparagus. 750 ml bottle.",
  "La giardiniera raccoglie le verdure dell'orto del Pollino — carote, peperoni, zucchine, cipolline — tagliate e conservate in agrodolce con aceto e spezie. Croccante e fresca, accompagna i salumi, un tagliere di formaggi o una grigliata. Vasetto da 350 g.":
    "The giardiniera brings together the vegetables of the Pollino garden — carrots, peppers, courgettes, small onions — sliced and preserved sweet-and-sour with vinegar and spices. Crunchy and fresh, it goes with cured meats, a cheese board or a mixed grill. 350 g jar.",
  "È la farina macinata da varietà di grano coltivate da generazioni nei campi del Pollino, macinate a pietra per conservare il germe. Ha un colore più scuro e un profumo di grano tostato: si usa per pane, pasta fresca e pizza, con un impasto che richiede più acqua. Confezione da 1 kg.":
    "It is the flour milled from wheat varieties grown for generations in the fields of the Pollino, stone-ground to keep the germ. It has a darker colour and a toasted wheat aroma: use it for bread, fresh pasta and pizza, with a dough that needs more water. 1 kg pack.",
  "Il pecorino del Pollino è un formaggio tradizionale riconosciuto come prodotto agroalimentare tradizionale: latte di pecora degli allevamenti del massiccio, caglio e stagionatura in ambiente fresco. La pasta è granulosa e il sapore pieno, con una nota sapida che cresce con i mesi. Si serve con il miele di castagno, si grattugia sui primi o si abbina al Moscato al governo di Saracena. Prezzo indicativo al chilogrammo.":
    "Pecorino del Pollino is a traditional cheese recognised as a traditional agri-food product: sheep's milk from farms on the massif, rennet and ageing in a cool environment. The paste is grainy and the flavour full, with a savoury note that grows over the months. Serve it with chestnut honey, grate it over first courses or pair it with the Moscato al governo di Saracena. Indicative price per kilogram.",
  "Il caprino di Morano Calabro nasce dal latte delle capre che pascolano sui rilievi del Pollino, tra il borgo e il massiccio. Ha pasta bianca e morbida, con un sapore acidulo e una nota di latte crudo che si sente subito. Si mangia fresco sui crostini, in insalata o con un filo di olio; con qualche settimana di stagionatura diventa più asciutto e piccante. Prezzo indicativo al chilogrammo.":
    "The goat cheese of Morano Calabro comes from the milk of goats grazing on the slopes of the Pollino, between the village and the massif. It has a white, soft paste, with a slightly sour flavour and a note of raw milk you notice at once. Eat it fresh on crostini, in salad or with a drizzle of oil; after a few weeks of ageing it becomes drier and spicier. Indicative price per kilogram.",
  "La felciata è un formaggio tradizionale di Morano Calabro riconosciuto come prodotto agroalimentare tradizionale: durante la stagionatura le forme vengono avvolte nelle foglie di felce, che proteggono la crosta e le lasciano un profumo vegetale. Il sapore è intenso, con note di erba e di sottobosco. Si serve a fette sottili come secondo piatto o su un tagliere con il pane di Cerchiara. Prezzo indicativo al chilogrammo.":
    "Felciata is a traditional cheese of Morano Calabro recognised as a traditional agri-food product: during ageing the wheels are wrapped in fern leaves, which protect the rind and leave a vegetal aroma. The flavour is intense, with notes of grass and undergrowth. Serve it in thin slices as a second course or on a board with Cerchiara bread. Indicative price per kilogram.",
  "La ricotta del Pollino viene lavorata con il siero del latte di pecora e poi affumicata, così la superficie si colora e il profumo di legna si lega al sapore dolce del latte. Si grattugia sui primi, si usa per il ripieno dei ravioli o si serve a scaglie con i fichi. Prezzo indicativo al chilogrammo.":
    "The ricotta of the Pollino is worked from sheep's milk whey and then smoked, so the surface takes on colour and the smell of wood blends with the sweet taste of the milk. Grate it over first courses, use it to fill ravioli or serve it in flakes with figs. Indicative price per kilogram.",
  "Il Peperone di Senise ha indicazione geografica protetta e matura tra agosto e ottobre nella valle del Sinni, alle porte del Pollino. La buccia è sottile, la forma allungata e il sapore dolce: si presta alla peperonata, ai ripieni e alle conserve di famiglia. Consumato fresco oppure essiccato diventa il Crusco. Prezzo indicativo al chilogrammo.":
    "The Peperone di Senise has protected geographical indication and ripens between August and October in the Sinni valley, at the gates of the Pollino. The skin is thin, the shape long and the flavour sweet: it suits peperonata, stuffed dishes and family preserves. Eaten fresh or dried, it becomes the Crusco. Indicative price per kilogram.",
  "Il Crusco è il Peperone di Senise IGP essiccato al sole e poi tostato in forno; qui lo trovi già macinato in polvere, pronto da usare. L'aroma parte dolce e chiude piccante, e si sposa con pasta e legumi, uova e carne alla brace. Una spolverata basta a dare carattere a un piatto di lenticchie o a una pasta e fagioli. Confezione da 100 g.":
    "The Crusco is the Senise pepper PGI dried in the sun and then toasted in the oven; here you find it already ground and ready to use. The aroma starts sweet and finishes hot, and it pairs with pasta and pulses, eggs and grilled meat. A sprinkle is enough to give character to a plate of lentils or a pasta e fagioli. 100 g pack.",
  "Il costoluto è la varietà che le famiglie del Pollino coltivano per la salsa di fine estate. La polpa è carnosa e zuccherina, con pochi semi, e si restringe bene sul fuoco: ottimo per conserve, passate e insalate di pomodoro. Si raccoglie tra luglio e agosto nei campi del territorio. Prezzo indicativo al chilogrammo.":
    "The costoluto is the variety that Pollino families grow for their late-summer sauce. The flesh is meaty and sweet, with few seeds, and it reduces well on the heat: excellent for preserves, passata and tomato salads. It is harvested between July and August in the fields of the area. Indicative price per kilogram.",
  "La lenticchia di Mormanno cresce sull'altopiano che chiude il Pollino, dove l'aria fresca e i terreni drenanti danno un legume minuto e dalla buccia sottile. Cuoce in una ventina di minuti senza ammollo e non si sfalda: ideale per zuppe, contorni e polpette di legumi. Confezione da 500 g.":
    "The lentil of Mormanno grows on the plateau that closes the Pollino, where cool air and draining soils give a small pulse with a thin skin. It cooks in about twenty minutes without soaking and does not fall apart: ideal for soups, side dishes and pulse balls. 500 g pack.",
  "I Fagioli Bianchi di Rotonda sono un legume a denominazione di origine protetta coltivato nel territorio di Rotonda, nel cuore del Pollino. Il seme è bianco e allungato, la buccia sottile: cuoce in modo uniforme e addensa il brodo. Sono la base di pasta e fagioli, zuppe e contorni in umido. Confezione da 500 g.":
    "Fagioli Bianchi di Rotonda are a pulse with protected designation of origin grown in the area of Rotonda, in the heart of the Pollino. The seed is white and elongated, the skin thin: it cooks evenly and thickens the broth. They are the base of pasta e fagioli, soups and stewed side dishes. 500 g pack.",
  "L'origano del Pollino si raccoglie in piena estate, quando la pianta è più aromatica, e si essicca all'ombra per trattenere gli oli essenziali. Il profumo è più intenso di quello del prodotto commerciale: basta poco per condire pomodori, carni alla brace e verdure grigliate. Confezione da 30 g.":
    "Pollino oregano is picked in high summer, when the plant is most aromatic, and dried in the shade to keep the essential oils. The aroma is more intense than the commercial product: a little is enough to season tomatoes, grilled meat and griddled vegetables. 30 g pack.",
  "I pomodori vengono essiccati al sole, poi ammorbiditi e conservati in olio di oliva con origano e peperoncino. Il sapore è concentrato e la consistenza carnosa: si servono sui crostini, si aggiungono alla pasta o farciscono una focaccia. Vasetto da 280 g.":
    "The tomatoes are dried in the sun, then softened and preserved in olive oil with oregano and chilli. The flavour is concentrated and the texture meaty: serve them on crostini, add them to pasta or use them to fill a focaccia. 280 g jar.",
  "Il guanciale si ricava dalla guancia del suino, salata e stagionata con pepe nero. È il grasso che dà avvio a un soffritto: si scioglie in padella e lascia il fondo saporito per sughi, zuppe e legumi. Si taglia a listarelle e si consuma cotto. Prezzo indicativo al chilogrammo.":
    "Guanciale is made from the pork cheek, salted and aged with black pepper. It is the fat that starts a soffritto: it melts in the pan and leaves a savoury base for sauces, soups and pulses. Cut it into strips and eat it cooked. Indicative price per kilogram.",
  "La soppressata è il salume che si prepara con il freddo, macinando la carne di suino a grana grossa con pepe e peperoncino, poi pressata e stagionata. Il sapore è pieno e leggermente piccante, la fetta compatta. Si serve sul tagliere con le olive nere, sulla pizza o in un panino con il caciocavallo. Prezzo indicativo al chilogrammo.":
    "Soppressata is the cured meat made in the cold months, grinding pork coarsely with pepper and chilli, then pressing and ageing it. The flavour is full and slightly spicy, the slice compact. Serve it on a board with black olives, on pizza or in a sandwich with caciocavallo. Indicative price per kilogram.",
  "Il miele di sulla si ottiene dal nettare dei prati di sulla che fioriscono tra la primavera e l'inizio dell'estate nel territorio del Pollino. È chiaro, quasi trasparente, con un profumo floreale leggero e un sapore dolce che non copre: perfetto a colazione, sui formaggi freschi come la giuncata o per dolcificare uno yogurt. Vasetto da 500 g.":
    "Sulla honey comes from the nectar of the sulla meadows that flower between spring and early summer in the Pollino area. It is pale, almost transparent, with a light floral scent and a sweet flavour that does not overpower: perfect at breakfast, on fresh cheeses such as giuncata or to sweeten a yoghurt. 500 g jar.",
  "La Roggianella è una cultivar di olivo che cresce sulle colline del Pollino e dà un olio dal frutto delicato, con sentori di mandorla e carciofo. Essendo monocultivar, il profilo resta riconoscibile anno dopo anno: è un olio da usare a crudo, sulle bruschette, sulle verdure lessate o su una zuppa di lenticchie. Bottiglia da 500 ml.":
    "Roggianella is an olive cultivar that grows on the hills of the Pollino and gives an oil with delicate fruit, with hints of almond and artichoke. Being a single variety, the profile stays recognisable year after year: it is an oil to use raw, on bruschette, on boiled vegetables or on lentil soup. 500 ml bottle.",
  "I porcini crescono nei boschi di faggio e castagno del Pollino da agosto a novembre, quando l'umidità e il fresco li fanno uscire. Hanno cappello carnoso e gambo sodo, profumo di sottobosco e sapore pieno: si cucinano trifolati, con la pasta, sotto l'arrosto o si essiccano per l'inverno. Prezzo indicativo al chilogrammo.":
    "Porcini grow in the beech and chestnut woods of the Pollino from August to November, when humidity and cool air bring them out. They have a meaty cap and a firm stem, a smell of undergrowth and a full flavour: cook them trifolati, with pasta, under a roast, or dry them for the winter. Indicative price per kilogram.",
  "Le confetture del Pollino nascono dalla frutta dei campi e degli alberi del territorio — fichi, prugne, more — cotta con zucchero e qualche goccia di limone. Restano dense e con pezzi di frutta visibili: si servono a colazione, con lo yogurt o in abbinamento ai formaggi stagionati come il pecorino. Vasetto da 350 g.":
    "The preserves of the Pollino come from the fruit of the fields and trees of the area — figs, plums, blackberries — cooked with sugar and a few drops of lemon. They stay thick with visible pieces of fruit: serve them at breakfast, with yoghurt or paired with aged cheeses such as pecorino. 350 g jar.",
  "Il pane di Cerchiara è il pane del borgo ai piedi del Pollino: farina di grano, lievito madre e una lunga lievitazione, poi cottura in forno a legna. La crosta è scura e croccante, la mollica alveolata e profumata. Si taglia per le bruschette, si conserva per giorni e, raffermo, diventa la base delle polpette di pane e delle panzanelle. Prezzo indicativo al chilogrammo.":
    "Cerchiara bread is the bread of the village at the foot of the Pollino: wheat flour, sourdough starter and a long rise, then baking in a wood-fired oven. The crust is dark and crunchy, the crumb open and fragrant. Slice it for bruschette, keep it for days and, once stale, use it as the base for bread balls and panzanelle. Indicative price per kilogram.",
  "Il bocconotto di Mormanno è un dolce tradizionale dello stesso paese che dà il nome alla lenticchia: un guscio di pasta frolla che racchiude cioccolato, noci e spezie, cotto al forno fino a scurire la superficie. Si serve come dessert di fine pasto, meglio con un bicchiere di Moscato al governo di Saracena. Prezzo indicativo al chilogrammo.":
    "The bocconotto of Mormanno is a traditional sweet from the same village that gives the lentil its name: a shortcrust shell enclosing chocolate, walnuts and spices, baked until the surface darkens. Serve it as a dessert at the end of the meal, better with a glass of Moscato al governo di Saracena. Indicative price per kilogram.",
  "I cannaritoli sono il dolce del Natale di Morano Calabro: una sfoglia arrotolata e fritta, poi passata nel miele caldo, che diventa croccante e lucida. Il sapore ricorda il mosto cotto e il miele del Pollino, due ingredienti che il territorio produce. Si preparano per le feste e si conservano per qualche giorno in una scatola di latta. Prezzo indicativo al chilogrammo.":
    "Cannaritoli are the Christmas sweet of Morano Calabro: a rolled pastry, fried and then dipped in hot honey, which becomes crunchy and glossy. The flavour recalls mosto cotto and Pollino honey, two ingredients the area produces. They are made for the holidays and keep for a few days in a tin box. Indicative price per kilogram.",
  "Le melanzane vengono affettate sottili, lasciate perdere l'acqua amara e conservate in olio di oliva con aglio e peperoncino. Sono un antipasto pronto da portare in tavola con il pane, ma stanno bene anche su una bruschetta o accanto a un tagliere di formaggi. Vasetto da 280 g.":
    "The aubergines are sliced thin, left to lose their bitter water and preserved in olive oil with garlic and chilli. They are an antipasto ready for the table with bread, but they also work on a bruschetta or next to a cheese board. 280 g jar.",
  "La pitta 'mpigliata è il dolce delle feste del Pollino: sfoglie sottili arrotolate su se stesse e farcite con noci, uvetta, miele e mosto cotto, poi cotte al forno fino a diventare dorate. Si taglia a fette sottili e si accompagna con il Moscato al governo di Saracena, che ne esalta il profumo di fico e di spezie. Prezzo indicativo al chilogrammo.":
    "Pitta 'mpigliata is the festive sweet of the Pollino: thin sheets of pastry rolled on themselves and filled with walnuts, raisins, honey and mosto cotto, then baked until golden. Cut it into thin slices and serve it with Moscato al governo di Saracena, which brings out its aroma of fig and spice. Indicative price per kilogram.",
  "La cacioricotta nasce in estate, quando il latte delle greggi è più scarso: si lavora il latte di capra e di pecora con il caglio e si stagiona la forma fino a farla diventare asciutta. Il sapore è intenso e leggermente piccante; si taglia a scaglie sul tagliere oppure si grattugia sulla pasta al forno. Prezzo indicativo al chilogrammo.":
    "Cacioricotta is made in summer, when the flocks give less milk: goat's and sheep's milk are worked with rennet and the wheel is aged until it becomes dry. The flavour is intense and slightly spicy; shave it onto a board or grate it over baked pasta. Indicative price per kilogram.",
  "La Melanzana Rossa di Rotonda è un ortaggio a denominazione di origine protetta coltivato nel versante del Pollino che guarda la valle del Lao, a pochi chilometri da Castrovillari. Ha buccia sottile, polpa chiara e pochi semi, quindi regge bene la cottura al forno e la frittura. In cucina è la base della parmigiana e degli involtini, oppure si conserva sott'olio per l'inverno. Prezzo indicativo al chilogrammo.":
    "The Melanzana Rossa di Rotonda is a vegetable with protected designation of origin grown on the side of the Pollino that faces the Lao valley, a few kilometres from Castrovillari. It has a thin skin, pale flesh and few seeds, so it holds up well to baking and frying. In the kitchen it is the base of parmigiana and involtini, or it is preserved in oil for the winter. Indicative price per kilogram.",
  "Il Caciocavallo Silano è un formaggio a denominazione di origine protetta a pasta filata, prodotto con latte vaccino e stagionato a coppie legate. La zona di produzione comprende il versante del Pollino: la pasta è compatta, il sapore va dal dolce del fresco al piccante del molto stagionato. Si taglia a fette per la piastra, si gratinano i primi piatti o si porta in tavola sul tagliere. Prezzo indicativo al chilogrammo.":
    "Caciocavallo Silano is a stretched-curd cheese with protected designation of origin, made from cow's milk and aged in tied pairs. The production area includes the Pollino side: the paste is compact and the flavour goes from the sweetness of the fresh cheese to the spice of the long-aged one. Slice it for the griddle, grate it over baked first courses or bring it to the table on a board. Indicative price per kilogram.",
  "La ’nduja di Spilinga è una specialità calabrese morbida e piccante, ideale da spalmare su pane e bruschette. Formato indicativo circa 350 g.":
    "The ’nduja of Spilinga is a soft, spicy Calabrian speciality, ideal for spreading on bread and bruschette. Indicative size about 350 g.",
  "La fileja è un formato di pasta tradizionale calabrese, adatto a sughi corposi e condimenti della cucina mediterranea. Confezione da 500 g.":
    "Fileja is a traditional Calabrian pasta shape, suited to rich sauces and Mediterranean dressings. 500 g pack.",
  "La Cipolla Rossa di Tropea IGP è una delle specialità più note della Calabria. Proposta in treccia, con peso indicativo di circa 1,5 kg.":
    "The Cipolla Rossa di Tropea PGI is one of the best-known specialities of Calabria. Offered in a braid, with an indicative weight of about 1.5 kg.",
  "Torrone mielato ispirato alla tradizione dolciaria di Bagnara Calabra. Confezione da 500 g.":
    "Honey torrone inspired by the confectionery tradition of Bagnara Calabra. 500 g pack.",
  "Il pecorino del Monte Poro è un formaggio della tradizione pastorale calabrese. Peso indicativo della forma circa 1,2 kg.":
    "Pecorino del Monte Poro is a cheese of the Calabrian pastoral tradition. Indicative wheel weight about 1.2 kg.",
  "Olio extravergine d’oliva in bottiglia da 1 litro, adatto a condire e valorizzare i piatti della cucina mediterranea.":
    "Extra virgin olive oil in a one-litre bottle, suited to dressing and bringing out Mediterranean dishes.",
  "Liquirizia di Calabria DOP in confezione da 100 g, una specialità dal gusto intenso legata alla tradizione calabrese.":
    "Liquirizia di Calabria PDO in a 100 g pack, a speciality with an intense flavour linked to the Calabrian tradition.",
  "Le piparelle sono biscotti tradizionali calabresi, croccanti e adatti da accompagnare a caffè e dessert. Confezione da 300 g.":
    "Piparelle are traditional Calabrian biscuits, crunchy and good with coffee and desserts. 300 g pack.",
  "La ciotaredda è il dolcetto tradizionale di Castrovillari, preparato con farina, noci, mosto cotto, miele e scorza di limone. La forma ricorda quella dei mostaccioli, la pasta è compatta e il sapore arriva dal mosto cotto e dal miele del Pollino. Si prepara per le feste e si accompagna con il Moscato al governo di Saracena. Prezzo indicativo al chilogrammo.":
    "Ciotaredda is the traditional sweet of Castrovillari, made with flour, walnuts, mosto cotto, honey and lemon zest. The shape recalls mostaccioli, the paste is compact and the flavour comes from mosto cotto and Pollino honey. It is made for the holidays and served with Moscato al governo di Saracena. Indicative price per kilogram.",
  "La dolcezza di cipolla è una confettura preparata con la Cipolla Bianca di Castrovillari, caramellata lentamente con zucchero e aceto fino a diventare densa e ambrata. Non è un prodotto certificato: è una conserva di laboratorio che usa la materia prima del territorio. Si abbina ai formaggi stagionati, alle carni arrosto e al pecorino, oppure si spalma su una bruschetta calda. Vasetto da 250 g.":
    "The onion preserve is a jam made with the White Onion of Castrovillari, slowly caramelised with sugar and vinegar until thick and amber. It is not a certified product: it is a workshop preserve that uses the area's raw material. Pair it with aged cheeses, roast meats and pecorino, or spread it on warm bruschetta. 250 g jar.",
  "La Cipolla Bianca di Castrovillari è un prodotto agricolo con Denominazione Comunale conferita dal Comune di Castrovillari, ecotipo locale di Allium cepa coltivato alle pendici del Pollino. Ha forma schiacciata, tunica bianca e un sapore dolce che non fa piangere: si usa cruda in insalata, nei soffritti, nelle zuppe e per la confettura. Si conserva a lungo in un luogo asciutto e ventilato. Prezzo indicativo al chilogrammo.":
    "The White Onion of Castrovillari is an agricultural product with a Municipal Designation granted by the Municipality of Castrovillari, a local ecotype of Allium cepa grown on the slopes of the Pollino. It has a flattened shape, a white tunic and a sweet flavour that does not make you cry: use it raw in salad, in soffritto, in soups and for the preserve. It keeps for a long time in a dry, airy place. Indicative price per kilogram.",
  "L'olio extravergine di oliva del Pollino nasce dagli oliveti che coprono le colline intorno al massiccio, con olive raccolte a mano o con agevolatori e molite in giornata. Il colore è verde intenso, il fruttato su erba e carciofo, l'amaro e il piccante presenti ma composti. È l'olio di base della cucina del territorio e si usa anche a crudo sulle verdure lessate. Bottiglia da 1 litro.":
    "Extra virgin olive oil from the Pollino comes from the olive groves covering the hills around the massif, with olives picked by hand or with combs and milled the same day. The colour is deep green, the fruitiness on grass and artichoke, the bitterness and pungency present but balanced. It is the base oil of the local cuisine and is also used raw on boiled vegetables. One-litre bottle.",
  "Il miele millefiori del Pollino è il miele delle fioriture che si susseguono sui pascoli del massiccio tra la primavera e l'estate: il risultato cambia di anno in anno e di apiario in apiario. Ha colore ambrato, profumo floreale e un sapore dolce e rotondo, con una lieve nota aromatica. Si usa a colazione, per dolcificare lo yogurt, sui formaggi freschi o per glassare un dolce. Vasetto da 500 g.":
    "Wildflower honey from the Pollino is the honey of the blooms that follow one another on the pastures of the massif between spring and summer: the result changes from year to year and from apiary to apiary. It has an amber colour, a floral scent and a sweet, rounded flavour with a slight aromatic note. Use it at breakfast, to sweeten yoghurt, on fresh cheeses or to glaze a cake. 500 g jar.",
  "Il miele di castagno si ottiene dal nettare dei castagneti che ricoprono le fasce più alte del Pollino e si raccoglie tra giugno e luglio. È scuro, quasi bruno, con un profumo di legno e un sapore deciso, leggermente amaro: per questo si abbina ai formaggi stagionati, al pecorino e al caciocavallo, più che ai dolci. Vasetto da 500 g.":
    "Chestnut honey comes from the nectar of the chestnut woods covering the higher belts of the Pollino and is harvested between June and July. It is dark, almost brown, with a smell of wood and a bold, slightly bitter flavour: for this reason it pairs with aged cheeses, pecorino and caciocavallo, rather than with sweets. 500 g jar.",
};
