/**
 * TERRITORI — traduzione inglese delle schede /territorio/[slug].
 *
 * I testi vengono da `lib/territori.ts`. Il racconto è reso da
 * `RaccontoTerritorio`, che lo divide in frasi e le mostra in span separati:
 * per questo le chiavi qui sotto sono le singole frasi (segmentazione
 * `Intl.Segmenter("it", { granularity: "sentence" })`), non i paragrafi.
 * Nomi propri di luoghi, persone, enti e prodotti restano in italiano.
 */
export const DIZIONARIO_TERRITORI: Record<string, string> = {
  // ── Etichette della scheda ────────────────────────────────────────────
  Riconoscimenti: "Designations",
  "DOP, IGP e STG sono denominazioni europee; PAT è un riconoscimento regionale; DE.CO. è una denominazione comunale.":
    "PDO, PGI and TSG are European designations; PAT is a regional recognition; DE.CO. is a municipal designation.",
  "Torna a tutti i territori": "Back to all territories",
  "Mostra tutto il testo": "Show the full text",
  "Mostra meno": "Show less",
  "Altri territori — Parchi": "Other territories — Parks",
  "Altri territori — Aree territoriali": "Other territories — Territorial areas",
  "Altri territori — Comuni": "Other territories — Municipalities",
  "Altri territori: Parchi": "Other territories: Parks",
  "Altri territori: Aree territoriali": "Other territories: Territorial areas",
  "Altri territori: Comuni": "Other territories: Municipalities",
  "Archivio Radici Calabria": "Radici Calabria Archive",
  "immagine fornita per la demo": "image provided for the demo",

  // ── Didascalie delle fotografie ───────────────────────────────────────
  "Escursionisti tra i prati fioriti ai piedi del massiccio del Pollino":
    "Hikers among flowering meadows at the foot of the Pollino massif",
  "Torrente tra i faggi nel bosco autunnale della Sila":
    "Stream among beech trees in the autumn woods of the Sila",
  "Paesaggio dell'Aspromonte lungo la strada di Pentedattilo, nel comune di Melito di Porto Salvo":
    "Aspromonte landscape along the Pentedattilo road, in the municipality of Melito di Porto Salvo",
  "Spiaggia di Tropea vista dall'alto con il borgo sulla falesia":
    "Tropea beach seen from above with the village on the cliff",
  "Campagna della Piana di Crotone tra uliveti e colline":
    "Countryside of the Piana di Crotone among olive groves and hills",
  "La Piana di Sibari con gli agrumeti e il mare sullo sfondo":
    "The Piana di Sibari with its citrus groves and the sea in the background",
  "Vigneto con grappoli d'uva nera in primo piano tra i filari":
    "Vineyard with bunches of black grapes in the foreground between the rows",
  "Panorama di Morano Calabro ai piedi del Pollino":
    "Panorama of Morano Calabro at the foot of the Pollino",
  "Lago con riva erbosa e staccionata in legno nel territorio di Mormanno":
    "Lake with a grassy shore and a wooden fence in the area of Mormanno",
  "Veduta di Rotonda ai piedi del Pollino": "View of Rotonda at the foot of the Pollino",

  // ── Pollino ───────────────────────────────────────────────────────────
  "Il Parco Nazionale del Pollino si estende su 192.565 ettari e comprende 56 comuni, 24 in Basilicata e 32 in Calabria, nelle province di Cosenza, Matera e Potenza.":
    "The Pollino National Park covers 192,565 hectares and includes 56 municipalities, 24 in Basilicata and 32 in Calabria, in the provinces of Cosenza, Matera and Potenza.",
  "È attraversato dai massicci del Pollino, dell'Orsomarso e dal Monte Alpi e va dal Mar Tirreno allo Ionio: da Cozzo del Pellegrino a Serra Dolcedorme, dai Piani di Campolongo, Novacco e Lanzo ai Piani del Pollino, dalle gole del Lao e del Raganello ai fiumi Argentino e Abatemarco.":
    "It is crossed by the Pollino and Orsomarso massifs and by Monte Alpi, and runs from the Tyrrhenian Sea to the Ionian: from Cozzo del Pellegrino to Serra Dolcedorme, from the Piani di Campolongo, Novacco and Lanzo to the Piani del Pollino, from the Lao and Raganello gorges to the Argentino and Abatemarco rivers.",
  "L'Ente Parco è stato istituito con DPR del 15 novembre 1993 e ha sede a Rotonda, nel Complesso Monumentale di Santa Maria della Consolazione; la seconda sede istituzionale è a Castrovillari, a Palazzo Gallo.":
    "The Park Authority was established by Presidential Decree of 15 November 1993 and is based in Rotonda, in the Monumental Complex of Santa Maria della Consolazione; its second institutional seat is in Castrovillari, at Palazzo Gallo.",
  "Il simbolo del Parco è il pino loricato, specie relicta che cresce sulle rupi d'alta quota.":
    "The symbol of the Park is the loricate pine, a relict species that grows on high-altitude cliffs.",
  "Dal 2015 il territorio è Geoparco Mondiale UNESCO.":
    "Since 2015 the area has been a UNESCO Global Geopark.",
  "Sul versante calabrese il paesaggio unisce faggete, castagneti, querceti e pascoli; l'economia tradizionale è legata a pastorizia, castanicoltura, olivicoltura e raccolta di erbe officinali.":
    "On the Calabrian side the landscape combines beech woods, chestnut groves, oak woods and pastures; the traditional economy is linked to sheep farming, chestnut growing, olive growing and the gathering of medicinal herbs.",
  "Le gole del Raganello e i piani di Campotenese sono tra i riferimenti più noti per la visita.":
    "The Raganello gorges and the Campotenese plains are among the best-known places to visit.",
  "Pecorino del Pollino e Cacioricotta del Pollino sono specialità tradizionali del comprensorio iscritte all'elenco regionale.":
    "Pecorino del Pollino and Cacioricotta del Pollino are traditional specialities of the area, listed in the regional register.",

  // ── Sila ──────────────────────────────────────────────────────────────
  "Il Parco Nazionale della Sila è stato istituito con la legge 344/1997 e l'Ente con DPR del 14 novembre 2002, raccogliendo l'eredità del Parco Nazionale della Calabria del 1968.":
    "The Sila National Park was established by law 344/1997 and its Authority by Presidential Decree of 14 November 2002, taking over the legacy of the 1968 Calabria National Park.",
  "Si estende su 73.695 ettari in 19 comuni delle province di Cosenza, Catanzaro e Crotone, sul più grande altopiano d'Europa, articolato in Sila Grande, Sila Greca e Sila Piccola.":
    "It covers 73,695 hectares in 19 municipalities of the provinces of Cosenza, Catanzaro and Crotone, on the largest plateau in Europe, divided into Sila Grande, Sila Greca and Sila Piccola.",
  "I boschi coprono l'81% della superficie del Parco: il pino laricio interessa il 43% delle aree boscate e il faggio il 35%.":
    "Woods cover 81% of the Park: Laricio pine accounts for 43% of the wooded areas and beech for 35%.",
  "Le cime principali sono il Monte Botte Donato (1.928 m) in Sila Grande e il Monte Gariglione (1.764 m) in Sila Piccola.":
    "The main peaks are Monte Botte Donato (1,928 m) in Sila Grande and Monte Gariglione (1,764 m) in Sila Piccola.",
  "La Riserva della Biosfera Sila è riconosciuta dal programma UNESCO Man and Biosphere.":
    "The Sila Biosphere Reserve is recognised by the UNESCO Man and Biosphere programme.",
  "L'altopiano è segnato da laghi, antichi mulini, abbazie e santuari; la pastorizia e la lavorazione del latte hanno costruito nei secoli un paesaggio di pascoli e caseifici.":
    "The plateau is marked by lakes, old mills, abbeys and sanctuaries; sheep farming and dairy work have shaped a landscape of pastures and dairies over the centuries.",
  "La patata della Sila è la produzione più identificativa, accanto ai formaggi e ai salumi della tradizione silana.":
    "The Sila potato is the most distinctive production, alongside the cheeses and cured meats of the Sila tradition.",
  "Il Caciocavallo Silano DOP è prodotto in un comprensorio che comprende la Sila e altri territori calabresi.":
    "Caciocavallo Silano PDO is produced in an area that includes the Sila and other parts of Calabria.",
  "La Patata della Sila è tutelata come Indicazione Geografica Protetta.":
    "The Sila potato is protected as a Protected Geographical Indication.",

  // ── Aspromonte ────────────────────────────────────────────────────────
  "Il Parco Nazionale dell'Aspromonte è stato istituito con la legge 305/1989 e il suo Ente con DPR del 14 gennaio 1994; si estende su 64.544 ettari nella provincia di Reggio Calabria e interessa 37 comuni.":
    "The Aspromonte National Park was established by law 305/1989 and its Authority by Presidential Decree of 14 January 1994; it covers 64,544 hectares in the province of Reggio Calabria and involves 37 municipalities.",
  "Il massiccio appartiene all'Arco Calabro-Peloritano, un settore geologico distinto dall'Appennino circostante, e sale rapidamente dalle coste fino a Montalto, la cima più alta con i suoi 1.955 metri.":
    "The massif belongs to the Calabrian-Peloritan Arc, a geological sector distinct from the surrounding Apennines, and rises steeply from the coast up to Montalto, the highest peak at 1,955 metres.",
  "Il paesaggio alterna faggete, abetine, pinete, lecci e macchia mediterranea, con una biodiversità tra le più articolate d'Europa.":
    "The landscape alternates beech woods, fir woods, pine woods, holm oaks and Mediterranean scrub, with a biodiversity among the richest in Europe.",
  "Il Parco ospita specie come il lupo, l'aquila reale, il gufo reale e l'astore.":
    "The Park is home to species such as the wolf, the golden eagle, the eagle owl and the goshawk.",
  "Dal 21 aprile 2021 l'intero territorio del Parco è riconosciuto come Aspromonte UNESCO Global Geopark.":
    "Since 21 April 2021 the entire Park area has been recognised as the Aspromonte UNESCO Global Geopark.",
  "L'identità del massiccio nasce dall'incontro tra la montagna e il mare: i borghi grecanici e arbëreshë conservano lingua e riti, mentre l'artigianato e la cucina raccontano un'economia di pascolo, castagneto e olivicoltura.":
    "The identity of the massif comes from the meeting of mountain and sea: the Greek and Arbëreshë villages keep their language and rites alive, while crafts and cooking tell of an economy of pasture, chestnut groves and olive growing.",
  "Nell'area di Reggio Calabria matura il bergamotto, agrume di cui l'Italia è di fatto l'unico produttore mondiale.":
    "In the Reggio Calabria area bergamot ripens, a citrus fruit of which Italy is in practice the world's only producer.",
  "Il Bergamotto di Reggio Calabria - Olio essenziale DOP ha zona di produzione provinciale.":
    "Bergamotto di Reggio Calabria - Olio essenziale PDO has its production area within the province.",
  "Il Torrone mielato di Bagnara Calabra è iscritto tra i Prodotti Agroalimentari Tradizionali della Calabria.":
    "The honey torrone of Bagnara Calabra is listed among the Traditional Agri-food Products of Calabria.",

  // ── Costa degli Dei ───────────────────────────────────────────────────
  "La Costa degli Dei è il tratto di litorale tirrenico calabrese che va da Pizzo Calabro a Nicotera, per circa 55 chilometri, attraversando i comuni di Vibo Valentia, Briatico, Zambrone, Parghelia, Tropea, Ricadi, Joppolo e Nicotera.":
    "The Costa degli Dei is the stretch of Calabrian Tyrrhenian coastline running from Pizzo Calabro to Nicotera, about 55 kilometres, through the municipalities of Vibo Valentia, Briatico, Zambrone, Parghelia, Tropea, Ricadi, Joppolo and Nicotera.",
  "Il nome rimanda a una leggenda legata all'antica Hipponion, secondo cui gli dei avrebbero scelto questa costa per la sua bellezza.":
    "The name refers to a legend linked to ancient Hipponion, according to which the gods chose this coast for its beauty.",
  "Il paesaggio alterna spiagge di sabbia chiara, falesie a picco sul mare e calette raggiungibili solo via mare; a Capo Vaticano, nel comune di Ricadi, affiora il granito rosa lavorato dal vento e dal mare.":
    "The landscape alternates pale sand beaches, cliffs dropping straight to the sea and coves reachable only by boat; at Capo Vaticano, in the municipality of Ricadi, pink granite shaped by wind and sea comes to the surface.",
  "A Tropea il Santuario di Santa Maria dell'Isola sorge su un promontorio quasi interamente circondato dall'acqua.":
    "In Tropea the Sanctuary of Santa Maria dell'Isola stands on a promontory almost entirely surrounded by water.",
  "L'entroterra è agricolo e terrazzato: la cipolla rossa di Tropea è la coltura più riconoscibile del comprensorio, accanto a oliveti e agrumeti.":
    "The hinterland is farmed and terraced: the red onion of Tropea is the most recognisable crop of the area, alongside olive groves and citrus orchards.",
  "La cucina costiera unisce pesce, conserve vegetali e i salumi piccanti dell'entroterra vibonese, come la 'nduja di Spilinga.":
    "Coastal cooking combines fish, vegetable preserves and the spicy cured meats of the Vibo hinterland, such as the 'nduja of Spilinga.",
  "La Cipolla Rossa di Tropea Calabria è tutelata come Indicazione Geografica Protetta.":
    "The Red Onion of Tropea Calabria is protected as a Protected Geographical Indication.",
  "Il Pecorino del Monte Poro DOP nasce nell'entroterra collinare vibonese.":
    "Pecorino del Monte Poro PDO comes from the hilly hinterland of Vibo Valentia.",
  "La 'Nduja di Spilinga è una specialità tradizionale iscritta all'elenco regionale.":
    "The 'Nduja of Spilinga is a traditional speciality listed in the regional register.",

  // ── Piana di Crotone ──────────────────────────────────────────────────
  "La piana di Crotone si apre sul Mar Ionio, alla foce dell'Esaro, ed è delimitata dalle colline argillose del Marchesato e dalle pendici orientali della Sila.":
    "The plain of Crotone opens onto the Ionian Sea at the mouth of the Esaro, bordered by the clay hills of the Marchesato and the eastern slopes of the Sila.",
  "Il nome Marchesato deriva dal titolo dei Ruffo di Calabria, che fino al Quattrocento tennero come feudo la città e il suo territorio.":
    "The name Marchesato comes from the title of the Ruffo di Calabria, who held the city and its territory as a fief until the fifteenth century.",
  "Kroton fu fondata alla fine dell'VIII secolo a.C. da coloni achei; nel V secolo raggiunse il massimo splendore e divenne uno dei centri più importanti della Magna Grecia.":
    "Kroton was founded at the end of the 8th century BC by Achaean colonists; in the 5th century it reached its greatest splendour and became one of the most important centres of Magna Graecia.",
  "L'entroterra collinare, un tempo chiamato «granaio della Calabria» per la vocazione cerealicola, è oggi segnato dai calanchi, forme di erosione nelle argille plioceniche.":
    "The hilly hinterland, once called the «granary of Calabria» for its grain growing, is today marked by calanchi, forms of erosion in the Pliocene clays.",
  "L'agricoltura della piana unisce cereali, ortaggi, uliveti e vigneti; la pastorizia dell'entroterra sostiene la produzione casearia, mentre sul promontorio di Capo Colonna restano le tracce del santuario dedicato a Hera Lacinia.":
    "The farming of the plain combines cereals, vegetables, olive groves and vineyards; sheep farming in the hinterland supports dairy production, while on the promontory of Capo Colonna traces remain of the sanctuary dedicated to Hera Lacinia.",
  "Pecorino Crotonese e Olio EVO Alto Crotonese sono denominazioni del comprensorio crotonese.":
    "Pecorino Crotonese and Olio EVO Alto Crotonese are designations of the Crotone area.",
  "Il Finocchio di Isola Capo Rizzuto è tutelato come IGP.":
    "The fennel of Isola Capo Rizzuto is protected as a PGI.",

  // ── Piana di Sibari ───────────────────────────────────────────────────
  "La Piana di Sibari è la vasta pianura alluvionale della costa ionica cosentina, solcata dai fiumi Crati e Coscile (l'antico Sybaris) e circondata dal Pollino e dalle ultime propaggini della Sila Greca.":
    "The Piana di Sibari is the wide alluvial plain of the Cosenza Ionian coast, cut by the Crati and Coscile rivers (the ancient Sybaris) and surrounded by the Pollino and the last foothills of the Sila Greca.",
  "Qui, nel 720 a.C., i coloni achei fondarono Sibari, una delle città più potenti della Magna Grecia.":
    "Here, in 720 BC, Achaean colonists founded Sybaris, one of the most powerful cities of Magna Graecia.",
  "Sibari fu distrutta nel 510 a.C. dai crotonesi; nel 444-443 a.C. sullo stesso sito nacque la colonia panellenica di Thurii e nel 193 a.C. la colonia latina di Copia.":
    "Sybaris was destroyed in 510 BC by the Crotonians; in 444-443 BC the panhellenic colony of Thurii was founded on the same site, and in 193 BC the Latin colony of Copia.",
  "L'area archeologica di Sybaris-Thurii-Copiae conserva questa stratificazione di oltre dieci secoli ed è oggi Parco Archeologico della Sibaritide, con il Museo Archeologico Nazionale.":
    "The archaeological area of Sybaris-Thurii-Copiae preserves this stratification of more than ten centuries and is today the Sibaritide Archaeological Park, with the National Archaeological Museum.",
  "La bonifica novecentesca ha trasformato la pianura paludosa in terreno agricolo: riso, agrumi, ortaggi e cereali sono le colture prevalenti, in un paesaggio di campi regolari delimitati da canali.":
    "Twentieth-century land reclamation turned the marshy plain into farmland: rice, citrus fruit, vegetables and cereals are the main crops, in a landscape of regular fields bordered by canals.",
  "Le Clementine di Calabria e il Limone di Rocca Imperiale sono tutelati come IGP.":
    "The Clementines of Calabria and the Lemon of Rocca Imperiale are protected as PGIs.",

  // ── Castrovillari ─────────────────────────────────────────────────────
  "Castrovillari sorge a 362 metri di altitudine, su uno sperone roccioso che domina la piana del Coscile e guarda il massiccio del Pollino.":
    "Castrovillari stands at 362 metres above sea level, on a rocky spur overlooking the plain of the Coscile and facing the Pollino massif.",
  "Il nome deriva probabilmente dal latino medievale castrum villarum, «fortezza delle ville»; le prime tracce di insediamento risalgono al Paleolitico inferiore.":
    "The name probably comes from the medieval Latin castrum villarum, «fortress of the villas»; the first traces of settlement date back to the Lower Palaeolithic.",
  "La città fu dominata da Normanni, Svevi, Angioini e Aragonesi e fino al 1806 appartenne al Conte di Cariati.":
    "The city was ruled by the Normans, Swabians, Angevins and Aragonese, and until 1806 it belonged to the Count of Cariati.",
  "Il centro storico, la Civita, conserva il Castello Aragonese, la Chiesa di Santa Maria del Castello con le grotte eremitiche, la Chiesa di San Giuliano (1264) e il Protoconvento Francescano (1220), oggi sede del Museo Archeologico.":
    "The old town, the Civita, preserves the Aragonese Castle, the Church of Santa Maria del Castello with its hermit caves, the Church of San Giuliano (1264) and the Franciscan Protoconvent (1220), today home to the Archaeological Museum.",
  "L'agricoltura della conca è legata alla cipolla bianca, coltura identificativa del territorio, e alla tradizione ortofrutticola della piana.":
    "The farming of the basin is linked to the white onion, the area's signature crop, and to the fruit and vegetable tradition of the plain.",
  "Il Carnevale di Castrovillari è l'evento pubblico più noto della città.":
    "The Carnival of Castrovillari is the city's best-known public event.",
  "La Ciotaredda di Castrovillari è iscritta all'elenco dei Prodotti Agroalimentari Tradizionali.":
    "The Ciotaredda of Castrovillari is listed in the register of Traditional Agri-food Products.",
  "La Cipolla Bianca di Castrovillari è tutelata da una Denominazione Comunale di Origine.":
    "The White Onion of Castrovillari is protected by a Municipal Designation of Origin.",

  // ── Morano Calabro ────────────────────────────────────────────────────
  "Morano Calabro sorge a 694 metri di altitudine su un colle conico ai piedi del massiccio del Pollino, con le case disposte a gradoni che compongono uno dei profili più riconoscibili della Calabria.":
    "Morano Calabro stands at 694 metres above sea level on a conical hill at the foot of the Pollino massif, its houses arranged in tiers to form one of the most recognisable profiles in Calabria.",
  "Il toponimo Muranum compare per la prima volta su una pietra miliare del II secolo a.C.; l'aggettivo «Calabro» fu aggiunto nel 1863 per distinguerlo da Morano sul Po.":
    "The place name Muranum appears for the first time on a milestone of the 2nd century BC; the adjective «Calabro» was added in 1863 to distinguish it from Morano sul Po.",
  "Il borgo fu feudo dei Morano, dei Fasanella e di Antonello Fuscaldo, passò agli Aragonesi ai Sanseverino di Bisignano e nel 1614 agli Spinelli di Scalea, che lo tennero fino all'eversione della feudalità nel 1806.":
    "The village was a fief of the Morano, the Fasanella and Antonello Fuscaldo, passed to the Aragonese, then to the Sanseverino of Bisignano and in 1614 to the Spinelli of Scalea, who held it until feudalism was abolished in 1806.",
  "Conserva il castello di età normanna, la Collegiata dei Santi Pietro e Paolo, la chiesa di San Bernardino e i ruderi del Convento di Colloreto.":
    "It preserves the Norman castle, the Collegiate Church of Saints Peter and Paul, the church of San Bernardino and the ruins of the Convent of Colloreto.",
  "L'economia tradizionale è agro-pastorale: orti, oliveti e allevamento sostengono le produzioni casearie e le conserve della tradizione.":
    "The traditional economy is based on farming and pastoralism: vegetable plots, olive groves and livestock support dairy production and traditional preserves.",
  "Il borgo fa parte de I Borghi più belli d'Italia.":
    "The village is part of I Borghi più belli d'Italia, the association of the most beautiful villages in Italy.",
  "La Felciata di Morano e la Pitta 'mpigliata sono specialità iscritte all'elenco regionale.":
    "The Felciata di Morano and the Pitta 'mpigliata are specialities listed in the regional register.",

  // ── Mormanno ──────────────────────────────────────────────────────────
  "Mormanno sorge a 840 metri di altitudine, ai confini con la Basilicata, alle pendici del Monte Cerviero e sulla valle del Mercure.":
    "Mormanno stands at 840 metres above sea level, on the border with Basilicata, on the slopes of Monte Cerviero and in the Mercure valley.",
  "Il nome originario Miromagnum rimanda all'idea di «grande vista»: dal borgo lo sguardo abbraccia la catena del Pollino e il paesaggio montano circostante.":
    "The original name Miromagnum suggests the idea of a «great view»: from the village the eye takes in the Pollino range and the surrounding mountain landscape.",
  "Il centro storico si articola sui colli Costa, San Michele, Torretta e San Rocco, con vicoli in pietra e portali scolpiti.":
    "The old town is spread over the Costa, San Michele, Torretta and San Rocco hills, with stone alleys and carved portals.",
  "Il cuore religioso è la Cattedrale di Santa Maria del Colle, eretta nel 1183 e ampliata fino all'impianto settecentesco a tre navate; poco fuori dall'abitato si trova il Faro Votivo dedicato ai caduti della Prima guerra mondiale.":
    "The religious heart is the Cathedral of Santa Maria del Colle, built in 1183 and enlarged up to the eighteenth-century three-nave layout; just outside the town stands the Votive Lighthouse dedicated to the fallen of the First World War.",
  "L'economia storica è legata alla pastorizia e ai legumi: lenticchie e «poverelli bianchi» sono le produzioni più citate, accanto ai bocconotti, dolce simbolo della gastronomia locale.":
    "The historic economy is linked to sheep farming and pulses: lentils and «poverelli bianchi» are the most cited productions, alongside bocconotti, the sweet symbol of local gastronomy.",
  "Il territorio comunale è interamente compreso nel Parco Nazionale del Pollino.":
    "The municipal area lies entirely within the Pollino National Park.",
  "Il Bocconotto di Mormanno e il Pecorino del Pollino sono iscritti all'elenco regionale.":
    "The Bocconotto of Mormanno and Pecorino del Pollino are listed in the regional register.",

  // ── Rotonda ───────────────────────────────────────────────────────────
  "Rotonda sorge a 580 metri di altitudine in provincia di Potenza, ai confini con la Calabria, e rientra nel Parco Nazionale del Pollino.":
    "Rotonda stands at 580 metres above sea level in the province of Potenza, on the border with Calabria, and lies within the Pollino National Park.",
  "Il Santuario di Santa Maria della Consolazione, iniziato nel 1558 e terminato nel 1574, sorge a circa un chilometro dal paese; le ali laterali ospitano la sede amministrativa dell'Ente Parco.":
    "The Sanctuary of Santa Maria della Consolazione, begun in 1558 and completed in 1574, stands about a kilometre from the village; its side wings house the administrative headquarters of the Park Authority.",
  "Il territorio comunale è compreso nella Valle del Mercure, il corridoio che collega il Pollino alla Basilicata.":
    "The municipal area lies in the Mercure Valley, the corridor linking the Pollino to Basilicata.",
  "L'agricoltura è storicamente legata ai legumi e agli ortaggi, in un paesaggio di campi e pascoli ai piedi dei rilievi.":
    "Farming has historically been linked to pulses and vegetables, in a landscape of fields and pastures at the foot of the mountains.",
  "Due produzioni orticole del comune hanno ottenuto la Denominazione di Origine Protetta europea: i Fagioli Bianchi di Rotonda DOP, dagli ecotipi Fagiolo Bianco e Tondino (Poverello Bianco), e la Melanzana Rossa di Rotonda DOP.":
    "Two vegetable productions of the municipality have obtained the European Protected Designation of Origin: the Fagioli Bianchi di Rotonda PDO, from the Fagiolo Bianco and Tondino (Poverello Bianco) ecotypes, and the Melanzana Rossa di Rotonda PDO.",
  "Fagioli Bianchi di Rotonda DOP — Reg. UE n. 240 dell'11.03.2011. Zona di produzione: Rotonda, Viggianello, Castelluccio Superiore e Castelluccio Inferiore.":
    "Fagioli Bianchi di Rotonda PDO — EU Reg. no. 240 of 11.03.2011. Production area: Rotonda, Viggianello, Castelluccio Superiore and Castelluccio Inferiore.",
  "Melanzana Rossa di Rotonda DOP — Reg. UE n. 624 del 15.07.2010, provincia di Potenza.":
    "Melanzana Rossa di Rotonda PDO — EU Reg. no. 624 of 15.07.2010, province of Potenza.",
  "Peperone di Senise e Crusco di Senise sono IGP della vicina area lucana del Pollino.":
    "Peperone di Senise and Crusco di Senise are PGIs from the nearby Lucanian area of the Pollino.",
};
