/**
 * Pino — Gemini Function Calling
 *
 * Gemini interpreta la richiesta e sceglie uno strumento. Le funzioni qui
 * dichiarate sono gli unici punti di accesso ai dati: nessuna query SQL
 * generata dal modello e nessuna disponibilità inventata.
 */

import { GoogleGenAI, FunctionCallingConfigMode, Type, type FunctionDeclaration } from "@google/genai";
import {
  searchStores,
  searchProducts,
  searchOffers,
  searchEvents,
  getCategoriesList,
  searchAll,
  ordinaProdottiPerBudget,
  getWeatherCastrovillari,
  searchPharmacies,
  type ToolParams,
} from "./tools";
import { searchAttractions } from "./attrazioni";
import { SYSTEM_PROMPT } from "./prompt";
import { rilevaLinguaConversazionePino } from "./understanding";
import type { MessaggioAssistente, RispostaAssistente } from "./index";
import { normalizzaArgomentiRicercaPino } from "./function-calling-contract";

type RisultatoTool = {
  ok: boolean;
  strumento: string;
  ambito: string;
  ricerca?: string;
  negozi?: Awaited<ReturnType<typeof searchStores>>;
  prodotti?: Awaited<ReturnType<typeof searchProducts>>;
  offerte?: Awaited<ReturnType<typeof searchOffers>>;
  eventi?: Awaited<ReturnType<typeof searchEvents>>;
  attrazioni?: ReturnType<typeof searchAttractions>;
  categorie?: Awaited<ReturnType<typeof getCategoriesList>>;
  meteo?: Awaited<ReturnType<typeof getWeatherCastrovillari>>;
  farmacie?: Awaited<ReturnType<typeof searchPharmacies>>;
  errore?: string;
};

const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "cercaNelDatabaseInCitta",
    description:
      "Cerca esclusivamente nei dati pubblici realmente presenti su InCittà a Castrovillari e dintorni. Usa questo strumento ogni volta che l'utente cerca o chiede disponibilità di prodotti, negozi, attività, professionisti, servizi, offerte, eventi, attrazioni o categorie. Comprendi sinonimi, descrizioni colloquiali e refusi: ad esempio 'qualcuno che lava le macchine' può diventare 'lavaggio auto'. Non inventare mai risultati. Se non trovi corrispondenze, restituisci il risultato vuoto.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ricerca: {
          type: Type.STRING,
          description:
            "Il soggetto concreto da cercare, ripulito dalla frase conversazionale. Esempi: 'orologio', 'pasta', 'lavaggio auto', 'riparazione smartphone'. Per richieste generiche su offerte o eventi può essere vuoto.",
        },
        ambito: {
          type: Type.STRING,
          enum: [
            "prodotti",
            "negozi_servizi",
            "offerte",
            "eventi",
            "attrazioni",
            "categorie",
            "tutto",
          ],
          description:
            "Dove cercare. prodotti per articoli acquistabili; negozi_servizi per attività, professionisti e servizi; offerte per promozioni; eventi per manifestazioni; attrazioni per la guida turistica InCittà; categorie per le categorie disponibili; tutto per una ricerca trasversale.",
        },
        varianti: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Fino a tre sinonimi o formulazioni alternative del soggetto, utili quando il catalogo può usare un nome diverso.",
        },
        categoria: {
          type: Type.STRING,
          description: "Categoria del catalogo, solo se chiaramente deducibile.",
        },
        tipo: {
          type: Type.STRING,
          description: "Tipo di attività o profilo professionale, se pertinente.",
        },
        citta: {
          type: Type.STRING,
          description: "Città richiesta dall'utente, se specificata.",
        },
        prezzoMassimo: {
          type: Type.NUMBER,
          description:
            "Budget massimo in euro. È una preferenza: il sistema ordina prima i prodotti entro budget e poi le alternative, senza inventare prezzi.",
        },
        prezzoMinimo: {
          type: Type.NUMBER,
          description: "Prezzo minimo in euro, se richiesto.",
        },
        apertiOra: {
          type: Type.BOOLEAN,
          description:
            "Imposta true solo se l'utente chiede esplicitamente attività aperte in questo momento.",
        },
        limite: {
          type: Type.NUMBER,
          description:
            "Numero massimo di risultati. Usa fino a 20 per richieste di conteggio o panoramiche; normalmente 8.",
        },
        escludiNomi: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            "Nomi già mostrati da escludere quando l'utente chiede altre opzioni.",
        },
      },
      required: ["ricerca", "ambito"],
    },
  },
  {
    name: "recuperaInformazioniLocali",
    description:
      "Recupera informazioni locali aggiornate tramite le fonti già collegate a InCittà. Usalo per meteo e farmacie di Castrovillari. Non dedurre mai lo stato di apertura di una farmacia.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tipo: {
          type: Type.STRING,
          enum: ["meteo", "farmacie"],
          description: "Tipo di informazione locale da recuperare.",
        },
        statoFarmacie: {
          type: Type.STRING,
          enum: ["aperte", "turno", "tutte"],
          description:
            "Per le farmacie: aperte solo se lo stato è verificato, turno per le farmacie di turno, tutte per l'elenco disponibile.",
        },
      },
      required: ["tipo"],
    },
  },
];

const PROMPT_FUNCTION_CALLING = `${SYSTEM_PROMPT}

ARCHITETTURA A STRUMENTI — REGOLE OBBLIGATORIE:
- Sei Pino. Per ogni richiesta che riguarda disponibilità, prodotti, negozi, servizi, professionisti, offerte, eventi, attrazioni o categorie di InCittà devi chiamare lo strumento appropriato PRIMA di rispondere.
- Non rispondere mai sulla disponibilità di un prodotto o servizio basandoti sulla memoria del modello. I dati del tool sono l'unica fonte di verità.
- Interpreta il significato, non copiare meccanicamente le parole dell'utente. Comprendi sinonimi, linguaggio colloquiale, errori di battitura e richieste in italiano o inglese. Esempio: "c'è qualcuno che lava le macchine a casa?" → ricerca "lavaggio auto a domicilio" nell'ambito negozi_servizi.
- Estrai il soggetto senza parole conversazionali. "Voglio un orologio, ho 99 euro" → ricerca "orologio", ambito prodotti, prezzoMassimo 99. Se un sinonimo può essere registrato nel catalogo con una formulazione diversa, aggiungi fino a tre varianti di ricerca.
- Mantieni il contesto: "e sotto 100?", "più economico", "fammi vedere altro" e simili si riferiscono alla richiesta precedente. Per "altro" escludi i nomi già mostrati.
- Scegli l'ambito giusto: prodotti per beni da acquistare; negozi_servizi per chi offre un'attività o un servizio; offerte ed eventi per le rispettive sezioni; attrazioni per luoghi, cultura, turismo e dintorni; tutto solo per richieste davvero ampie.
- Se l'utente cerca un prodotto, non restituire negozi come se fossero prodotti. Se cerca un servizio, cerca le attività che lo dichiarano nei dati del catalogo.
- I risultati vuoti significano soltanto che non è stata trovata una corrispondenza nei dati consultati di InCittà. NON affermare che quel prodotto o servizio non esiste a Castrovillari o che nessuna attività in città lo offre.
- Distingui un risultato vuoto da un errore tecnico del recupero. Non presentare un errore come una ricerca completata senza risultati.
- Dopo aver ricevuto i risultati, formula una risposta naturale, cordiale e concreta nella lingua dell'utente. Usa esclusivamente i dati restituiti. Non inventare prezzi, dettagli, orari, disponibilità, indirizzi o caratteristiche.
- Se il tool restituisce zero risultati, dillo chiaramente riferendoti al catalogo InCittà e proponi un'alternativa utile senza fingere di aver trovato qualcosa.
- Le domande sull'identità di Pino, sul funzionamento generale di InCittà, i saluti, la cortesia e la semplice chiacchiera non richiedono una ricerca di catalogo: rispondi direttamente e con naturalezza.
- Non mostrare all'utente nomi interni degli strumenti, JSON o dettagli tecnici.
`;

function queryVarianti(args: ReturnType<typeof normalizzaArgomentiRicercaPino>): string[] {
  return Array.from(new Set([args.ricerca, ...(args.varianti ?? [])]
    .map((q) => q.trim())
    .filter(Boolean))).slice(0, 4);
}

function unisciPerId<T extends { id: string }>(liste: T[][], limite: number): T[] {
  const risultati = new Map<string, T>();
  for (const lista of liste) {
    for (const item of lista) {
      if (!risultati.has(String(item.id))) risultati.set(String(item.id), item);
    }
  }
  return Array.from(risultati.values()).slice(0, limite);
}

function unisciPerNome<T extends { nome: string }>(liste: T[][], limite: number): T[] {
  const risultati = new Map<string, T>();
  for (const lista of liste) {
    for (const item of lista) {
      const chiave = item.nome.trim().toLowerCase();
      if (chiave && !risultati.has(chiave)) risultati.set(chiave, item);
    }
  }
  return Array.from(risultati.values()).slice(0, limite);
}

async function eseguiRicercaDatabase(argsRaw: Record<string, unknown>): Promise<RisultatoTool> {
  const args = normalizzaArgomentiRicercaPino(argsRaw);
  const query = args.ricerca ?? "";
  const queries = queryVarianti(args);
  const limite = args.limite ?? 8;
  const filtri: ToolParams = {
    categoria: args.categoria,
    tipo: args.tipo,
    citta: args.citta,
    maxPrice: args.prezzoMassimo,
    minPrice: args.prezzoMinimo,
    apertiOra: args.apertiOra,
    limit: limite,
    escludiNomi: args.escludiNomi,
  };

  try {
    switch (args.ambito) {
      case "prodotti": {
        const liste = await Promise.all(queries.map((q) => searchProducts(q, filtri)));
        let prodotti = unisciPerId(liste, limite);
        if (args.prezzoMassimo != null || args.prezzoMinimo != null) {
          prodotti = ordinaProdottiPerBudget(
            prodotti,
            { maxPrice: args.prezzoMassimo, minPrice: args.prezzoMinimo }
          );
        }
        return { ok: true, strumento: "cercaNelDatabaseInCitta", ambito: args.ambito, ricerca: query, prodotti };
      }
      case "negozi_servizi": {
        const liste = queries.length
          ? await Promise.all(queries.map((q) => searchStores(q, filtri)))
          : (args.categoria || args.tipo)
            ? [await searchStores("", filtri)]
            : [];
        return {
          ok: true,
          strumento: "cercaNelDatabaseInCitta",
          ambito: args.ambito,
          ricerca: query,
          negozi: unisciPerId(liste, limite),
        };
      }
      case "offerte": {
        const liste = queries.length
          ? await Promise.all(queries.map((q) => searchOffers(q, limite)))
          : [await searchOffers(undefined, limite)];
        return { ok: true, strumento: "cercaNelDatabaseInCitta", ambito: args.ambito, ricerca: query, offerte: unisciPerId(liste, limite) };
      }
      case "eventi": {
        const liste = queries.length
          ? await Promise.all(queries.map((q) => searchEvents(q, limite)))
          : [await searchEvents(undefined, limite)];
        return { ok: true, strumento: "cercaNelDatabaseInCitta", ambito: args.ambito, ricerca: query, eventi: unisciPerId(liste, limite) };
      }
      case "attrazioni": {
        const liste = queries.map((q) => searchAttractions(q, limite));
        return {
          ok: true,
          strumento: "cercaNelDatabaseInCitta",
          ambito: args.ambito,
          ricerca: query,
          attrazioni: unisciPerNome(liste, limite),
        };
      }
      case "categorie":
        return {
          ok: true,
          strumento: "cercaNelDatabaseInCitta",
          ambito: args.ambito,
          ricerca: query,
          categorie: await getCategoriesList(),
        };
      case "tutto": {
        if (queries.length === 0) {
          const [offerte, eventi, categorie] = await Promise.all([
            searchOffers(undefined, 5),
            searchEvents(undefined, 5),
            getCategoriesList(),
          ]);
          return { ok: true, strumento: "cercaNelDatabaseInCitta", ambito: args.ambito, offerte, eventi, categorie };
        }
        const liste = await Promise.all(queries.map((q) => searchAll(q, filtri)));
        return {
          ok: true,
          strumento: "cercaNelDatabaseInCitta",
          ambito: args.ambito,
          ricerca: query,
          negozi: unisciPerId(liste.map((r) => r.negozi), limite),
          prodotti: unisciPerId(liste.map((r) => r.prodotti), limite),
          offerte: unisciPerId(liste.map((r) => r.offerte), limite),
          eventi: unisciPerId(liste.map((r) => r.eventi), limite),
          categorie: unisciPerNome(liste.map((r) => r.categorie), 20),
        };
      }
      default:
        return { ok: false, strumento: "cercaNelDatabaseInCitta", ambito: "sconosciuto", errore: "Ambito di ricerca non riconosciuto." };
    }
  } catch (error) {
    console.error("[pino-function-calling] Errore ricerca database:", error);
    return {
      ok: false,
      strumento: "cercaNelDatabaseInCitta",
      ambito: args.ambito,
      ricerca: query,
      errore: "Il recupero dei dati InCittà non è riuscito. Non è possibile confermare la disponibilità.",
    };
  }
}
async function eseguiInformazioneLocale(args: Record<string, unknown>): Promise<RisultatoTool> {
  const tipo = args.tipo === "farmacie" ? "farmacie" : "meteo";
  try {
    if (tipo === "meteo") {
      const meteo = await getWeatherCastrovillari();
      return {
        ok: meteo !== null,
        strumento: "recuperaInformazioniLocali",
        ambito: "meteo",
        meteo,
        ...(meteo ? {} : { errore: "Dati meteo temporaneamente non disponibili." }),
      };
    }
    const stato =
      args.statoFarmacie === "aperte" ||
      args.statoFarmacie === "turno" ||
      args.statoFarmacie === "tutte"
        ? args.statoFarmacie
        : "turno";
    const farmacie = await searchPharmacies(stato, 8);
    return {
      ok: true,
      strumento: "recuperaInformazioniLocali",
      ambito: "farmacie",
      farmacie,
    };
  } catch (error) {
    console.error("[pino-function-calling] Errore informazione locale:", error);
    return {
      ok: false,
      strumento: "recuperaInformazioniLocali",
      ambito: tipo,
      errore: "La fonte delle informazioni locali non è al momento disponibile.",
    };
  }
}

function estraiTesto(response: { text?: string | (() => string) }): string {
  const value = response.text;
  return typeof value === "function" ? value.call(response).trim() : String(value ?? "").trim();
}

function fallbackRisposta(
  risultati: RisultatoTool[],
  lingua: "it" | "en"
): string {
  const errore = risultati.some((r) => !r.ok);
  if (errore) {
    return lingua === "en"
      ? "I couldn't complete the live search right now, so I can't confirm availability. Please try again in a moment."
      : "Non sono riuscito a completare la ricerca in questo momento, quindi non posso confermare la disponibilità. Riprova tra poco.";
  }
  const vuoto = risultati.every((r) =>
    (r.negozi?.length ?? 0) +
      (r.prodotti?.length ?? 0) +
      (r.offerte?.length ?? 0) +
      (r.eventi?.length ?? 0) +
      (r.attrazioni?.length ?? 0) +
      (r.categorie?.length ?? 0) +
      (r.farmacie?.length ?? 0) +
      (r.meteo ? 1 : 0) === 0
  );
  return vuoto
    ? lingua === "en"
      ? "I couldn't find a matching result in the InCittà catalogue. That doesn't mean the product or service is unavailable elsewhere in Castrovillari."
      : "Non ho trovato una corrispondenza nel catalogo InCittà. Questo non significa che il prodotto o il servizio non sia disponibile altrove a Castrovillari."
    : lingua === "en"
      ? "I found information in InCittà, but couldn't format the results. Please try again."
      : "Ho recuperato informazioni da InCittà, ma non sono riuscito a comporre la risposta. Riprova.";
}

export async function chatConFunctionCalling(
  messages: MessaggioAssistente[],
  inizio: number
): Promise<RispostaAssistente> {
  const lingua = rilevaLinguaConversazionePino(messages);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      risposta: lingua === "en"
        ? "Pino is temporarily unavailable. Please try again later."
        : "Pino non è momentaneamente disponibile. Riprova più tardi.",
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
    };
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 25_000,
      retryOptions: {
        attempts: 2,
        initialDelay: 0.5,
        maxDelay: 1.5,
        expBase: 2,
        jitter: 0.2,
        httpStatusCodes: [408, 429, 500, 502, 503, 504],
      },
    },
  });
  const contents: any[] = messages.slice(-12).map((m) => ({
    role: m.role === "assistant" ? "model" as const : "user" as const,
    parts: [{ text: m.content.slice(0, 800) }],
  }));

  try {
    const primaRisposta = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: PROMPT_FUNCTION_CALLING,
        temperature: 0.15,
        maxOutputTokens: 700,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO,
          },
        },
      },
    });

    const functionCalls = primaRisposta.functionCalls ?? [];
    if (functionCalls.length === 0) {
      const testo = estraiTesto(primaRisposta);
      return {
        risposta: testo || (lingua === "en" ? "I couldn't understand the request well enough to search. Could you rephrase it?" : "Non ho capito bene la richiesta. Puoi formularla in un altro modo?"),
        negozi: [],
        prodotti: [],
        processingMs: Date.now() - inizio,
        source: "assistente",
      };
    }

    const risultati: RisultatoTool[] = [];
    const calls = functionCalls;
    for (const call of calls) {
      if (call.name === "cercaNelDatabaseInCitta") {
        risultati.push(
          await eseguiRicercaDatabase((call.args ?? {}) as Record<string, unknown>)
        );
      } else if (call.name === "recuperaInformazioniLocali") {
        risultati.push(
          await eseguiInformazioneLocale((call.args ?? {}) as Record<string, unknown>)
        );
      } else {
        risultati.push({
          ok: false,
          strumento: String(call.name ?? "sconosciuto"),
          ambito: "sconosciuto",
          errore: "Strumento non riconosciuto.",
        });
      }
    }

    const contenutoModello = primaRisposta.candidates?.[0]?.content;
    if (contenutoModello) {
      contents.push(contenutoModello);
    } else {
      contents.push({
        role: "model",
        parts: calls.map((call) => ({
          functionCall: {
            name: call.name ?? "",
            args: call.args ?? {},
            ...(call.id ? { id: call.id } : {}),
          },
        })),
      });
    }

    contents.push({
      role: "user",
      parts: calls.map((call, index) => ({
        functionResponse: {
          name: call.name ?? "",
          response: risultati[index] as unknown as Record<string, unknown>,
          ...(call.id ? { id: call.id } : {}),
        },
      })),
    });

    const rispostaFinale = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: PROMPT_FUNCTION_CALLING,
        temperature: 0.35,
        maxOutputTokens: 900,
      },
    });

    const testoFinale = estraiTesto(rispostaFinale);
    const negozi = risultati.flatMap((r) => r.negozi ?? []);
    const prodotti = risultati.flatMap((r) => r.prodotti ?? []);

    return {
      risposta: testoFinale || fallbackRisposta(risultati, lingua),
      negozi: negozi.filter((n, i, all) => all.findIndex((x) => x.id === n.id) === i).slice(0, 8),
      prodotti: prodotti.filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i).slice(0, 10),
      processingMs: Date.now() - inizio,
      source: "assistente",
    };
  } catch (error) {
    console.error("[pino-function-calling] Errore Gemini:", error);
    return {
      risposta: lingua === "en"
        ? "I couldn't complete the request right now. Please try again in a moment."
        : "Non sono riuscito a completare la richiesta in questo momento. Riprova tra poco.",
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
    };
  }
}
