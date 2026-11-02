/**
 * Selettore Gemini Function Calling per Pino.
 *
 * Questo modulo sostituisce soltanto la selezione JSON dei tool.
 * L'esecuzione resta nell'orchestratore esistente, che conserva memoria,
 * follow-up, filtri, budget, attrazioni, risposte aggregate e fallback.
 */
import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  Type,
  type FunctionDeclaration,
} from "@google/genai";
import { SYSTEM_PROMPT, buildToolSelectionPrompt } from "./prompt";
import type { MessaggioAssistente } from "./index";
import type { ToolParams } from "./tools";
import { estraiSelezioneFunctionCalling } from "./function-calling-utils";

export type PinoToolInvocation = {
  tool: string;
  params: ToolParams;
};

export type PinoToolSelection = {
  tools: PinoToolInvocation[];
  directReply: string | null;
};

const stringField = (description: string) => ({
  type: Type.STRING,
  description,
});
const numberField = (description: string) => ({
  type: Type.NUMBER,
  description,
});
const stringArray = (description: string) => ({
  type: Type.ARRAY,
  items: { type: Type.STRING },
  description,
});

const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "searchStores",
    description: "Cerca negozi, attività, professionisti e servizi nel catalogo pubblico InCittà. Usalo quando l'utente cerca chi offre un servizio o quale attività vende/fa qualcosa. Interpreta sinonimi, descrizioni colloquiali e refusi.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: stringField("Soggetto concreto da cercare, senza parole conversazionali."),
        categoria: stringField("Categoria dell'attività, se deducibile."),
        sottocategoria: stringField("Sottocategoria, se deducibile."),
        tipo: stringField("Tipo di attività o profilo professionale, se deducibile."),
        citta: stringField("Città esplicitamente richiesta."),
        termini: stringArray("Parole chiave e sinonimi pertinenti, senza articoli o preposizioni."),
        apertiOra: { type: Type.BOOLEAN, description: "true solo se l'utente chiede esplicitamente attività aperte adesso." },
        limit: numberField("Numero massimo di risultati, normalmente 8 e mai oltre 20."),
        escludiNomi: stringArray("Nomi già mostrati da escludere quando l'utente chiede altre opzioni."),
      },
      required: ["query"],
    },
  },
  {
    name: "searchProducts",
    description: "Cerca prodotti acquistabili nel catalogo InCittà. Usalo per oggetti/articoli, non per negozi o servizi. Comprendi sinonimi e linguaggio naturale.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: stringField("Nome o soggetto del prodotto cercato."),
        maxPrice: numberField("Budget massimo in euro, se specificato."),
        minPrice: numberField("Prezzo minimo in euro, se specificato."),
        categoria: stringField("Categoria prodotto, se deducibile."),
        sottocategoria: stringField("Sottocategoria prodotto, se deducibile."),
        termini: stringArray("Termini specifici che identificano il prodotto."),
        esclusioni: stringArray("Caratteristiche da escludere esplicitamente."),
        limit: numberField("Numero massimo di risultati, normalmente 8 e mai oltre 20."),
        escludiNomi: stringArray("Prodotti già mostrati da escludere quando l'utente chiede alternative."),
      },
      required: ["query"],
    },
  },
  {
    name: "searchOffers",
    description: "Cerca offerte, promozioni, sconti e saldi pubblicati su InCittà. Per una richiesta generica di offerte lascia query vuota.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: stringField("Tipo di offerta o prodotto a cui si riferisce la promozione, se specificato."), limit: numberField("Numero massimo di risultati.") },
    },
  },
  {
    name: "searchEvents",
    description: "Cerca eventi, manifestazioni e iniziative pubblicate su InCittà. Per una richiesta generica di eventi lascia query vuota.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: stringField("Nome, tema o periodo dell'evento, se specificato."), limit: numberField("Numero massimo di risultati.") },
    },
  },
  {
    name: "searchAll",
    description: "Ricerca trasversale su negozi, prodotti, offerte, eventi e categorie. Usala solo quando la richiesta è ampia o l'ambito non è chiaro.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: stringField("Soggetto concreto da cercare."), limit: numberField("Numero massimo di risultati.") },
      required: ["query"],
    },
  },
  {
    name: "getCategories",
    description: "Restituisce le categorie disponibili nel catalogo InCittà. Usalo quando l'utente chiede quali categorie o tipologie sono presenti.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "getWeather",
    description: "Recupera il meteo aggiornato per Castrovillari. Usalo solo per domande sul tempo.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "searchPharmacies",
    description: "Recupera i dati delle farmacie di Castrovillari. Non dedurre mai apertura o turno: usa lo stato richiesto e i dati restituiti.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        stato: { type: Type.STRING, enum: ["aperte", "turno", "tutte"], description: "Stato richiesto delle farmacie." },
        limit: numberField("Numero massimo di risultati."),
      },
    },
  },
];

const ALLOWED_TOOLS = new Set(
  FUNCTION_DECLARATIONS
    .map((tool) => tool.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0)
);

function cleanParams(raw: unknown): ToolParams {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const result: ToolParams = {};
  const stringKeys = ["query", "categoria", "sottocategoria", "tipo", "citta"] as const;
  for (const key of stringKeys) {
    const value = source[key];
    if (typeof value === "string") Object.assign(result, { [key]: value.trim().slice(0, 160) });
  }
  const numberKeys = ["maxPrice", "minPrice", "limit"] as const;
  for (const key of numberKeys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      Object.assign(result, {
        [key]: key === "limit"
          ? Math.max(1, Math.min(20, Math.floor(value)))
          : Math.max(0, Math.min(1_000_000, value)),
      });
    }
  }
  if (source.stato === "aperte" || source.stato === "turno" || source.stato === "tutte") {
    result.stato = source.stato;
  }
  if (source.apertiOra === true) result.apertiOra = true;
  for (const key of ["termini", "esclusioni", "escludiNomi"] as const) {
    const value = source[key];
    if (Array.isArray(value)) {
      Object.assign(result, {
        [key]: value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().slice(0, 100))
          .filter(Boolean)
          .slice(0, 12),
      });
    }
  }
  return result;
}

function statusCodeFromError(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const source = error as Record<string, unknown>;
  const nested = source.error && typeof source.error === "object"
    ? source.error as Record<string, unknown>
    : null;
  for (const value of [source.status, source.statusCode, nested?.code]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
  }
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/(?:HTTP|status)\s*(\d{3})/i);
  return match ? Number(match[1]) : null;
}

export async function selezionaToolConGemini(
  messages: MessaggioAssistente[],
  intentHint?: string
): Promise<PinoToolSelection> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Chiave API Gemini mancante.");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  // Timeout breve e un solo retry per evitare attese indefinite nell'assistente.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 15_000 } });

  const userPrompt = buildToolSelectionPrompt(messages, intentHint)
    .replace(
      /Rispondi SOLO con JSON valido, senza testo esterno\.[\s\S]*$/,
      "Per una richiesta concreta chiama uno o più strumenti dichiarati. Per una chiacchiera o una risposta diretta non pertinente al catalogo, rispondi senza chiamare strumenti. Non inventare dati."
    );

  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.1,
          maxOutputTokens: 450,
          tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
          },
        },
      });
      break;
    } catch (error) {
      const status = statusCodeFromError(error);
      const retryable = status !== null && [402, 429, 500, 502, 503, 504].includes(status);
      if (!retryable || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  if (!response) throw new Error("Gemini non ha restituito una risposta per la selezione degli strumenti.");

  return estraiSelezioneFunctionCalling(response, ALLOWED_TOOLS, cleanParams) as PinoToolSelection;
}
