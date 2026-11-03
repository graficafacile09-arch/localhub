import { expect, test } from "@playwright/test";

import { chatConAssistente } from "../lib/assistente/index";
import { analizzaComprensionePino, pianoLocaleIntelligente } from "../lib/assistente/semantica";
import { analizzaIntentoPino, pianoIntento } from "../lib/assistente/intent";
import { prodottoPertinente, filtraProdottiPerSoggettoUnico } from "../lib/assistente/tools";
import { parametriFallbackPiano, fallbackTestuale } from "../lib/assistente/index";
import {
  isExplicitFoodProductRequest,
  richiestaCinemaPino,
} from "../lib/assistente/routing-policy";
import { TOKEN_SENZA_REFUSI, VOCABOLARIO_PINO } from "../lib/assistente/semantica";
import {
  correggiTokenCatalogo,
  normalizzaQueryCatalogo,
  rilevaLinguaConversazionePino,
} from "../lib/assistente/understanding";
import {
  etichettaNegoziTrovatiPino,
  etichettaProdottiTrovatiPino,
} from "../lib/assistente/etichette-risultati";
import {
  espandiQueryConSinonimi,
  espandiQueryConSinonimiBase,
  sonoSinonimiDirettiProdotto,
} from "../lib/ricerca-semantica";
import type { ProdottoRicerca } from "../lib/ricerca-ai";

const u = (content: string) => ({ role: "user" as const, content });

/**
 * Ricerca alimentare in inglese: il soggetto deve diventare italiano PRIMA del
 * retrieval. Nessuna nuova fonte: la query tradotta passa dalla stessa ricerca
 * prodotti InCittà usata dalle richieste italiane.
 */
test.describe("Pino — alimenti in inglese", () => {
  test("'bread' è intento food non basso e il piano cerca prodotti in italiano", () => {
    const analisi = analizzaIntentoPino("bread");
    expect(analisi.intent).toBe("food");
    expect(analisi.dominio).toBe("food");
    expect(analisi.confidence).not.toBe("bassa");

    const piano = pianoIntento(analisi, "bread");
    expect(piano).toContainEqual({ tool: "searchProducts", query: "pane" });
    expect(piano.some((t) => t.query === "bread")).toBe(false);
  });

  test("le richieste inglesi complete usano il soggetto italiano del catalogo", () => {
    const casi: Array<[string, string]> = [
      ["I want some bread", "pane"],
      ["I want some cheese", "formaggio"],
      ["I need some cookies", "biscotti"],
    ];
    for (const [frase, soggetto] of casi) {
      expect(normalizzaQueryCatalogo(frase)).toBe(soggetto);
    }
  });

  test("la parola singola inglese è una richiesta esplicita di prodotto", () => {
    expect(isExplicitFoodProductRequest("bread")).toBe(true);
    // Confronto per token esatto: nessun falso positivo su parole più lunghe.
    expect(isExplicitFoodProductRequest("breadsticks")).toBe(false);
  });
});

/**
 * Lingua del singolo messaggio e conteggi dei risultati.
 *
 * La lingua della risposta è `comprensione.lingua` (index.ts): una preferenza
 * dichiarata in passato non deve bloccare un messaggio chiaramente scritto in
 * un'altra lingua, e le etichette dei risultati devono seguire quella lingua.
 */
test.describe("Pino — lingua del messaggio e conteggi", () => {
  const linguaRisposta = (frase: string, turni: string[]) =>
    analizzaComprensionePino(frase, [...turni.map(u), u(frase)]).lingua;

  test("conversazione in inglese, poi 'voglio il pane': risposta italiana", () => {
    expect(linguaRisposta("voglio il pane", ["I speak English", "bread", "I want some bread"])).toBe("it");
    expect(
      rilevaLinguaConversazionePino(
        ["I speak English", "bread", "I want some bread", "voglio il pane"].map(u)
      )
    ).toBe("it");
  });

  test("conversazione in italiano, poi 'I want some bread': risposta inglese", () => {
    expect(linguaRisposta("I want some bread", ["voglio il pane"])).toBe("en");
    expect(rilevaLinguaConversazionePino(["voglio il pane", "I want some bread"].map(u))).toBe("en");
  });

  test("cambio ripetuto italiano → inglese → italiano nella stessa conversazione", () => {
    expect(linguaRisposta("voglio il pane", ["voglio il pane", "I want some bread"])).toBe("it");
    expect(
      linguaRisposta("I want some bread", ["voglio il pane", "I want some bread", "voglio il pane"])
    ).toBe("en");
    // Anche dopo una preferenza esplicita il ritorno all'italiano è riconosciuto.
    expect(
      rilevaLinguaConversazionePino(["I speak English", "bread", "voglio il pane"].map(u))
    ).toBe("it");
  });

  test("i conteggi seguono la lingua della risposta", () => {
    expect(etichettaProdottiTrovatiPino(1, "en")).toBe("1 product found");
    expect(etichettaProdottiTrovatiPino(1, "it")).toBe("1 prodotto trovato");
    expect(etichettaProdottiTrovatiPino(3, "en")).toBe("3 products found");
    expect(etichettaProdottiTrovatiPino(3, "it")).toBe("3 prodotti trovati");
    expect(etichettaNegoziTrovatiPino(1, "en")).toBe("1 store found");
    expect(etichettaNegoziTrovatiPino(2, "it")).toBe("2 negozi trovati");
    // Senza lingua (ricerca DB, non assistente) resta l'italiano storico.
    expect(etichettaProdottiTrovatiPino(1)).toBe("1 prodotto trovato");
  });
});

/**
 * Categoria alimentare generica e sottotipi reali del catalogo.
 *
 * Il catalogo pubblica il nome specifico ("Pecorino"), non la categoria
 * generica ("formaggio"): il ponte è curato e viene verificato solo sui
 * metadati identitari, mai sulla descrizione, e non è una soglia globale più
 * permissiva.
 */
test.describe("Pino — formaggi: categoria generica e sottotipi", () => {
  const P = (nome: string, categoria: string, descrizione: string | null = null): ProdottoRicerca => ({
    id: nome,
    negozio_id: "n1",
    nome,
    descrizione,
    categoria,
    prezzo: 12,
    negozio_nome: "Attività",
    immagine_principale: null,
  });

  const pecorino = P("Pecorino di Castrovillari", "Alimentari", "Formaggio stagionato di latte di pecora.");

  test("'formaggio' accetta il pecorino pubblicato come alimento", () => {
    expect(prodottoPertinente(pecorino, ["formaggio"], [])).toBe(true);
  });

  test("'formaggio' non promuove un prodotto solo perché la descrizione lo cita", () => {
    const cipolla = P("Dolcezza di Cipolla Bianca", "Alimentari", "Ottima con formaggi e carni.");
    expect(prodottoPertinente(cipolla, ["formaggio"], [])).toBe(false);
  });

  test("'pecorino' resta una ricerca specifica, non una categoria", () => {
    expect(prodottoPertinente(pecorino, ["pecorino"], [])).toBe(true);
    expect(prodottoPertinente(P("Caciocavallo silano", "Alimentari"), ["pecorino"], [])).toBe(false);
  });

  test("la query generica si espande ai sottotipi senza perdere il termine originale", () => {
    const espansa = espandiQueryConSinonimiBase("formaggio").split(/\s+/);
    expect(espansa).toContain("formaggio");
    expect(espansa).toContain("pecorino");
    // Una query specifica non viene allargata alla categoria.
    expect(espandiQueryConSinonimiBase("pecorino").split(/\s+/)).not.toContain("mozzarella");
  });

  test("'cerco pecorino' è una richiesta esplicita di prodotto alimentare", () => {
    expect(isExplicitFoodProductRequest("cerco pecorino")).toBe(true);
    expect(isExplicitFoodProductRequest("trova un formaggio")).toBe(true);
  });

  test("lingua: 'cheese' e 'I want some cheese' sono inglesi", () => {
    expect(analizzaComprensionePino("cheese", [u("cheese")]).lingua).toBe("en");
    expect(analizzaComprensionePino("I want some cheese", [u("I want some cheese")]).lingua).toBe("en");
    // La normalizzazione del soggetto resta quella già introdotta.
    expect(normalizzaQueryCatalogo("cheese")).toBe("formaggio");
  });

  test("regressioni alimentari invariate", () => {
    expect(prodottoPertinente(P("Pane Casereccio", "Panetteria"), ["pane"], [])).toBe(true);
    expect(normalizzaQueryCatalogo("cookies")).toBe("biscotti");
    expect(prodottoPertinente(P("Biscotti della casa", "Dolciumi"), ["biscotti"], [])).toBe(true);
    expect(rilevaLinguaConversazionePino(["I speak English", "voglio il pane"].map(u))).toBe("it");
  });
});

/**
 * Regressioni segnalate sul comportamento reale di Pino.
 *
 * Questi casi si fermano prima di Supabase/Gemini (fast path conversazionale e
 * dominio attrazioni), quindi sono verificabili localmente senza servizi
 * esterni e senza inventare dati di catalogo.
 */
test.describe("Pino — regressioni di intento", () => {
  test("'I speak English' resta una conversazione: nessuna ricerca di catalogo", async () => {
    const r = await chatConAssistente([u("I speak English")]);

    expect(r.negozi).toEqual([]);
    expect(r.prodotti).toEqual([]);
    expect(r.risposta).toMatch(/English/);
    expect(r.risposta).not.toMatch(/Prodotti trovati|Negozi pertinenti|Products found/);
  });

  test("'Voglio andare al cinema' usa il dominio luoghi e dichiara l'assenza del cinema", async () => {
    const r = await chatConAssistente([u("Voglio andare al cinema")]);

    expect(r.negozi).toEqual([]);
    expect(r.prodotti).toEqual([]);
    expect(r.risposta).toMatch(/cinema/i);
    expect(r.risposta).toMatch(/guida Attrazioni/i);
    // Non deve affermare che in città non esistano cinema: solo che la guida
    // non ne riporta uno.
    expect(r.risposta).not.toMatch(/a Castrovillari non esist/i);
    expect(r.risposta).not.toMatch(/Prodotti trovati|Negozi pertinenti/);
  });

  test("una parola italiana valida non viene sostituita da un termine di catalogo", () => {
    for (const query of ["Voglio un cane", "Voglio un gatto", "Voglio un pane"]) {
      const piano = pianoLocaleIntelligente(query, analizzaIntentoPino(query));
      expect(piano?.query ?? "").not.toMatch(/\baglio\b/);
      expect(piano?.query ?? "").toMatch(/\b(cane|gatto|pane)\b/);
    }
  });

  test("nessun prodotto reale viene mostrato per una parola diversa (cane ≠ pane)", () => {
    const prodotto = (nome: string, categoria: string): ProdottoRicerca => ({
      id: nome,
      negozio_id: "n1",
      nome,
      descrizione: null,
      categoria,
      prezzo: 3,
      negozio_nome: "Attività",
      immagine_principale: null,
    });

    expect(prodottoPertinente(prodotto("Pane artigianale", "Alimentari"), ["cane"], [])).toBe(false);
    expect(prodottoPertinente(prodotto("Guinzaglio per cane", "Animali"), ["cane"], [])).toBe(true);
  });

  test("'I want to go to the movies' resta una richiesta di luogo, senza prodotti", async () => {
    const r = await chatConAssistente([u("I want to go to the movies")]);

    expect(r.negozi).toEqual([]);
    expect(r.prodotti).toEqual([]);
    expect(r.risposta).toMatch(/cinema/i);
    expect(r.risposta).toMatch(/Attractions guide/i);
  });

  test("il gate per soggetto unico accetta equivalenze reali e rifiuta le somiglianze", () => {
    const P = (nome: string, categoria: string): ProdottoRicerca => ({
      id: nome,
      negozio_id: "n1",
      nome,
      descrizione: null,
      categoria,
      prezzo: 3,
      negozio_nome: "Attività",
      immagine_principale: null,
    });
    const sneakers = P("Sneakers running", "Calzature");
    const anello = P("Anello d'oro", "Gioielleria");
    const maglietta = P("Maglietta in cotone", "Abbigliamento");
    const pane = P("Pane artigianale", "Alimentari");
    const crocchetteCani = P("Crocchette per cani", "Animali");
    const crocchetteCane = P("Crocchette per cane", "Animali");
    const telefono = P("Telefono Samsung", "Telefonia");
    const orologio = P("Orologio da polso", "Accessori");

    expect(filtraProdottiPerSoggettoUnico([sneakers], "scarpe")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([anello], "gioielli")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([maglietta], "maglia")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([crocchetteCani], "cane")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([crocchetteCane], "cani")).toHaveLength(1);

    // "cane" non deve mai mostrare pane, né in corrispondenza né in recupero.
    expect(filtraProdottiPerSoggettoUnico([pane], "cane")).toHaveLength(0);
    // I risultati esatti hanno la precedenza: nessun pane accanto alle crocchette.
    expect(filtraProdottiPerSoggettoUnico([pane, crocchetteCani], "cane")).toEqual([
      crocchetteCani,
    ]);

    // Refusi plausibili recuperabili, parole corrette mai sostituite.
    expect(filtraProdottiPerSoggettoUnico([telefono], "telefno")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([orologio], "orologgio")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Carote", "Ortofrutta")], "carta")).toHaveLength(0);
  });

  test("la descrizione non identifica il prodotto: cipolla sott'olio ≠ olio (D1)", () => {
    const P = (nome: string, categoria: string, descrizione: string | null = null): ProdottoRicerca => ({
      id: nome,
      negozio_id: "n1",
      nome,
      descrizione,
      categoria,
      prezzo: 3,
      negozio_nome: "Attività",
      immagine_principale: null,
    });

    expect(
      prodottoPertinente(P("Filetti di cipolla", "Conserve", "Conservati sott'olio."), ["olio"], [])
    ).toBe(false);
    expect(
      prodottoPertinente(P("Olio Extra Vergine di Oliva", "Alimentari"), ["olio"], [])
    ).toBe(true);
  });

  test("il gate multi-parola usa il soggetto principale, non gli attributi (D2)", () => {
    const P = (nome: string, categoria: string): ProdottoRicerca => ({
      id: nome,
      negozio_id: "n1",
      nome,
      descrizione: null,
      categoria,
      prezzo: 3,
      negozio_nome: "Attività",
      immagine_principale: null,
    });

    expect(filtraProdottiPerSoggettoUnico([P("T-shirt nera", "Abbigliamento")], "tartufo nero")).toHaveLength(0);
    expect(filtraProdottiPerSoggettoUnico([P("Tartufo nero in salsa", "Gastronomia")], "tartufo nero")).toHaveLength(1);

    // Gli attributi non sono un AND: il colore diverso non azzera il risultato.
    expect(filtraProdottiPerSoggettoUnico([P("Sneakers running nere", "Calzature")], "scarpe nere")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Scarpe da running bianche", "Calzature")], "scarpe nere")).toHaveLength(1);

    // Descrizione diversa nel catalogo: la lampada resta pertinente.
    expect(filtraProdottiPerSoggettoUnico([P("Lampada da scrivania in metallo", "Arredo")], "lampada da tavolo in legno")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Lampada da tavolo in legno", "Arredo")], "lampada da tavolo in legno")).toHaveLength(1);
    // Un arredo diverso non è una lampada, anche se condivide il materiale.
    expect(filtraProdottiPerSoggettoUnico([P("Scrivania in metallo", "Arredo")], "lampada da tavolo in legno")).toHaveLength(0);

    // Batteria auto: corrispondenza lessicale diretta.
    expect(filtraProdottiPerSoggettoUnico([P("Batteria 12V", "Auto")], "batteria per auto")).toHaveLength(1);

    // Cuffie: prodotto pertinente sì, elettronica generica no.
    expect(filtraProdottiPerSoggettoUnico([P("Cuffie Bluetooth", "Audio")], "cuffie")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Caricatore USB", "Elettronica")], "cuffie")).toHaveLength(0);

    // Ponte concettuale controllato: "luce" recupera la lampada…
    expect(filtraProdottiPerSoggettoUnico([P("Lampada da esterno", "Illuminazione")], "luce per esterno")).toHaveLength(1);
    // …ma non un accessorio che condivide solo l'attributo "esterno".
    expect(filtraProdottiPerSoggettoUnico([P("Cavo elettrico per esterno", "Elettrico")], "luce per esterno")).toHaveLength(0);
  });

  test("le richieste inglesi esplicite sono ricerche di prodotto (D4)", () => {
    for (const query of ["I am looking for shoes", "I want to buy olive oil", "I need a pair of headphones"]) {
      const analisi = analizzaIntentoPino(query);
      expect(analisi.intent, query).toBe("product");
      expect(analisi.confidence, query).toBe("alta");
      expect(analisi.segnali, query).toContain("ricerca-esplicita");
    }

    // "I want to go to the cinema" non è un acquisto: resta una richiesta di luogo.
    expect(richiestaCinemaPino("I want to go to the cinema")).toBe(true);
    expect(analizzaIntentoPino("I want to go to the cinema").segnali).not.toContain("ricerca-esplicita");
    // Il cinema non deve essere trattato come un servizio generico: il luogo è
    // instradato da `richiestaCinemaPino` in `index.ts` prima dell'intento.
    expect(analizzaIntentoPino("I want to go to the cinema").intent).not.toBe("service");
    // "Find me …" è comunque una ricerca esplicita di prodotto.
    expect(analizzaIntentoPino("Find me a gift").segnali).toContain("ricerca-esplicita");
  });

  test("i servizi in inglese restano servizi, gli acquisti restano acquisti (D4)", () => {
    const servizi = [
      "I need a doctor",
      "I need a dentist",
      "I need a plumber",
      "I need an electrician",
      "I want a haircut",
      "I need a barber",
    ];
    for (const query of servizi) {
      const analisi = analizzaIntentoPino(query);
      expect(analisi.intent, query).toBe("service");
      expect(analisi.usaProdotti, query).toBe(false);
    }

    const acquisti = ["I want to buy a phone", "I want to order a pizza"];
    for (const query of acquisti) {
      const analisi = analizzaIntentoPino(query);
      expect(analisi.intent, query).toBe("product");
      expect(analisi.segnali, query).toContain("ricerca-esplicita");
    }
    expect(analizzaIntentoPino("I want to order a pizza").dominio).toBe("food");
    expect(analizzaIntentoPino("I'm looking for headphones").intent).toBe("product");

    // Il luogo cinema è gestito da `richiestaCinemaPino`, non da L_SERVICE:
    // cercare proiettori o televisori "per il cinema" resta ricerca prodotti.
    for (const query of ["Cerco televisori per il cinema", "Voglio proiettori per il cinema"]) {
      const analisi = analizzaIntentoPino(query);
      expect(analisi.intent, query).toBe("product");
      expect(analisi.usaProdotti, query).toBe(true);
      expect(richiestaCinemaPino(query), query).toBe(false);
    }
    expect(richiestaCinemaPino("I want to go to the movies")).toBe(true);
    expect(analizzaIntentoPino("I want to go to the movies").intent).not.toBe("service");
  });

  test("il fallback conserva i vincoli del piano (D5)", () => {
    expect(parametriFallbackPiano(undefined)).toEqual({});
    expect(
      parametriFallbackPiano({
        surface: "products",
        intent: "food",
        query: "pasta",
        terms: ["pasta"],
        exclusions: ["nero"],
        minPrice: 1,
        maxPrice: 5,
        city: "castrovillari",
        openNow: true,
        confidence: "alta",
      })
    ).toEqual({
      esclusioni: ["nero"],
      maxPrice: 5,
      minPrice: 1,
      citta: "castrovillari",
      apertiOra: true,
    });
    // Nessun vincolo presente ⇒ nessuna proprietà inventata.
    expect(
      parametriFallbackPiano({
        surface: "products",
        intent: "product",
        query: "pasta",
        terms: [],
        exclusions: [],
        minPrice: null,
        maxPrice: null,
        city: null,
        openNow: false,
        confidence: "alta",
      })
    ).toEqual({});
  });

  test("senza risultati la risposta è onesta e non elenca prodotti", () => {
    const vuoto = {
      negozi: [],
      prodotti: [],
      offerte: [],
      eventi: [],
      categorie: [],
      meteo: null,
      farmacie: [],
    };

    const italiano = fallbackTestuale(vuoto, "", "product", undefined, null, "it");
    expect(italiano).toMatch(/Non trovo risultati/);
    expect(italiano).not.toMatch(/Prodotti trovati|Negozi pertinenti/);

    const inglese = fallbackTestuale(vuoto, "", "product", undefined, null, "en");
    expect(inglese).toMatch(/couldn.t find results/i);
  });

  test("'Cerco pasta sotto 5 euro' mantiene soggetto e budget", () => {
    const piano = pianoLocaleIntelligente("Cerco pasta sotto 5 euro", analizzaIntentoPino("Cerco pasta sotto 5 euro"));

    expect(piano?.query).toBe("pasta");
    expect(piano?.maxPrice).toBe(5);
    expect(piano?.surface).toBe("products");
  });

  test("D6: cuffie/auricolari e borsa/borsello sono equivalenti nel gate", () => {
    const P = (nome: string, categoria: string): ProdottoRicerca => ({
      id: nome,
      negozio_id: "n1",
      nome,
      descrizione: null,
      categoria,
      prezzo: 3,
      negozio_nome: "Attività",
      immagine_principale: null,
    });

    // Corrispondenze attese (singolare e plurale).
    expect(filtraProdottiPerSoggettoUnico([P("Auricolari Bluetooth", "Audio")], "cuffie")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Cuffie Bluetooth", "Audio")], "auricolari")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Borsello in pelle", "Accessori")], "borsa")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Borsa da donna", "Accessori")], "borsello")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Auricolari Bluetooth", "Audio")], "cuffia")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Borsa da donna", "Accessori")], "borse")).toHaveLength(1);

    // Abbinamenti irrilevanti: esclusi esplicitamente.
    expect(filtraProdottiPerSoggettoUnico([P("Cappello in lana", "Abbigliamento")], "cuffie")).toHaveLength(0);
    expect(filtraProdottiPerSoggettoUnico([P("Cintura in pelle", "Accessori")], "borsa")).toHaveLength(0);
    expect(filtraProdottiPerSoggettoUnico([P("Altoparlante Bluetooth", "Audio")], "auricolari")).toHaveLength(0);
    expect(filtraProdottiPerSoggettoUnico([P("Portafoglio in pelle", "Accessori")], "borsello")).toHaveLength(0);

    // Nessun effetto collaterale sugli altri gruppi già presenti.
    expect(filtraProdottiPerSoggettoUnico([P("Sneakers running", "Calzature")], "scarpe")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Maglietta in cotone", "Abbigliamento")], "maglia")).toHaveLength(1);
    expect(filtraProdottiPerSoggettoUnico([P("Pane casereccio", "Panetteria")], "cane")).toHaveLength(0);
  });

  test("D6: espansione semantica condivisa senza contaminare altre query", () => {
    expect(espandiQueryConSinonimiBase("cuffie").split(/\s+/)).toEqual(
      expect.arrayContaining(["cuffia", "cuffie", "auricolare", "auricolari"])
    );
    expect(espandiQueryConSinonimiBase("borsa").split(/\s+/)).toEqual(
      expect.arrayContaining(["borsa", "borse", "borsello", "borselli"])
    );
    // Ricerca negozi: la forme colloquiale arriva allo stesso gruppo.
    expect(espandiQueryConSinonimi("borse").split(/\s+/)).toContain("borsello");

    const pizza = espandiQueryConSinonimiBase("pizza").split(/\s+/);
    expect(pizza).not.toContain("auricolari");
    expect(pizza).not.toContain("borsello");
    expect(espandiQueryConSinonimi("farmacia").split(/\s+/)).not.toContain("cuffie");

    expect(sonoSinonimiDirettiProdotto("cuffie", "auricolari")).toBe(true);
    expect(sonoSinonimiDirettiProdotto("borsa", "borsello")).toBe(true);
    expect(sonoSinonimiDirettiProdotto("borsa", "cintura")).toBe(false);
    expect(sonoSinonimiDirettiProdotto("cuffie", "cappello")).toBe(false);
    expect(sonoSinonimiDirettiProdotto("auricolari", "altoparlante")).toBe(false);
    expect(sonoSinonimiDirettiProdotto("borsello", "portafoglio")).toBe(false);
  });

  test("D6: 'articolare/articolari' non vengono riscritti in auricolari", () => {
    expect(TOKEN_SENZA_REFUSI.has("articolare")).toBe(true);
    expect(TOKEN_SENZA_REFUSI.has("articolari")).toBe(true);
    expect(VOCABOLARIO_PINO.some(([parola]) => parola === "auricolare" || parola === "auricolari")).toBe(false);

    expect(correggiTokenCatalogo("articolare", VOCABOLARIO_PINO)).toBeNull();
    expect(correggiTokenCatalogo("articolari", VOCABOLARIO_PINO)).toBeNull();

    // Nessun piano locale deve introdurre "auricolari" da un dolore articolare.
    for (const query of ["dolore articolare", "dolori articolari"]) {
      const piano = pianoLocaleIntelligente(query, analizzaIntentoPino(query));
      expect(JSON.stringify(piano ?? {}), query).not.toContain("auricol");
    }

    // La protezione non depotenzia il recupero dei refusi veri.
    expect(correggiTokenCatalogo("orologgio", VOCABOLARIO_PINO)).toBe("orologio");
    expect(correggiTokenCatalogo("cuffie", VOCABOLARIO_PINO)).toBeNull();
    expect(correggiTokenCatalogo("borsello", VOCABOLARIO_PINO)).toBeNull();
  });
});
