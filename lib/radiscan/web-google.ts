import type { RiconoscimentoAi, RicercaWeb } from "./tipi";
import {
  costruisciQuery,
  creaRicercaWeb,
  hostPubblico,
  type CandidatoWeb,
  type OpzioniRicercaWeb,
  type ProviderRicercaWeb,
  type RichiestaRicercaWeb,
} from "./web";

/**
 * RadiciScan — ricerca web tramite Google Search (grounding Gemini).
 *
 * È il provider di riserva di Tavily. Restituisce URL realmente usati da
 * Google Search, non conoscenze del modello. I metadati di grounding
 * contengono le query eseguite e i collegamenti alle fonti: solo quegli URL
 * vengono passati alla lettura delle pagine.
 *
 * Nessuna nuova chiave: usa `GEMINI_API_KEY`, già necessaria al servizio.
 * Se il grounding non è disponibile (modello assente, quota, nessun chunk)
 * si torna ai motori keyless, dichiarando il motore effettivamente usato.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELLI = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
];
const TIMEOUT_MODELLO_MS = 8_000;
const MAX_TEMPO_GROUNDING_MS = 14_000;
const MAX_CANDIDATI = 22;
// Quota e autorizzazione Google sono a livello di progetto/chiave, non di modello.
// Evita di ripetere la stessa richiesta su quattro modelli quando il provider
// ha già risposto 429/401/403. Il cooldown è solo in memoria e si riapre da sé.
const COOLDOWN_GROUNDING_MS = 30_000;
let groundingDisabilitatoFino = 0;

export interface OpzioniRicercaGoogle extends OpzioniRicercaWeb {
  apiKey?: string;
  modelli?: string[];
}

interface ChunkGrounding {
  web?: { uri?: unknown; title?: unknown };
}

interface MetadatiGrounding {
  webSearchQueries?: unknown;
  groundingChunks?: unknown;
}

interface RispostaGrounding {
  candidates?: Array<{ groundingMetadata?: MetadatiGrounding }>;
}

function promptRicerca(riconoscimento: RiconoscimentoAi): string {
  const righe = [
    "Sei un ricercatore documentale. Usa Google Search per cercare sul web informazioni verificabili, non la tua conoscenza interna.",
    "Devi ricostruire separatamente: denominazione protetta, produttore, marchio commerciale, prodotto specifico, consorzio di tutela e organismo di controllo.",
    "Cerca anche il sito ufficiale del produttore e le sue pagine prodotto, oltre a registro europeo, MASAF, Regione, ARSAC e organismi di certificazione.",
    "Non inventare URL o fatti. Se un'informazione non emerge, non presentarla come certa.",
    "",
    `Prodotto: ${riconoscimento.prodotto}`,
    `Denominazione: ${riconoscimento.denominazioneProposta ?? "non leggibile"}`,
    `Produttore/marchio: ${riconoscimento.produttore ?? "non leggibile"}`,
    `Territorio: ${riconoscimento.territorioProposto ?? "non indicato"}`,
    `Schema di qualità: ${riconoscimento.schemaProposto ?? "non indicato"}`,
    "",
    "Esegui più ricerche separate, tra cui:",
    ...costruisciQuery(riconoscimento).map((query) => `- ${query}`),
    "",
    "Riporta in forma breve i fatti trovati e le fonti consultate. Il testo serve solo come supporto: le fonti vincolanti sono gli URL restituiti dal grounding.",
  ];
  return righe.join("\n");
}

function candidatiDaGrounding(
  metadati: MetadatiGrounding | undefined,
  riconoscimento: RiconoscimentoAi
): { candidati: CandidatoWeb[]; query: string[] } {
  if (!metadati) return { candidati: [], query: [] };

  const query = Array.isArray(metadati.webSearchQueries)
    ? metadati.webSearchQueries
        .filter((voce): voce is string => typeof voce === "string" && voce.trim() !== "")
        .map((voce) => voce.trim())
        .slice(0, 8)
    : [];

  const chunk = Array.isArray(metadati.groundingChunks)
    ? (metadati.groundingChunks as ChunkGrounding[])
    : [];
  const visti = new Set<string>();
  const candidati: CandidatoWeb[] = [];
  for (const voce of chunk) {
    const uri = typeof voce.web?.uri === "string" ? voce.web.uri.trim() : "";
    if (!uri) continue;
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || !hostPubblico(url.hostname)) continue;
    url.hash = "";
    const pulito = url.toString();
    if (visti.has(pulito)) continue;
    visti.add(pulito);
    const titolo =
      typeof voce.web?.title === "string" && voce.web.title.trim()
        ? voce.web.title.trim().slice(0, 220)
        : url.hostname;
    // La query associata ai chunk è neutra rispetto al produttore: Google
    // può restituire anche una scheda MASAF che non ripete il nome commerciale.
    // La pertinenza resta verificata sul prodotto/denominazione.
    const queryNeutra =
      [riconoscimento.prodotto, riconoscimento.denominazioneProposta]
        .filter((voce): voce is string => Boolean(voce && voce.trim()))
        .join(" ") || riconoscimento.prodotto;
    candidati.push({
      titolo,
      url: pulito,
      estratto: null,
      query: queryNeutra,
    });
    if (candidati.length >= MAX_CANDIDATI) break;
  }

  return { candidati, query };
}

async function cercaGrounding(
  apiKey: string,
  riconoscimento: RiconoscimentoAi,
  fetchImpl: typeof fetch,
  modelli: string[],
  signal?: AbortSignal
): Promise<{ candidati: CandidatoWeb[]; query: string[] }> {
  if (groundingDisabilitatoFino > Date.now()) {
    return { candidati: [], query: [] };
  }

  const prompt = promptRicerca(riconoscimento);
  const scadenza = Date.now() + MAX_TEMPO_GROUNDING_MS;

  for (const modello of modelli) {
    if (Date.now() >= scadenza || signal?.aborted) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MODELLO_MS);
    const annulla = () => controller.abort();
    signal?.addEventListener("abort", annulla, { once: true });
    if (signal?.aborted) controller.abort();

    try {
      const risposta = await fetchImpl(`${BASE_URL}/${modello}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0, maxOutputTokens: 1024 },
        }),
        signal: controller.signal,
      });

      if (!risposta.ok) {
        // 429 e 401/403 non dipendono dal modello: provare gli altri nomi
        // ripete richieste destinate a fallire e allunga la scansione.
        if ([401, 403, 429].includes(risposta.status)) {
          groundingDisabilitatoFino = Date.now() + COOLDOWN_GROUNDING_MS;
          console.warn(
            `[radiscan][web] motore=google modello=${modello} http=${risposta.status} circuito=30s esito=non_disponibile`
          );
          break;
        }
        // Un 404 può invece indicare solo un modello non disponibile.
        console.warn(
          `[radiscan][web] motore=google modello=${modello} http=${risposta.status} esito=non_disponibile`
        );
        continue;
      }

      const payload = (await risposta.json().catch(() => null)) as RispostaGrounding | null;
      const metadati = payload?.candidates?.[0]?.groundingMetadata;
      const esito = candidatiDaGrounding(metadati, riconoscimento);
      if (esito.candidati.length > 0) return esito;
      console.warn(
        `[radiscan][web] motore=google modello=${modello} http=200 esito=nessun_url`
      );
    } catch {
      console.warn(
        `[radiscan][web] motore=google modello=${modello} esito=rete`
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", annulla);
    }
  }

  return { candidati: [], query: [] };
}

/**
 * Provider ibrido di riserva: Google grounding, poi motori keyless.
 * Restituisce sempre il motore effettivo e non inventa fonti.
 */
export function creaRicercaWebGoogle(
  opzioni: OpzioniRicercaGoogle = {}
): ProviderRicercaWeb {
  const apiKey = (opzioni.apiKey ?? process.env.GEMINI_API_KEY ?? "").trim();
  const modelli = opzioni.modelli?.length ? opzioni.modelli : MODELLI;
  const keyless = creaRicercaWeb(opzioni);

  return {
    nome: "web-google",
    async cerca(input: RichiestaRicercaWeb): Promise<RicercaWeb> {
      if (!apiKey) return keyless.cerca(input);

      const grounding = await cercaGrounding(
        apiKey,
        input.riconoscimento,
        opzioni.fetchImpl ?? fetch,
        modelli,
        input.signal
      );

      if (grounding.candidati.length === 0) {
        const fallback = await keyless.cerca(input);
        return {
          ...fallback,
          motore: fallback.motore ?? "keyless",
          messaggio:
            fallback.messaggio ??
            "Google Search non ha restituito fonti utilizzabili: usati i motori di riserva.",
        };
      }

      const esito = await keyless.cerca({
        ...input,
        candidati: grounding.candidati,
        query: grounding.query.length > 0 ? grounding.query : costruisciQuery(input.riconoscimento),
      });

      return {
        ...esito,
        motore: "google_grounding",
        messaggio:
          esito.fonti.length === 0
            ? "Google Search ha restituito URL, ma nessuna pagina pertinente è stata letta: non è una prova di assenza di fonti."
            : esito.messaggio,
      };
    },
  };
}
