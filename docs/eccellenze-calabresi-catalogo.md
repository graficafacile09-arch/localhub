# Eccellenze Calabresi — catalogo proposto per l'ampliamento

Documento di lavoro per aumentare i prodotti della vetrina `/prodotti-tipici`
(flag `prodotti.prodotto_tipico = true`). Oggi la vetrina contiene **8 prodotti**
su 3 negozi demo:

| Negozio demo | Categoria | Prodotti attuali |
| --- | --- | --- |
| Bottega del Pollino – DEMO | Alimentari | Cipolla Bianca di Castrovillari, Filetti di cipolla, Dolcezza di cipolla |
| Terre del Pollino – DEMO | Alimentari | Miele millefiori, Miele di castagno, Olio EVO del Pollino, Magliocco del Pollino |
| Sapori di Castrovillari – DEMO | Panificio | Ciotaredda di Castrovillari |

Obiettivo: **oltre 110 prodotti nuovi** (58 etichette di vino + 53 alimentari;
14 in tutto sono specifici del Pollino), con le denominazioni incrociate su
**ARSAC Calabria** (vini DOP/DOC e IGP/IGT, 22 prodotti agroalimentari tutelati),
**FederDOC** e **Assovini.it** (liste DOCG/DOC/IGT e schede vitigni), mantenendo
la regola già seguita dal seed attuale:
solo denominazioni **reali e verificabili**, nessuna certificazione inventata. La
sezione 9 indica un sottoinsieme prioritario se si vuole procedere a step; la
sezione 8 elenca le **aziende reali del Pollino** trovate in fonti pubbliche e i
loro prodotti. La sezione 12 (demo per Pino) è limitata ai soli
prodotti e vini dell'area del Pollino: le sezioni 1–9 restano il catalogo
regionale di riferimento.

---

## 0. Regole da rispettare quando si inseriscono

1. **Denominazione corretta e completa.** Scrivere "Cipolla Rossa di Tropea
   Calabria IGP", non "cipolla IGP". Se il prodotto è trasformato (confettura,
   liquore, conserva) la denominazione non si trasferisce: si scrive
   "a base di … IGP/DOP" e si marca come *prodotto commerciale del territorio*.
2. **Nessun logo di consorzio** su prodotti demo: il marchio DOP/IGP è usabile
   solo da chi è nella filiera certificata.
3. **Descrizione demo esplicita** quando il negozio è demo: "prodotto
   dimostrativo nella selezione delle eccellenze", come già avviene.
4. **`categoria`**: i vini vanno in `Vini` (testo libero, nessun vincolo DB),
   gli alimentari restano `Alimentari`. Serve per poter filtrare in futuro,
   oggi la vetrina non filtra per categoria.
5. **Prezzi indicativi** (retail, €): sono demo, non listini reali.

---

## 1. Vini — 1 DOCG, 9 DOC, 7 sottozone e 10 IGT

Fonti incrociate: **ARSAC Calabria** («I vini DOP/DOC in Calabria» e «I vini
IGP/IGT»), **FederDOC** (scheda Calabria), **Assovini.it** (liste DOCG/DOC/IGT
Calabria e schede vitigni), disciplinari Masaf. Il vino esistente
(`magliocco-pollino`) copre già Terre di Cosenza DOC sottozona Pollino.
Numerazione locale alle tabelle di questa sezione.

Due precisazioni utili:
- **Cosenza e Vibo Valentia non hanno IGT proprie**: i loro vini rientrano
  nell'IGT Calabria (ARSAC).
- Il **Moscato al governo di Saracena** non compare qui: non è DOC/IGT ma
  Presidio Slow Food (sezione 12.2).

### 1.1 DOCG (1 denominazione)

| # | Nome prodotto | Categoria | Prezzo | Note |
| --- | --- | --- | --- | --- |
| 1 | Cirò Classico DOCG Rosso | Vini | 18–24 | Gaglioppo min. 90%, Magliocco e/o Greco nero max 10%. Prima DOCG della Calabria (2025) |
| 2 | Cirò Classico DOCG Riserva | Vini | 26–34 | Stessa base, affinamento più lungo |

### 1.2 DOC (9 denominazioni, tipologie più vendibili)

| # | Nome prodotto | Prezzo | Note |
| --- | --- | --- | --- |
| 1 | Cirò DOC Rosso | 12–16 | Gaglioppo min. 80% |
| 2 | Cirò DOC Rosso Riserva | 16–22 | Affinamento prolungato, stessa base |
| 3 | Cirò DOC Rosato | 11–14 | Stessa base, vinificazione in rosato |
| 4 | Cirò DOC Bianco | 11–14 | Greco bianco min. 80% |
| 5 | Bivongi DOC Rosso | 12–16 | Greco nero e/o Gaglioppo 30–50% + Nocera/Calabrese/Castiglione 30–50% |
| 6 | Bivongi DOC Rosato | 11–14 | Stessa base del rosso |
| 7 | Bivongi DOC Bianco | 11–14 | Greco bianco/Guardavalle/Montonico + Malvasia/Ansonica |
| 8 | Greco di Bianco DOC (passito) | 22–30 | Greco bianco min. 95%, Locride |
| 9 | Savuto DOC Rosso | 12–16 | Magliocco dolce (Arvino), tra Cosenza e Catanzaro |
| 10 | Savuto DOC Rosato | 11–14 | Stessa base |
| 11 | Savuto DOC Bianco | 11–14 | Montonico, Chardonnay, Greco bianco, Malvasia |
| 12 | Lamezia DOC Rosso | 11–15 | Piana lametina |
| 13 | Lamezia DOC Rosato | 11–14 | Stessa base |
| 14 | Lamezia DOC Bianco | 11–14 | Greco bianco, Trebbiano, Malvasia |
| 15 | Melissa DOC Rosso | 13–17 | Fascia ionica crotonese |
| 16 | Melissa DOC Bianco | 12–16 | Greco bianco 80–95% |
| 17 | Sant'Anna di Isola Capo Rizzuto DOC Rosso | 12–16 | Crotonese |
| 18 | Sant'Anna di Isola Capo Rizzuto DOC Rosato | 11–14 | Stessa base |
| 19 | Scavigna DOC Rosso | 12–16 | Versante tirrenico del catanzarese |

### 1.3 Terre di Cosenza DOC (7 sottozone)

Sottozone riconosciute: **Colline del Crati, Condoleo, Donnici, Esaro, Pollino,
San Vito di Luzzi, Verbicaro** (ARSAC). Attenzione: «Greco bianco» **non** è una
sottozone, è una tipologia del Terre di Cosenza bianco.

| # | Nome prodotto | Prezzo | Note |
| --- | --- | --- | --- |
| 1 | Terre di Cosenza DOC Rosso | 12–16 | Magliocco min. 60% |
| 2 | Terre di Cosenza DOC Bianco | 11–15 | Greco bianco / Guarnaccia bianca / Pecorello / Montonico min. 60% |
| 3 | Terre di Cosenza DOC Rosato | 11–14 | Greco nero / Magliocco / Gaglioppo / Aglianico / Calabrese min. 60% |
| 4 | Terre di Cosenza DOC Passito / Vendemmia tardiva | 14–20 | Da uve bianche appassite |
| 5 | Terre di Cosenza DOC Magliocco | 13–17 | Monovarietale |
| 6 | Terre di Cosenza DOC Donnici | 13–17 | Sottozona storica, rossi da Magliocco/Gaglioppo |
| 7 | Terre di Cosenza DOC Esaro | 12–16 | Sottozona della fascia orientale cosentina |
| 8 | Terre di Cosenza DOC Verbicaro Rosso | 12–18 | Guarnaccia nera (Magliocco dolce) |
| 9 | Terre di Cosenza DOC Verbicaro Bianco | 11–15 | Sottozona dell'alto Tirreno cosentino |
| 10 | Terre di Cosenza DOC San Vito di Luzzi | 12–16 | Sottozona con vitigni autoctoni |
| 11 | Terre di Cosenza DOC Colline del Crati | 12–16 | Valle del Crati |
| 12 | Terre di Cosenza DOC Condoleo | 12–16 | Sottozona cosentina |
| 13 | Terre di Cosenza DOC Pollino | 12–16 | Sottozona del Pollino: **già coperta** dal prodotto `magliocco-pollino` |

### 1.4 IGT (10 denominazioni regionali)

| # | Nome prodotto | Prezzo | Note |
| --- | --- | --- | --- |
| 1 | Calabria IGT Rosso | 8–12 | Intero territorio regionale |
| 2 | Calabria IGT Bianco | 8–12 | Intero territorio regionale |
| 3 | Calabria IGT Rosato | 8–12 | Intero territorio regionale |
| 4 | Calabria IGT Bianco passito | 12–18 | Da uve bianche appassite |
| 5 | Calabria IGT Greco | 8–12 | Specificazione di vitigno (il disciplinare scrive «Greco») |
| 6 | Val di Neto IGT Rosso | 10–15 | Provincia di Crotone |
| 7 | Val di Neto IGT Bianco | 10–14 | Greco/Mantonico |
| 8 | Costa Viola IGT | 10–14 | Costa tirrenica reggina |
| 9 | Locride IGT | 9–13 | Area della Locride |
| 10 | Pellaro IGT | 9–13 | Frazioni di Pellaro, Reggio Calabria |
| 11 | Scilla IGT | 10–14 | Zona di Scilla |
| 12 | Palizzi IGT | 9–13 | Area grecanica |
| 13 | Lipuda IGT | 9–13 | Provincia di Crotone |
| 14 | Arghillà IGT | 9–13 | Area reggina (Calanna, Campo Calabro, Fiumara, Villa San Giovanni...) |
| 15 | Valdamato IGT | 9–13 | Provincia di Catanzaro |

### 1.5 Specificazioni da vitigno autoctono (IGT Calabria)

Il disciplinare dell'IGT Calabria ammette la specificazione di uno dei vitigni
autorizzati: Aglianico, Barbera, Cabernet (franc e/o sauvignon), Calabrese,
Castiglione, Gaglioppo, Greco nero, Magliocco canino, Malvasia nera di Brindisi,
Marsigliana nera, Merlot, Nerello cappuccio, Nerello mascalese, Nocera, Prunesta,
Sangiovese; per i bianchi Ansonica, Chardonnay, Greco, Guardavalle, Guarnaccia,
Malvasia bianca, Manzoni bianco, Montonico bianco, Moscato bianco, Pecorello,
Pinot bianco, Riesling italico, Sauvignon, Semillon, Traminer aromatico,
Trebbiano toscano (elenco ARSAC dal disciplinare).

| # | Nome prodotto | Prezzo | Note |
| --- | --- | --- | --- |
| 1 | Calabria IGT Magliocco canino | 10–15 | Autoctono, frutto scuro |
| 2 | Calabria IGT Gaglioppo | 9–14 | Autoctono, ciliegia e tannino |
| 3 | Calabria IGT Greco nero | 9–14 | Autoctono, corpo e spezia |
| 4 | Calabria IGT Calabrese (Nerello calabrese) | 9–14 | Autoctono |
| 5 | Calabria IGT Castiglione | 9–13 | Autoctono minore |
| 6 | Calabria IGT Nocera | 10–14 | Autoctono, struttura |
| 7 | Calabria IGT Marsigliana nera | 9–13 | Autoctono minore |
| 8 | Calabria IGT Nerello cappuccio | 9–13 | Autoctono |
| 9 | Calabria IGT Nerello mascalese | 9–14 | Autoctono |
| 10 | Calabria IGT Guarnaccia | 9–14 | Bianco autoctono |
| 11 | Calabria IGT Montonico bianco (Mantonico) | 10–14 | Bianco autoctono, base di passiti |
| 12 | Calabria IGT Pecorello | 10–15 | Bianco autoctono, sapido |
| 13 | Calabria IGT Moscato bianco | 9–14 | Aromatico, secco o dolce |
| 14 | Calabria IGT Guardavalle | 9–13 | Bianco autoctono minore |

### 1.6 Vitigni autoctoni calabresi (per le descrizioni di Pino)

| Bacca | Vitigni (ARSAC) |
| --- | --- |
| Nera | Gaglioppo; Magliocco dolce (detti Arvino nel Savuto, Lagrima nell'Esaro e nel Pollino, Guarnaccia nera nel Verbicaro); Greco nero; Calabrese o Nerello calabrese; Aglianico; Nerello cappuccio; Nerello mascalese; Castiglione; Nocera |
| Bianca | Greco bianco (anche passito); Mantonico bianco (altro passito storico); Guarnaccia bianca; Moscatello; Pecorello; Malvasia bianca |

**Dove metterli:** nuovo negozio demo `Enoteca del Pollino – DEMO`
(`demo-enoteca-pollino`, categoria `Enoteca`, sottocategoria `Vini`), così la
vetrina acquista una sezione enologica riconoscibile. In alternativa i primi 6–8
vini possono entrare in `Terre del Pollino – DEMO`.

---

## 2. Ortofrutta e prodotti agricoli DOP/IGP (9)

| # | Nome prodotto | Categoria | Prezzo | Note |
| --- | --- | --- | --- | --- |
| 35 | Cipolla Rossa di Tropea Calabria IGP | Alimentari | 2,50–4,00/kg | Ecotipi Tondo Piatta, Mezza Campana, Allungata |
| 36 | Cipollotto di Tropea Calabria IGP | Alimentari | 3,50–5,00/kg | Tipologia distinta dalla cipolla da serbo |
| 37 | Patata della Sila IGP | Alimentari | 1,80–2,50/kg | Comprensorio della Sila |
| 38 | Limone di Rocca Imperiale IGP | Alimentari | 3,00–4,50/kg | Ionico cosentino |
| 39 | Clementine di Calabria IGP | Alimentari | 2,50–3,50/kg | Stagionale (nov–gen) |
| 40 | Finocchio di Isola Capo Rizzuto IGP | Alimentari | 2,50–3,50/kg | Stagionale (ott–mar) |
| 41 | Peperoncino di Calabria IGP | Alimentari | 4,00–6,00 | IGP registrata con Reg. UE 2026/1273 (GUUE 11/06/2026). Fresco, essiccato, in scaglie o polvere |
| 42 | Bergamotto di Reggio Calabria (frutto fresco) | Alimentari | 2,50–5,00/kg | **Non ancora IGP registrata**: domanda trasmessa alla Commissione UE il 06/02/2026. Citare solo "bergamotto di Reggio Calabria", senza sigla |
| 43 | Fichi di Cosenza DOP (essiccati) | Alimentari | 8,00–14,00 | Varietà Dottato bianco, essiccati al sole |

---

## 3. Formaggi e latticini (6)

| # | Nome prodotto | Prezzo | Note |
| --- | --- | --- | --- |
| 44 | Caciocavallo Silano DOP | 14–20/kg | DOP interregionale, prodotto anche in Calabria |
| 45 | Pecorino Crotonese DOP | 16–24/kg | Zona crotonese |
| 46 | Pecorino del Monte Poro DOP | 18–26/kg | Provincia di Vibo Valentia |
| 47 | Pecorino del Pollino PAT | 15–22/kg | PAT regionale, territorio del Pollino |
| 48 | Mozzarella silana PAT | 10–14/kg | Latte della Sila |
| 49 | Ricotta di capra del Pollino PAT | 9–13/kg | Fresca, da consumare breve |

---

## 4. Salumi e carni (7)

| # | Nome prodotto | Prezzo | Note |
| --- | --- | --- | --- |
| 50 | Soppressata di Calabria DOP | 18–26/kg | DOP, filiera certificata |
| 51 | Capocollo di Calabria DOP | 24–34/kg | DOP |
| 52 | Pancetta di Calabria DOP | 16–22/kg | DOP |
| 53 | Salsiccia di Calabria DOP | 14–20/kg | DOP |
| 54 | 'Nduja di Spilinga | 16–24/kg | **Nessuna DOP**: tradizionale/PAT, non usare "DOP" |
| 55 | Guanciale calabrese | 16–22/kg | Prodotto tradizionale, nessuna DOP |
| 56 | Razza podolica calabrese (carni) | 18–28/kg | Presidio Slow Food, tagli da macelleria |

---

## 5. Oli, conserve e dispensa (14)

| # | Nome prodotto | Prezzo | Note |
| --- | --- | --- | --- |
| 57 | Olio Extravergine Bruzio DOP | 10–16 | DOP regionale |
| 58 | Olio Extravergine Lametia DOP | 10–15 | DOP della piana lametina |
| 59 | Olio Extravergine Alto Crotonese DOP | 11–16 | DOP del crotonese |
| 59bis | Olio di Calabria IGP | 9–14 | IGP regionale, Reg. UE 2016/2301; cultivar Carolea, Dolce di Rossano, Sinopolese, Grossa di Gerace, Tondina |
| 60 | Olive schiacciate alla calabrese | 6–9 | Già presente in altri cataloghi del sito, da marcare tipico |
| 61 | Pomodori secchi sott'olio | 6–9 | Conserva tradizionale |
| 62 | Melanzane sott'olio | 6–9 | Conserva tradizionale |
| 63 | Peperoncini ripieni sott'olio | 7–10 | Conserva tradizionale |
| 64 | Confettura di fichi di Cosenza | 7–10 | Trasformato: "a base di Fichi di Cosenza DOP" |
| 65 | Confettura di bergamotto | 8–11 | Trasformato, nessuna DOP sul prodotto finito |
| 66 | Miele di agrumi del Pollino | 9–12 | Varietà distinta dai due mieli già presenti |
| 67 | Miele di sulla del Pollino | 10–13 | Varietà primaverile |
| 68 | Liquirizia di Calabria DOP (radice/polvere) | 6–12 | DOP; la liquirizia come materia prima |
| 69 | Bergamotto di Reggio Calabria – olio essenziale DOP | 15–30 | DOP, uso alimentare/cosmetico |

---

## 6. Panificati, pasta e dolci (12)

| # | Nome prodotto | Prezzo | Note |
| --- | --- | --- | --- |
| 70 | Fileja (pasta al ferretto) | 4–6 | Formato tradizionale calabrese |
| 71 | Maccheroni al ferretto | 4–6 | Formato tradizionale |
| 72 | Pane di Cerchiara PAT | 5–8/kg | Pane tradizionale del Pollino |
| 73 | Pane casereccio del Pollino | 4–6/kg | Prodotto da forno locale |
| 74 | Torrone di Bagnara IGP | 8–14 | IGP, torrone di Bagnara Calabra |
| 75 | Mostaccioli calabresi | 8–12/kg | Dolce tradizionale al mosto cotto |
| 76 | Turdilli | 9–13/kg | Dolce fritto di Natale al miele |
| 77 | Scalille | 9–13/kg | Dolce natalizio, pasta sfoglia al miele |
| 78 | Susumelle | 9–13/kg | Dolce al cioccolato e spezie |
| 79 | Chinulille (Crotone) | 10–14/kg | Dolce tradizionale crotonese |
| 80 | Cudduraci (Reggio Calabria) | 9–13/kg | Biscotto pasquale decorato |
| 81 | Zippole di Carnevale | 8–12/kg | Dolce fritto carnevalesco |
| — | Ciotaredda di Castrovillari (**già inserito**) | 7,50 | Dolce identitario di Castrovillari |
| — | Cipolla Bianca di Castrovillari De.Co. (**già inserito**) | 3,50 | Eventuali varianti: treccia, sott'aceto |

---

## 7. Liquori e distillati PAT (5)

| # | Nome prodotto | Prezzo | Note |
| --- | --- | --- | --- |
| 82 | Liquore di bergamotto | 12–18 | PAT regionale |
| 83 | Liquore alla liquirizia | 12–16 | PAT regionale |
| 84 | Liquore di cedro | 12–16 | PAT regionale |
| 85 | Amaro alle erbe calabrese | 14–20 | PAT regionale, nessun marchio commerciale |
| 86 | Zibibbo di Pizzo Calabro | 14–20 | Presidio Slow Food, vino liquoroso |

---

## 8. Aziende e prodotti del Pollino

Produttori **reali** individuati in fonti pubbliche (siti aziendali, Parks.it –
Ente Parco Nazionale del Pollino, Slow Food, guide di settore). Non sono clienti
né partner di InCittà e non sono stati contattati: servono consenso e verifica
dei dati prima di pubblicare una scheda.

### 8.1 Versante calabrese — provincia di Cosenza

| Azienda | Comune | Prodotti principali | Fonte / contatto |
| --- | --- | --- | --- |
| **Ferrocinto** | Castrovillari (C.da Ciparsia) | Terre di Cosenza DOP Pollino Rosso, Pollino Riserva, Peperosso (Magliocco + Merlot), spumanti | ferrocinto.it · 0981 415100 |
| **Tenuta Celimarro** | Castrovillari (vigneti; cantina a San Lorenzo del Vallo) | Magliocco DOP Terre di Cosenza Pollino, Greco Bianco, rosato da Aglianico | celimarro.it |
| **Azienda Vinicola Manna** | tra Frascineto e Castrovillari | "Terra Madre" Calabria IGP, recupero vitigni autoctoni (Magliocco) | Guida Fisar “Vignaioli dell'Alta Calabria” |
| **Cantina Rizzo** | Frascineto | Terre di Cosenza DOC | Italian Winery Directory |
| **Casalnuovo del Duca** | area Pollino | Pollino DOC rosso, Magliocco in purezza | vinook.it |
| **Vignaioli del Pollino** | area Pollino | Pollino DOC (rete di ~200 piccoli viticoltori) | vinook.it |
| **Cantine Viola** | Saracena | Moscato al governo di Saracena (Presidio Slow Food), Rossoviola 100% Magliocco dolce, grappa | cantineviola.it |
| **Giuseppe Calabrese – Agricoltore a Saracena** | Saracena (C.da Cocozzello 20) | Terre di Cosenza DOP Pollino (Magliocco dolce), “Peppina” Moscato di Saracena, bianco “Daipastini” (Guarnaccia/Malvasia), olio EVO cultivar Verace e Forasane | giuseppe-calabrese.it · 327 1508821 |
| **Azienda Agricola Diana** | Saracena (C.da Mileo) | Moscato al governo di Saracena (Presidio Slow Food) | aziendaagricoladiana.it · 347 3892928 |
| **Fratelli Bisconte** | Saracena | Moscato di Saracena con lunga maturazione in cantina, ~5 ha di vigna | Gambero Rosso (Vino da Meditazione 2024) |
| **Verbicaro Viti e Vini** | Verbicaro | DOP Terre di Cosenza sottozona Verbicaro (Laos Riserva, Berbicaro), Magliocco/Guarnaccia/Greco/Malvasia/Moscato | verbicarovitievini.it |
| **Tenute Oliveto** | Saracena (C.da San Filippo 16) + punto vendita Castrovillari, Corso Garibaldi 122 | Olio EVO bio monocultivar (Carolea, Tondina, Verace di Saracena), vino biologico | tenuteoliveto.com · 0981 235899 |
| **Olio Bastùnu (fratelli Stabile)** | Castrovillari | Olio EVO IGP da cultivar antiche (latta 5 lt, bottiglie 0,25/1 lt) | oliobastunu.it |
| **Azienda Agricola Marchesi Gallo** | Castrovillari | Olio EVO bio blend (Tondina, Frantoio, Nocellara, Coratina, Leccino), 750 ml | Artigiano in Fiera (premi Flos Olei, Oro dei Bruzzi) |
| **Azienda Agricola Palombari** | Castrovillari (C.da Palombari 144) | Olio EVO bio monocultivar Roggianella, frantoio aziendale | agripalombari.com |
| **Castrofrutta s.a.s. / “Anticomonte”** | Castrovillari (Via Acquaformosa 7) | Olio EVO Roggianella + Nocellara, conserve di cipolla bianca (e cannella, e porcini, e 'nduja), melanzane a filetto, broccoli sott'olio, salumi, agrumi | castrofrutta.com |
| **Fattorie Covelli** | Castrovillari | Selezione di prodotti tipici (formaggi, salumi, sottoli, EVO, vini, liquori), mozzarella di razza Jersey | fattoriecovelli.it |
| **Caseificio Dolci Pascoli s.a.s.** | Morano Calabro | Felciata (‘a filicèta, PAT), Caprino di Morano, caciocavallo, mozzarella, treccia, ricotta, pecorino | Parks.it / LatteNews · 0981 30108 (da verificare) |
| **Caseificio Da Gino** | Morano Calabro | Formaggi e latticini | Guida “La Calabria che produce” (da verificare) |
| **Micropanificio La Bionda** | Cerchiara di Calabria | Pane di Cerchiara con lievito madre, forno a legna (1 kg) | pollinodoro.com |
| **Antico Forno Mauro** | Cerchiara di Calabria | Pane di Cerchiara tradizionale | Corriere Viaggi / Dove |
| **Panificio Monti** | Cerchiara di Calabria | Pane di Cerchiara, prodotti da forno | ilgiornaledelcibo.it |
| **Azienda Agricola Il Vecchio Fienile** | Mormanno | Lenticchia di Mormanno (recupero del ecotipo locale), agriturismo | ilvecchiofienile.com |
| **Macelleria Fratelli Montilli (Coop. Agricola)** | Francavilla Marittima | Salumi, filone stagionato senza glutine | pollinodoro.com |

### 8.2 Versante lucano — Parco del Pollino, provincia di Potenza

| Azienda | Comune | Prodotti principali | Fonte / contatto |
| --- | --- | --- | --- |
| **Agriturismo / Azienda Agricola Biologica La Garavina** | Terranova di Pollino | Confetture del Pollino BIO, Miele del Pollino, peperoncino “Vamp i fuc” di Cerchiara in olio e aceto | lagaravina.it · 0973 93395 |
| **Azienda Agricola Attadia Franco** | Rotonda | Melanzana Rossa di Rotonda DOP/PAT (Presidio Slow Food), Pomodoro Costoluto PAT, pomodoro verde sott'olio | Parks.it · 0973 661540 |
| **Azienda Agricola Caputo Pasquale** | Chiaromonte | Peperone di Senise IGP/PAT | Parks.it · 320 6956479 |
| **Azienda Agricola Serra del Prete** | Viggianello | Miele | Parks.it |
| **Coop. Agricola La Ginestra** | Viggianello | Salumi | Parks.it |
| **La Collinetta del Mercure di De Filpo Costantino** | Viggianello | Formaggi | Parks.it |
| **Agrocarne** | Latronico | Salumi | Parks.it |
| **Molino Padre Covile** | Castronuovo di Sant'Andrea | Farine, cereali, pasta | Parks.it |
| **Azienda Zootecnica Tosa di Troiano Giovanni** | San Paolo Albanese | Carni di razze autoctone | Parks.it |

### 8.3 Prodotti del Pollino da aggiungere in vetrina (14 nuovi)

| # | Prodotto | Zona | Categoria | Prezzo | Note |
| --- | --- | --- | --- | --- | --- |
| P1 | Moscato al governo di Saracena | Saracena | Vini | 18–28 | **Presidio Slow Food** dal 2004; Denominazione ancora non DOC (obiettivo del Presidio) |
| P2 | Pane di Cerchiara | Cerchiara di Calabria | Alimentari | 6–8/kg | Marchio **De.Co.** comunale, Arca del Gusto Slow Food; 3 forni storici |
| P3 | Lenticchia di Mormanno | Mormanno | Alimentari | 6–9 | Ecotipo locale recuperato negli anni 2000 con ARSAC/CNR |
| P4 | Felciata di Morano (‘a filicèta) | Morano Calabro | Alimentari | 12–18/kg | **PAT**; caprino crudo avvolto in foglie di felce, stagionale mag–ago |
| P5 | Caprino di Morano | Morano Calabro | Alimentari | 12–18/kg | Formaggio caprino a pasta lattica, tradizione casearia moranese |
| P6 | Moretto del Pollino | Morano Calabro / Pollino | Alimentari | 14–20/kg | Fungo di sottobosco segnalato tra i prodotti locali di Morano |
| P7 | Mischiglio | area Pollino (CS/PZ) | Alimentari | 3–5 | **PAT**: farina/blend di grani per pasta e pane |
| P8 | Peperoncino “Vamp i fuc” di Cerchiara | Cerchiara di Calabria | Alimentari | 6–9 | Peperoncino locale in olio o aceto, confezionato da La Garavina |
| P9 | Melanzana Rossa di Rotonda DOP | Rotonda (PZ) | Alimentari | 3–5/kg | **DOP** + PAT + Presidio Slow Food; stagionale estiva |
| P10 | Peperone di Senise IGP | Chiaromonte / Senise (PZ) | Alimentari | 6–10 | **IGP** + PAT; secco o in polvere ("crusco") |
| P11 | Pomodoro Costoluto | Rotonda (PZ) | Alimentari | 3–5/kg | **PAT** |
| P12 | Confetture del Pollino (bio) | Terranova di Pollino (PZ) | Alimentari | 7–11 | Confetture di frutta del Parco, produzione biologica |
| P13 | Bocconotto di Mormanno | Mormanno | Alimentari | 9–14/kg | Dolce di pasta frolla con ripieno, tradizione mormannese |
| P14 | Cannaritoli di Morano | Morano Calabro | Alimentari | 10–14/kg | Piccoli cannoli con miele, dolce natalizio moranese |

Già presenti nelle sezioni precedenti e riferibili al Pollino: Pecorino del Pollino PAT
(#47), Caciocavallo Silano DOP zona Pollino (#44), Fichi di Cosenza DOP (#43), Olio
EVO del Pollino (esistente), Cipolla Bianca di Castrovillari (esistente), miele del
Pollino (#66, #67 + 2 esistenti), fileja (#70), soppressata/capocollo/guanciale
(#50, #51, #55), Torrone di Bagnara (#74), liquori PAT (#82–86).

### 8.4 Prima di pubblicare una scheda azienda

1. **Consenso**: chiedere all'azienda l'autorizzazione a comparire e i dati
   aggiornati (indirizzo, telefono, prezzi, disponibilità).
2. **Nessun claim di partnership** o logo dell'azienda senza accordo scritto.
3. **Nessun logo DOP/IGP/Presidio** sulla scheda finché l'azienda non conferma la
   certificazione del lotto venduto.
4. **Prezzi e stagionalità** vanno indicati come "indicativi": molti prodotti
   (Felciata, Melanzana di Rotonda, Clementine, Fichi) sono stagionali.

---

## 9. Priorità consigliate (se si vuole procedere a step)

**Step 0 — blocco Pollino, 14 prodotti** (sezione 8): è il territorio della
città, quindi il più riconoscibile per chi visita incitta.online — Moscato di
Saracena, Pane di Cerchiara, Lenticchia di Mormanno, Felciata, Melanzana di
Rotonda, Peperone di Senise.

**Step 1 — massimo impatto, 10 prodotti**: Cirò Classico DOCG, Cirò DOC Rosso,
Greco di Bianco DOC, Savuto DOC Rosso, Terre di Cosenza DOC Donnici, Cipolla
Rossa di Tropea IGP, Fichi di Cosenza DOP, Caciocavallo Silano DOP, Soppressata
di Calabria DOP, Torrone di Bagnara IGP.

**Step 2 — 10 vini** (completa la sezione enoteca: le altre DOC + 3 IGT).

**Step 3 — 15 dispensa e dolci** (conserve, mieli, mostaccioli, turdilli,
susumelle, fileja, pane di Cerchiara).

**Step 4 — 10 formaggi e salumi** (Pecorino Crotonese, Monte Poro, Pollino PAT,
'nuduja, capocollo, pancetta).

---

## 10. Fonti consultate

- **Vini**: FederDOC, scheda Calabria (1 DOCG Cirò Classico, 9 DOC, 10 IGT);
  disciplinari Mipaaf/Masaf (Terre di Cosenza DOC e sottozone, Cirò, Greco di
  Bianco, Savuto, Lamezia, Melissa, Bivongi, Scavigna, Sant'Anna di Isola Capo
  Rizzuto).
- **ARSAC Calabria** (arsacweb.it, aggiornamento ottobre 2026): «I vini DOP/DOC
  in Calabria» e «I vini IGP/IGT», con le 7 sottozone di Terre di Cosenza, le 10
  IGT (e la nota che Cosenza e Vibo Valentia non ne hanno di proprie), l'elenco
  dei vitigni autoctoni e le specificazioni di vitigno ammesse; pagine «Prodotti
  di qualità» (14 DOP + 8 IGP = 22 prodotti tutelati) e «Prodotti tradizionali
  PAT» (270 schede).
- **Assovini.it** (dati Mipaaf aggiornati al 24/10/2026): liste DOCG/DOC/IGT
  Calabria con sottozone, schede dei vitigni calabresi (Gaglioppo, Castiglione,
  Mantonico, Pecorello, Guarnaccia, Nocera...) e relative denominazioni
  vinificate; sezione «Cantine Calabria» (2 schede: La Pizzuta del Principe,
  Cantine Ielasi) usata solo come controllo, **non** per inserire nomi di
  aziende nel demo.
- **DOP/IGP alimentari**: elenco CREA/Masaf delle IG italiane registrate (14 DOP
  e 7 IGP storiche calabresi) + Peperoncino di Calabria IGP, Reg. UE 2026/1273
  del 04/06/2026, GUUE dell'11/06/2026.
- **Bergamotto di Reggio Calabria IGP (frutto)**: disciplinare pubblicato in G.U.
  n. 241 del 16/10/2025, domanda trasmessa alla Commissione UE il 06/02/2026;
  in eAmbrosia risulta ancora *Applied*, quindi **non registrata**.
- **PAT**: elenco regionale ARSAC dei prodotti agroalimentari tradizionali della
  Calabria (269–270 schede), usato per formaggi, dolci e liquori.
- **Aziende del Pollino**: Parks.it – Ente Parco Nazionale del Pollino (schede
  produttori), ilpollino.it, Fondazione Slow Food (Presidio Moscato al governo di
  Saracena; Arca del Gusto Pane di Cerchiara), siti aziendali citati in tabella,
  Guida Fisar “Vignaioli dell'Alta Calabria”, Gambero Rosso, ARSAC/CNR per la
  lenticchia di Mormanno.

---

## 11. Campi DB da valorizzare (schema attuale)

```sql
insert into public.prodotti (
  slug, negozio_id, nome, descrizione, categoria, prezzo,
  attivo, quantita_disponibile, immagine_principale,
  origine_pubblicazione, prodotto_tipico
)
select 'ciro-classico-docg-rosso', n.id,
       'Cirò Classico DOCG Rosso',
       'Rosso da uve Gaglioppo delle colline di Cirò. Prodotto dimostrativo nella selezione delle eccellenze.',
       'Vini', 19.90, true, 12, '<immagine>', 'manuale', true
from public.negozi n where n.slug = 'demo-enoteca-pollino'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione,
  categoria = excluded.categoria, prezzo = excluded.prezzo,
  attivo = true, prodotto_tipico = true,
  immagine_principale = excluded.immagine_principale;
```

Note pratiche:
- `slug` univoco e parlante (usare il nome denominazione, senza anno/annata).
- `origine_pubblicazione = 'manuale'` per i prodotti inseriti a mano.
- Le immagini dei vini oggi disponibili sono foto Pexels generiche di calici:
  se si vuole coerenza visiva conviene riusare 3–4 immagini "bottiglia/cantina"
  e non una diversa per ogni etichetta.
- Nessuna nuova colonna necessaria: `categoria = 'Vini'` basta per una futura
  sezione "Vini" o per un filtro nella vetrina.

---

## 12. Selezione DEMO per ricette e abbinamenti — solo area Pollino

Selezione pensata per il modulo in cui **Pino crea ricette e abbinamenti**:
servono solo **nomi di prodotto** (nessun marchio, nessuna azienda), scelti
perché sono cucinabili e riconoscibili. Prezzi indicativi, categoria DB pronta
(`Alimentari` / `Vini`), stagionalità dichiarata quando conta.

**Perimetro: area del Pollino.** Comuni del Parco Nazionale del Pollino e
immediati dintorni. Versante calabrese (provincia di Cosenza): Castrovillari,
Morano Calabro, Mormanno, Saracena, Cerchiara di Calabria, Frascineto, Civita,
Lungro, Acquaformosa, Firmo, Altomonte, San Basile, Laino Borgo, Laino
Castello, Papasidero, Orsomarso, Verbicaro, San Donato di Nibbio, Alessandria
del Carretto, San Lorenzo Bellizzi, Terranova di Pollino, San Costantino
Albanese, San Paolo Albanese, Plataci, Castroregio, Albidona. Versante lucano
(provincia di Potenza): Rotonda, Viggianello, Chiaromonte, Senise, San Severino
Lucano, Episcopia, Francavilla in Sinni, Noepoli, Cersosimo, Castronuovo di
Sant'Andrea, Latronico, Lauria.

Restano **fuori** da questa sezione — e non vanno usati nelle ricette demo — i
prodotti e i vini delle altre aree calabresi descritti nelle sezioni 1–9 (Cirò,
Greco di Bianco, Savuto, Bivongi, Lamezia, Melissa, Sant'Anna di Isola Capo
Rizzuto, Scavigna, Tropea, Sila, Rocca Imperiale, Bagnara, Reggio Calabria,
Sibaritide...): quelle sezioni restano il catalogo regionale di riferimento, non
la selezione del demo.

### 12.1 Ingredienti (53)

**Verdure, legumi, frutta e aromi**

| Prodotto | Stagione | Ruolo in ricetta | Prezzo |
| --- | --- | --- | --- |
| Cipolla Bianca di Castrovillari | tutto l'anno | soffritti, zuppe, confettura | 3,50/kg |
| Melanzana Rossa di Rotonda DOP | giu–set | parmigiana, involtini, sott'olio | 3–5/kg |
| Peperone di Senise IGP (fresco) | ago–ott | peperonata, ripieni, conserve | 6–10 |
| Crusco di Senise (in polvere) | tutto l'anno | condimento di pasta e legumi | 8–12 |
| Pomodoro Costoluto del Pollino | lug–set | salsa, conserve, insalate | 3–5/kg |
| Lenticchia di Mormanno | tutto l'anno | zuppe, contorni, polpette | 6–9 |
| Fagioli Bianchi di Rotonda DOP | tutto l'anno | zuppe, contorni, pasta e fagioli | 6–10 |
| Funghi porcini del Pollino | ago–nov | primi, secondi, sott'olio | 12–20 |
| Castagne del Pollino | ott–dic | arrosto, dolci, farina | 5–8/kg |
| Noci del Pollino | ott–dic | dolci, condimento, tagliere | 8–12/kg |
| Asparagi selvatici del Pollino | mar–mag | frittate, primi, sott'olio | 10–16/kg |
| Broccoli del Pollino (natalizi) | nov–feb | contorni, orecchiette, sott'olio | 3–5/kg |
| Finocchietto selvatico del Pollino | mar–nov | condimento, pasta con le sarde | 4–7 |
| Origano selvatico del Pollino | giu–ago | condimento di carni e verdure | 4–8 |
| Peperoncino "Vamp i fuc" di Cerchiara | ago–ott (fresco) | condimento, olio aromatizzato | 6–9 |

**Pasta, pane e farine**

| Prodotto | Stagione | Ruolo in ricetta | Prezzo |
| --- | --- | --- | --- |
| Mischiglio PAT | tutto l'anno | minestre, pasta rustica | 3–5 |
| Pane di Cerchiara | tutto l'anno | bruschette, pane raffermo per polpette | 6–8/kg |
| Farina di grani antichi del Pollino | tutto l'anno | pane, pasta fresca, pizza | 3–6/kg |

**Formaggi**

| Prodotto | Stagione | Ruolo in ricetta | Prezzo |
| --- | --- | --- | --- |
| Caciocavallo Silano DOP (zona Pollino) | tutto l'anno | gratinati, alla piastra, tagliere | 14–18/kg |
| Pecorino del Pollino PAT | tutto l'anno | tagliere, sughi, pasta | 16–22/kg |
| Caprino di Morano | mar–ott | antipasti, crostini, insalate | 12–18/kg |
| Felciata di Morano PAT | mag–ago | secondo piatto, tagliere | 12–18/kg |
| Ricotta affumicata del Pollino | tutto l'anno | ripieni, ravioli, pasta | 10–14/kg |
| Cacioricotta del Pollino | estivo | tagliere, gratinati, pasta | 12–16/kg |
| Giuncata del Pollino | primavera | antipasto, dessert con miele | 8–12/kg |

**Salumi e carni**

| Prodotto | Stagione | Ruolo in ricetta | Prezzo |
| --- | --- | --- | --- |
| Guanciale del Pollino | tutto l'anno | soffritto, sughi, zuppe | 12–16/kg |
| Soppressata del Pollino | inverno | antipasti, sugo, pizza | 12–18/kg |
| Capocollo del Pollino | inverno | tagliere, panini | 14–20/kg |
| Salsiccia del Pollino | tutto l'anno | brace, sugo, pizza | 9–14/kg |
| Pancetta del Pollino | inverno | soffritti, sughi, bruschette | 10–14/kg |
| Agnello del Pollino | primavera | arrosto, brodo, ragù bianco | 14–20/kg |
| Capretto del Pollino | primavera | arrosto, umido | 14–20/kg |
| Cinghiale del Pollino | autunno–inverno | umido, ragù, salumi | 12–18/kg |

**Dispensa e condimenti**

| Prodotto | Stagione | Ruolo in ricetta | Prezzo |
| --- | --- | --- | --- |
| Olio EVO del Pollino | tutto l'anno | base di ogni ricetta | 12,50/lt |
| Olio EVO monocultivar Roggianella | tutto l'anno | condimento a crudo, bruschette | 14–20/lt |
| Miele millefiori del Pollino | tutto l'anno | dolci, arrosti, formaggi | 9,90 |
| Miele di castagno del Pollino | tutto l'anno | formaggi stagionati, dolci | 11,90 |
| Miele di sulla del Pollino | tutto l'anno | formaggi freschi, colazione | 10–13 |
| Dolcezza di cipolla bianca | tutto l'anno | abbinata a formaggi, carni | 7,90 |
| Pomodori secchi sott'olio del Pollino | tutto l'anno | antipasti, pasta, bruschette | 7–11 |
| Melanzane sott'olio del Pollino | tutto l'anno | antipasti, bruschette | 7–11 |
| Funghi porcini sott'olio | tutto l'anno | crostini, condimento | 9–14 |
| Olive nere in salamoia del Pollino | tutto l'anno | antipasti, pizza, insalate | 6–10 |
| Peperoncino "Vamp i fuc" in olio | tutto l'anno | condimento piccante | 6–9 |
| Mosto cotto (saba) | tutto l'anno | dolci, arrosti, condimento | 6–10 |
| Confetture del Pollino (fichi, prugne, more) | tutto l'anno | colazione, formaggi | 7–11 |
| Farina di castagne del Pollino | ott–dic | dolci, pasta fresca, polenta | 6–10 |
| Giardiniera di verdure del Pollino | tutto l'anno | contorno, antipasto | 6–9 |

**Dolci**

| Prodotto | Stagione | Ruolo in ricetta | Prezzo |
| --- | --- | --- | --- |
| Ciotaredda di Castrovillari | tutto l'anno | dolce da forno, colazione | 7,50 |
| Bocconotto di Mormanno | tutto l'anno | dessert, fine pasto | 9–14/kg |
| Cannaritoli di Morano | natale | dessert natalizio | 10–14/kg |
| Pitta 'mpigliata del Pollino | natale | dessert natalizio, con Moscato | 12–18/kg |

### 12.2 Vini del Pollino da abbinare (6)

| Vino | Stile | Abbinamenti tipici | Prezzo |
| --- | --- | --- | --- |
| Terre di Cosenza DOC Pollino Rosso (Magliocco) | rosso di medio corpo, frutto scuro, spezia | agnello, cinghiale, pecorino | 12–16 |
| Terre di Cosenza DOC Pollino Riserva | rosso strutturato, tannino morbido | brasati, caciocavallo stagionato | 18–26 |
| Terre di Cosenza DOC Pollino Rosato | rosato secco, fresco | salumi, felciata, frittate | 9–13 |
| Terre di Cosenza DOC Verbicaro Rosso | rosso caldo da Guarnaccia nera | arrosti, sughi di carne, melanzane al forno | 12–18 |
| Terre di Cosenza DOC Verbicaro Bianco | bianco sapido, agrumato | caprino, verdure amare, funghi | 11–15 |
| Moscato al governo di Saracena | dolce, ossidativo, note di fico e miele | bocconotto, cannaritoli, ciotaredda, pecorino stagionato | 18–28 |

Sono le sole denominazioni vinicole che ricadono nell'area del Pollino:
sottozona **Pollino** di Terre di Cosenza, sottozona **Verbicaro** (comune del
Parco, alto Tirreno cosentino) e il **Moscato al governo di Saracena**, che non è
DOC ma Presidio Slow Food. Un bianco fermo prodotto nel Pollino da cantine che
non rivendicano la sottozona si etichetta **Terre di Cosenza DOC Bianco**,
denominazione provinciale: è l'unica eccezione ammessa, e va usata solo se serve
un bianco secco in più.

Schede dettagliate dei sei vini (zona, base ampelografica, stile, servizio,
abbinamenti dal paniere): `docs/schede-vini-calabria.md`. Le schede delle altre
denominazioni calabresi restano in `docs/schede-vini-calabria-regione.md`, fuori
dalla selezione demo.

### 12.3 Come usarli nel demo

- Ogni ricetta parte da **2–5 ingredienti** della 12.1 (uno principale + condimento
  del territorio) e propone **1 vino** della 12.2 con una riga di motivazione
  (struttura, acidità, dolcezza).
- Con sei vini la scelta va fatta per struttura: **Pollino Rosso** per arrosti e
  cinghiale, **Riserva** per le cotture lunghe, **Rosato** per antipasti e
  frittate, **Verbicaro Rosso** per le verdure cotte e i sughi, **Verbicaro
  Bianco** per caprino e verdure amare, **Moscato di Saracena** solo su dolci e
  formaggi stagionati.
- Il **Moscato al governo di Saracena** è il prodotto simbolo del Pollino: può
  fare da ponte tra la sezione dolci e quella vini.
- Stagionalità: Felciata (mag–ago), Melanzana di Rotonda e Pomodoro Costoluto
  (estate), Castagne e Cinghiale (autunno–inverno) — utile per una sezione
  "ricette del mese".

### 12.4 Regole del demo

- **Nessun nome di azienda, marchio o logo**: solo denominazioni di prodotto.
- **Solo area Pollino**: se un ingrediente o un vino non è nel perimetro
  descritto sopra, non entra nelle ricette demo.
- Le denominazioni tutelate citabili in questa selezione sono solo:
  **Melanzana Rossa di Rotonda DOP**, **Fagioli Bianchi di Rotonda DOP**,
  **Peperone di Senise IGP**, **Caciocavallo Silano DOP** (prodotto anche nella
  zona del Pollino) e i **PAT** Mischiglio, Felciata di Morano, Pecorino del
  Pollino. Il Moscato di Saracena resta **senza** sigla perché non è DOC.
- **Salumi**: gli unici DOP calabresi (Soppressata, Capocollo, Pancetta,
  Salsiccia di Calabria DOP) hanno denominazione regionale, quindi nella
  selezione si scrive **"del Pollino"**, senza sigla: è un prodotto locale, non
  una DOP.
- Prezzi e stagioni **indicativi**, da non presentare come offerta commerciale.
