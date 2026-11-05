import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { rispostaIdentitaPino } from "../lib/assistente/identity.ts";
import { isExplicitFoodProductRequest, isBroadAttractionsRequest, richiestaCinemaPino } from "../lib/assistente/routing-policy.ts";
import { rispostaPreferenzaLinguaPino } from "../lib/assistente/greetings.ts";
import {
  prodottoIdentificatoDaSoggetto,
  prodottoIdentificaSoggetto,
  prodottoForseRefusoDiSoggetto,
} from "../lib/assistente/product-relevance.ts";
import {
  correggiTokenCatalogo,
  normalizzaQueryCatalogo,
  refusoPlausibile,
  rilevaLinguaPino,
  richiestaApertaOra,
  rilevaLinguaConversazionePino,
} from "../lib/assistente/understanding.ts";

const promptSource = readFileSync(
  new URL("../lib/assistente/prompt.ts", import.meta.url),
  "utf8",
);

test("English budget and alternative wording reduce to the catalog subject", () => {
  assert.equal(rilevaLinguaPino("I'm looking for pasta under 5 euros"), "en");
  assert.equal(normalizzaQueryCatalogo("I'm looking for pasta under 5 euros"), "pasta");
  const request = "I want a watch under 100 euros, or something similar";
  assert.equal(rilevaLinguaPino(request), "en");
  assert.equal(normalizzaQueryCatalogo(request), "orologio");
});

test("Reported English budget sentence never leaves the word have in the query", () => {
  assert.equal(
    normalizzaQueryCatalogo("I have 100 euros and I want a watch or something similar."),
    "orologio",
  );
});

test("Orphaned English planner terms are removed from catalog query", () => {
  assert.equal(normalizzaQueryCatalogo("have orologio"), "orologio");
});

test("Colloquial English budget wording does not pollute the query", () => {
  assert.equal(
    normalizzaQueryCatalogo("I have 100 euros and want a watch"),
    "orologio",
  );
});

test("English product attributes are preserved", () => {
  assert.equal(
    normalizzaQueryCatalogo("I want a watch with a leather strap under 100 euros"),
    "orologio con cinturino in pelle",
  );
});

test("Italian product attributes are preserved", () => {
  assert.equal(
    normalizzaQueryCatalogo("scarpe da uomo eleganti sotto 100 euro"),
    "scarpe da uomo eleganti",
  );
  assert.equal(rilevaLinguaPino("Ho 100 euro e voglio un orologio"), "it");
});

test("Common English catalog subjects normalize to Italian search terms", () => {
  assert.equal(normalizzaQueryCatalogo("I want shoes under 80 euros"), "scarpe");
  assert.equal(normalizzaQueryCatalogo("Find me a wallet"), "portafoglio");
  assert.equal(normalizzaQueryCatalogo("I need a phone"), "telefono");
});

test("Pino identifies itself consistently in Italian and English", () => {
  assert.match(rispostaIdentitaPino("Chi sei?") ?? "", /Sono Pino/);
  assert.match(rispostaIdentitaPino("What is your name?") ?? "", /I'm Pino/);
  assert.equal(rispostaIdentitaPino("Cerca un orologio"), null);
});

test("Pino system prompt defines identity and proactive grounded behavior", () => {
  assert.match(promptSource, /Sei Pino, l'assistente AI ufficiale di InCittà\.online/);
  assert.match(promptSource, /Non inventare mai negozi, prodotti, prezzi/);
  assert.match(promptSource, /Se la richiesta è abbastanza chiara, agisci e cerca subito/);
});


test("Italian question wording normalizes to the pasta catalog subject", () => {
  assert.equal(normalizzaQueryCatalogo("Quanta pasta avete?"), "pasta");
  assert.equal(normalizzaQueryCatalogo("Che pasta avete?"), "pasta");
  assert.equal(normalizzaQueryCatalogo("Quali paste avete?"), "pasta");
  assert.equal(normalizzaQueryCatalogo("Avete pasta?"), "pasta");
});

test("Open-now wording is recognized in Italian and English and removed from catalog queries", () => {
  assert.equal(richiestaApertaOra("pizzeria aperta ora"), true);
  assert.equal(richiestaApertaOra("pizza open now"), true);
  assert.equal(richiestaApertaOra("pizzeria open right now"), true);
  assert.equal(normalizzaQueryCatalogo("pizza open now"), "pizza");
  assert.equal(normalizzaQueryCatalogo("pizzeria aperta ora"), "pizzeria");
});


test("product search subject must identify the product, not occur only in its description", () => {
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Filetti di Cipolla Bianca di Castrovillari", categoria: "Conserve" }, "olio"), false);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Olio Extra Vergine di Oliva del Pollino", categoria: "Alimentari" }, "olio"), true);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Orologio da polso", categoria: "Accessori" }, "orologio"), true);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Filetti di Cipolla", categoria: "Conserve" }, "olio", ["olio"]), false);
});


test("single English food nouns are recognized as English", () => {
  for (const query of ["cheese", "bread", "cookies", "cake", "noodles", "honey", "fish"]) {
    assert.equal(rilevaLinguaPino(query), "en", query);
  }
  assert.equal(rilevaLinguaConversazionePino([{ role: "user", content: "cheese" }]), "en");
  // Le parole identiche nelle due lingue non spostano il rilevamento.
  assert.equal(rilevaLinguaPino("pasta"), "it");
  assert.equal(rilevaLinguaPino("pizza"), "it");
  // Un messaggio italiano resta italiano.
  assert.equal(rilevaLinguaPino("voglio il pane"), "it");
});

test("English short conversational messages are detected, including how are you", () => {
  assert.equal(rilevaLinguaPino("Hi Pino, how are you?"), "en");
  assert.equal(rilevaLinguaPino("Would you like to chat?"), "en");
  assert.equal(rilevaLinguaPino("Thanks, that was helpful!"), "en");
  assert.equal(rilevaLinguaPino("Come stai?"), "it");
});

test("Pino keeps the conversation language when a follow-up is short", () => {
  assert.equal(rilevaLinguaConversazionePino([
    { role: "user", content: "I'm looking for a watch under 100 euros" },
    { role: "assistant", content: "I found two products." },
    { role: "user", content: "Show me more" },
    { role: "assistant", content: "Here are more options." },
    { role: "user", content: "Okay" },
  ]), "en");
});


test("Pino switches back to Italian when the user does", () => {
  assert.equal(rilevaLinguaPino("Va bene, grazie"), "it");
  assert.equal(rilevaLinguaConversazionePino([
    { role: "user", content: "I'm looking for a watch under 100 euros" },
    { role: "assistant", content: "I found two products." },
    { role: "user", content: "Va bene, grazie" },
  ]), "it");
});

test("Pino follows the language of each new message, even after a preference", () => {
  // La sequenza reale: preferenza inglese, poi un messaggio italiano chiaro.
  assert.equal(
    rilevaLinguaConversazionePino(
      ["I speak English", "bread", "I want some bread", "voglio il pane"].map((content) => ({
        role: "user",
        content,
      }))
    ),
    "it"
  );
  // Anche in senso inverso: la conversazione italiana accoglie un messaggio inglese.
  assert.equal(
    rilevaLinguaConversazionePino([
      { role: "user", content: "voglio il pane" },
      { role: "user", content: "I want some bread" },
    ]),
    "en"
  );
  // Cambio ripetuto italiano → inglese → italiano.
  assert.equal(
    rilevaLinguaConversazionePino([
      { role: "user", content: "voglio il pane" },
      { role: "user", content: "I want some bread" },
      { role: "user", content: "voglio il pane" },
    ]),
    "it"
  );
  // Un follow-up breve o ambiguo eredita ancora la lingua corrente.
  assert.equal(
    rilevaLinguaConversazionePino([
      { role: "user", content: "I speak English" },
      { role: "user", content: "bread" },
    ]),
    "en"
  );
});


test("explicit food product requests are routed to the catalog in Italian and English", () => {
  assert.equal(isExplicitFoodProductRequest("I'm looking for pasta under 5 euros"), true);
  assert.equal(isExplicitFoodProductRequest("Cerco pasta sotto 5 euro"), true);
  assert.equal(isExplicitFoodProductRequest("I need some bread"), true);
  assert.equal(isExplicitFoodProductRequest("Vorrei mangiare"), false);
});

test("English food subjects reach the Italian catalog subject", () => {
  // Il catalogo è in italiano: il soggetto inglese deve arrivare già tradotto,
  // altrimenti la ricerca prodotti non ha nulla da confrontare.
  assert.equal(normalizzaQueryCatalogo("bread"), "pane");
  assert.equal(normalizzaQueryCatalogo("I want some bread"), "pane");
  assert.equal(normalizzaQueryCatalogo("cheese"), "formaggio");
  assert.equal(normalizzaQueryCatalogo("I want some cheese"), "formaggio");
  assert.equal(normalizzaQueryCatalogo("I need some cookies"), "biscotti");
  assert.equal(normalizzaQueryCatalogo("noodles"), "pasta");
  // Invariante: i termini italiani già funzionanti non cambiano.
  assert.equal(normalizzaQueryCatalogo("voglio il pane"), "pane");
  assert.equal(normalizzaQueryCatalogo("Voglio un pane"), "pane");
  assert.equal(normalizzaQueryCatalogo("pizza"), "pizza");
  assert.equal(normalizzaQueryCatalogo("Cerco pasta sotto 5 euro"), "pasta");
  // Nessuna traduzione dentro parole più lunghe.
  assert.equal(normalizzaQueryCatalogo("breadsticks"), "breadsticks");
  assert.equal(normalizzaQueryCatalogo("meatballs"), "meatballs");
});

test("single English food nouns are explicit product requests, exact token only", () => {
  // Positivi: parola singola inglese già nel vocabolario alimentare.
  assert.equal(isExplicitFoodProductRequest("bread"), true);
  assert.equal(isExplicitFoodProductRequest("cheese"), true);
  assert.equal(isExplicitFoodProductRequest("meat"), true);
  // Positivi con verbo (comportamento invariato).
  assert.equal(isExplicitFoodProductRequest("I want some bread"), true);
  assert.equal(isExplicitFoodProductRequest("voglio il pane"), true);
  // Negativi: parole non alimentari isolate.
  assert.equal(isExplicitFoodProductRequest("headphones"), false);
  assert.equal(isExplicitFoodProductRequest("cane"), false);
  assert.equal(isExplicitFoodProductRequest("gatto"), false);
  // Negativi: parole che CONTENGONO un termine alimentare.
  assert.equal(isExplicitFoodProductRequest("breadsticks"), false);
  assert.equal(isExplicitFoodProductRequest("breadcrumbs"), false);
  assert.equal(isExplicitFoodProductRequest("meatballs"), false);
  // Regressioni italiane: nessun cambio di comportamento.
  assert.equal(isExplicitFoodProductRequest("pane"), false);
  assert.equal(isExplicitFoodProductRequest("Voglio un pane"), true);
  assert.equal(isExplicitFoodProductRequest("Vorrei mangiare"), false);
  assert.equal(isExplicitFoodProductRequest("Voglio un cane"), false);
  assert.equal(isExplicitFoodProductRequest("Cerco pasta sotto 5 euro"), true);
});

test("generic attractions questions are recognized in Italian and English", () => {
  assert.equal(isBroadAttractionsRequest("What attractions can I visit in Castrovillari?"), true);
  assert.equal(isBroadAttractionsRequest("Quali attrazioni posso visitare a Castrovillari?"), true);
  assert.equal(isBroadAttractionsRequest("I'm looking for pasta"), false);
});


test("food relevance uses product identity, never the seller name", () => {
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Taralli tradizionali", categoria: "Alimentari" }, "pasta"), false);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Pasta artigianale", categoria: "Alimentari" }, "pasta"), true);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Tagliatelle all'uovo", categoria: "Pasta fresca" }, "pasta"), true);
});

// ─── Regressioni segnalate sul comportamento reale di Pino ────────────────

test("valid Italian words are never rewritten into catalog terms", () => {
  const vocabolario = [
    ["aglio", "aglio"],
    ["pane", "pane"],
    ["carota", "carota"],
    ["orologio", "orologio"],
    ["pizza", "pizza"],
  ];
  // "Voglio un cane" non deve diventare "aglio pane", "carta" non è "carota".
  assert.equal(correggiTokenCatalogo("cane", vocabolario), null);
  assert.equal(correggiTokenCatalogo("voglio", vocabolario), null);
  assert.equal(correggiTokenCatalogo("carta", vocabolario), null);
  assert.equal(correggiTokenCatalogo("gatto", vocabolario), null);
  // I refusi reali restano corretti.
  assert.equal(correggiTokenCatalogo("orologgio", vocabolario), "orologio");
  assert.equal(correggiTokenCatalogo("pizze", vocabolario), "pizza");
});

test("requests without a catalog subject keep their real subject", () => {
  assert.equal(normalizzaQueryCatalogo("Voglio un cane"), "cane");
  assert.equal(normalizzaQueryCatalogo("Voglio un gatto"), "gatto");
  assert.equal(normalizzaQueryCatalogo("Voglio un pane"), "pane");
  assert.equal(isExplicitFoodProductRequest("Voglio un cane"), false);
  assert.equal(isBroadAttractionsRequest("Voglio un cane"), false);
});

test("language statements are conversation, never catalog searches", () => {
  const richieste = [
    "I speak English",
    "Please speak English",
    "Can you reply in English?",
    "I'd like to speak in English",
    "Parlo solo inglese",
    "Vorrei parlare in inglese",
    "Rispondi in inglese per favore",
  ];
  for (const richiesta of richieste) {
    assert.match(rispostaPreferenzaLinguaPino(richiesta) ?? "", /English/, richiesta);
  }
  // Una richiesta di catalogo con un riferimento linguistico resta una ricerca.
  assert.equal(rispostaPreferenzaLinguaPino("I speak English and I'm looking for pasta"), null);
  assert.equal(rispostaPreferenzaLinguaPino("Vorrei parlare in inglese e cerco pasta"), null);
  // Una domanda di traduzione non è una preferenza linguistica.
  assert.equal(rispostaPreferenzaLinguaPino("Come si dice cane in inglese?"), null);
  assert.equal(rispostaPreferenzaLinguaPino("Cerco un libro in inglese"), null);
});

test("cinema belongs to places and services, not to the product catalog", () => {
  const luoghi = [
    "Voglio andare al cinema",
    "Dove si trova il cinema?",
    "C'è un cinema a Castrovillari?",
    "Ci sono cinema a Castrovillari?",
    "Vorrei vedere un film al cinema",
    "I want to go to the movies",
    "Where is the movie theater?",
    "Is there a cinema nearby?",
  ];
  for (const richiesta of luoghi) {
    assert.equal(richiestaCinemaPino(richiesta), true, richiesta);
  }

  // Eventi, prodotti (anche al plurale) e abbonamenti non sono una sala.
  const nonLuoghi = [
    "Ci sono eventi al cinema questo weekend?",
    "Cerco un proiettore per casa",
    "Voglio comprare proiettori",
    "Cerco televisori",
    "Cerco televisori per il cinema",
    "Voglio proiettori per il cinema",
    "Voglio un televisore per guardare film",
    "Cerco DVD",
    "Voglio un abbonamento cinema",
    "Cerco una rassegna cinematografica",
    "Cinema Paradiso, quando è il prossimo evento?",
    "Cerco pasta sotto 5 euro",
  ];
  for (const richiesta of nonLuoghi) {
    assert.equal(richiestaCinemaPino(richiesta), false, richiesta);
  }
});

test("typo recovery never rewrites a valid Italian word", () => {
  // Refusi recuperabili: stessa prima lettera, una sola modifica.
  assert.equal(refusoPlausibile("telefno", "telefono"), true);
  assert.equal(refusoPlausibile("orologgio", "orologio"), true);
  // Parole italiane corrette e parole diverse restano intatte.
  assert.equal(refusoPlausibile("cane", "pane"), false);
  assert.equal(refusoPlausibile("voglio", "aglio"), false);
  assert.equal(refusoPlausibile("carta", "carota"), false);
});

test("single-subject gate keeps real equivalences and rejects lookalikes", () => {
  const sneakers = { nome: "Sneakers running", categoria: "Calzature" };
  const anello = { nome: "Anello d'oro", categoria: "Gioielleria" };
  const maglietta = { nome: "Maglietta in cotone", categoria: "Abbigliamento" };
  const pane = { nome: "Pane artigianale", categoria: "Alimentari" };
  const crocchetteCani = { nome: "Crocchette per cani", categoria: "Animali" };
  const crocchetteCane = { nome: "Crocchette per cane", categoria: "Animali" };

  // Equivalenze semantiche reali.
  assert.equal(prodottoIdentificaSoggetto(anello, "gioielli"), true);
  assert.equal(prodottoIdentificaSoggetto(maglietta, "maglia"), true);
  assert.equal(prodottoIdentificaSoggetto(crocchetteCani, "cane"), true);
  assert.equal(prodottoIdentificaSoggetto(crocchetteCane, "cani"), true);
  // Il sinonimo diretto arriva dal motore condiviso ("calzature" per "scarpe").
  assert.equal(prodottoIdentificaSoggetto(sneakers, "calzature"), true);

  // Somiglianze casuali rifiutate.
  assert.equal(prodottoIdentificaSoggetto(pane, "cane"), false);
  assert.equal(prodottoForseRefusoDiSoggetto(pane, "cane"), false);
  assert.equal(prodottoIdentificaSoggetto({ nome: "Carote", categoria: "Ortofrutta" }, "carta"), false);

  // Recupero del solo refuso plausibile.
  const telefono = { nome: "Telefono Samsung", categoria: "Telefonia" };
  const orologio = { nome: "Orologio da polso", categoria: "Accessori" };
  assert.equal(prodottoIdentificaSoggetto(telefono, "telefno"), false);
  assert.equal(prodottoForseRefusoDiSoggetto(telefono, "telefno"), true);
  assert.equal(prodottoIdentificaSoggetto(orologio, "orologgio"), false);
  assert.equal(prodottoForseRefusoDiSoggetto(orologio, "orologgio"), true);
});

test("descriptions never identify the product by themselves (D1)", () => {
  const cipolla = {
    nome: "Filetti di cipolla",
    categoria: "Conserve",
    descrizione: "Conservati sott'olio, pronti da servire.",
  };
  assert.equal(prodottoIdentificatoDaSoggetto(cipolla, "olio"), false);

  // I prodotti che si chiamano davvero olio restano pertinenti.
  assert.equal(
    prodottoIdentificatoDaSoggetto(
      { nome: "Olio Extra Vergine di Oliva del Pollino", categoria: "Alimentari" },
      "olio"
    ),
    true
  );
  // Una parola chiave da sola NON identifica il prodotto.
  assert.equal(
    prodottoIdentificatoDaSoggetto(
      { nome: "Maccheroni al ferretto", categoria: "Alimentari", parole_chiave: ["pasta"] },
      "pasta"
    ),
    false
  );
  // Contribuisce solo con una descrizione concorde (due segnali).
  assert.equal(
    prodottoIdentificatoDaSoggetto(
      {
        nome: "Maccheroni al ferretto",
        categoria: "Alimentari",
        parole_chiave: ["pasta"],
        descrizione: "Pasta tradizionale calabrese.",
      },
      "pasta"
    ),
    true
  );
});

test("seller keywords cannot identify a product on their own", () => {
  // Keyword isolata: nessuna identificazione, anche se il termine è specifico.
  assert.equal(
    prodottoIdentificatoDaSoggetto(
      { nome: "Biscotti", categoria: "Dolciumi", parole_chiave: ["olio"] },
      "olio"
    ),
    false
  );
  assert.equal(
    prodottoIdentificatoDaSoggetto(
      { nome: "Trapano", categoria: "Ferramenta", parole_chiave: ["alimentari"] },
      "alimentari"
    ),
    false
  );
  // Il prodotto realmente pertinente resta identificato dal nome.
  assert.equal(
    prodottoIdentificatoDaSoggetto(
      { nome: "Olio Extra Vergine di Oliva", categoria: "Alimentari", parole_chiave: ["olio"] },
      "olio"
    ),
    true
  );
  // Keyword + descrizione che la cita di passaggio: identità ancora incoerente,
  // quindi nessuna identificazione ("con olio" non rende i biscotti olio).
  assert.equal(
    prodottoIdentificatoDaSoggetto(
      {
        nome: "Biscotti",
        categoria: "Dolciumi",
        parole_chiave: ["olio"],
        descrizione: "Biscotti da forno con olio.",
      },
      "olio"
    ),
    false
  );
  assert.equal(
    prodottoIdentificatoDaSoggetto(
      {
        nome: "Trapano",
        categoria: "Ferramenta",
        parole_chiave: ["alimentari"],
        descrizione: "Utensile per uso alimentare.",
      },
      "alimentari"
    ),
    false
  );
  // Il segnale di classificazione vero resta ammesso: descrizione che NOMINA
  // il soggetto in apertura, oppure parola chiave-frase del venditore.
  assert.equal(
    prodottoIdentificatoDaSoggetto(
      {
        nome: "Tagliatelle",
        categoria: "Alimentari",
        parole_chiave: ["pasta fresca"],
        descrizione: "Pasta fresca all'uovo, sfoglia tirata a mano.",
      },
      "pasta"
    ),
    true
  );
});

test("typo recovery compares with the product name head only (D3)", () => {
  assert.equal(
    prodottoForseRefusoDiSoggetto({ nome: "Panificio Rossi", categoria: "Panetteria" }, "panifcio"),
    true
  );
  // Una parola secondaria non identifica il prodotto.
  assert.equal(
    prodottoForseRefusoDiSoggetto({ nome: "Cintura Orologio", categoria: "Accessori" }, "orologgio"),
    false
  );
  assert.equal(
    prodottoForseRefusoDiSoggetto({ nome: "Orologio da polso", categoria: "Accessori" }, "orologgio"),
    true
  );
});

test("budget product requests keep subject and budget", () => {
  assert.equal(normalizzaQueryCatalogo("Cerco pasta sotto 5 euro"), "pasta");
  assert.equal(normalizzaQueryCatalogo("I'm looking for pasta under 5 euros"), "pasta");
  assert.equal(isExplicitFoodProductRequest("Cerco pasta sotto 5 euro"), true);
});

const intentSource = readFileSync(
  new URL("../lib/assistente/intent.ts", import.meta.url),
  "utf8",
);
const assistantSource = readFileSync(
  new URL("../lib/assistente/index.ts", import.meta.url),
  "utf8",
);

test("professional searches use a deterministic business-only fast path", () => {
  for (const profession of ["commercialista", "fotografo", "accountant", "photographer"]) {
    assert.ok(intentSource.includes(`"${profession}"`), profession);
  }
  const fastPathStart = assistantSource.indexOf("Professioni riconosciute con certezza");
  const attractionsStart = assistantSource.indexOf("Guida turistica InCittà");
  assert.ok(fastPathStart >= 0);
  assert.ok(attractionsStart > fastPathStart);
  const fastPath = assistantSource.slice(fastPathStart, attractionsStart);
  assert.match(fastPath, /await searchStores\(professione, \{ limit: 8 \}\)/);
  assert.doesNotMatch(fastPath, /searchProducts|searchEvents|searchAttractions|callGeminiText|recuperaMemoria/);
  assert.match(fastPath, /Non risultano \$\{plurale\} nel catalogo InCittà/);
});
