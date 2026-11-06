/**
 * Pino Semantic Planner v2
 *
 * Interpreta richieste naturali prima del retrieval: soggetto, superficie,
 * sinonimi, vincoli di prezzo, città ed esclusioni. Il modello NON decide
 * quali dati inventare: restituisce solo un piano di ricerca che viene poi
 * validato e applicato dai tool deterministici.
 *
 * Fallback locale: se Gemini non è disponibile, il piano resta utilizzabile
 * con intent + termini originali.
 */
import { callGeminiText, type CallGeminiTextParams } from "@/lib/ai/gemini-text";
import {
  chiamataGeminiConBudgetPino,
  type BudgetGeminiPino,
} from "./budget-gemini";
import { extractJsonFromText } from "@/lib/product-assistant/providers/utils";
import { normalizzaRichiesta } from "./local-intents";
import {
  attributiVuotiPino,
  correggiTokenCatalogo,
  DESTINATARI_PINO,
  estraiAttributiPino,
  estraiSoggettoPino,
  normalizzaQueryCatalogo,
  richiestaApertaOra,
  rilevaPreferenzaLinguaPino,
  rilevaLinguaConversazionePino,
  rilevaLinguaPino,
  type PinoUnderstanding,
} from "./understanding";
import { rilevaFollowUp } from "./conversazione";
import { estraiCitta } from "@/lib/localita";
import { analizzaIntentoPino, type PinoIntent, type PinoIntentAnalysis } from "./intent";
import { SINONIMI_DIRETTI_PRODOTTO, SINONIMI_TIPO_ATTIVITA } from "@/lib/ricerca-semantica";
import { CANONICI_CATALOGO_PINO, VOCABOLARIO_REFUSI_PINO } from "./lexicon.ts";
import type { MessaggioAssistente } from "./index";
import type { PinoMemoriaVoce } from "./memoria";

// ─── Fallback a costo zero: Gemini 429/402 → Groq (OpenAI-compatibile) ──────
//
// Il planner semantico è il primo consumatore di quota della richiesta: con
// Gemini a 429 (o appeso oltre la soglia) la comprensione AI si spegneva e
// restava solo il piano deterministico. Qui la stessa richiesta viene ripetuta
// su Groq Cloud, che espone un endpoint OpenAI-compatibile.
//
// L'helper resta LOCALE a questo file: `index.ts` importa semantica, quindi
// importare da lì la funzione creerebbe un ciclo ESM. La chiave arriva da
// GROQ_API_KEY, mai dal codice.
// Se anche Groq fallisce viene rilanciato l'errore ORIGINALE di Gemini: il
// catch di `interpretaRichiestaPino` conserva il percorso deterministico e la
// rotta non va in crash.

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
/**
 * `llama-3.3-70b-specdec` e `llama3-8b-8192` non sono più erogati: il
 * sostituto indicato da Groq è `openai/gpt-oss-120b`, sostituibile con
 * GROQ_MODEL.
 */
const MODELLO_GROQ_FALLBACK = "openai/gpt-oss-120b";
/**
 * 4s su Gemini + 6s su Groq = 10s nel caso peggiore, ampiamente dentro la
 * scadenza della rotta: il backup non deve allungare il percorso.
 */
const TIMEOUT_GROQ_MS = 6_000;
/** 0.3: determinismo sui dati di catalogo. */
const TEMPERATURA_GROQ = 0.3;
/**
 * `openai/gpt-oss-120b` è un modello reasoning: spende ~150 token in
 * `reasoning_tokens` prima di scrivere il JSON del piano. Con 300 il piano
 * arrivava troncato o vuoto, quindi il tetto coincide con il minimo garantito
 * (vedi `Math.max` nel body della richiesta).
 */
const MAX_TOKENS_GROQ = 700;

/** Messaggio in formato OpenAI: Groq accetta system/user/assistant. */
type MessaggioGroq = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Errori in cui il backup è conveniente: quota/rate limit (429/402) e attesa
 * scaduta. Un Gemini che non risponde in 4s è già indisponibile per questa
 * richiesta: insistere significa bruciare il budget della rotta.
 * `callGeminiText` segnala il timeout come `Timeout chiamata Gemini (4s).`;
 * `deadline`/`ETIMEDOUT` coprono gli errori di rete o dei runtime.
 */
function erroreGeminiRecuperabilePino(errore: unknown): boolean {
  if (!errore) return false;
  if (typeof errore === "object") {
    const stato =
      (errore as { status?: unknown }).status ??
      (errore as { statusCode?: unknown }).statusCode;
    if (stato === 429 || stato === 402 || stato === "429" || stato === "402") return true;
    const codice = (errore as { code?: unknown }).code;
    if (typeof codice === "string" && /ETIMEDOUT|TIMEOUT|DEADLINE/i.test(codice)) return true;
  }
  const testo = errore instanceof Error ? errore.message : String(errore);
  return /429|402|quota|rate.?limit|timeout|deadline|etimedout/i.test(testo);
}

/**
 * Chiamata di backup su Groq Cloud: fetch nativa, nessuna dipendenza nuova.
 * Lancia su chiave assente, risposta non valida, timeout o testo vuoto — il
 * chiamante decide come degradare.
 */
async function chiamaBackupSuGroq(
  systemPrompt: string,
  messages: MessaggioGroq[],
  opzioni: { maxTokens?: number } = {}
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Chiave API Groq mancante. Aggiungi GROQ_API_KEY alle variabili d'ambiente."
    );
  }
  const model = process.env.GROQ_MODEL?.trim() || MODELLO_GROQ_FALLBACK;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_GROQ_MS);
  try {
    const corpo: MessaggioGroq[] = systemPrompt.trim()
      ? [{ role: "system", content: systemPrompt.trim() }, ...messages]
      : messages;
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: corpo,
        temperature: TEMPERATURA_GROQ,
        // Tetto minimo: il reasoning del modello consuma token prima del testo.
        max_tokens: Math.max(opzioni.maxTokens ?? 0, MAX_TOKENS_GROQ),
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Nessun body in chiaro: può contenere il token o dettagli interni.
      throw new Error(`Errore Groq (HTTP ${response.status}).`);
    }
    const dati = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const testo = (dati.choices?.[0]?.message?.content ?? "").trim();
    if (!testo) throw new Error("Risposta Groq vuota.");
    return testo;
  } catch (caught: unknown) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw new Error(`Timeout chiamata Groq (${Math.round(TIMEOUT_GROQ_MS / 1000)}s).`);
    }
    throw caught;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Prova Gemini e, solo quando l'errore è recuperabile (quota o timeout),
 * ripete la stessa richiesta su Groq con lo stesso system prompt. Gli errori
 * non recuperabili restano al chiamante senza cambio di provider. Il backup
 * non consuma il budget delle 2 chiamate Gemini della richiesta.
 */
async function chiamaGeminiConBackup(
  parametri: CallGeminiTextParams
): Promise<string> {
  try {
    return await callGeminiText(parametri);
  } catch (erroreGemini) {
    if (!erroreGeminiRecuperabilePino(erroreGemini)) throw erroreGemini;
    console.warn(
      "[pino-semantic-fallback] Gemini lento o in quota. Switch preventivo su Groq..."
    );
    const messaggi: MessaggioGroq[] = [
      ...(parametri.history ?? []).map((messaggio) => ({
        role: messaggio.role === "model" ? ("assistant" as const) : ("user" as const),
        content: messaggio.content,
      })),
      { role: "user" as const, content: parametri.userPrompt },
    ];
    try {
      const testo = await chiamaBackupSuGroq(parametri.systemPrompt, messaggi, {
        maxTokens: parametri.maxTokens,
      });
      console.info("[pino-semantic-fallback] Piano semantico prodotto da Groq.");
      return testo;
    } catch (erroreGroq) {
      // Graceful degradation: si rilancia l'errore di Gemini, che il catch di
      // `interpretaRichiestaPino` già gestisce (piano locale, nessun crash).
      console.warn(
        "[pino-semantic-fallback] Groq non disponibile, degrado sul planner locale:",
        erroreGroq instanceof Error ? erroreGroq.message : "errore sconosciuto"
      );
      throw erroreGemini;
    }
  }
}

export type PinoSemanticPlan = {
  surface: "products" | "stores" | "both" | "none";
  intent: PinoIntent;
  query: string;
  terms: string[];
  exclusions: string[];
  minPrice: number | null;
  maxPrice: number | null;
  city: string | null;
  openNow: boolean;
  confidence: "alta" | "media" | "bassa";
};

export type PinoConversationState = {
  richiesta: string;
  query: string | null;
  intent: PinoIntent;
  exclusions: string[];
  minPrice: number | null;
  maxPrice: number | null;
  city: string | null;
  openNow: boolean;
  confidence: "alta" | "media" | "bassa";
  attivo: boolean;
};

/**
 * Costruisce uno stato semantico esplicito dalla conversazione recente.
 *
 * Lo stato viene calcolato in modo deterministico e resta confinato a Pino:
 * non scrive sul DB e non modifica la ricerca pubblica. La regola importante
 * è che l'ultimo messaggio può modificare lo stato precedente senza portarsi
 * dietro filtri obsoleti (prezzo/città/reset).
 */
export function costruisciStatoConversazionale(
  history: MessaggioAssistente[]
): PinoConversationState {
  const utenti = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);

  const corrente = utenti[utenti.length - 1] ?? "";
  if (!corrente) {
    return {
      richiesta: "",
      query: null,
      intent: "generic",
      exclusions: [],
      minPrice: null,
      maxPrice: null,
      city: null,
      openNow: false,
      confidence: "bassa",
      attivo: false,
    };
  }

  // Riutilizziamo la stessa logica di contesto già verificata e la trasformiamo
  // subito in uno stato strutturato. In questo modo i livelli successivi non
  // devono reinterpretare ogni volta la cronologia in modo diverso.
  const richiesta = arricchisciRichiestaConContesto(corrente, history);
  const analisi = analizzaIntentoPino(richiesta);
  const piano = pianoLocaleIntelligente(richiesta, analisi);

  // Follow-up puri senza un piano locale (es. "fammi vedere altro") mantengono
  // comunque il soggetto della conversazione; non diventano una nuova ricerca.
  if (!piano) {
    const follow = rilevaFollowUp(corrente);
    if (follow && utenti.length >= 2) {
      const soggetto = [...utenti.slice(0, -1)].reverse().find((q) => !rilevaFollowUp(q));
      if (soggetto) {
        const base = analizzaIntentoPino(soggetto);
        return {
          richiesta,
          query: soggetto,
          intent: base.intent,
          exclusions: [],
          minPrice: null,
          maxPrice: null,
          city: null,
          openNow: false,
          confidence: base.confidence,
          attivo: true,
        };
      }
    }
    return {
      richiesta,
      query: null,
      intent: analisi.intent,
      exclusions: [],
      minPrice: null,
      maxPrice: null,
      city: null,
      openNow: false,
      confidence: analisi.confidence,
      attivo: false,
    };
  }

  return {
    richiesta,
    query: piano.query || null,
    intent: piano.intent,
    exclusions: piano.exclusions,
    minPrice: piano.minPrice,
    maxPrice: piano.maxPrice,
    city: piano.city,
    openNow: piano.openNow,
    confidence: piano.confidence,
    attivo: piano.surface !== "none" && Boolean(piano.query),
  };
};

/**
 * S3 — Comprensione strutturata della richiesta.
 *
 * Compone le informazioni già prodotte dai livelli esistenti (lingua, intento,
 * piano semantico) in un unico contratto tipizzato e aggiunge ciò che mancava:
 * preferenza linguistica esplicita, attributi strutturati e soggetto distinto
 * dagli attributi. Non applica filtri e non cambia la query di retrieval: il
 * piano semantico resta l'unico responsabile della ricerca.
 */
export type PinoComprensionePrecalcolata = {
  /** Domanda contestuale già calcolata dall'orchestratore. */
  richiesta?: string;
  /** Analisi dell'intento già calcolata sulla domanda contestuale. */
  analisi?: PinoIntentAnalysis;
  /** Piano locale già calcolato (se assente si calcola qui, una volta). */
  piano?: PinoSemanticPlan | null;
};

export function analizzaComprensionePino(
  input: string,
  history: MessaggioAssistente[] = [],
  precalcolato: PinoComprensionePrecalcolata = {}
): PinoUnderstanding {
  const testo = String(input ?? "").trim();
  const storico =
    history.length > 0 ? history : [{ role: "user" as const, content: testo }];
  const preferenza = rilevaPreferenzaLinguaPino(testo);
  // La preferenza esplicita vince sul rilevamento statistico della lingua.
  const lingua = preferenza?.lingua ?? rilevaLinguaConversazionePino(storico);

  // Solo comunicazione sulla lingua: nessun soggetto, nessun vincolo, nessuna
  // query. È questa la condizione che tiene Pino lontano dalle ricerche
  // commerciali non richieste ("I speak English").
  if (preferenza?.soloLingua) {
    return {
      lingua,
      linguaPreferita: preferenza.lingua,
      languagePreferenceOnly: true,
      intent: "generic",
      soggetto: "",
      attributi: attributiVuotiPino(),
      esclusioni: [],
      minPrice: null,
      maxPrice: null,
    };
  }

  // S4.1: l'orchestratore può passare la domanda contestuale e l'analisi che ha
  // già calcolato, così la comprensione non le ricalcola. In assenza di valori
  // precalcolati il comportamento è identico a prima.
  const richiesta = precalcolato.richiesta?.trim()
    ? precalcolato.richiesta
    : arricchisciRichiestaConContesto(testo, storico);
  const analisi = precalcolato.analisi ?? analizzaIntentoPino(richiesta);
  const piano =
    precalcolato.piano !== undefined
      ? precalcolato.piano
      : pianoLocaleIntelligente(richiesta, analisi);

  // S6.2 — L'estrazione delle esclusioni non dipende dall'esistenza di un
  // piano. Per le richieste brevi senza formule introduttive ("borsa without
  // leather") `pianoLocaleIntelligente` resta `null`, ma il termine negato è
  // già determinabile lessicalmente: se il piano non lo dichiara, la
  // comprensione lo conserva comunque. Quando il piano c'è le sue esclusioni
  // sono la fonte autorevole e non vengono duplicate.
  const esclusioni = piano?.exclusions?.length
    ? piano.exclusions
    : estraiEsclusioniPino(richiesta);

  return {
    lingua,
    linguaPreferita: preferenza?.lingua ?? null,
    languagePreferenceOnly: false,
    intent: piano?.intent ?? analisi.intent,
    soggetto: estraiSoggettoPino(richiesta),
    attributi: estraiAttributiPino(richiesta),
    esclusioni,
    minPrice: piano?.minPrice ?? null,
    maxPrice: piano?.maxPrice ?? null,
  };
}

/**
 * S4.1 — Vincoli effettivi per il retrieval a partire dal piano semantico e dal
 * contratto di comprensione.
 *
 * Il piano resta la fonte prioritaria (è ciò che l'utente ha chiesto in forma
 * strutturata); il contratto interviene solo dove il piano non ha il dato, così
 * nessun vincolo riconosciuto si perde nel percorso verso i tool. Le esclusioni
 * sono un'unione senza duplicati: aggiungere non significa sostituire.
 * I prezzi restano indicativi (D-1): qui si propagano, non si filtrano.
 * Zero è un limite esplicito valido; null/undefined e negativi restano assenti.
 */
export function fondiVincoliPino(
  piano: PinoSemanticPlan | null | undefined,
  comprensione: PinoUnderstanding
): { esclusioni: string[]; minPrice: number | null; maxPrice: number | null } {
  const esclusioni = Array.from(
    new Set(
      [...(piano?.exclusions ?? []), ...comprensione.esclusioni]
        .map((voce) => String(voce ?? "").trim())
        .filter(Boolean)
    )
  );
  const prezzoValido = (valore: unknown): number | null => {
    const numero = Number(valore);
    return valore != null && Number.isFinite(numero) && numero >= 0 ? numero : null;
  };
  return {
    esclusioni,
    minPrice: prezzoValido(piano?.minPrice) ?? prezzoValido(comprensione.minPrice),
    maxPrice: prezzoValido(piano?.maxPrice) ?? prezzoValido(comprensione.maxPrice),
  };
}

// ─── Prezzo esplicito: unica fonte deterministica ───────────────────────────
// `entro`, `non oltre`, `al massimo`, `fino a`, `inferiore a` sono tetti;
// `sopra`, `oltre` (non negato), `almeno`, `superiore a` sono soglie minime.
const RE_PREZZO_TETTO =
  /(?:budget(?:\s+di)?|sotto|massimo|al massimo|meno di|inferiore a|entro|fino a|non oltre|under|below|up to|less than|no more than|not over|at most)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)/i;
// `oltre` è un minimo SOLO senza negazione: "non oltre" è un tetto.
const RE_PREZZO_SOGLIA =
  /(?:sopra|superiore a|minimo|almeno|piu di|più di|(?<!non\s+)oltre|over|above|more than|at least)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)/i;
const RE_PREZZO_INTERVALLO =
  /(?:tra|da|between)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)\s*(?:e|a|and|to)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:euro|euros|eur))?/i;
const RE_PREZZO_GENERICO =
  /(?:€\s*(\d+(?:[.,]\d+)?))|(\d+(?:[.,]\d+)?)\s*(?:euro|euros|eur)\b/i;

/**
 * UNICO estrattore di prezzo esplicito, condiviso da piano locale e fallback.
 *
 * Ordine: intervallo → tetto → soglia → importo generico. L'importo nudo
 * ("50 euro", "€50", "con 50 euro") diventa un tetto SOLO quando la frase non
 * contiene già un tetto o una soglia: così "oltre 50 euro" resta un minimo e
 * non diventa anche un massimo. L'intervallo è sempre normalizzato min ≤ max.
 */
export function estraiPrezzoEsplicitoPino(
  testo: string
): { minPrice: number | null; maxPrice: number | null } {
  const q = String(testo ?? "");
  const numero = (valore: string) => Number(valore.replace(",", "."));
  const intervallo = q.match(RE_PREZZO_INTERVALLO);
  if (intervallo) {
    const a = numero(intervallo[1]);
    const b = numero(intervallo[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { minPrice: Math.min(a, b), maxPrice: Math.max(a, b) };
    }
  }
  const tetto = q.match(RE_PREZZO_TETTO);
  const soglia = q.match(RE_PREZZO_SOGLIA);
  if (tetto || soglia) {
    return {
      minPrice: soglia ? numero(soglia[1]) : null,
      maxPrice: tetto ? numero(tetto[1]) : null,
    };
  }
  const generico = q.match(RE_PREZZO_GENERICO);
  const valore = generico ? numero(generico[1] ?? generico[2]) : null;
  return {
    minPrice: null,
    maxPrice: valore != null && Number.isFinite(valore) && valore > 0 ? valore : null,
  };
}

/**
 * Il budget del piano viene SOLO dall'estrazione deterministica della
 * richiesta: i campi di prezzo restituiti dal modello non possono introdurre
 * né rimuovere un vincolo. Uno zero "di riempimento" non diventa quindi un
 * tetto, mentre «entro 0 euro» resta un tetto esplicito pari a zero.
 */
export function applicaLimitiEsplicitiPianoPino(
  piano: PinoSemanticPlan,
  richiesta: string
): PinoSemanticPlan {
  const limiti = estraiPrezzoEsplicitoPino(richiesta);
  return { ...piano, minPrice: limiti.minPrice, maxPrice: limiti.maxPrice };
}

// Clausole economiche rimosse dalla query di retrieval: intervallo (anche
// inglese), tetto/soglia (anche inglese), importi con valuta o simbolo.
// Regola UNICA condivisa da piano locale e fallback: nessuna implementazione
// duplicata e nessun residuo come «between», «above», «and» o importi.
const RE_CLAUSOLA_PREZZO_INTERVALLO =
  /(?:tra|fra|da|between|from)\s*(?:€|\$)?\s*\d+(?:[.,]\d+)?\s*(?:e|a|and|to)\s*(?:€|\$)?\s*\d+(?:[.,]\d+)?(?:\s*(?:euros|euro|eur))?/gi;
const RE_CLAUSOLA_PREZZO_LIMITE =
  /(?:budget(?:\s+di)?|non oltre|al massimo|massimo|sotto|meno di|inferiore a|entro|fino a|sopra|superiore a|minimo|almeno|piu di|più di|oltre|under|below|up to|less than|no more than|not over|at most|above|over|more than|at least)\s*(?:€|\$)?\s*\d+(?:[.,]\d+)?(?:\s*(?:euros|euro|eur))?/gi;

export function rimuoviClausolePrezzoPino(testo: string): string {
  return String(testo ?? "")
    .replace(RE_CLAUSOLA_PREZZO_INTERVALLO, " ")
    .replace(RE_CLAUSOLA_PREZZO_LIMITE, " ")
    .replace(
      /\b(?:ho|con|dispongo di|a disposizione(?: di)?)\s*(?:(?:un|il|il mio)\s+)?(?:budget(?:\s+di)?\s*)?(?:€\s*)?\d+(?:[.,]\d+)?\s*(?:euros|euro|eur)\b(?:\s+(?:da spendere|per)\b)?/gi,
      " "
    )
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:euros|euro|eur)\b/gi, " ")
    .replace(/€\s*\d+(?:[.,]\d+)?/g, " ")
    .replace(/\b(?:euros|euro|eur)\b/gi, " ")
    .replace(/€/g, " ")
    // Connettivi orfani rimasti in coda dopo la rimozione dell'importo
    // («cuffie con», «pasta and»): non sono keyword di catalogo.
    .replace(/\s+\b(?:e|ed|and|to|con|da|di|a|per|circa|tra|between|above|below|over|under|entro|fino)\b\s*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Limiti validi di una singola interpretazione: null/undefined/negativi non contano; 0 è un limite esplicito valido. */
function limitiPianoPino(
  fonte?: { minPrice?: number | null; maxPrice?: number | null } | null
): { minPrice: number | null; maxPrice: number | null } | null {
  const valido = (valore: unknown): number | null => {
    const numero = Number(valore);
    return valore != null && Number.isFinite(numero) && numero >= 0 ? numero : null;
  };
  const min = valido(fonte?.minPrice);
  const max = valido(fonte?.maxPrice);
  return min == null && max == null ? null : { minPrice: min, maxPrice: max };
}

/**
 * Budget ESPLICITO con precedenza ESCLUSIVA: se il piano semantico contiene
 * almeno un limite valido si usano solo i suoi (anche quando l'altro è null);
 * la comprensione subentra solo quando il piano non ne ha nessuno. Minimo di
 * un'interpretazione e massimo dell'altra non vengono mai combinati.
 */
export function limitiVincolantiPino(
  semantica?: PinoSemanticPlan | null,
  comprensione?: PinoUnderstanding | null
): { minPrice: number | null; maxPrice: number | null } | null {
  return limitiPianoPino(semantica) ?? limitiPianoPino(comprensione);
}

const SCHEMA_PROMPT = `Interpreta una richiesta dell'utente per la ricerca locale di InCittà.
NON rispondere all'utente. Devi produrre SOLO JSON valido.

Regole:
- Comprendi italiano e inglese naturali, inclusi plurali, sinonimi, forme colloquiali e abbreviazioni.
- Se la richiesta è in inglese, produci comunque lo stesso JSON strutturato. Il catalogo è prevalentemente in italiano: traduci il soggetto in italiano e usa sinonimi/categorie italiani utili al retrieval, mantenendo attributi distintivi.
- Esempi di normalizzazione cross-lingua: "watch"/"wristwatch" => "orologio"; "shoes" => "scarpe"; "phone"/"cellphone" => "telefono"; "wallet" => "portafoglio". Sono esempi, non un elenco chiuso: interpreta anche soggetti mai visti.
- Comprendi richieste come "under 100", "below 100", "up to 100", "over 50", "between 50 and 100", "open now" e "near the center".
- "birre", "birretta", "birrette" => soggetto canonico "birra".
- "telefonino", "cellulare", "smartphone" => soggetto canonico "telefono".
- Non inventare prodotti, negozi o disponibilità.
- terms contiene SOLO i soggetti realmente cercati, non articoli, preposizioni,
  verbi o vincoli. Può contenere sinonimi utili (massimo 5).
- exclusions contiene ciò che l'utente esclude esplicitamente (massimo 5),
  ad esempio "non alcolica" => ["alcolica"].
- Estrai prezzi da frasi come "sotto 10 euro", "massimo 20", "tra 5 e 15".
- city solo se la città è esplicitamente indicata.
- openNow true solo se l'utente chiede esplicitamente attività aperte ora.
- products = prodotti fisici; stores = negozi/servizi; both quando servono
  entrambi; none per chiacchiere o richieste non di ricerca.
- Per servizi/professionisti usa stores.
- Mantieni il soggetto principale anche quando la frase è lunga.
- confidence bassa se non riesci a identificare un soggetto concreto.

JSON:
{
  "surface": "products|stores|both|none",
  "intent": "product|service|food|drink|gift|generic",
  "query": "stringa breve del soggetto",
  "terms": ["string"],
  "exclusions": ["string"],
  "minPrice": number|null,
  "maxPrice": number|null,
  "city": "string|null",
  "openNow": true|false,
  "confidence": "alta|media|bassa"
}`;

function pulisciLista(values: unknown, max = 5): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(
    values
      .filter((v): v is string => typeof v === "string")
      .map((v) => normalizzaRichiesta(v).trim())
      .filter((v) => v.length >= 2 && v.length <= 40)
  )).slice(0, max);
}

function numeroValido(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1000000 ? Math.round(n * 100) / 100 : null;
}

// Soggetti canonici del piano locale e vocabolario dei refusi: la conoscenza è
// in `lexicon.ts`, qui nessuna lista da tenere allineata a mano.
const CANONICI_RICERCA = CANONICI_CATALOGO_PINO;

const VOCABOLARIO_PINO_BASE: Array<[string, string]> = VOCABOLARIO_REFUSI_PINO.map(
  ([termine, canonico]) => [termine, canonico] as [string, string]
);

/**
 * Token che NON partecipano alla correzione automatica dei refusi.
 *
 * `auricolare`/`auricolari` sono a due modifiche da `articolare`/`articolari`:
 * se entrassero nel vocabolario, `correggiTokenCatalogo` riscriverebbe una
 * parola italiana valida ("dolore articolare" → "dolore auricolare"). Le due
 * forme italiane sono escluse anche in ingresso, come seconda difesa.
 */
export const TOKEN_SENZA_REFUSI = new Set([
  "articolare",
  "articolari",
  "auricolare",
  "auricolari",
  // Destinatari e legami familiari: sono parole italiane valide e non devono
  // essere "corrette" verso un prodotto del catalogo. Senza questa protezione
  // «regalo per mia moglie» diventava «regalo per mia maglia» (due sostituzioni
  // su una parola di 6 lettere rientravano nella soglia dei refusi) e la
  // ricerca finiva su un capo di abbigliamento mai richiesto.
  ...DESTINATARI_PINO.flatMap(([canonico, sinonimi]) => [canonico, ...sinonimi]),
]);

/** Vocabolario dei refusi di Pino (token → termine canonico). Esportato per i
 * test diretti della protezione `TOKEN_SENZA_REFUSI`. */
export const VOCABOLARIO_PINO: Array<[string, string]> = (() => {
  const mappa = new Map<string, string>(VOCABOLARIO_PINO_BASE);

  // Riutilizziamo il vocabolario semantico già presente nel motore InCittà:
  // errori di battitura su prodotti, categorie e servizi vengono corretti
  // verso un termine reale già conosciuto dal catalogo.
  for (const gruppo of SINONIMI_DIRETTI_PRODOTTO) {
    for (const voce of gruppo) {
      for (const token of normalizzaRichiesta(voce).split(/\s+/)) {
        if (token.length >= 4 && !TOKEN_SENZA_REFUSI.has(token)) mappa.set(token, token);
      }
    }
  }

  for (const gruppo of Object.values(SINONIMI_TIPO_ATTIVITA)) {
    for (const voce of gruppo) {
      for (const token of normalizzaRichiesta(voce).split(/\s+/)) {
        if (token.length >= 4 && !TOKEN_SENZA_REFUSI.has(token)) mappa.set(token, token);
      }
    }
  }

  return Array.from(mappa.entries());
})();

export function correggiErroriBattitura(query: string): string {
  // La correzione vive in understanding.ts ed è volutamente prudente: un
  // refuso plausibile viene corretto, una parola italiana valida no ("cane"
  // non deve diventare "pane", "voglio" non deve diventare "aglio").
  // I token in TOKEN_SENZA_REFUSI non vengono mai riscritti.
  return query.split(/(\s+)/).map((part) => {
    const lower = part.toLocaleLowerCase("it-IT");
    if (TOKEN_SENZA_REFUSI.has(lower)) return part;
    return correggiTokenCatalogo(part, VOCABOLARIO_PINO) ?? part;
  }).join("");
}

/**
 * Applica SOLO le associazioni di memoria esplicitamente apprese come
 * correzione semantica e già consolidate. La sostituzione è token-aware:
 * "birrra," viene corretto, ma "birrraio" no.
 *
 * La query originale resta intatta nel flusso dell'interfaccia; questa funzione
 * produce esclusivamente la variante usata dal planner/retrieval. Le soglie
 * vengono ricontrollate qui per evitare che una voce debole possa alterare la
 * ricerca anche se arriva da un chiamante futuro diverso da recuperaMemoria().
 */
export function applicaMemoriaSemantica(
  query: string,
  memoria: PinoMemoriaVoce[]
): string {
  const originale = (query ?? "").trim();
  if (!originale || !memoria?.length) return originale;

  const correzioni = memoria
    .filter(
      (m) =>
        m.tipo === "correzione_semantica" &&
        m.frequenza >= 2 &&
        m.confidence >= 0.70
    )
    .map((m) => ({
      termine: normalizzaRichiesta(m.termine ?? "").trim(),
      concetto: normalizzaRichiesta(m.concetto ?? "").trim(),
    }))
    .filter(
      (m) =>
        m.termine.length >= 4 &&
        m.concetto.length >= 2 &&
        m.termine !== m.concetto &&
        !m.termine.includes(" ") &&
        !m.concetto.includes(" ")
    )
    .sort((a, b) => b.termine.length - a.termine.length);

  let risultato = originale;
  for (const correzione of correzioni.slice(0, 6)) {
    const escaped = correzione.termine.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      "(^|[^A-Za-zÀ-ÖØ-öø-ÿ0-9])" +
        escaped +
        "(?=$|[^A-Za-zÀ-ÖØ-öø-ÿ0-9])",
      "gi"
    );
    risultato = risultato.replace(re, "$1" + correzione.concetto);
  }

  return risultato.replace(/\s+/g, " ").trim();
}

/**
 * Collega una modifica breve alla ricerca sostanziale più recente.
 *
 * La ricerca precedente non è necessariamente l'ultimo messaggio dell'utente:
 * in una catena come "scarpe da uomo" -> "eleganti" -> "sotto 100 euro" ->
 * "nere", il soggetto va recuperato dal primo messaggio concreto e i
 * modificatori intermedi vanno mantenuti.
 */
export function arricchisciRichiestaConContesto(
  query: string,
  history: MessaggioAssistente[]
): string {
  const corrente = (query ?? "").trim();
  const q = normalizzaRichiesta(corrente);
  if (!q) return corrente;

  const parole = q.split(/\s+/).filter(Boolean);
  if (parole.length > 8) return corrente;

  const RE_RESET_PREZZO =
    /\b(?:lascia\s+perdere|togli|rimuovi|ignora)\s+(?:il\s+)?(?:filtro\s+)?(?:del\s+|di\s+)?prezzo\b|\b(?:senza|non\s+importa)\s+(?:il\s+)?(?:limite\s+di\s+)?prezzo\b/i;
  const RE_CLAUSOLA_PREZZO =
    /\b(?:budget(?:\s+di)?|sotto|sopra|massimo|minimo|meno\s+di|piu\s+di|più\s+di|entro|fino\s+a|tra|da|under|below|up\s+to|over|above|more\s+than|less\s+than|between)\s*(?:€\s*)?\d+(?:[.,]\d+)?(?:\s*(?:e|a|and|to)\s*(?:€\s*)?\d+(?:[.,]\d+)?)?/gi;
  const estraiCittaEsplicita = (testo: string): string | null => {
    const normalizzata = normalizzaRichiesta(testo);
    const citta = estraiCitta(normalizzata);
    if (!citta) return null;
    return new RegExp("\\b(?:a|in)\\s+" + citta + "\\b", "i").test(normalizzata)
      ? citta
      : null;
  };
  const rimuoviPrezzo = (testo: string): string =>
    testo
      .replace(RE_CLAUSOLA_PREZZO, " ")
      // La valuta resta attaccata al numero ("sotto 50 euro"): va rimossa anche
      // da sola, altrimenti entra nella query di retrieval.
      .replace(/\b(?:euro|euros|eur)\b/gi, " ")
      .replace(/€/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const rimuoviCitta = (testo: string, citta: string | null): string => {
    if (!citta) return testo;
    const escaped = citta.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    return testo
      .replace(new RegExp("\\b(?:a|in)\\s+" + escaped + "\\b", "gi"), " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const haSoggettoConcreto = (testo: string): boolean => {
    const normalizzata = normalizzaRichiesta(testo);
    if (!normalizzata) return false;
    if (CANONICI_RICERCA.some((x) => x.pattern.test(normalizzata))) return true;
    if (/\b(?:parrucchier[ei]|barbier[ei]|farmaci[ae]|ristorant[ei]|pizzeri[ae]|negozio|negozi|hotel|idraulico|elettricista|calzolaio|dentista|oculista|meccanico|gommista|sartoria|fotografo|tipografia)\b/i.test(normalizzata)) {
      return true;
    }
    const analisi = analizzaIntentoPino(normalizzata);
    return analisi.intent !== "generic" && analisi.confidence !== "bassa";
  };

  // Una nuova richiesta con un soggetto proprio non deve ereditare il contesto.
  if (haSoggettoConcreto(corrente)) return corrente;

  const utenti = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);
  if (utenti.length < 2) return corrente;

  if (/^(?:ok|okay|va bene|perfetto|grazie|grazie mille|ciao|buongiorno|buonasera)$/.test(q)) {
    return corrente;
  }

  let indiceBase = -1;
  for (let i = utenti.length - 2; i >= 0; i--) {
    if (haSoggettoConcreto(utenti[i])) {
      indiceBase = i;
      break;
    }
  }
  if (indiceBase < 0) return corrente;

  let parti = utenti.slice(indiceBase, utenti.length - 1);
  const haNuovoPrezzo = RE_CLAUSOLA_PREZZO.test(corrente);
  RE_CLAUSOLA_PREZZO.lastIndex = 0;
  const resetPrezzo = RE_RESET_PREZZO.test(q);

  // Un nuovo vincolo economico sostituisce quello precedente. Questo evita
  // che "sotto 100" + "anzi sotto 70" venga interpretato ancora come 100.
  if (haNuovoPrezzo || resetPrezzo) {
    parti = parti.map(rimuoviPrezzo).filter(Boolean);
  }

  const nuovaCitta = estraiCittaEsplicita(corrente);
  if (nuovaCitta) {
    // Anche la città è un filtro sostituibile: "a Castrovillari" → "a Cosenza".
    parti = parti
      .map((p) => {
        const cittaPrecedente = estraiCittaEsplicita(p);
        return rimuoviCitta(p, cittaPrecedente);
      })
      .filter(Boolean);
  }

  // Un reset del prezzo è un comando di stato, non testo da cercare.
  if (resetPrezzo) {
    return [...parti].join(" ").replace(/\s+/g, " ").trim().slice(0, 500) || corrente;
  }

  const modificaEsplicita =
    /\b(?:elegant[ei]|sportiv[oi]|casual|da uomo|da donna|per uomo|per donna|per bambini?|economich[ei]|economico|costos[oi]|nere?|bianch[ei]|ross[aei]|blu|verdi?|gialle?|grigie?|marron[ei]|piccol[oi]|grand[ei]|nuov[oi]|usato|usata|usati|usate|senza|non|sotto|sopra|massimo|minimo|entro|fino|tra|vicino|vicina|vicinanze|aperto|aperta|aperti|aperte|oggi|domani|stasera|adesso|ora)\b/i;

  const intermedi =
    parti.length === 0
      ? []
      : parti.filter((p, index) => {
          // Il primo elemento è il soggetto-base concreto già riconosciuto
          // sopra: può essere una richiesta completa e lunga (es. idea regalo
          // con destinatario). I limiti di lunghezza valgono solo per i
          // messaggi intermedi, non per la richiesta originale.
          if (index === 0) return true;
          const pn = normalizzaRichiesta(p);
          const n = pn.split(/\s+/).filter(Boolean).length;
          return n <= 8 && (modificaEsplicita.test(pn) || n <= 2);
        });

  if (parti.length > 0 && intermedi.length !== parti.length) return corrente;

  return [...parti, corrente].join(" ").slice(0, 500);
}

export function usaFastPathSemantico(query: string, analisi: PinoIntentAnalysis): boolean {
  const q = correggiErroriBattitura(normalizzaRichiesta(query)).trim();
  return CANONICI_RICERCA.some((x) => x.pattern.test(q)) ||
    /\b(?:analcolic(?:a|o|he|i)|non\s+(?:alcol(?:ica|ico)?|alcol)|senza\s+(?:alcol(?:ica|ico)?|alcol))\b/i.test(q) ||
    /\b(?:sotto|sopra|massimo|minimo|meno di|piu di|più di|entro|fino a|tra)\b/i.test(q);
}

// ─── Esclusioni negative ─────────────────────────────────────────────────────
// "non in tessuto" deve escludere IL MATERIALE, non la preposizione "in":
// tra la negazione e il termine negato possono stare preposizioni, articoli e
// costrutti inglesi ("not made of plastic"). Connettori e articoli non sono mai
// esclusioni autonome; il termine positivo non negato resta un attributo.
const CONNETTORI_CLAUSOLA_ESCLUSIONE = [
  "in", "di", "del", "dello", "della", "dei", "degli", "delle", "da",
  "con", "a", "al", "allo", "alla", "ai", "agli", "alle", "su",
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
  "the", "an", "of", "from", "with", "made", "out",
];

// Parole che non possono MAI essere un'esclusione da sole (connettori, articoli
// e formule di raccordo). Se la cattura le produce, vengono scartate.
const PAROLE_NON_ESCLUSIONE = new Set([
  ...CONNETTORI_CLAUSOLA_ESCLUSIONE,
  "non", "senza", "not", "without", "solo", "soltanto", "piu", "più",
  "molto", "poco", "troppo", "e", "ed", "o", "ma", "che",
]);

// Cattura: negazione + eventuali connettori + termine negato.
function sorgenteClausolaEsclusione(): string {
  return `\\b(?:non|senza|without|not)\\b\\s+(?:(?:${CONNETTORI_CLAUSOLA_ESCLUSIONE.join("|")})\\s+)*([a-zàèéìòù][a-zàèéìòù0-9-]*)`;
}

/**
 * Estrae i termini effettivamente negati ("non in tessuto" → tessuto).
 * Preposizioni, articoli e parole di raccordo non diventano esclusioni.
 */
export function estraiEsclusioniPino(testo: string): string[] {
  const q = String(testo ?? "");
  if (!q.trim()) return [];
  const regex = new RegExp(sorgenteClausolaEsclusione(), "gi");
  const esclusioni: string[] = [];
  for (const occorrenza of q.matchAll(regex)) {
    const voce = String(occorrenza[1] ?? "").trim().toLowerCase();
    if (!voce || PAROLE_NON_ESCLUSIONE.has(voce)) continue;
    esclusioni.push(voce);
  }
  return Array.from(new Set(esclusioni)).slice(0, 5);
}

/** Rimuove dalla query le clausole di esclusione già estratte. */
export function rimuoviClausoleEsclusionePino(testo: string): string {
  return String(testo ?? "").replace(new RegExp(sorgenteClausolaEsclusione(), "gi"), " ");
}

export function pianoLocaleIntelligente(query: string, analisi: PinoIntentAnalysis): PinoSemanticPlan | null {
  const q = correggiErroriBattitura(normalizzaRichiesta(query)).trim();
  if (!q) return null;
  const match = CANONICI_RICERCA.find((x) => x.pattern.test(q));
  const haEsclusioneAlcol = /\b(?:non|senza)\s+(?:alcol(?:ica|ico)?|alcol)\b|\banalcolic(?:a|o|he|i)\b/i.test(q);
  const haPrezzo = /\b(?:budget(?:\s+di)?|sotto|sopra|massimo|minimo|meno di|piu di|più di|entro|fino a|tra|under|below|up to|over|above|more than|less than|between)\b/i.test(q) || /\b(?:ho|con|dispongo di|a disposizione(?: di)?)\s*(?:€\s*)?\d+(?:[.,]\d+)?\s*(?:euro|euros|eur)\b/i.test(q) || /(?:€\s*)\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*(?:euro|euros|eur)\b/i.test(q);
  if (!match && !haEsclusioneAlcol && !haPrezzo && analisi.confidence === "bassa") return null;

  // I vincoli NON fanno parte della query di retrieval. Prezzo, negazioni,
  // apertura e città vengono estratti separatamente, altrimenti il gate di
  // pertinenza potrebbe richiedere termini come "sotto" o "100" dentro al
  // prodotto e restituire zero risultati.
  // Unico estrattore condiviso con il fallback: nessuna seconda interpretazione.
  const { minPrice, maxPrice } = estraiPrezzoEsplicitoPino(q);

  // Negazione generica: "non nere", "senza glutine", "non in tessuto" ecc.
  // Catturiamo il termine negato saltando preposizioni e articoli: "non nere
  // eleganti" esclude "nere" e mantiene "eleganti" come attributo positivo.
  const esclusioni = estraiEsclusioniPino(q);

  let city: string | null = null;
  const cittaNota = estraiCitta(q);
  if (cittaNota && new RegExp("\\b(?:a|in)\\s+" + cittaNota + "\\b", "i").test(q)) {
    city = cittaNota;
  }

  // Costruiamo la query sostanziale eliminando SOLO i vincoli già estratti.
  // Gli attributi positivi restano: "scarpe da uomo eleganti" deve continuare
  // a cercare scarpe da uomo eleganti, non solo "scarpe".
  let termine = q
    // Remove English conversational framing before single-token cleanup:
    // otherwise stripping the standalone "i" from "I'm" leaves an orphan "'m".
    .replace(/\b(?:i am looking for|i['’]m looking for|im looking for|looking for|i would like|i'd like|id like|i want|i need|can you find|could you find|find me|show me|help me find|please find|please show)\b/gi, " ")
    // La domanda sul prezzo è una cornice linguistica, non parte del nome
    // cercato: "quanto costa la cipolla?" deve interrogare il catalogo per
    // "cipolla", non per le parole "quanto/costa".
    .replace(/\bquanto\s+(?:costa|costano|viene|vengono|vale|valgono)\b/gi, " ")
    .replace(/\b(?:prezzo|prezzi)\s+(?:di|del|della|dei|degli|delle)?\b/gi, " ")
    .replace(/\b(?:aperto|aperta|aperti|aperte)\s+(?:ora|adesso)\b|\b(?:open|opened)\s+(?:right\s+)?now\b|\bcurrently\s+open\b|\bopen\s+at\s+the\s+moment\b/gi, " ")
    .replace(/\b(?:ora|adesso)\b/gi, " ")
    // Punteggiatura residua ("regalo,"): non è una keyword di catalogo e
    // sporcherebbe la query mostrata all'utente.
    .replace(/[,;:]+/g, " ");

  // Vincoli economici (italiano e inglese): la stessa pulizia del fallback,
  // così nessuna clausola resta nella query di retrieval.
  termine = rimuoviClausolePrezzoPino(termine);

  // Le clausole di esclusione non sono keyword di ricerca: vanno rimosse
  // insieme ai connettori ("non in tessuto" non deve lasciare né "non" né
  // "in" nella query di retrieval).
  termine = rimuoviClausoleEsclusionePino(termine);

  if (city) {
    const escapedCity = city.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    termine = termine.replace(
      new RegExp("\\b(?:a|in)\\s+" + escapedCity + "\\b", "gi"),
      " "
    );
  }

  termine = termine
    .replace(/\b(?:voglio|vorrei|cerco|cerca|trovami|mi serve|fammi trovare|dammi|ho|anzi|invece|pero|però|delle|degli|del|della|dei|una|un|uno|il|lo|la|i|gli|le)\b/gi, " ")
    // Preposizioni/connettivi orfani rimasti dopo aver tolto l'importo
    // ("orologio con", "orologio da"): non sono keyword di catalogo.
    .replace(/\s+\b(?:con|da|di|a|per|circa|entro|fino|e)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  termine = normalizzaQueryCatalogo(termine);

  if (match) termine = normalizzaQueryCatalogo(termine.replace(match.pattern, match.termine)).trim();
  // Se non resta alcun termine di catalogo (es. "ho 99 euro", "budget di
  // 100 euro"), la query è vuota: non reimmettiamo la frase di budget.
  if (!termine) termine = match?.termine ?? "";

  // "analcolica" resta una caratteristica positiva; la regola speciale del
  // retrieval la tratta correttamente senza escludere le vere analcoliche.
  if (haEsclusioneAlcol && !esclusioni.some((e) => /\balcol/i.test(e))) {
    esclusioni.push("alcolica");
  }

  const openNow = richiestaApertaOra(q);

  const intent = match?.intent ?? analisi.intent;
  // "aperto ora" su un'attività (pizzeria, farmacia, …) è una ricerca di
  // negozi. Le altre richieste restano guidate dall'intent: i flag
  // usaNegozi/usaProdotti valgono true quasi sempre, quindi usarli in
  // precedenza classificherebbe come "both" anche le query di catalogo
  // ("scarpe da uomo eleganti" deve restare "products").
  const surface: PinoSemanticPlan["surface"] =
    openNow && analisi.usaNegozi ? "stores" :
    intent === "service" ? "stores" :
    intent === "generic" ? "none" : "products";

  return {
    surface,
    intent,
    query: termine.slice(0, 120),
    terms: Array.from(
      new Set([termine, ...(match ? [match.termine] : [])].filter((t) => t && t.trim()))
    ).slice(0, 5),
    exclusions: esclusioni,
    minPrice,
    maxPrice,
    city,
    openNow,
    confidence: match || haEsclusioneAlcol || haPrezzo ? "alta" : analisi.confidence,
  };
}

export function fallbackPlan(query: string, analisi: PinoIntentAnalysis): PinoSemanticPlan {
  const q = normalizzaRichiesta(query);
  // Stesso estrattore del piano locale: le preposizioni non sono esclusioni e
  // non restano nella query ("non in tessuto" → tessuto, query senza clausola).
  const exclusions = estraiEsclusioniPino(q);
  const qCatalogo = normalizzaQueryCatalogo(
    rimuoviClausolePrezzoPino(rimuoviClausoleEsclusionePino(q))
  );
  const tokens = qCatalogo
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .filter((t) => !/^(cerco|cerca|trovami|trova|vorrei|voglio|mi|serve|anzi|invece|pero|però|un|una|uno|per|con|di|a|da|il|lo|la|i|gli|le|e|in|su|del|della|dei|delle|sotto|sopra|massimo|minimo|inferiore|superiore|almeno|entro|oltre|non|euro)$/.test(t));
  const { minPrice, maxPrice } = estraiPrezzoEsplicitoPino(q);
  const openNow = richiestaApertaOra(q);
  const surface =
    openNow && analisi.usaNegozi ? "stores" :
    analisi.intent === "service" ? "stores" :
    analisi.intent === "generic" ? "none" :
    "both";

  return {
    surface,
    intent: analisi.intent,
    query: tokens.slice(0, 3).join(" "),
    terms: tokens.slice(0, 5),
    exclusions,
    minPrice,
    maxPrice,
    city: null,
    openNow,
    confidence: analisi.confidence,
  };
}

export async function interpretaRichiestaPino(
  query: string,
  history: MessaggioAssistente[],
  analisi: PinoIntentAnalysis,
  memoria: PinoMemoriaVoce[],
  stato?: PinoConversationState,
  budget?: BudgetGeminiPino
): Promise<PinoSemanticPlan> {
  // Lo stato strutturato è la fonte prioritaria per le conversazioni
  // multi-turno. La memoria semantica viene applicata comunque dopo la
  // ricostruzione dello stato, così una correzione consolidata resta utilizzabile.
  const richiestaDaStato =
    stato?.attivo && stato.richiesta
      ? stato.richiesta
      : query;
  const queryConMemoria = applicaMemoriaSemantica(richiestaDaStato, memoria);
  const q = queryConMemoria.trim();
  // Se la memoria ha trasformato un termine non riconosciuto in un concetto
  // canonico, ricalcoliamo l'intento sul testo normalizzato.
  const analisiEffettiva = q !== query.trim() ? analizzaIntentoPino(q) : analisi;
  const fallback = fallbackPlan(q, analisiEffettiva);

  if (!q || (analisiEffettiva.intent === "generic" && q.length < 12 && rilevaLinguaPino(q) !== "en")) return fallback;

  // Il piano locale resta un fallback rapido e sicuro, non un veto alla
  // comprensione AI: le richieste nuove o colloquiali devono poter arrivare
  // al planner multilingue anche quando una regex ha già riconosciuto il prezzo.
  const fastPlan = pianoLocaleIntelligente(q, analisiEffettiva);

  // A clear English product request with an explicit numeric price constraint
  // is already fully parsed locally. Keep that deterministic subject and
  // budget instead of allowing an LLM paraphrase to reintroduce fragments
  // such as "'m pasta under" into the catalog query.
  if (
    fastPlan &&
    rilevaLinguaPino(q) === "en" &&
    fastPlan.surface === "products" &&
    (fastPlan.intent === "product" || fastPlan.intent === "food" || fastPlan.intent === "drink") &&
    (fastPlan.maxPrice !== null || fastPlan.minPrice !== null) &&
    fastPlan.confidence !== "bassa" &&
    fastPlan.query.trim()
  ) {
    return fastPlan;
  }

  const memoriaTesto = memoria.slice(0, 4)
    .map((m) => `${m.termine}=>${m.concetto}`)
    .join(", ") || "nessuna";

  try {
    const storico = history
      .slice(-6)
      .map((m) => `${m.role}: ${m.content.slice(0, 240)}`)
      .join("\n");

    // M6-B1 — Budget condiviso con la selezione dei tool: a budget esaurito
    // la chiamata non parte e vale il piano deterministico (catch sotto).
    const raw = await chiamataGeminiConBudgetPino(budget, () =>
      chiamaGeminiConBackup({
        systemPrompt: SCHEMA_PROMPT,
        userPrompt:
          `Intento locale già riconosciuto: ${analisi.intent} / ${analisi.dominio}.\n` +
          `Memoria semantica confermata: ${memoriaTesto}\n\n` +
          `CONVERSAZIONE:\n${storico}\n\nRICHIESTA ATTUALE:\n${q}`,
        maxTokens: 300,
        temperature: 0,
        json: true,
        // 4s: oltre questa soglia Gemini non è utile a questa richiesta e il
        // turno passa a Groq, che ha 6s propri.
        timeoutMs: 4_000,
        retries: 1,
      })
    );

    const parsed = JSON.parse(extractJsonFromText(raw)) as Record<string, unknown>;
    const surface =
      parsed.surface === "products" || parsed.surface === "stores" ||
      parsed.surface === "both" || parsed.surface === "none"
        ? parsed.surface
        : fallback.surface;
    const intent =
      parsed.intent === "product" || parsed.intent === "service" ||
      parsed.intent === "food" || parsed.intent === "drink" ||
      parsed.intent === "gift" || parsed.intent === "generic"
        ? parsed.intent
        : fallback.intent;

    const intentFinal = analisiEffettiva.confidence === "alta" ? analisiEffettiva.intent : intent;
    const terms = pulisciLista(parsed.terms, 5)
      .map((termine) => normalizzaQueryCatalogo(termine))
      .filter(Boolean);
    const exclusions = pulisciLista(parsed.exclusions, 5);
    const minPrice = numeroValido(parsed.minPrice);
    const maxPrice = numeroValido(parsed.maxPrice);
    const city = typeof parsed.city === "string"
      ? normalizzaRichiesta(parsed.city).trim().slice(0, 60) || null
      : null;
    const queryPlan = (normalizzaQueryCatalogo(typeof parsed.query === "string" && parsed.query.trim() ? parsed.query : terms.length ? terms[0] : fallback.query) || fallback.query).slice(0, 120);

    return {
      surface: intentFinal === "service" ? "stores" : surface,
      intent: intentFinal,
      query: queryPlan,
      terms: terms.length ? terms : fallback.terms,
      exclusions,
      minPrice,
      maxPrice,
      city,
      openNow: parsed.openNow === true || fallback.openNow,
      confidence:
        parsed.confidence === "alta" || parsed.confidence === "media" || parsed.confidence === "bassa"
          ? parsed.confidence
          : fallback.confidence,
    };
  } catch (error) {
    console.warn("[pino-semantic] planner non disponibile, fallback locale:", error);
    return fastPlan ?? fallback;
  }
}
