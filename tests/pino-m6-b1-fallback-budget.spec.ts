import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  chiamataGeminiConBudgetPino,
  creaBudgetGeminiPino,
  ErroreBudgetGeminiPino,
  MASSIMO_CHIAMATE_GEMINI_PINO,
  prelevaChiamataGeminiPino,
} from "../lib/assistente/budget-gemini";
import {
  conScadenzaPino,
  ErroreTimeoutPino,
  eseguiFallbackConScadenzaPino,
  fallbackSelezioneVuotaPino,
  messaggioIndisponibilitaGemini,
  SCADENZA_INVOCAZIONE_PINO_MS,
} from "../lib/assistente/index";

// ─── M6-B1: fallback protetto e budget Gemini condiviso ─────────────────────
//
// 1) Il fallback `searchAll` non era coperto dalla scadenza di 20s.
// 2) Il limite di 2 chiamate Gemini per richiesta non era imposto: ogni modulo
//    decideva per sé. Il budget ora è unico e condiviso dalla richiesta.

const lettura = (percorso: string) =>
  readFileSync(join(process.cwd(), percorso), "utf8").replace(/\r\n/g, "\n");

const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mai = <T,>() => new Promise<T>(() => undefined);

test.describe("M6-B1 — budget Gemini condiviso", () => {
  test("il tetto è due chiamate per richiesta", () => {
    expect(MASSIMO_CHIAMATE_GEMINI_PINO).toBe(2);
    const budget = creaBudgetGeminiPino();
    expect(budget).toEqual({ limite: 2, usate: 0 });
  });

  test("due chiamate partono, la terza è bloccata", async () => {
    const budget = creaBudgetGeminiPino();
    const esiti: string[] = [];
    esiti.push(await chiamataGeminiConBudgetPino(budget, async () => "selezione"));
    esiti.push(await chiamataGeminiConBudgetPino(budget, async () => "semantica"));

    expect(esiti).toEqual(["selezione", "semantica"]);
    expect(budget.usate).toBe(2);
    await expect(
      chiamataGeminiConBudgetPino(budget, async () => "terza")
    ).rejects.toBeInstanceOf(ErroreBudgetGeminiPino);
    expect(budget.usate).toBe(2);
  });

  test("una chiamata fallita resta conteggiata", async () => {
    const budget = creaBudgetGeminiPino(1);
    await chiamataGeminiConBudgetPino(budget, () =>
      Promise.reject(new Error("Quota Gemini superata"))
    ).catch(() => undefined);
    expect(budget.usate).toBe(1);
    await expect(
      chiamataGeminiConBudgetPino(budget, async () => "dopo")
    ).rejects.toBeInstanceOf(ErroreBudgetGeminiPino);
  });

  test("una chiamata in timeout resta conteggiata", async () => {
    const budget = creaBudgetGeminiPino(1);
    const inCorso = chiamataGeminiConBudgetPino(budget, () => mai<string>());
    // Prenotazione sincrona: il timeout non restituisce budget.
    expect(budget.usate).toBe(1);
    await expect(conScadenzaPino(inCorso, 20)).rejects.toBeInstanceOf(ErroreTimeoutPino);
    expect(budget.usate).toBe(1);
    await expect(
      chiamataGeminiConBudgetPino(budget, async () => "dopo")
    ).rejects.toBeInstanceOf(ErroreBudgetGeminiPino);
  });

  test("due chiamate concorrenti non aggirano il budget", async () => {
    const budget = creaBudgetGeminiPino(1);
    const esiti = await Promise.allSettled([
      chiamataGeminiConBudgetPino(budget, async () => "prima"),
      chiamataGeminiConBudgetPino(budget, async () => "seconda"),
    ]);
    expect(esiti.filter((e) => e.status === "fulfilled")).toHaveLength(1);
    expect(esiti.filter((e) => e.status === "rejected")).toHaveLength(1);
    expect(budget.usate).toBe(1);
  });

  test("senza budget il chiamante fuori da Pino non è limitato", async () => {
    expect(prelevaChiamataGeminiPino(undefined)).toBe(true);
    await expect(
      chiamataGeminiConBudgetPino(undefined, async () => "libera")
    ).resolves.toBe("libera");
  });

  test("il budget esaurito non produce chiamate aggiuntive", async () => {
    const budget = creaBudgetGeminiPino(1);
    let chiamate = 0;
    const conta = async () => {
      chiamate += 1;
      return "ok";
    };
    await chiamataGeminiConBudgetPino(budget, conta);
    await chiamataGeminiConBudgetPino(budget, conta).catch(() => undefined);
    expect(chiamate).toBe(1);
  });
});

test.describe("M6-B1 — fallback searchAll con scadenza", () => {
  test("il fallback riuscito restituisce i risultati", async () => {
    const esito = await eseguiFallbackConScadenzaPino(
      async () => ({ negozi: [{ id: "n1" }] }),
      100
    );
    expect(esito.errore).toBeNull();
    expect(esito.esito?.negozi).toHaveLength(1);
  });

  test("il fallback appeso scade e non restituisce un falso vuoto", async () => {
    const esito = await eseguiFallbackConScadenzaPino(() => mai<never>(), 25);
    expect(esito.esito).toBeNull();
    expect(esito.errore).toBeInstanceOf(ErroreTimeoutPino);

    // Timeout + nessun risultato = indisponibilità dichiarata, non "catalogo
    // vuoto": il ramo S19 usa questo messaggio.
    expect(
      fallbackSelezioneVuotaPino({
        selezioneOk: false,
        richiestaServizio: null,
        negozi: [],
        prodotti: [],
        offerte: [],
        eventi: [],
        categorie: [],
      })
    ).toBe(true);
    expect(messaggioIndisponibilitaGemini("it")).toContain(
      "non significa che il prodotto o servizio non esista"
    );
  });

  test("un errore reale resta un errore (non un timeout)", async () => {
    const errore = new Error("PostgREST 503");
    const esito = await eseguiFallbackConScadenzaPino(() => Promise.reject(errore), 100);
    expect(esito.esito).toBeNull();
    expect(esito.errore).toBe(errore);
    expect(esito.errore).not.toBeInstanceOf(ErroreTimeoutPino);
  });

  test("i risultati parziali non vengono azzerati", async () => {
    const esito = await eseguiFallbackConScadenzaPino(
      async () => ({ negozi: [], prodotti: [{ id: "p1" }] }),
      100
    );
    expect(esito.esito?.prodotti).toHaveLength(1);
    expect(
      fallbackSelezioneVuotaPino({
        selezioneOk: false,
        richiestaServizio: null,
        negozi: [],
        prodotti: [{ id: "p1" }],
        offerte: [],
        eventi: [],
        categorie: [],
      })
    ).toBe(false);
  });

  test("la scadenza del fallback è quella dei tool (20s)", async () => {
    const sorgente = lettura("lib/assistente/index.ts");
    expect(SCADENZA_INVOCAZIONE_PINO_MS).toBe(20_000);
    expect(sorgente).toContain("scadenzaMs: number = SCADENZA_INVOCAZIONE_PINO_MS");
    expect(sorgente).toContain("eseguiFallbackConScadenzaPino(() =>");
  });
});

test.describe("M6-B1 — call graph Gemini e invarianti", () => {
  const indice = lettura("lib/assistente/index.ts");
  const semantica = lettura("lib/assistente/semantica.ts");
  const planner = lettura("lib/assistente/core-v2/ai-request-planner.ts");

  test("nel percorso Pino restano due soli siti di chiamata", () => {
    const inIndice = indice.match(/callGeminiText\(/g) ?? [];
    const inSemantica = semantica.match(/callGeminiText\(/g) ?? [];
    expect(inIndice).toHaveLength(1);
    expect(inSemantica).toHaveLength(1);
    // Il planner core-v2 non è importato dal percorso Pino.
    expect(indice).not.toContain("planPinoCoreRequestWithAI");
    expect(semantica).not.toContain("planPinoCoreRequestWithAI");
    expect(planner).toContain("planPinoCoreRequestWithAI");
  });

  test("entrambi i siti passano dal budget condiviso della richiesta", () => {
    expect(indice).toContain("const budgetGemini = creaBudgetGeminiPino();");
    expect(indice).toContain("chiamataGeminiConBudgetPino(budgetGemini, () =>");
    expect(semantica).toContain("chiamataGeminiConBudgetPino(budget, () =>");
    // Il budget attraversa il planner semantico.
    expect(indice).toContain("statoConversazionale,\n        budgetGemini");
    expect(semantica).toContain("budget?: BudgetGeminiPino");
  });

  test("il fallback usa la scadenza e conserva i risultati validi", () => {
    expect(indice).toContain("const fallback = await eseguiFallbackConScadenzaPino(() =>");
    expect(indice).toContain("searchAll(domanda, parametriFallbackPiano(semantica, comprensione, domandaSemantica))");
    expect(indice).toContain("if (fallback.esito) {");
  });

  test("nessun retry aggiunto intorno al fallback", () => {
    const blocco = indice.slice(
      indice.indexOf("eseguiFallbackConScadenzaPino(() =>"),
      indice.indexOf("eseguiFallbackConScadenzaPino(() =>") + 400
    );
    expect(blocco).not.toContain("retry");
    expect(blocco).not.toContain("for (");
  });
});
