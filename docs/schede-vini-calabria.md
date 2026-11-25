# Schede vini del Pollino — selezione per il demo di Pino

Schede di servizio per il modulo in cui **Pino crea ricette e abbinamenti**.
Contengono **solo le sei denominazioni che ricadono nell'area del Pollino** e
descrivono **solo la denominazione**, mai un'azienda o un marchio: niente nomi di
cantine, niente etichette commerciali. Basi ampelografiche e zone sono quelle
verificate nelle sezioni 1–1.3 di `docs/eccellenze-calabresi-catalogo.md` (fonti:
ARSAC Calabria, FederDOC, Assovini, disciplinari Masaf); gli abbinamenti
rimandano ai 53 ingredienti della sezione 12.1 dello stesso documento. Le schede
delle altre denominazioni calabresi (Cirò, Greco di Bianco, Savuto, Bivongi,
Lamezia, Melissa, IGT regionali) sono in `docs/schede-vini-calabria-regione.md`,
**fuori** dalla selezione demo.

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

Regole: prezzi indicativi (non listini), nessuna annata, nessun logo DOP/IGP,
niente «DOP» sui vini (per il vino si usa DOC/DOCG/IGT).

---

## Terre di Cosenza DOC — sottozona Pollino (provincia di Cosenza)

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
**Con i prodotti del paniere** Brasato d'agnello con mosto cotto (saba), Caciocavallo Silano DOP stagionato, Funghi porcini del Pollino
**Nota per Pino** «Da usare quando la ricetta ha cottura lunga e sugo ristretto.»

### 3. Terre di Cosenza DOC Pollino Rosato
**Slug** `terre-di-cosenza-doc-pollino-rosato` · **Categoria** Vini · **Prezzo** 9–13 €
**Zona** sottozona Pollino
**Base** Greco nero / Magliocco / Gaglioppo / Aglianico / Calabrese (min. 60%)
**Stile** rosato secco, ciliegia, buona acidità
**Servizio** 10–12 °C, calice medio
**Con i prodotti del paniere** Felciata di Morano PAT, Soppressata del Pollino, Frittata con asparagi selvatici del Pollino
**Nota per Pino** «Il rosato che apre il pasto: salumi e formaggi morbidi senza coprirli.»

## Terre di Cosenza DOC — sottozona Verbicaro (alto Tirreno cosentino)

### 4. Terre di Cosenza DOC Verbicaro Rosso
**Slug** `terre-di-cosenza-doc-verbicaro-rosso` · **Categoria** Vini · **Prezzo** 12–18 €
**Zona** sottozona Verbicaro, comune del Parco del Pollino sul versante tirrenico
**Base** Magliocco dolce, qui detto *Guarnaccia nera*
**Stile** rosso caldo, frutto maturo, spezia e balsamico
**Servizio** 16–18 °C
**Con i prodotti del paniere** Capretto del Pollino, Salsiccia del Pollino, Melanzana Rossa di Rotonda DOP
**Nota per Pino** «Rosso mediterraneo: funziona con le verdure cotte al forno, non solo con la carne.»

### 5. Terre di Cosenza DOC Verbicaro Bianco
**Slug** `terre-di-cosenza-doc-verbicaro-bianco` · **Categoria** Vini · **Prezzo** 11–15 €
**Zona** sottozona Verbicaro
**Base** uve bianche della sottozona (Greco bianco, Guarnaccia bianca, Pecorello)
**Stile** bianco sapido, agrumato, finale salino
**Servizio** 10–12 °C
**Con i prodotti del paniere** Caprino di Morano, Broccoli del Pollino saltati, Frittata con asparagi selvatici del Pollino
**Nota per Pino** «Bianco di montagna: tiene testa ai piatti di verdure amare e ai formaggi di capra.»

## Saracena (provincia di Cosenza) — non DOC

### 6. Moscato al governo di Saracena
**Slug** `moscato-al-governo-di-saracena` · **Categoria** Vini · **Prezzo** 18–28 €
**Zona** Saracena e dintorni (provincia di Cosenza), Pollino
**Base** Moscato bianco con uve bianche locali e mosto cotto; **Presidio Slow Food dal 2004**
**Stile** dolce, ossidativo, fico secco, miele, mandorla
**Servizio** 12–14 °C, calice piccolo
**Con i prodotti del paniere** Bocconotto di Mormanno, Pitta 'mpigliata del Pollino, Pecorino del Pollino PAT stagionato
**Nota per Pino** «Non è DOC: scrivere solo "Moscato al governo di Saracena". È il ponte perfetto tra la sezione dolci e quella vini.»

---

## Tabella di caricamento (6 vini)

| # | Slug | Nome prodotto | Categoria | Prezzo |
| --- | --- | --- | --- | --- |
| 1 | terre-di-cosenza-doc-pollino-rosso | Terre di Cosenza DOC Pollino Rosso | Vini | 12–16 |
| 2 | terre-di-cosenza-doc-pollino-riserva | Terre di Cosenza DOC Pollino Riserva | Vini | 18–26 |
| 3 | terre-di-cosenza-doc-pollino-rosato | Terre di Cosenza DOC Pollino Rosato | Vini | 9–13 |
| 4 | terre-di-cosenza-doc-verbicaro-rosso | Terre di Cosenza DOC Verbicaro Rosso | Vini | 12–18 |
| 5 | terre-di-cosenza-doc-verbicaro-bianco | Terre di Cosenza DOC Verbicaro Bianco | Vini | 11–15 |
| 6 | moscato-al-governo-di-saracena | Moscato al governo di Saracena | Vini | 18–28 |

Tutti e sei finiscono in `public.prodotti` con `categoria = 'Vini'`,
`prodotto_tipico = true`, `attivo = true`, nel negozio demo dell'enoteca.
