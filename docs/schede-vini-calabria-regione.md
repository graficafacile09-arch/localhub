# Schede vini Calabria — riferimento regionale (fuori dal demo)
**Non è la selezione usata dal demo.** Il demo di Pino usa solo i vini
dell'area del Pollino, con le schede in `docs/schede-vini-calabria.md`.
Questo file conserva le schede delle altre denominazioni calabresi come
documentazione regionale.


Schede di servizio per il modulo in cui **Pino crea ricette e abbinamenti**.
Ogni scheda descrive **solo la denominazione**, mai un'azienda o un marchio:
niente nomi di cantine, niente etichette commerciali. Le denominazioni e le basi
ampelografiche sono quelle verificate nelle sezioni 1–1.6 di
`docs/eccellenze-calabresi-catalogo.md` (fonti: ARSAC Calabria, FederDOC, Assovini,
disciplinari Masaf); gli abbinamenti rimandano ai 71 ingredienti della sezione
12.1 dello stesso documento.

**Campi di ogni scheda**

| Campo | Uso |
| --- | --- |
| Slug | chiave per l'`insert ... on conflict (slug)` in `public.prodotti` |
| Categoria / Prezzo | `Vini`, prezzo demo indicativo in € |
| Zona | area di produzione della denominazione |
| Base | uvaggio o vitigno, con le percentuali solo dove il disciplinare le fissa |
| Stile | come si presenta al naso e in bocca |
| Servizio | temperatura e tipo di calice |
| Con i prodotti del paniere | 2–4 referenze della sezione 12.1, anche nella preparazione in cui la ricetta le usa (es. "Agnello del Pollino alla brace") |
| Nota per Pino | frase pronta da riusare nelle ricette |

Regole: prezzi indicativi (non listini), nessuna annata, nessun logo DOP/IGC,
niente «DOP» sui vini (per il vino si usa DOC/DOCG/IGT).

---

## Terre di Cosenza DOC (provincia di Cosenza)

### 1. Terre di Cosenza DOC Pollino Rosso
**Slug** `terre-di-cosenza-doc-pollino-rosso` · **Categoria** Vini · **Prezzo** 12–16 €
**Zona** sottozona Pollino, versante cosentino del massiccio
**Base** Magliocco (localmente *Lagrima*), min. 60% nel Terre di Cosenza rosso
**Stile** rosso di medio corpo, frutta scura, spezia dolce, tannino morbido
**Servizio** 16–18 °C, calice ampio
**Con i prodotti del paniere** Agnello del Pollino, Cinghiale del Pollino in umido, Pecorino del Pollino PAT
**Nota per Pino** «Il rosso del Pollino per eccellenza: regge sia l'arrosto d'agnello sia un ragù di cinghiale.»

### 2. Terre di Cosenza DOC Pollino Riserva
**Slug** `terre-di-cosenza-doc-pollino-riserva` · **Categoria** Vini · **Prezzo** 18–26 €
**Zona** sottozona Pollino
**Base** Magliocco, affinamento più lungo
**Stile** rosso strutturato, frutto maturo, note di cuoio e spezie
**Servizio** 18 °C, calice ampio
**Con i prodotti del paniere** Brasato d'agnello, Caciocavallo Silano DOP stagionato, Funghi porcini del Pollino
**Nota per Pino** «Da usare quando la ricetta ha cottura lunga e sugo ristretto.»

### 3. Terre di Cosenza DOC Pollino Rosato
**Slug** `terre-di-cosenza-doc-pollino-rosato` · **Categoria** Vini · **Prezzo** 9–13 €
**Zona** sottozona Pollino
**Base** Greco nero / Magliocco / Gaglioppo / Aglianico / Calabrese (min. 60%)
**Stile** rosato secco, ciliegia, buona acidità
**Servizio** 10–12 °C, calice medio
**Con i prodotti del paniere** Felciata di Morano PAT, Soppressata di Calabria DOP, Frittata con asparagi selvatici del Pollino
**Nota per Pino** «Il rosato che apre il pasto: salumi e formaggi morbidi senza coprirli.»

### 4. Terre di Cosenza DOC Magliocco
**Slug** `terre-di-cosenza-doc-magliocco` · **Categoria** Vini · **Prezzo** 13–17 €
**Zona** intera provincia di Cosenza
**Base** Magliocco in prevalenza (menzione di vitigno)
**Stile** rosso pieno, frutto maturo, tannino fine
**Servizio** 16–18 °C
**Con i prodotti del paniere** Salsiccia di Calabria DOP alla brace, Pecorino del Pollino PAT, Melanzana Rossa di Rotonda DOP ripiena
**Nota per Pino** «Buon compromesso tra struttura e prezzo per i piatti di carne quotidiani.»

### 5. Terre di Cosenza DOC Donnici
**Slug** `terre-di-cosenza-doc-donnici` · **Categoria** Vini · **Prezzo** 13–17 €
**Zona** sottozona Donnici, colline intorno a Cosenza
**Base** basi del Terre di Cosenza con uve della sottozona
**Stile** rosso di collina, tannino fine, erbe aromatiche
**Servizio** 16–18 °C
**Con i prodotti del paniere** Capretto del Pollino al forno, Funghi porcini del Pollino, Pecorino del Pollino PAT
**Nota per Pino** «Rosso elegante: meglio con carni giovani e funghi che con sughi pesanti.»

### 6. Terre di Cosenza DOC Esaro
**Slug** `terre-di-cosenza-doc-esaro` · **Categoria** Vini · **Prezzo** 12–16 €
**Zona** sottozona Esaro, fascia orientale cosentina
**Base** Magliocco (qui detto *Lagrima*) con altre uve della sottozona
**Stile** rosso snello, acidità viva, frutto fresco
**Servizio** 16 °C, calice medio
**Con i prodotti del paniere** Soppressata di Calabria DOP, Fileja al ragù, Lenticchia di Mormanno in umido
**Nota per Pino** «Rosso da tavola: perfetto con la pasta al ragù e i legumi.»

### 7. Terre di Cosenza DOC San Vito di Luzzi
**Slug** `terre-di-cosenza-doc-san-vito-di-luzzi` · **Categoria** Vini · **Prezzo** 12–16 €
**Zona** sottozona San Vito di Luzzi (Cs)
**Base** basi del Terre di Cosenza con uve della sottozona
**Stile** rosso morbido, note speziate, tannino setoso
**Servizio** 16–18 °C
**Con i prodotti del paniere** Cinghiale del Pollino, Brasato con mosto cotto (saba), Caciocavallo Silano DOP
**Nota per Pino** «Da giocare con le cotture dolci: saba, cipolla, castagne.»

### 8. Terre di Cosenza DOC Colline del Crati
**Slug** `terre-di-cosenza-doc-colline-del-crati` · **Categoria** Vini · **Prezzo** 12–16 €
**Zona** sottozona Colline del Crati, valle del Crati
**Base** basi del Terre di Cosenza con uve della sottozona
**Stile** rosso fruttato, beva facile, tannino leggero
**Servizio** 14–16 °C, calice medio
**Con i prodotti del paniere** Pizza di pane di Cerchiara, Arrosti leggeri, Cacioricotta del Pollino
**Nota per Pino** «Il rosso da tutti i giorni, ideale quando la ricetta non deve pesare.»

### 9. Terre di Cosenza DOC Condoleo
**Slug** `terre-di-cosenza-doc-condoleo` · **Categoria** Vini · **Prezzo** 12–16 €
**Zona** sottozona Condoleo (Cs)
**Base** basi del Terre di Cosenza con uve della sottozona
**Stile** rosso caldo, tannino presente, frutto scuro
**Servizio** 16–18 °C
**Con i prodotti del paniere** Agnello del Pollino alla brace, Soppressata di Calabria DOP, Pecorino del Pollino PAT
**Nota per Pino** «Rosso da brace: alza il tono dei piatti con peperoncino di Calabria IGP.»

### 10. Terre di Cosenza DOC Verbicaro Rosso
**Slug** `terre-di-cosenza-doc-verbicaro-rosso` · **Categoria** Vini · **Prezzo** 12–18 €
**Zona** sottozona Verbicaro, alto Tirreno cosentino (falde del monte Pellegrino)
**Base** Magliocco dolce, qui detto *Guarnaccia nera*
**Stile** rosso caldo, frutto maturo, spezia e balsamico
**Servizio** 16–18 °C
**Con i prodotti del paniere** Capretto del Pollino, Salsiccia di Calabria DOP, Melanzana Rossa di Rotonda DOP
**Nota per Pino** «Rosso mediterraneo: funziona con le verdure cotte al forno, non solo con la carne.»

### 11. Terre di Cosenza DOC Verbicaro Bianco
**Slug** `terre-di-cosenza-doc-verbicaro-bianco` · **Categoria** Vini · **Prezzo** 11–15 €
**Zona** sottozona Verbicaro
**Base** uve bianche della sottozona (Greco bianco, Guarnaccia bianca, Pecorello)
**Stile** bianco sapido, agrumato, finale salino
**Servizio** 10–12 °C
**Con i prodotti del paniere** Caprino di Morano, Broccoli del Pollino, Frittura di paranza
**Nota per Pino** «Bianco di montagna: tiene testa ai piatti di verdure amare e ai formaggi di capra.»

### 12. Terre di Cosenza DOC Bianco
**Slug** `terre-di-cosenza-doc-bianco` · **Categoria** Vini · **Prezzo** 11–15 €
**Zona** intera provincia di Cosenza
**Base** Greco bianco / Guarnaccia bianca / Pecorello / Montonico, min. 60%
**Stile** bianco secco, floreale, frutto bianco
**Servizio** 10–12 °C
**Con i prodotti del paniere** Giuncata, Antipasti di verdure sott'olio, Frisella di grano duro
**Nota per Pino** «Il bianco base della provincia: leggero, non copre gli antipasti.»

### 13. Terre di Cosenza DOC Rosato
**Slug** `terre-di-cosenza-doc-rosato` · **Categoria** Vini · **Prezzo** 11–14 €
**Zona** intera provincia di Cosenza
**Base** Greco nero / Magliocco / Gaglioppo / Aglianico / Calabrese, min. 60%
**Stile** rosato secco, frutto rosso croccante
**Servizio** 10–12 °C
**Con i prodotti del paniere** Salumi di Calabria DOP, Frittata di asparagi selvatici, Pesce alla griglia
**Nota per Pino** «Il rosato da mezzo pomeriggio: salumi, uova, verdure.»

### 14. Terre di Cosenza DOC Passito / Vendemmia tardiva
**Slug** `terre-di-cosenza-doc-passito` · **Categoria** Vini · **Prezzo** 14–20 €
**Zona** intera provincia di Cosenza
**Base** uve bianche appassite (Greco bianco, Guarnaccia bianca, Pecorello, Montonico)
**Stile** dolce, fico secco e miele, buona acidità
**Servizio** 12–14 °C, calice piccolo
**Con i prodotti del paniere** Ciotaredda di Castrovillari, Fichi di Cosenza DOP, Pecorino del Pollino PAT stagionato
**Nota per Pino** «Dolce da fine pasto o da formaggio stagionato: un solo bicchiere basta.»

### 15. Savuto DOC Rosso
**Slug** `savuto-doc-rosso` · **Categoria** Vini · **Prezzo** 12–16 €
**Zona** valle del Savuto, tra province di Cosenza e Catanzaro
**Base** uvaggio tradizionale a base di Gaglioppo e Magliocco (qui detto *Arvino*)
**Stile** rosso asciutto, erbe di macchia, tannino vivo
**Servizio** 16–18 °C
**Con i prodotti del paniere** Soppressata di Calabria DOP, Capretto al forno, Pecorino del Pollino PAT
**Nota per Pino** «Rosso di carattere ma rustico: meglio con piatti di terra semplici.»

### 16. Savuto DOC Rosato
**Slug** `savuto-doc-rosato` · **Categoria** Vini · **Prezzo** 11–14 €
**Zona** valle del Savuto
**Base** stesso uvaggio del rosso, vinificazione in rosato
**Stile** rosato asciutto, frutto fresco, finale sapido
**Servizio** 10–12 °C
**Con i prodotti del paniere** Felciata di Morano PAT, Capocollo di Calabria DOP, Pomodori secchi sott'olio
**Nota per Pino** «Rosato da tagliere: salumi, formaggi semi-stagionati, conserve.»

### 17. Savuto DOC Bianco
**Slug** `savuto-doc-bianco` · **Categoria** Vini · **Prezzo** 11–14 €
**Zona** valle del Savuto
**Base** Montonico (max 40%), Chardonnay (max 30%), Greco bianco (max 20%), Malvasia bianca (max 10%)
**Stile** bianco sapido, agrumato, corpo medio
**Servizio** 10–12 °C
**Con i prodotti del paniere** Pesce al forno, Caprino di Morano, Broccoli del Pollino saltati
**Nota per Pino** «Bianco di valle con struttura: regge anche i piatti di pesce al forno.»

### 18. Moscato al governo di Saracena
**Slug** `moscato-al-governo-di-saracena` · **Categoria** Vini · **Prezzo** 18–28 €
**Zona** Saracena e dintorni (provincia di Cosenza), Pollino
**Base** Moscato bianco con uve bianche locali e mosto cotto; **Presidio Slow Food dal 2004**
**Stile** dolce, ossidativo, fico secco, miele, mandorla
**Servizio** 12–14 °C, calice piccolo
**Con i prodotti del paniere** Bocconotto di Mormanno, Pitta 'mpigliata, Pecorino del Pollino PAT stagionato
**Nota per Pino** «Non è DOC: scrivere solo "Moscato al governo di Saracena". È il ponte perfetto tra la sezione dolci e quella vini.»

## Calabria IGT (intera regione)

### 19. Calabria IGT Rosso
**Slug** `calabria-igt-rosso` · **Categoria** Vini · **Prezzo** 8–12 €
**Zona** intero territorio regionale
**Base** uno o più vitigni autorizzati in Calabria
**Stile** rosso semplice, fruttato, tannino leggero
**Servizio** 14–16 °C
**Con i prodotti del paniere** Pizza, Salumi di Calabria DOP, Pasta al forno
**Nota per Pino** «Il rosso "da tavola" della regione: da proporre quando il piatto è semplice.»

### 20. Calabria IGT Bianco
**Slug** `calabria-igt-bianco` · **Categoria** Vini · **Prezzo** 8–12 €
**Zona** intero territorio regionale
**Base** uno o più vitigni a bacca bianca autorizzati
**Stile** bianco leggero, frutto bianco, acidità discreta
**Servizio** 8–10 °C
**Con i prodotti del paniere** Antipasti di verdure, Frittura, Insalata di pomodoro Costoluto del Pollino
**Nota per Pino** «Bianco versatile per aprire il pasto o accompagnare una frittura.»

### 21. Calabria IGT Greco
**Slug** `calabria-igt-greco` · **Categoria** Vini · **Prezzo** 8–12 €
**Zona** intero territorio regionale
**Base** Greco in prevalenza (il disciplinare indica la specificazione «Greco»)
**Stile** bianco aromatico, sapido, note di agrumi e pietra focaia
**Servizio** 10–12 °C
**Con i prodotti del paniere** Pesce, Caprino di Morano, Verdure gratinate
**Nota per Pino** «Il bianco aromatico calabrese: pochi piatti, ma quelli giusti (pesce e capra).»

### 22. Calabria IGT Magliocco canino
**Slug** `calabria-igt-magliocco-canino` · **Categoria** Vini · **Prezzo** 10–15 €
**Zona** intero territorio regionale (vitigno autoctono)
**Base** Magliocco canino, specificazione di vitigno
**Stile** rosso di frutto scuro, tannino medio, finale speziato
**Servizio** 16 °C
**Con i prodotti del paniere** Agnello del Pollino, Fileja al ragù, Pecorino del Pollino PAT
**Nota per Pino** «Cugino più snello del Magliocco dolce: buono con i sughi di carne.»

### 23. Calabria IGT Gaglioppo
**Slug** `calabria-igt-gaglioppo` · **Categoria** Vini · **Prezzo** 9–14 €
**Zona** intero territorio regionale (vitigno autoctono)
**Base** Gaglioppo, specificazione di vitigno
**Stile** rosso asciutto, ciliegia, tannino vivo
**Servizio** 16 °C
**Con i prodotti del paniere** Carne alla brace, Soppressata di Calabria DOP, 'Nduja di Spilinga
**Nota per Pino** «Il vitigno del Cirò in versione semplice: ideale con il piccante.»

### 24. Calabria IGT Greco nero
**Slug** `calabria-igt-greco-nero` · **Categoria** Vini · **Prezzo** 9–14 €
**Zona** intero territorio regionale (vitigno autoctono)
**Base** Greco nero, specificazione di vitigno
**Stile** rosso caldo, speziato, tannino morbido
**Servizio** 16 °C
**Con i prodotti del paniere** Capretto del Pollino in umido, Cinghiale, Peperoncino di Calabria IGP
**Nota per Pino** «Rosso da umido: si sposa con i piatti un po' piccanti.»

### 25. Calabria IGT Calabrese (Nerello calabrese)
**Slug** `calabria-igt-calabrese` · **Categoria** Vini · **Prezzo** 9–14 €
**Zona** intero territorio regionale (vitigno autoctono)
**Base** Calabrese, detto anche Nerello calabrese
**Stile** rosso fruttato, tannino medio, beva scorrevole
**Servizio** 14–16 °C
**Con i prodotti del paniere** Arrosti, Salsiccia di Calabria DOP, Patata della Sila IGP al forno
**Nota per Pino** «Rosso di pranzo domenicale: arrosto e patate.»

### 26. Calabria IGT Castiglione
**Slug** `calabria-igt-castiglione` · **Categoria** Vini · **Prezzo** 9–13 €
**Zona** intero territorio regionale (vitigno autoctono minore)
**Base** Castiglione, specificazione di vitigno
**Stile** rosso leggero, vinoso, acidulo
**Servizio** 14 °C
**Con i prodotti del paniere** Pizza, Salumi di Calabria DOP, Olive nere in salamoia del Pollino
**Nota per Pino** «Rosso quasi "da osteria": perfetto con pizza e tagliere.»

### 27. Calabria IGT Nocera
**Slug** `calabria-igt-nocera` · **Categoria** Vini · **Prezzo** 10–14 €
**Zona** intero territorio regionale (vitigno autoctono)
**Base** Nocera, specificazione di vitigno
**Stile** rosso strutturato, frutto scuro, tannino deciso
**Servizio** 16–18 °C
**Con i prodotti del paniere** Arrosti, Sughi di carne, Caciocavallo Silano DOP
**Nota per Pino** «Rosso da portata importante, con carni cotte a lungo.»

### 28. Calabria IGT Marsigliana nera
**Slug** `calabria-igt-marsigliana-nera` · **Categoria** Vini · **Prezzo** 9–13 €
**Zona** intero territorio regionale (vitigno autoctono minore)
**Base** Marsigliana nera, specificazione di vitigno
**Stile** rosso leggero, beva facile, frutto semplice
**Servizio** 14 °C
**Con i prodotti del paniere** Salumi di Calabria DOP, Contorni di verdure, Frisella
**Nota per Pino** «Vitigno ritrovato: buono per raccontare una storia di recupero, leggero nel bicchiere.»

### 29. Calabria IGT Nerello cappuccio
**Slug** `calabria-igt-nerello-cappuccio` · **Categoria** Vini · **Prezzo** 9–13 €
**Zona** intero territorio regionale (vitigno autoctono)
**Base** Nerello cappuccio
**Stile** rosso fine, fruttato, tannino leggero
**Servizio** 14–16 °C
**Con i prodotti del paniere** Arrosti leggeri, Funghi porcini del Pollino, Pecorino del Pollino PAT
**Nota per Pino** «Rosso elegante e non stancante: bene con i funghi.»

### 30. Calabria IGT Nerello mascalese
**Slug** `calabria-igt-nerello-mascalese` · **Categoria** Vini · **Prezzo** 9–14 €
**Zona** intero territorio regionale (vitigno autoctono)
**Base** Nerello mascalese
**Stile** rosso elegante, tannino fine, frutto rosso e spezia
**Servizio** 16 °C
**Con i prodotti del paniere** Agnello del Pollino, Formaggi semi-stagionati, Castagne del Pollino
**Nota per Pino** «Finezza da vitigno "da montagna": alza il livello di un piatto semplice.»

### 31. Calabria IGT Guarnaccia
**Slug** `calabria-igt-guarnaccia` · **Categoria** Vini · **Prezzo** 9–14 €
**Zona** intero territorio regionale (vitigno autoctono bianco)
**Base** Guarnaccia bianca, specificazione di vitigno
**Stile** bianco morbido, fruttato, acidità contenuta
**Servizio** 10–12 °C
**Con i prodotti del paniere** Frittura, Pasta con le verdure, Giuncata
**Nota per Pino** «Bianco di facile lettura: non serve una grande cucina per valorizzarlo.»

### 32. Calabria IGT Montonico bianco (Mantonico)
**Slug** `calabria-igt-montonico-bianco` · **Categoria** Vini · **Prezzo** 10–14 €
**Zona** intero territorio regionale (vitigno autoctono)
**Base** Montonico bianco, localmente chiamato Mantonico
**Stile** bianco sapido, buona acidità, finale mandorlato
**Servizio** 10–12 °C
**Con i prodotti del paniere** Pesce, Caprino di Morano, Broccoli del Pollino
**Nota per Pino** «Base storica dei passiti calabresi; da secco è sapido e gastronomico.»

### 33. Calabria IGT Pecorello
**Slug** `calabria-igt-pecorello` · **Categoria** Vini · **Prezzo** 10–15 €
**Zona** intero territorio regionale (vitigno autoctono)
**Base** Pecorello, specificazione di vitigno
**Stile** bianco sapido, agrumato, buona persistenza
**Servizio** 10–12 °C
**Con i prodotti del paniere** Antipasti, Verdure fritte, Pecorino del Pollino PAT
**Nota per Pino** «Bianco gastronomico: dei tre bianchi autoctoni è quello con più carattere.»

### 34. Calabria IGT Moscato bianco
**Slug** `calabria-igt-moscato-bianco` · **Categoria** Vini · **Prezzo** 9–14 €
**Zona** intero territorio regionale
**Base** Moscato bianco, specificazione di vitigno
**Stile** aromatico, uva e fiori; può essere secco o dolce
**Servizio** 8–10 °C (secco) / 10–12 °C (dolce)
**Con i prodotti del paniere** Dolci secchi e pasticceria (dolce); verdure e antipasti (secco)
**Nota per Pino** «Se la ricetta è dolce serve la versione dolce: dichiararlo nella scheda.»

### 35. Calabria IGT Guardavalle
**Slug** `calabria-igt-guardavalle` · **Categoria** Vini · **Prezzo** 9–13 €
**Zona** intero territorio regionale (vitigno autoctono minore)
**Base** Guardavalle, specificazione di vitigno
**Stile** bianco delicato, floreale, corpo leggero
**Servizio** 8–10 °C
**Con i prodotti del paniere** Antipasti, Frittura, Insalate di mare
**Nota per Pino** «Bianco discreto: da usare con piatti delicati, non con piatti piccanti.»

### 36. Calabria IGT Bianco passito
**Slug** `calabria-igt-bianco-passito` · **Categoria** Vini · **Prezzo** 12–18 €
**Zona** intero territorio regionale
**Base** uve bianche appassite
**Stile** dolce, miele e frutta secca, acidità che pulisce il palato
**Servizio** 12–14 °C, calice piccolo
**Con i prodotti del paniere** Torrone di Bagnara IGP, Mostaccioli calabresi, Fichi di Cosenza DOP
**Nota per Pino** «Alternativa al Moscato di Saracena per i dolci secchi del paniere.»

### 37. Val di Neto IGT Rosso
**Slug** `val-di-neto-igt-rosso` · **Categoria** Vini · **Prezzo** 10–15 €
**Zona** provincia di Crotone, valle del Neto
**Base** uno o più vitigni rossi autorizzati
**Stile** rosso strutturato, caldo, frutto scuro e spezia
**Servizio** 16–18 °C
**Con i prodotti del paniere** Arrosti, Cinghiale del Pollino, Caciocavallo Silano DOP
**Nota per Pino** «Rosso del crotonese: buon rapporto struttura/prezzo per le carni.»

### 38. Val di Neto IGT Bianco
**Slug** `val-di-neto-igt-bianco` · **Categoria** Vini · **Prezzo** 10–14 €
**Zona** provincia di Crotone
**Base** Greco e/o Mantonico e altri vitigni bianchi autorizzati
**Stile** bianco morbido, fruttato, corpo medio
**Servizio** 10–12 °C
**Con i prodotti del paniere** Antipasti, Primi di verdure, Pesce
**Nota per Pino** «Bianco di media struttura: sta bene con i primi di verdure.»

### 39. Bivongi DOC Rosso
**Slug** `bivongi-doc-rosso` · **Categoria** Vini · **Prezzo** 12–16 €
**Zona** Bivongi e dintorni (provincia di Reggio Calabria, piccola parte di Catanzaro)
**Base** Greco nero e/o Gaglioppo (30–50%) + Nocera e/o Calabrese e/o Castiglione (30–50%)
**Stile** rosso rustico, tannino marcato, frutto scuro
**Servizio** 16–18 °C
**Con i prodotti del paniere** Salsiccia di Calabria DOP, Capretto in umido, Pecorino del Pollino PAT
**Nota per Pino** «Rosso di montagna: chiede piatti saporiti, non delicati.»

### 40. Bivongi DOC Rosato
**Slug** `bivongi-doc-rosato` · **Categoria** Vini · **Prezzo** 11–14 €
**Zona** provincia di Reggio Calabria
**Base** stesso uvaggio del rosso
**Stile** rosato rustico, ciliegia, acidità viva
**Servizio** 10–12 °C
**Con i prodotti del paniere** Salumi di Calabria DOP, Verdure grigliate, Pizza
**Nota per Pino** «Rosato con più carattere del solito: regge anche la pizza.»

### 41. Bivongi DOC Bianco
**Slug** `bivongi-doc-bianco` · **Categoria** Vini · **Prezzo** 11–14 €
**Zona** provincia di Reggio Calabria
**Base** Greco bianco e/o Guardavalle e/o Montonico (30–50%) + Malvasia e/o Ansonica (30–50%)
**Stile** bianco floreale, sapido, finale ammandorlato
**Servizio** 10–12 °C
**Con i prodotti del paniere** Antipasti, Frittura, Giuncata con miele
**Nota per Pino** «Bianco del reggino ionico: da abbinare alla frittura di verdure.»

### 42. Lamezia DOC Rosso
**Slug** `lamezia-doc-rosso` · **Categoria** Vini · **Prezzo** 11–15 €
**Zona** territorio di Lamezia Terme (Cz)
**Base** Nerello mascalese e/o cappuccio (30–50%) + Gaglioppo e/o Magliocco (25–35%) + Greco nero e/o Marsigliana (25–35%)
**Stile** rosso medio, fruttato, tannino gentile
**Servizio** 14–16 °C
**Con i prodotti del paniere** Pasta al forno, Salumi di Calabria DOP, Caciocavallo Silano DOP
**Nota per Pino** «Rosso versatile della piana: funziona con pasta al forno e salumi.»

### 43. Lamezia DOC Rosato
**Slug** `lamezia-doc-rosato` · **Categoria** Vini · **Prezzo** 11–14 €
**Zona** territorio di Lamezia Terme
**Base** stesso uvaggio del rosso
**Stile** rosato fresco, floreale, fragolina
**Servizio** 10–12 °C
**Con i prodotti del paniere** Frittura, Verdure, Pizza
**Nota per Pino** «Rosato leggero: da aperitivo o con la frittura.»

### 44. Lamezia DOC Bianco
**Slug** `lamezia-doc-bianco` · **Categoria** Vini · **Prezzo** 11–14 €
**Zona** territorio di Lamezia Terme
**Base** Greco bianco (max 50%), Trebbiano toscano (max 40%), Malvasia bianca (min 20%)
**Stile** bianco fresco, agrumato, finale secco
**Servizio** 10–12 °C
**Con i prodotti del paniere** Pesce, Verdure, Caprino di Morano
**Nota per Pino** «Bianco di pianura: semplice e pulito, con il pesce e le verdure.»

### 45. Melissa DOC Rosso
**Slug** `melissa-doc-rosso` · **Categoria** Vini · **Prezzo** 13–17 €
**Zona** fascia ionica crotonese (Melissa e comuni vicini)
**Base** uvaggio a prevalenza di Gaglioppo
**Stile** rosso pieno, speziato, tannino caldo
**Servizio** 16–18 °C
**Con i prodotti del paniere** Agnello alla brace, 'Nduja di Spilinga, Formaggi stagionati
**Nota per Pino** «Rosso del crotonese: con il peperoncino non teme confronti.»

### 46. Melissa DOC Bianco
**Slug** `melissa-doc-bianco` · **Categoria** Vini · **Prezzo** 12–16 €
**Zona** fascia ionica crotonese
**Base** Greco bianco (80–95%), con Trebbiano e/o Malvasia bianca
**Stile** bianco pieno, agrumato, buona struttura
**Servizio** 10–12 °C
**Con i prodotti del paniere** Pesce, Verdure gratinate, Cacioricotta del Pollino
**Nota per Pino** «Bianco con corpo: sostiene i piatti gratinati al forno.»

### 47. Sant'Anna di Isola Capo Rizzuto DOC Rosso
**Slug** `sant-anna-di-isola-capo-rizzuto-doc-rosso` · **Categoria** Vini · **Prezzo** 12–16 €
**Zona** Isola Capo Rizzuto e comuni vicini (provincia di Crotone)
**Base** uvaggio a prevalenza di Gaglioppo
**Stile** rosso semplice, fruttato, tannino leggero
**Servizio** 14–16 °C
**Con i prodotti del paniere** Pizza, Salumi di Calabria DOP, Arrosti leggeri
**Nota per Pino** «Rosso quotidiano del crotonese: da proporre senza pretese.»

### 48. Sant'Anna di Isola Capo Rizzuto DOC Rosato
**Slug** `sant-anna-di-isola-capo-rizzuto-doc-rosato` · **Categoria** Vini · **Prezzo** 11–14 €
**Zona** Isola Capo Rizzuto
**Base** stesso uvaggio del rosso
**Stile** rosato semplice, fruttato, fresco
**Servizio** 10–12 °C
**Con i prodotti del paniere** Antipasti, Salumi di Calabria DOP, Frittura
**Nota per Pino** «Rosato da apertura: leggero, non ruba la scena al piatto.»

### 49. Scavigna DOC Rosso
**Slug** `scavigna-doc-rosso` · **Categoria** Vini · **Prezzo** 12–16 €
**Zona** versante tirrenico del catanzarese (Nocera Terinese e dintorni)
**Base** uvaggio a base di Aglianico e Magliocco con altre uve autoctone
**Stile** rosso morbido, frutto scuro, tannino vellutato
**Servizio** 16–18 °C
**Con i prodotti del paniere** Agnello del Pollino, Sughi di carne, Caciocavallo Silano DOP
**Nota per Pino** «Rosso tirrenico: più morbido del Cirò, buono con i sughi.»

### 50. Cirò DOC Rosso
**Slug** `ciro-doc-rosso` · **Categoria** Vini · **Prezzo** 12–18 €
**Zona** Cirò, Cirò Marina, Melissa, Crucoli (provincia di Crotone)
**Base** Gaglioppo min. 80%
**Stile** rosso asciutto, ciliegia, tannino vivo, finale speziato
**Servizio** 16–18 °C
**Con i prodotti del paniere** Carne alla brace, Soppressata di Calabria DOP, Pecorino del Pollino PAT
**Nota per Pino** «Il rosso simbolo della Calabria: raccontarlo come il vino dei Greci.»

### 51. Cirò DOC Rosso Riserva
**Slug** `ciro-doc-rosso-riserva` · **Categoria** Vini · **Prezzo** 16–22 €
**Zona** Cirò e Cirò Marina
**Base** Gaglioppo min. 80%, affinamento prolungato
**Stile** rosso tannico, lungo, note balsamiche e di cuoio
**Servizio** 18 °C
**Con i prodotti del paniere** Arrosti, Cinghiale del Pollino, Formaggi stagionati
**Nota per Pino** «Versione importante del Cirò: da riserva, con i piatti della domenica.»

### 52. Cirò DOC Rosato
**Slug** `ciro-doc-rosato` · **Categoria** Vini · **Prezzo** 11–14 €
**Zona** Cirò e Cirò Marina
**Base** Gaglioppo in rosato
**Stile** rosato secco, ciliegia, acidità viva
**Servizio** 10–12 °C
**Con i prodotti del paniere** Frittura, Verdure, Formaggi freschi
**Nota per Pino** «Rosato da mare e da frittura, con buona acidità.»

### 53. Cirò DOC Bianco
**Slug** `ciro-doc-bianco` · **Categoria** Vini · **Prezzo** 11–14 €
**Zona** Cirò e Cirò Marina
**Base** Greco bianco min. 80%
**Stile** bianco secco, agrumato, sapido
**Servizio** 10–12 °C
**Con i prodotti del paniere** Pesce, Antipasti, Caprino di Morano
**Nota per Pino** «Bianco del territorio del Cirò: poco noto, ottimo con il pesce.»

### 54. Cirò Classico DOCG Rosso
**Slug** `ciro-classico-docg-rosso` · **Categoria** Vini · **Prezzo** 18–24 €
**Zona** zona classica di Cirò e Cirò Marina
**Base** Gaglioppo min. 90%, Magliocco e/o Greco nero max 10%
**Stile** rosso teso, tannino vivo, frutto scuro e spezia
**Servizio** 18 °C
**Con i prodotti del paniere** Agnello del Pollino, Cinghiale, Pecorino del Pollino PAT
**Nota per Pino** «Prima DOCG della Calabria (2025): usarlo quando serve un vino "che conta".»

### 55. Cirò Classico DOCG Riserva
**Slug** `ciro-classico-docg-riserva` · **Categoria** Vini · **Prezzo** 20–30 €
**Zona** zona classica di Cirò
**Base** Gaglioppo min. 90% con affinamento più lungo
**Stile** rosso importante, tannino fitto, frutto sotto spirito
**Servizio** 18 °C, decantare
**Con i prodotti del paniere** Brasati, Cinghiale del Pollino, Caciocavallo Silano DOP molto stagionato
**Nota per Pino** «Il vino più alto della gamma: poche ricette, scelte bene.»

### 56. Greco di Bianco DOC (passito)
**Slug** `greco-di-bianco-doc` · **Categoria** Vini · **Prezzo** 18–25 €
**Zona** Bianco e Locride (provincia di Reggio Calabria)
**Base** Greco bianco min. 95%, uve appassite
**Stile** liquoroso dolce, agrumi canditi, miele, mandorla
**Servizio** 10–12 °C, calice piccolo
**Con i prodotti del paniere** Dolci secchi, Torrone di Bagnara IGP, Pecorino stagionato
**Nota per Pino** «Passito storico della Locride: chiude il pasto o accompagna il formaggio.»

---

## Tabella di caricamento (56 vini)

| # | Slug | Nome prodotto | Categoria | Prezzo |
| --- | --- | --- | --- | --- |
| 1 | terre-di-cosenza-doc-pollino-rosso | Terre di Cosenza DOC Pollino Rosso | Vini | 12–16 |
| 2 | terre-di-cosenza-doc-pollino-riserva | Terre di Cosenza DOC Pollino Riserva | Vini | 18–26 |
| 3 | terre-di-cosenza-doc-pollino-rosato | Terre di Cosenza DOC Pollino Rosato | Vini | 9–13 |
| 4 | terre-di-cosenza-doc-magliocco | Terre di Cosenza DOC Magliocco | Vini | 13–17 |
| 5 | terre-di-cosenza-doc-donnici | Terre di Cosenza DOC Donnici | Vini | 13–17 |
| 6 | terre-di-cosenza-doc-esaro | Terre di Cosenza DOC Esaro | Vini | 12–16 |
| 7 | terre-di-cosenza-doc-san-vito-di-luzzi | Terre di Cosenza DOC San Vito di Luzzi | Vini | 12–16 |
| 8 | terre-di-cosenza-doc-colline-del-crati | Terre di Cosenza DOC Colline del Crati | Vini | 12–16 |
| 9 | terre-di-cosenza-doc-condoleo | Terre di Cosenza DOC Condoleo | Vini | 12–16 |
| 10 | terre-di-cosenza-doc-verbicaro-rosso | Terre di Cosenza DOC Verbicaro Rosso | Vini | 12–18 |
| 11 | terre-di-cosenza-doc-verbicaro-bianco | Terre di Cosenza DOC Verbicaro Bianco | Vini | 11–15 |
| 12 | terre-di-cosenza-doc-bianco | Terre di Cosenza DOC Bianco | Vini | 11–15 |
| 13 | terre-di-cosenza-doc-rosato | Terre di Cosenza DOC Rosato | Vini | 11–14 |
| 14 | terre-di-cosenza-doc-passito | Terre di Cosenza DOC Passito / Vendemmia tardiva | Vini | 14–20 |
| 15 | savuto-doc-rosso | Savuto DOC Rosso | Vini | 12–16 |
| 16 | savuto-doc-rosato | Savuto DOC Rosato | Vini | 11–14 |
| 17 | savuto-doc-bianco | Savuto DOC Bianco | Vini | 11–14 |
| 18 | moscato-al-governo-di-saracena | Moscato al governo di Saracena | Vini | 18–28 |
| 19 | calabria-igt-rosso | Calabria IGT Rosso | Vini | 8–12 |
| 20 | calabria-igt-bianco | Calabria IGT Bianco | Vini | 8–12 |
| 21 | calabria-igt-greco | Calabria IGT Greco | Vini | 8–12 |
| 22 | calabria-igt-magliocco-canino | Calabria IGT Magliocco canino | Vini | 10–15 |
| 23 | calabria-igt-gaglioppo | Calabria IGT Gaglioppo | Vini | 9–14 |
| 24 | calabria-igt-greco-nero | Calabria IGT Greco nero | Vini | 9–14 |
| 25 | calabria-igt-calabrese | Calabria IGT Calabrese (Nerello calabrese) | Vini | 9–14 |
| 26 | calabria-igt-castiglione | Calabria IGT Castiglione | Vini | 9–13 |
| 27 | calabria-igt-nocera | Calabria IGT Nocera | Vini | 10–14 |
| 28 | calabria-igt-marsigliana-nera | Calabria IGT Marsigliana nera | Vini | 9–13 |
| 29 | calabria-igt-nerello-cappuccio | Calabria IGT Nerello cappuccio | Vini | 9–13 |
| 30 | calabria-igt-nerello-mascalese | Calabria IGT Nerello mascalese | Vini | 9–14 |
| 31 | calabria-igt-guarnaccia | Calabria IGT Guarnaccia | Vini | 9–14 |
| 32 | calabria-igt-montonico-bianco | Calabria IGT Montonico bianco (Mantonico) | Vini | 10–14 |
| 33 | calabria-igt-pecorello | Calabria IGT Pecorello | Vini | 10–15 |
| 34 | calabria-igt-moscato-bianco | Calabria IGT Moscato bianco | Vini | 9–14 |
| 35 | calabria-igt-guardavalle | Calabria IGT Guardavalle | Vini | 9–13 |
| 36 | calabria-igt-bianco-passito | Calabria IGT Bianco passito | Vini | 12–18 |
| 37 | val-di-neto-igt-rosso | Val di Neto IGT Rosso | Vini | 10–15 |
| 38 | val-di-neto-igt-bianco | Val di Neto IGT Bianco | Vini | 10–14 |
| 39 | bivongi-doc-rosso | Bivongi DOC Rosso | Vini | 12–16 |
| 40 | bivongi-doc-rosato | Bivongi DOC Rosato | Vini | 11–14 |
| 41 | bivongi-doc-bianco | Bivongi DOC Bianco | Vini | 11–14 |
| 42 | lamezia-doc-rosso | Lamezia DOC Rosso | Vini | 11–15 |
| 43 | lamezia-doc-rosato | Lamezia DOC Rosato | Vini | 11–14 |
| 44 | lamezia-doc-bianco | Lamezia DOC Bianco | Vini | 11–14 |
| 45 | melissa-doc-rosso | Melissa DOC Rosso | Vini | 13–17 |
| 46 | melissa-doc-bianco | Melissa DOC Bianco | Vini | 12–16 |
| 47 | sant-anna-di-isola-capo-rizzuto-doc-rosso | Sant'Anna di Isola Capo Rizzuto DOC Rosso | Vini | 12–16 |
| 48 | sant-anna-di-isola-capo-rizzuto-doc-rosato | Sant'Anna di Isola Capo Rizzuto DOC Rosato | Vini | 11–14 |
| 49 | scavigna-doc-rosso | Scavigna DOC Rosso | Vini | 12–16 |
| 50 | ciro-doc-rosso | Cirò DOC Rosso | Vini | 12–18 |
| 51 | ciro-doc-rosso-riserva | Cirò DOC Rosso Riserva | Vini | 16–22 |
| 52 | ciro-doc-rosato | Cirò DOC Rosato | Vini | 11–14 |
| 53 | ciro-doc-bianco | Cirò DOC Bianco | Vini | 11–14 |
| 54 | ciro-classico-docg-rosso | Cirò Classico DOCG Rosso | Vini | 18–24 |
| 55 | ciro-classico-docg-riserva | Cirò Classico DOCG Riserva | Vini | 20–30 |
| 56 | greco-di-bianco-doc | Greco di Bianco DOC (passito) | Vini | 18–25 |
