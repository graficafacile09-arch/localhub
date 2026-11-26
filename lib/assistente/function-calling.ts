/**
 * LocalHub — Pino: contratto centrale dei tool e Function Calling provider-neutral.
 *
 * Questo modulo è la sola fonte per:
 * - nome, descrizione e JSON Schema dei parametri;
 * - chiavi ammesse dal validatore;
 * - elenco degli strumenti esposti al modello e strumenti interni;
 * - dichiarazioni native compatibili con il provider;
 * - menu testuale usato dal percorso JSON legacy.
 *
 * Il percorso nativo è sperimentale e non viene attivato di default. Il
 * contratto non esegue tool, non accede a Supabase e non chiama provider AI.
 *
 * @module lib/assistente/function-calling
 */
import type { StrumentoPino, ToolParams } from "./tools";

export type TipoParametroFunctionCalling =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object";

export type ParametroFunctionCalling = {
  type: TipoParametroFunctionCalling;
  description: string;
  enum?: readonly string[];
  items?: { type: "string" };
  minimum?: number;
  maximum?: number;
};

export type SchemaParametriFunctionCalling = {
  type: "object";
  properties: Record<string, ParametroFunctionCalling>;
  required?: readonly string[];
  additionalProperties: false;
};

export type DefinizioneStrumentoPino = {
  name: StrumentoPino;
  description: string;
  parameters: SchemaParametriFunctionCalling;
  /** Chiavi ammesse dal validatore, incluse quelle interne non esposte. */
  allowedParams: readonly (keyof ToolParams)[];
  /** true = dichiarato al provider AI; false = solo uso interno/deterministico. */
  exposed: boolean;
};

const testo = (description: string): ParametroFunctionCalling => ({
  type: "string",
  description,
});
const numero = (description: string): ParametroFunctionCalling => ({
  type: "number",
  description,
  minimum: 0,
});
const intero = (description: string): ParametroFunctionCalling => ({
  type: "integer",
  description,
  minimum: 1,
  maximum: 20,
});
const booleano = (description: string): ParametroFunctionCalling => ({
  type: "boolean",
  description,
});
const lista = (description: string): ParametroFunctionCalling => ({
  type: "array",
  description,
  items: { type: "string" },
});
const statoFarmacia = (): ParametroFunctionCalling => ({
  type: "string",
  description: "Stato richiesto: aperte, turno o tutte.",
  enum: ["aperte", "turno", "tutte"],
});

const PARAMETRI_COMUNI_CATALOGO = {
  query: testo("Soggetto breve e concreto da cercare nel catalogo."),
  limit: intero("Numero massimo di risultati, da 1 a 20."),
  categoria: testo("Categoria o vetrina del catalogo, se esplicita."),
  citta: testo("Città esplicitamente richiesta."),
  esclusioni: lista("Caratteristiche esplicitamente escluse."),
  colori: lista("Colori richiesti, in forma canonica."),
  materiali: lista("Materiali richiesti, in forma canonica."),
  escludiNomi: lista("Nomi di risultati già mostrati da escludere."),
  minPrice: numero("Prezzo minimo in euro, zero incluso."),
  maxPrice: numero("Prezzo massimo in euro, zero incluso."),
  apertiOra: booleano("True solo se l'utente chiede attività aperte ora."),
} as const;

/**
 * Contratto completo. L'ordine è stabile e viene usato anche dai test.
 * `searchGiftCategories` è interno: il fan-out regalo lo costruisce
 * l'orchestratore, non il modello.
 */
export const TOOL_DEFINITIONS: readonly DefinizioneStrumentoPino[] = [
  {
    name: "searchStores",
    description: "Cerca negozi, attività, professionisti e servizi locali.",
    parameters: {
      type: "object",
      properties: {
        query: PARAMETRI_COMUNI_CATALOGO.query,
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
        categoria: PARAMETRI_COMUNI_CATALOGO.categoria,
        tipo: testo("Tipo di attività o profilo professionale."),
        servizio: testo("Servizio richiesto dell'attività."),
        serviziTutti: booleano(
          "True per elencare tutti i servizi pubblicati dall'attività, quando la richiesta è generica."
        ),
        citta: PARAMETRI_COMUNI_CATALOGO.citta,
        termini: lista("Parole chiave e sinonimi utili al recupero."),
        esclusioni: PARAMETRI_COMUNI_CATALOGO.esclusioni,
        escludiNomi: PARAMETRI_COMUNI_CATALOGO.escludiNomi,
        apertiOra: PARAMETRI_COMUNI_CATALOGO.apertiOra,
      },
      required: ["query"],
      additionalProperties: false,
    },
    allowedParams: [
      "query", "limit", "categoria", "tipo", "servizio", "serviziTutti", "citta", "termini",
      "esclusioni", "escludiNomi", "apertiOra",
    ],
    exposed: true,
  },
  {
    name: "searchProducts",
    description: "Cerca prodotti acquistabili nel catalogo locale.",
    parameters: {
      type: "object",
      properties: {
        query: PARAMETRI_COMUNI_CATALOGO.query,
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
        categoria: PARAMETRI_COMUNI_CATALOGO.categoria,
        citta: PARAMETRI_COMUNI_CATALOGO.citta,
        esclusioni: PARAMETRI_COMUNI_CATALOGO.esclusioni,
        colori: PARAMETRI_COMUNI_CATALOGO.colori,
        materiali: PARAMETRI_COMUNI_CATALOGO.materiali,
        escludiNomi: PARAMETRI_COMUNI_CATALOGO.escludiNomi,
        minPrice: PARAMETRI_COMUNI_CATALOGO.minPrice,
        maxPrice: PARAMETRI_COMUNI_CATALOGO.maxPrice,
        apertiOra: PARAMETRI_COMUNI_CATALOGO.apertiOra,
      },
      required: ["query"],
      additionalProperties: false,
    },
    allowedParams: [
      "query", "limit", "categoria", "citta", "esclusioni", "colori",
      "materiali", "escludiNomi", "minPrice", "maxPrice", "prezzoRigido", "apertiOra",
    ],
    exposed: true,
  },
  {
    name: "searchOffers",
    description: "Cerca offerte, promozioni e sconti attivi.",
    parameters: {
      type: "object",
      properties: {
        query: testo("Soggetto opzionale dell'offerta."),
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
      },
      required: [],
      additionalProperties: false,
    },
    allowedParams: ["query", "limit"],
    exposed: true,
  },
  {
    name: "searchEvents",
    description: "Cerca eventi, manifestazioni e appuntamenti.",
    parameters: {
      type: "object",
      properties: {
        query: testo("Soggetto opzionale dell'evento."),
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
      },
      required: [],
      additionalProperties: false,
    },
    allowedParams: ["query", "limit"],
    exposed: true,
  },
  {
    name: "searchNews",
    description: "Cerca le ultime notizie pubblicate su Radici Calabria, con fonte e link.",
    parameters: {
      type: "object",
      properties: {
        query: testo("Tema, luogo o persona delle notizie; vuoto per le ultime pubblicate."),
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
      },
      required: [],
      additionalProperties: false,
    },
    allowedParams: ["query", "limit"],
    exposed: true,
  },
  {
    name: "searchContent",
    description: "Cerca articoli e contenuti editoriali pubblicati su Radici Calabria.",
    parameters: {
      type: "object",
      properties: {
        query: testo("Tema, luogo o parola chiave dei contenuti; vuoto per i più recenti."),
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
      },
      required: [],
      additionalProperties: false,
    },
    allowedParams: ["query", "limit"],
    exposed: true,
  },
  {
    name: "searchConoscenza",
    description: "Cerca nelle informazioni del sito su territorio, parchi, località, filiere e produttori, stagionalità, FAQ e pagine informative. Non cerca prodotti, negozi, prezzi, offerte o eventi.",
    parameters: {
      type: "object",
      properties: {
        query: testo("Tema, luogo o parola chiave da cercare nelle informazioni del sito."),
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
      },
      required: [],
      additionalProperties: false,
    },
    allowedParams: ["query", "limit"],
    exposed: true,
  },
  {
    name: "searchTerritorio",
    description: "Cerca parchi, aree e comuni della Calabria, con i riconoscimenti DOP, IGP e PAT dei loro prodotti.",
    parameters: {
      type: "object",
      properties: {
        query: testo("Parco, comune, area o prodotto riconosciuto da cercare; vuoto per l'elenco."),
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
      },
      required: [],
      additionalProperties: false,
    },
    allowedParams: ["query", "limit"],
    exposed: true,
  },
  {
    name: "searchFiliere",
    description: "Elenca le dieci filiere agroalimentari calabresi della homepage (olivicola, agrumicola, vitivinicola, ittica e altre), filtrabili per nome.",
    parameters: {
      type: "object",
      properties: {
        query: testo("Nome o tema della filiera (es. olio, vino, ittica); vuoto per tutte."),
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
      },
      required: [],
      additionalProperties: false,
    },
    allowedParams: ["query", "limit"],
    exposed: true,
  },
  {
    name: "searchAll",
    description: "Cerca trasversalmente negozi, prodotti, offerte, eventi, notizie, contenuti e categorie.",
    parameters: {
      type: "object",
      properties: {
        query: PARAMETRI_COMUNI_CATALOGO.query,
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
        categoria: PARAMETRI_COMUNI_CATALOGO.categoria,
        tipo: testo("Tipo di attività o profilo professionale."),
        servizio: testo("Servizio richiesto dell'attività."),
        citta: PARAMETRI_COMUNI_CATALOGO.citta,
        termini: lista("Parole chiave e sinonimi utili al recupero."),
        esclusioni: PARAMETRI_COMUNI_CATALOGO.esclusioni,
        colori: PARAMETRI_COMUNI_CATALOGO.colori,
        materiali: PARAMETRI_COMUNI_CATALOGO.materiali,
        escludiNomi: PARAMETRI_COMUNI_CATALOGO.escludiNomi,
        minPrice: PARAMETRI_COMUNI_CATALOGO.minPrice,
        maxPrice: PARAMETRI_COMUNI_CATALOGO.maxPrice,
        apertiOra: PARAMETRI_COMUNI_CATALOGO.apertiOra,
      },
      required: ["query"],
      additionalProperties: false,
    },
    allowedParams: [
      "query", "limit", "categoria", "tipo", "servizio", "citta", "termini",
      "esclusioni", "colori", "materiali", "escludiNomi", "minPrice", "maxPrice",
      "prezzoRigido", "apertiOra",
    ],
    exposed: true,
  },
  {
    name: "getCategories",
    description: "Elenca le categorie del catalogo con il numero di negozi.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    allowedParams: [],
    exposed: true,
  },
  {
    name: "getWeather",
    description: "Restituisce il meteo aggiornato di Castrovillari.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    allowedParams: [],
    exposed: true,
  },
  {
    name: "searchPharmacies",
    description: "Cerca farmacie aperte, di turno o tutte.",
    parameters: {
      type: "object",
      properties: {
        stato: statoFarmacia(),
        limit: PARAMETRI_COMUNI_CATALOGO.limit,
      },
      required: [],
      additionalProperties: false,
    },
    allowedParams: ["stato", "limit"],
    exposed: true,
  },
  {
    name: "searchGiftCategories",
    description: "Cerca prodotti nelle categorie regalo; strumento interno al fan-out.",
    parameters: {
      type: "object",
      properties: {
        query: testo("Categoria o soggetto del regalo."),
        limit: intero("Numero massimo di risultati per categoria."),
        termini: lista("Categorie regalo da interrogare."),
        categoria: PARAMETRI_COMUNI_CATALOGO.categoria,
        citta: PARAMETRI_COMUNI_CATALOGO.citta,
        esclusioni: PARAMETRI_COMUNI_CATALOGO.esclusioni,
        colori: PARAMETRI_COMUNI_CATALOGO.colori,
        materiali: PARAMETRI_COMUNI_CATALOGO.materiali,
        escludiNomi: PARAMETRI_COMUNI_CATALOGO.escludiNomi,
        minPrice: PARAMETRI_COMUNI_CATALOGO.minPrice,
        maxPrice: PARAMETRI_COMUNI_CATALOGO.maxPrice,
        apertiOra: PARAMETRI_COMUNI_CATALOGO.apertiOra,
      },
      required: ["termini"],
      additionalProperties: false,
    },
    allowedParams: [
      "query", "limit", "termini", "categoria", "citta", "esclusioni", "colori",
      "materiali", "escludiNomi", "minPrice", "maxPrice", "prezzoRigido", "apertiOra",
    ],
    exposed: false,
  },
] as const;

/** Dichiarazione provider-neutral degli strumenti esposti a Pino. */
export type PinoToolDeclaration = {
  name: string;
  description: string;
  parametersJsonSchema: SchemaParametriFunctionCalling;
};

/** Chiavi ammesse dal validatore, derivate dallo stesso contratto. */
export const CONTRATTI_STRUMENTO: Record<StrumentoPino, readonly (keyof ToolParams)[]> =
  TOOL_DEFINITIONS.reduce(
    (contratti, definizione) => {
      contratti[definizione.name] = definizione.allowedParams;
      return contratti;
    },
    {} as Record<StrumentoPino, readonly (keyof ToolParams)[]>
  );

/** Strumenti dichiarati al provider AI: il fan-out regalo resta interno. */
export function buildNativeToolDeclarations(): PinoToolDeclaration[] {
  return TOOL_DEFINITIONS.filter((definizione) => definizione.exposed).map((definizione) => ({
    name: definizione.name,
    description: definizione.description,
    parametersJsonSchema: definizione.parameters,
  }));
}

/**
 * Menu testuale per il percorso JSON legacy. Le descrizioni e i nomi arrivano
 * dallo stesso contratto delle dichiarazioni native: nessuna seconda lista.
 */
export function buildToolMenuPrompt(): string {
  return TOOL_DEFINITIONS.filter((definizione) => definizione.exposed)
    .map((definizione) => {
      const proprieta = Object.keys(definizione.parameters.properties);
      const obbligatori = definizione.parameters.required ?? [];
      if (proprieta.length === 0) {
        return `- ${definizione.name}: ${definizione.description} Nessun parametro.`;
      }
      const opzionali = proprieta.filter((chiave) => !obbligatori.includes(chiave));
      const testoObbligatori = obbligatori.length
        ? ` Obbligatori: ${obbligatori.join(", ")}.`
        : "";
      const testoOpzionali = opzionali.length
        ? ` Opzionali: ${opzionali.join(", ")}.`
        : "";
      return `- ${definizione.name}: ${definizione.description}${testoObbligatori}${testoOpzionali}`;
    })
    .join("\n");
}

export type NativeFunctionCall = {
  name: string;
  args: Record<string, unknown>;
};

/** Normalizza le function call del provider: scarta forme non interpretabili. */
export function parseNativeFunctionCalls(calls: unknown): NativeFunctionCall[] {
  if (!Array.isArray(calls)) return [];
  const normalizzate: NativeFunctionCall[] = [];
  for (const call of calls) {
    if (!call || typeof call !== "object" || Array.isArray(call)) continue;
    const nome = (call as { name?: unknown }).name;
    const args = (call as { args?: unknown }).args;
    if (typeof nome !== "string" || !nome.trim()) continue;
    if (!args || typeof args !== "object" || Array.isArray(args)) continue;
    normalizzate.push({
      name: nome.trim(),
      args: args as Record<string, unknown>,
    });
  }
  return normalizzate;
}

/** Verifica i parametri obbligatori dichiarati, prima della validazione fine. */
export function parametriObbligatoriPresentiPino(
  nome: string,
  args: Record<string, unknown>
): boolean {
  const definizione = TOOL_DEFINITIONS.find((voce) => voce.name === nome);
  if (!definizione) return false;
  return (definizione.parameters.required ?? []).every((chiave) => {
    const valore = args[chiave];
    if (valore === null || valore === undefined) return false;
    if (typeof valore === "string" && !valore.trim()) return false;
    if (Array.isArray(valore) && valore.length === 0) return false;
    return true;
  });
}

/**
 * Una risposta testuale è ammessa senza tool solo fuori dal catalogo.
 * `surface` e `intent` arrivano dal livello deterministico, non dal modello.
 */
export function directReplyAmmessoPino(input: {
  surface?: string | null;
  intent?: string | null;
  haInvocazioni?: boolean;
}): boolean {
  if (input.haInvocazioni) return true;
  const catalogo =
    input.surface === "products" ||
    input.surface === "stores" ||
    input.surface === "both" ||
    input.intent === "product" ||
    input.intent === "food" ||
    input.intent === "drink" ||
    input.intent === "service" ||
    input.intent === "gift";
  return !catalogo;
}
