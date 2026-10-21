import { isStepCount, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { createGeminiLanguageModel } from "@/lib/ai/gemini-text";
import type { ToolParams } from "./tools";

export type PinoToolInvocation = { tool: string; params: ToolParams };

const paramsSchema = z.object({
  query: z.string().max(240).optional(),
  maxPrice: z.number().finite().nonnegative().nullable().optional(),
  minPrice: z.number().finite().nonnegative().nullable().optional(),
  limit: z.number().int().min(1).max(20).optional(),
  termini: z.array(z.string().max(80)).max(10).optional(),
  categoria: z.string().max(100).optional(),
  sottocategoria: z.string().max(100).optional(),
  tipo: z.string().max(100).optional(),
  citta: z.string().max(100).optional(),
  stato: z.enum(["aperte", "turno", "tutte"]).optional(),
  tutte: z.boolean().optional(),
  esclusioni: z.array(z.string().max(80)).max(10).optional(),
  escludiNomi: z.array(z.string().max(120)).max(20).optional(),
  apertiOra: z.boolean().optional(),
});

function registraTool(
  nome: string,
  descrizione: string,
  invocazioni: PinoToolInvocation[]
) {
  return tool({
    description: descrizione,
    inputSchema: paramsSchema,
    execute: async (params) => {
      // Il modello sceglie l'azione; il recupero vero resta nel livello
      // controllato eseguiTool, che usa esclusivamente i dati pubblici esistenti.
      const normalizzati = params as ToolParams;
      const chiave = `${nome}:${String(normalizzati.query ?? "").trim().toLowerCase()}`;
      if (
        invocazioni.length < 3 &&
        !invocazioni.some((item) => `${item.tool}:${String(item.params.query ?? "").trim().toLowerCase()}` === chiave)
      ) {
        invocazioni.push({ tool: nome, params: normalizzati });
      }
      return {
        pianificazioneRegistrata: true,
        nota: "Azione registrata. L'applicazione eseguirà la ricerca sui dati reali e controllerà i risultati.",
      };
    },
  });
}

/**
 * ToolLoopAgent usato solo per pianificare le ricerche non già risolte dalle
 * regole deterministiche. L'agente non accede direttamente al database e non
 * può scrivere dati: le chiamate vengono validate ed eseguite da eseguiTool.
 */
export async function selezionaToolConAgente(input: {
  prompt: string;
}): Promise<PinoToolInvocation[]> {
  const invocazioni: PinoToolInvocation[] = [];
  const tools = {
    searchStores: registraTool(
      "searchStores",
      "Pianifica una ricerca di negozi o attività locali. Usa query e, se chiari, categoria, tipo, città e termini.",
      invocazioni
    ),
    searchProducts: registraTool(
      "searchProducts",
      "Pianifica una ricerca di prodotti del catalogo. Usa query e vincoli di prezzo reali se presenti.",
      invocazioni
    ),
    searchOffers: registraTool(
      "searchOffers",
      "Pianifica una ricerca di offerte e promozioni attive. Query è opzionale per elencarle tutte.",
      invocazioni
    ),
    searchEvents: registraTool(
      "searchEvents",
      "Pianifica una ricerca di eventi locali. Query è opzionale per elencare gli eventi disponibili.",
      invocazioni
    ),
    searchAll: registraTool(
      "searchAll",
      "Pianifica una ricerca trasversale quando la richiesta è ampia o ambigua.",
      invocazioni
    ),
    getCategories: registraTool(
      "getCategories",
      "Pianifica il recupero delle categorie disponibili nel catalogo.",
      invocazioni
    ),
    getWeather: registraTool(
      "getWeather",
      "Pianifica il recupero del meteo aggiornato per Castrovillari.",
      invocazioni
    ),
    searchPharmacies: registraTool(
      "searchPharmacies",
      "Pianifica il recupero delle farmacie di turno o aperte. Specifica stato: aperte, turno o tutte.",
      invocazioni
    ),
  };

  const agent = new ToolLoopAgent({
    model: createGeminiLanguageModel(),
    instructions: [
      "Sei il pianificatore operativo di Pino per InCittà.online.",
      "Interpreta il bisogno usando la conversazione e l'intento forniti.",
      "Usa gli strumenti per registrare solo ricerche utili, fino a 3 chiamate.",
      "Le ricerche saranno eseguite dall'applicazione su dati reali: non inventare risultati o prezzi.",
      "Per offerte scegli searchOffers; per eventi searchEvents; per meteo getWeather; per farmacie searchPharmacies.",
      "Per negozi e professionisti scegli searchStores; per articoli acquistabili searchProducts.",
      "Usa searchAll solo se la richiesta è ampia o non si può classificare meglio.",
      "Non rispondere all'utente e non produrre JSON: seleziona le azioni e termina.",
    ].join("\n"),
    tools,
    stopWhen: isStepCount(4),
    temperature: 0.1,
    maxOutputTokens: 450,
  });

  // Il prompt legacy contiene esempi utili e contesto; si rimuove solo il
  // vecchio vincolo finale che chiedeva JSON invece delle tool call dell'agente.
  const prompt = input.prompt.replace(/\nRispondi SOLO con JSON valido[\s\S]*$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);
  try {
    await agent.generate({ prompt, abortSignal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  return invocazioni.slice(0, 3);
}
