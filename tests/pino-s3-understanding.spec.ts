import { expect, test } from "@playwright/test";

import { analizzaComprensionePino, pianoLocaleIntelligente } from "../lib/assistente/semantica";
import { analizzaIntentoPino } from "../lib/assistente/intent";
import { rispostaPreferenzaLinguaPino } from "../lib/assistente/greetings";
import {
  estraiAttributiPino,
  estraiSoggettoPino,
  normalizzaQueryCatalogo,
  rilevaPreferenzaLinguaPino,
  rilevaLinguaConversazionePino,
} from "../lib/assistente/understanding";

// ─── S3: comprensione linguistica e attributi ───────────────────────────────
//
// Il livello di comprensione produce un contratto unico:
//  - lingua effettiva e preferenza linguistica esplicita;
//  - `languagePreferenceOnly`: nessuna richiesta da eseguire, quindi nessuna
//    ricerca di catalogo (l'orchestratore risponde diretto, vedi index.ts:1179);
//  - soggetto identificante distinto dagli attributi;
//  - attributi espliciti (colore, materiale, destinatario, età, provenienza);
//  - vincoli già riconosciuti dal piano (esclusioni, budget indicativo D-1).

const utente = (content: string) => ({ role: "user" as const, content });

test.describe("S3 — preferenza linguistica", () => {
  test("'I speak English' è solo una preferenza: nessun soggetto, nessun vincolo", () => {
    const u = analizzaComprensionePino("I speak English");

    expect(u.languagePreferenceOnly).toBe(true);
    expect(u.lingua).toBe("en");
    expect(u.linguaPreferita).toBe("en");
    expect(u.soggetto).toBe("");
    expect(u.attributi).toEqual({
      colori: [],
      materiali: [],
      destinatario: null,
      eta: null,
      provenienza: [],
      taglie: [],
      genere: null,
      altri: [],
    });
    expect(u.esclusioni).toEqual([]);
    expect(u.minPrice).toBeNull();
    expect(u.maxPrice).toBeNull();
    // La guardia conversazionale risponde diretto, prima di qualsiasi tool.
    expect(rispostaPreferenzaLinguaPino("I speak English")).not.toBeNull();
  });

  test("preferenza inglese in italiano: 'Vorrei parlare in inglese'", () => {
    const u = analizzaComprensionePino("Vorrei parlare in inglese");

    expect(u.languagePreferenceOnly).toBe(true);
    expect(u.lingua).toBe("en");
    expect(u.linguaPreferita).toBe("en");
    expect(u.soggetto).toBe("");
    expect(rispostaPreferenzaLinguaPino("Vorrei parlare in inglese")).toMatch(/English/);
  });

  test("preferenza italiana: nessuna ricerca e risposta in italiano", () => {
    for (const frase of [
      "Parla in italiano",
      "Vorrei parlare in italiano",
      "Rispondi in italiano per favore",
    ]) {
      const u = analizzaComprensionePino(frase);
      expect(u.languagePreferenceOnly, frase).toBe(true);
      expect(u.lingua, frase).toBe("it");
      expect(u.linguaPreferita, frase).toBe("it");
      expect(rispostaPreferenzaLinguaPino(frase), frase).toMatch(/italiano/);
    }
  });

  test("preferenza + richiesta: la richiesta non viene persa", () => {
    const frase = "I speak English and I'm looking for pasta";
    const u = analizzaComprensionePino(frase);

    expect(u.languagePreferenceOnly).toBe(false);
    expect(u.lingua).toBe("en");
    expect(u.linguaPreferita).toBe("en");
    expect(u.soggetto).toBe("pasta");
    expect(["product", "food"]).toContain(u.intent);
    expect(u.maxPrice).toBeNull();
    // La guardia non deve intercettare la richiesta di catalogo.
    expect(rispostaPreferenzaLinguaPino(frase)).toBeNull();
    // Il piano locale continua a cercare il soggetto.
    expect(pianoLocaleIntelligente(frase, analizzaIntentoPino(frase))?.query).toBe("pasta");
  });

  test("la preferenza resta valida nei turni successivi", () => {
    expect(rilevaLinguaConversazionePino([utente("I speak English"), utente("pasta")])).toBe("en");
    expect(analizzaComprensionePino("pasta", [utente("I speak English"), utente("pasta")]).lingua).toBe("en");
    // La lingua richiesta vince sul rilevamento statistico della frase.
    expect(rilevaLinguaConversazionePino([utente("Vorrei parlare in inglese")])).toBe("en");
    expect(
      rilevaLinguaConversazionePino([utente("Parla in italiano"), utente("pasta")])
    ).toBe("it");
  });

  test("'I speak English' non è un saluto né un prodotto", () => {
    const u = analizzaComprensionePino("I speak English");
    expect(u.intent).toBe("generic");
    expect(u.languagePreferenceOnly).toBe(true);
  });
});

test.describe("S3 — attributi strutturati", () => {
  test("colore e materiale restano distinti dal soggetto", () => {
    const u = analizzaComprensionePino("Cerco una borsa di pelle nera");

    expect(u.soggetto).toBe("borsa");
    expect(u.attributi.colori).toEqual(["nero"]);
    expect(u.attributi.materiali).toEqual(["pelle"]);
    expect(u.attributi.destinatario).toBeNull();
    expect(u.attributi.eta).toBeNull();
  });

  test("equivalente inglese: 'I need a black leather bag'", () => {
    const u = analizzaComprensionePino("I need a black leather bag");

    expect(u.lingua).toBe("en");
    expect(u.soggetto).toBe("borsa");
    expect(u.attributi.colori).toEqual(["nero"]);
    expect(u.attributi.materiali).toEqual(["pelle"]);
  });

  test("regalo con destinatario, età e budget indicativo", () => {
    const u = analizzaComprensionePino("Cerco un regalo per una donna di 30 anni, entro 50 euro");

    expect(u.soggetto).toBe("regalo");
    expect(u.attributi.destinatario).toBe("donna");
    expect(u.attributi.eta).toBe(30);
    expect(u.maxPrice).toBe(50);
    expect(u.minPrice).toBeNull();
    expect(u.languagePreferenceOnly).toBe(false);
  });

  test("esclusioni e provenienza conservate", () => {
    const u = analizzaComprensionePino("Vorrei un prodotto artigianale calabrese, non alimentare");

    expect(u.soggetto).toBe("prodotto");
    expect(u.attributi.altri).toEqual(["artigianale"]);
    expect(u.attributi.provenienza).toEqual(["calabrese"]);
    // L'esclusione è conservata; il livello di correzione refusi esistente la
    // normalizza nella variante di catalogo ("alimentare" → "alimentari").
    expect(u.esclusioni.length).toBe(1);
    expect(u.esclusioni[0]).toMatch(/^aliment/);
  });

  test("richiesta mista lingua + attributi + budget (caso D)", () => {
    const frase = "I speak English, I'm looking for a handmade leather wallet under 40 euros";
    const u = analizzaComprensionePino(frase);

    expect(u.languagePreferenceOnly).toBe(false);
    expect(u.lingua).toBe("en");
    expect(u.soggetto).toBe("portafoglio");
    expect(u.attributi.materiali).toEqual(["pelle"]);
    expect(u.attributi.altri).toEqual(["artigianale"]);
    expect(u.maxPrice).toBe(40);
    expect(rispostaPreferenzaLinguaPino(frase)).toBeNull();
  });

  test("richiesta mista italiano/inglese: comprensione coerente", () => {
    const u = analizzaComprensionePino("Please answer in English, cerco una borsa nera");

    expect(u.languagePreferenceOnly).toBe(false);
    expect(u.lingua).toBe("en");
    expect(u.soggetto).toBe("borsa");
    expect(u.attributi.colori).toEqual(["nero"]);
    expect(rispostaPreferenzaLinguaPino("Please answer in English, cerco una borsa nera")).toBeNull();
  });
});

test.describe("S3 — nessuna invenzione, nessuna regressione", () => {
  test("input ambiguo: nessun attributo inventato", () => {
    const u = analizzaComprensionePino("Cerco qualcosa");

    expect(u.attributi).toEqual({
      colori: [],
      materiali: [],
      destinatario: null,
      eta: null,
      provenienza: [],
      taglie: [],
      genere: null,
      altri: [],
    });
    expect(u.maxPrice).toBeNull();
    expect(u.minPrice).toBeNull();
    expect(u.esclusioni).toEqual([]);
  });

  test("senza preferenza linguistica il comportamento è quello precedente", () => {
    const frase = "Cerco scarpe da uomo sotto 100 euro";
    const u = analizzaComprensionePino(frase);

    expect(u.languagePreferenceOnly).toBe(false);
    expect(u.linguaPreferita).toBeNull();
    expect(u.soggetto).toBe("scarpe");
    expect(u.attributi.destinatario).toBe("uomo");
    expect(u.maxPrice).toBe(100);
    expect(rispostaPreferenzaLinguaPino(frase)).toBeNull();
    const piano = pianoLocaleIntelligente(frase, analizzaIntentoPino(frase));
    expect(piano?.query).toContain("scarpe");
    expect(piano?.maxPrice).toBe(100);
  });

  test("attributi estratti solo quando espliciti", () => {
    expect(estraiAttributiPino("Cerco una borsa").colori).toEqual([]);
    expect(estraiAttributiPino("Cerco una borsa").materiali).toEqual([]);
    expect(estraiAttributiPino("A leather bag").materiali).toEqual(["pelle"]);
    expect(estraiAttributiPino("regalo per mio nonno di 80 anni")).toMatchObject({
      destinatario: "nonno",
      eta: 80,
    });
  });

  test("il soggetto non è un attributo né una parola di cornice", () => {
    expect(estraiSoggettoPino("Cerco una borsa di pelle nera")).toBe("borsa");
    expect(estraiSoggettoPino("I want a black leather bag")).toBe("borsa");
    expect(estraiSoggettoPino("Cerco un regalo per una donna di 30 anni")).toBe("regalo");
    expect(estraiSoggettoPino("I speak English")).toBe("");
  });

  test("il riconoscimento della preferenza non intercetta richieste di catalogo", () => {
    for (const frase of [
      "Cerco un libro in inglese",
      "I speak English and I'm looking for pasta",
      "Vorrei un regalo in inglese per mia figlia",
      "cerco una borsa nera",
    ]) {
      expect(rispostaPreferenzaLinguaPino(frase), frase).toBeNull();
    }
    expect(rilevaPreferenzaLinguaPino("Cerco un libro in inglese")).toBeNull();
    // "in inglese" qui è un attributo del prodotto, non una preferenza: resta.
    expect(normalizzaQueryCatalogo("Cerco un libro in inglese")).toContain("inglese");
    // Una preferenza con verbo di lingua non entra nella query di catalogo.
    expect(normalizzaQueryCatalogo("I speak English and I'm looking for pasta")).toBe("pasta");
  });
});
