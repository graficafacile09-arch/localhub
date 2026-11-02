import {
  attributoCanonicoPino,
  rilevaLinguaConversazionePino,
  rilevaLinguaPino,
  normalizzaQueryCatalogo,
} from "./understanding";
import { isExplicitFoodProductRequest, richiestaCinemaPino } from "./routing-policy";
import { rispostaIdentitaPino } from "./identity";
import { rispostaSalutoPino, rispostaRelazionalePino, rispostaPreferenzaLinguaPino } from "./greetings";
import { CATEGORIE_REGALO, isGenericGiftRequest, prodottoCorrispondeCategoriaRegalo } from "./gift-retrieval";
/**
 * LocalHub — Assistente AI: Orchestratore
 *
 * Flusso (2 chiamate LLM, come da analisi):
 *   1. comprensione intenzione + scelta dei tool (JSON) usando TUTTA la
 *      conversazione recente ("e sotto i 300?" viene risolto col contesto);
 *   2. esecuzione dei tool (retrieval su dati pubblici, riuso funzioni esistenti);
 *   3. contesto strutturato dei risultati → risposta finale dell'AI.
 *
 * Usa GEMINI_API_KEY (già presente nel progetto, usata anche dalla Vision),
 * modello GEMINI_MODEL (con fallback gemini-2.0-flash), timeout su ogni
 * chiamata, max_tokens e temperature. Fallback: se la selezione tool fallisce
 * → searchAll sulla domanda; se la risposta finale fallisce → elenco testuale
 * dei risultati recuperati. Nessuna scrittura su DB.
 *
 * @module lib/assistente/index
 */

import {
  searchStores,
  searchProducts,
  searchOffers,
  searchEvents,
  getCategoriesList,
  searchAll,
  getWeatherCastrovillari,
  searchPharmacies,
  orariPerNegozi,
  ordinaProdottiPerBudget,
  rilevaBudgetIndicativoPino,
  prezzoNumerico,
  filtraProdottiPerAttributiPino,
  filtraProdottiPerDisponibilitaPino,
  notaDisponibilitaProdottiPino,
  rilevaRichiestaServizioPino,
  serviziRichiestiPino,
  type AttributiProdottoPino,
  type EsitoAttributiProdottiPino,
  type RichiestaServizioPino,
  type ServizioAttivoPino,
  type ToolParams,
} from "./tools";
import {
  SYSTEM_PROMPT,
  buildToolSelectionPrompt,
  buildContextoRisultati,
  buildFinalPrompt,
  type RisultatiRecuperati,
} from "./prompt";
import { extractJsonFromText } from "@/lib/product-assistant/providers/utils";
import { callGeminiText } from "@/lib/ai/gemini-text";
import { isAttractionNameQuery, searchAttractions } from "./attrazioni";
import { normalizza } from "@/lib/text-utils";
import type { NegozioRicerca, ProdottoRicerca } from "@/lib/ricerca-ai";
import { pianoIntentoLocale } from "./local-intents";
import {
  analizzaIntentoPino,
  pianoIntento,
  descriviIntento,
  type PinoIntent,
  type PinoIntentAnalysis,
} from "./intent";
import { recuperaMemoria, registraEsitoMemoria } from "./memoria";
import {
  rilevaDomandaAggregata,
  risolviSoggettoAggregato,
  prodottoCorrispondeQualificatore,
  componiRispostaAggregata,
} from "./aggregata";
import {
  analizzaComprensionePino,
  arricchisciRichiestaConContesto,
  costruisciStatoConversazionale,
  fallbackPlan,
  fondiVincoliPino,
  interpretaRichiestaPino,
  usaFastPathSemantico,
  type PinoSemanticPlan,
} from "./semantica";
import type { PinoUnderstanding } from "./understanding";
import {
  rilevaFollowUp,
  soggettoPrecedente,
  apertoOra,
  motivoCategoria,
  type FollowUp,
  type FollowUpTipo,
} from "./conversazione";

// ─── Tipi pubblici ───────────────────────────────────────────────────────────

export type MessaggioAssistente = {
  role: "user" | "assistant";
  content: string;
};

export interface RispostaAssistente {
  risposta: string;
  negozi: NegozioRicerca[];
  prodotti: ProdottoRicerca[];
  processingMs: number;
  source: "assistente";
  /** Intento riconosciuto da Pino Intent Layer v1 (osservabilità/test). */
  intent?: PinoIntent;
  /** Follow-up conversazionale applicato (Pino Conversazionale v1). */
  followUp?: FollowUpTipo;
}

// ─── Configurazione LLM ──────────────────────────────────────────────────────

export type ToolInvocation = {
  tool?: string;
  params?: ToolParams;
};

// ─── Chiamata Gemini con timeout e retry ────────────────────────────────────
// Il provider è centralizzato in lib/ai/gemini-text.ts (callGeminiText): usa
// GEMINI_API_KEY + GEMINI_MODEL, endpoint generateContent di Gemini, retry con
// backoff su 429/402 (quota) e timeout su ogni chiamata. L'assistente esegue
// fino a 2 chiamate LLM per messaggio, quindi i picchi brevi di quota sono
// gestiti dal retry interno.

// ─── Normalizzazione messaggi ────────────────────────────────────────────────

function normalizzaMessaggi(messages: MessaggioAssistente[]): MessaggioAssistente[] {
  return (messages ?? [])
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .slice(-12);
}

// ─── Esecuzione dei tool scelti dall'LLM ─────────────────────────────────────

async function eseguiTool(
  nome: string,
  params: ToolParams,
  fallbackQuery: string
): Promise<{
  negozi: NegozioRicerca[];
  prodotti: ProdottoRicerca[];
  offerte: Awaited<ReturnType<typeof searchOffers>>;
  eventi: Awaited<ReturnType<typeof searchEvents>>;
  categorie: Awaited<ReturnType<typeof getCategoriesList>>;
  meteo: Awaited<ReturnType<typeof getWeatherCastrovillari>>;
  farmacie: Awaited<ReturnType<typeof searchPharmacies>>;
}> {
  const vuoto = { negozi: [], prodotti: [], offerte: [], eventi: [], categorie: [], meteo: null, farmacie: [] };
  const limit = params?.limit;

  switch (nome) {
    case "searchStores":
    case "searchProducts": {
      // Se l'LLM non riporta il soggetto nei follow-up ("sotto 500 euro") o
      // passa una query che è solo un vincolo di prezzo, usiamo la query
      // sostanziale della conversazione (es. "cerco una TV").
      const q = params?.termini?.length
        ? (params.termini.join(" ") || fallbackQuery)
        : eQuerySostanziale(params?.query ?? "") || fallbackQuery;
      if (!q) return vuoto;
      if (nome === "searchStores") {
        return {
          ...vuoto,
          negozi: await searchStores(q, { ...params, limit }),
        };
      }
      return {
        ...vuoto,
        prodotti: await searchProducts(q, {
          ...params,
          limit,
          termini: undefined,
        }),
      };
    }
    case "searchOffers":
      // Query vuota = TUTTE le offerte attive (es. "ci sono offerte?").
      return { ...vuoto, offerte: await searchOffers(params?.query?.trim() || undefined, limit) };
    case "searchEvents":
      // Query vuota = TUTTI gli eventi attivi (es. "cosa c'è questo weekend?").
      return { ...vuoto, eventi: await searchEvents(params?.query?.trim() || undefined, limit) };
    case "searchAll": {
      const q = eQuerySostanziale(params?.query ?? "") || fallbackQuery;
      if (!q) return vuoto;
      const tutto = await searchAll(q, { ...params, limit });
      return tutto;
    }
    case "getCategories":
      return { ...vuoto, categorie: await getCategoriesList() };
    case "searchGiftCategories": {
      // S5.1 — Un'unica invocazione tool per gruppo di categorie regalo. Le
      // ricerche per singola categoria sono query INTERNE al contratto dello
      // strumento: non sono invocazioni tool aggiuntive e non superano il
      // limite globale di 3. Il filtro di categoria resta attivo per ogni
      // risultato, così nessun prodotto fuori tema riempie il gruppo.
      const categorie = Array.isArray(params?.termini) ? params.termini : [];
      const limiteCategoria = Math.max(
        1,
        Math.min(Math.floor(Number(params?.limit ?? 3)) || 3, 5)
      );
      const trovati: ProdottoRicerca[] = [];
      for (const categoria of categorie) {
        const risultati = await searchProducts(categoria, {
          ...params,
          query: categoria,
          termini: undefined,
          limit: limiteCategoria,
        });
        for (const prodotto of risultati) {
          if (!prodottoCorrispondeCategoriaRegalo(prodotto, categoria)) continue;
          if (!trovati.some((esistente) => esistente.id === prodotto.id)) trovati.push(prodotto);
        }
      }
      return { ...vuoto, prodotti: trovati };
    }
    case "getWeather":
      return { ...vuoto, meteo: await getWeatherCastrovillari() };
    case "searchPharmacies": {
      const stato =
        params?.stato === "aperte" || params?.stato === "turno" || params?.stato === "tutte"
          ? params.stato
          : "turno";
      return { ...vuoto, farmacie: await searchPharmacies(stato, limit) };
    }
    default:
      return vuoto;
  }
}

/**
 * Vincoli del piano semantico da conservare nel fallback di ricerca completa.
 * Il fallback non deve diventare un percorso alternativo che aggira i filtri
 * della ricerca principale: esclusioni, budget, città e orari restano attivi.
 * Solo i valori realmente presenti vengono passati (nessuna proprietà inventata).
 */
export function parametriFallbackPiano(
  semantica?: PinoSemanticPlan,
  comprensione?: PinoUnderstanding,
  domanda?: string
): ToolParams {
  const params: ToolParams = {};
  if (semantica) {
    if (semantica.exclusions?.length) params.esclusioni = semantica.exclusions;
    if (semantica.maxPrice != null) params.maxPrice = semantica.maxPrice;
    if (semantica.minPrice != null) params.minPrice = semantica.minPrice;
    if (semantica.city) params.citta = semantica.city;
    if (semantica.openNow) params.apertiOra = true;
  }
  // S4.1: se il piano non è disponibile (planner spento o fallito) i vincoli
  // riconosciuti dal contratto restano attivi anche nel fallback: nessuna
  // ricerca "pulita" che reintroduca esclusioni o budget già riconosciuti.
  // Gli importi passano dalla stessa validazione di `fondiVincoliPino`, così
  // nessun prezzo pari a zero o non numerico diventa un vincolo.
  if (comprensione) {
    const daComprensione = fondiVincoliPino(undefined, comprensione);
    if (!params.esclusioni?.length && daComprensione.esclusioni.length > 0) {
      params.esclusioni = daComprensione.esclusioni;
    }
    if (params.maxPrice == null && daComprensione.maxPrice != null) {
      params.maxPrice = daComprensione.maxPrice;
    }
    if (params.minPrice == null && daComprensione.minPrice != null) {
      params.minPrice = daComprensione.minPrice;
    }
    // S4.3: colore e materiale restano attivi anche nel fallback.
    const attributi = attributiProdottiPino(comprensione, domanda);
    if (attributi) {
      if (attributi.colori?.length) params.colori = attributi.colori;
      if (attributi.materiali?.length) params.materiali = attributi.materiali;
    }
  }
  return params;
}

/**
 * S4.3 — Attributi dei prodotti che Pino trasferisce ai tool.
 *
 * Solo colore e materiale diventano filtri in questa fase (D-4); destinatario,
 * taglia, genere e provenienza restano nel contratto senza diventare vincoli.
 * Restituisce `null` quando non c'è nulla da applicare, così le richieste senza
 * attributi non ricevono parametri aggiuntivi.
 */
const RE_ATTRIBUTO_NEGATO =
  /\b(?:non|senza|not|without|no)\s+(?:in\s+|di\s+|il\s+|lo\s+|la\s+|the\s+)?([a-z\u00e0-\u00ff]+)/gi;

export function attributiProdottiPino(
  comprensione?: PinoUnderstanding,
  domanda?: string
): AttributiProdottoPino | null {
  // Un attributo negato dall'utente ("non in tessuto") è un'esclusione, non un
  // requisito: senza questa sottrazione il filtro accetterebbe proprio il
  // materiale che la richiesta rifiuta. Fonti: esclusioni del piano e
  // negazioni esplicite nella richiesta stessa.
  //
  // S6.1: il confronto passa dalla forma canonica del vocabolario
  // ("nere" → "nero", "leather" → "pelle"). Con il confronto alla lettera
  // "scarpe non nere" lasciava "nero" tra i requisiti positivi, perché
  // l'esclusione arrivava nella forma flessa usata dall'utente.
  const esclusi = new Set<string>();
  const aggiungiEsclusione = (voce: unknown) => {
    const testo = String(voce ?? "").trim().toLowerCase();
    if (!testo) return;
    esclusi.add(testo);
    const canonico = attributoCanonicoPino(testo);
    if (canonico) esclusi.add(canonico);
  };
  for (const voce of comprensione?.esclusioni ?? []) aggiungiEsclusione(voce);
  if (domanda) {
    for (const occorrenza of domanda.matchAll(RE_ATTRIBUTO_NEGATO)) {
      aggiungiEsclusione(occorrenza[1]);
    }
  }
  const colori = (comprensione?.attributi.colori ?? []).filter((voce) => !esclusi.has(voce));
  const materiali = (comprensione?.attributi.materiali ?? []).filter(
    (voce) => !esclusi.has(voce)
  );
  const attributi: AttributiProdottoPino = {};
  if (colori.length > 0) attributi.colori = colori;
  if (materiali.length > 0) attributi.materiali = materiali;
  return attributi.colori || attributi.materiali ? attributi : null;
}

/**
 * Trasferisce gli attributi alle invocazioni che leggono il catalogo prodotti,
 * qualunque sia la loro origine (piano locale, LLM, fan-out dei regali).
 * Gli altri strumenti restano invariati.
 */
export function applicaAttributiProdottiPino(
  invocazioni: ToolInvocation[],
  comprensione?: PinoUnderstanding,
  domanda?: string
): ToolInvocation[] {
  const attributi = attributiProdottiPino(comprensione, domanda);
  if (!attributi) return invocazioni;
  return invocazioni.map((invocazione) =>
    invocazione.tool === "searchProducts" ||
    invocazione.tool === "searchAll" ||
    invocazione.tool === "searchGiftCategories"
      ? { ...invocazione, params: { ...(invocazione.params ?? {}), ...attributi } }
      : invocazione
  );
}

// ─── S4.5: richieste di servizio, ricerca e risposta ────────────────────────

/** Negozio con i servizi trovati da `searchStores` (proprietà extra del tool). */
type NegozioConServiziPino = NegozioRicerca & {
  serviziTrovati?: ServizioAttivoPino[];
  /** Servizi richiesti dichiarati dall'attività, ma senza record strutturato. */
  serviziNonDichiarati?: string[];
};

/**
 * Quando la richiesta è di un servizio, il catalogo da interrogare è quello
 * delle attività: le invocazioni di prodotti vengono sostituite (nessun
 * prodotto casuale, nessun negozio fuori tema) da una sola `searchStores` con
 * il servizio riconosciuto. Il soggetto attività, se c'è, resta la query.
 */
export function invocazioniConServizioPino(
  invocazioni: ToolInvocation[],
  richiesta: RichiestaServizioPino | null,
  vincoli: { esclusioni?: string[]; citta?: string | null } = {}
): ToolInvocation[] {
  if (!richiesta) return invocazioni;
  const params: ToolParams = {
    servizio: richiesta.servizio,
    limit: 8,
  };
  if (richiesta.attivita) params.query = richiesta.attivita;
  if (vincoli.esclusioni?.length) params.esclusioni = vincoli.esclusioni;
  if (vincoli.citta) params.citta = vincoli.citta;
  return [{ tool: "searchStores", params }];
}

function formattaPrezzoServizioPino(prezzo: number | null | undefined): string | null {
  if (prezzo == null) return null;
  const numero = Number(prezzo);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return `€${numero}`;
}

/**
 * Risposta deterministica per le richieste di servizio: usa SOLO i servizi
 * restituiti dal tool. Prezzo e durata mancanti sono dichiarati come tali e
 * mai attribuiti al negozio o a un altro servizio.
 */
export function rispostaServizioPino(
  negozi: NegozioRicerca[],
  servizio: string,
  lingua: "it" | "en" = "it"
): string {
  const inglese = lingua === "en";
  // S6.1/P2: una richiesta può chiedere più servizi ("taglio e barba"). Ogni
  // servizio resta un'unità distinta: la risposta non somma prezzi, non
  // attribuisce la durata di uno all'altro e dichiara separatamente ciò che
  // l'attività non dettaglia.
  const richiesti = serviziRichiestiPino(servizio);
  const righe: string[] = [];
  for (const negozio of (negozi ?? []).slice(0, 8)) {
    const nome = String(negozio?.nome ?? "").trim();
    if (!nome) continue;
    const trovati = ((negozio as NegozioConServiziPino).serviziTrovati ?? []).filter(
      (voce) => voce && String(voce.nome ?? "").trim()
    );
    const dettagli = trovati.map((voce) => {
      const prezzo = formattaPrezzoServizioPino(voce.prezzo);
      const durata =
        voce.durataMin != null && Number.isFinite(Number(voce.durataMin)) && Number(voce.durataMin) > 0
          ? (inglese ? `about ${Number(voce.durataMin)} minutes` : `circa ${Number(voce.durataMin)} minuti`)
          : null;
      const parti = [
        prezzo ?? (inglese ? "price not stated" : "prezzo non indicato"),
        durata ?? (inglese ? "duration not stated" : "durata non indicata"),
      ];
      return `${String(voce.nome).trim()}: ${parti.join(" · ")}`;
    });
    // Solo per i servizi richiesti che l'attività non dettaglia: nessun prezzo
    // o durata inventati, e nessuna riga aggiunta quando l'attività non mostra
    // alcun servizio (in quel caso resta la formula "offre …").
    if (dettagli.length > 0) {
      for (const mancante of (negozio as NegozioConServiziPino).serviziNonDichiarati ?? []) {
        const etichetta = String(mancante ?? "").trim();
        if (!etichetta) continue;
        dettagli.push(
          `${etichetta}: ${inglese ? "price and duration not stated" : "prezzo e durata non indicati"}`
        );
      }
    }
    const descrizione = dettagli.length
      ? dettagli.join("; ")
      : (inglese ? `lists ${servizio}` : `offre ${servizio}`);
    righe.push(`- **${nome}** — ${descrizione}`);
  }

  if (righe.length === 0) return messaggioServizioNonTrovatoPino(servizio, lingua);
  const pluraleServizi = richiesti.length > 1;
  const apertura = inglese
    ? `I found ${righe.length} ${righe.length === 1 ? "business" : "businesses"} in the InCittà catalogue that ${pluraleServizi ? "list the requested services" : "list this service"}.`
    : `Ho trovato ${righe.length} attività nel catalogo InCittà che ${pluraleServizi ? "dichiarano i servizi richiesti" : "dichiara questo servizio"}.`;
  return `${apertura}\n\n${righe.join("\n")}`;
}

/**
 * Nessuna attività con il servizio richiesto: Pino parla di catalogo, non
 * dell'assenza del servizio in città, e non propone alternative casuali.
 */
export function messaggioServizioNonTrovatoPino(
  servizio: string,
  lingua: "it" | "en" = "it"
): string {
  return lingua === "en"
    ? `I couldn't find any business in the InCittà catalogue that lists "${servizio}". I can try a different area or a similar service.`
    : `Nel catalogo InCittà non ho trovato attività che dichiarino "${servizio}". Posso provare con un'altra zona o un servizio simile.`;
}

/**
 * Nota onesta sugli attributi: dichiara solo ciò che il catalogo permette di
 * verificare. Se il filtro ha azzerato i risultati, Pino parla di catalogo
 * InCittà e non afferma che il prodotto non esista in città; se alcuni
 * risultati non dichiarano il dato, non lo presenta come confermato.
 */
export function notaAttributiProdottiPino(
  esito: EsitoAttributiProdottiPino,
  comprensione?: PinoUnderstanding,
  lingua: "it" | "en" = "it",
  domanda?: string
): string | null {
  const attributi = attributiProdottiPino(comprensione, domanda);
  if (!attributi) return null;
  const elenco = [...(attributi.colori ?? []), ...(attributi.materiali ?? [])].join(", ");

  if (esito.prodotti.length === 0 && esito.esclusi > 0) {
    return lingua === "en"
      ? `I found no products in the InCittà catalogue matching ${elenco}. I can relax that filter or look for a similar item.`
      : `Nel catalogo InCittà non ho trovato prodotti compatibili con ${elenco}. Posso allargare la ricerca o cercare un prodotto simile.`;
  }

  const mancantiIt: string[] = [];
  const mancantiEn: string[] = [];
  if ((attributi.colori?.length ?? 0) > 0 && esito.senzaColore > 0) {
    mancantiIt.push("il colore");
    mancantiEn.push("the colour");
  }
  if ((attributi.materiali?.length ?? 0) > 0 && esito.senzaMateriale > 0) {
    mancantiIt.push("il materiale");
    mancantiEn.push("the material");
  }
  if (mancantiIt.length === 0) return null;
  return lingua === "en"
    ? `Some results do not state ${mancantiEn.join(" or ")} in the InCittà catalogue, so I can't confirm it.`
    : `Per alcuni risultati il catalogo InCittà non indica ${mancantiIt.join(" e ")}: non posso confermarlo.`;
}

// Ultima query "sostanziale" dell'utente: se il messaggio corrente è solo un
// vincolo/follow-up ("sotto 500 euro", "e sotto i 300?", "più economico"),
// usa la richiesta precedente come soggetto della ricerca.
const RE_VINCOLO = /^(e\s+)?(budget(?:\s+di)?|sotto|sopra|massimo|minimo|meno di|più di|piu di|più economico|piu economico|che altro|più caro|piu caro|oltre|fino a|tra|under|below|up to|over|above|less than|more than|cheaper|more expensive|what else|only open|open now)\b/i;

// Intenzione salute → farmacia: usata anche nella risposta deterministica.
const REQUIRES_PHARMACY_REASON =
  /\bfebbre\b|\btemperatura alta\b|\bmal di gola\b|\braffreddore\b|\binfluenza\b|\btosse\b|\bfever\b|\bsore throat\b|\bcold\b|\bflu\b|\bcough\b/i;

function eQuerySostanziale(q: string): string | null {
  const t = q.trim();
  if (!t || t.length <= 3) return null;
  if (RE_VINCOLO.test(t)) return null;
  const parole = t.split(/\s+/);
  const soloVincoli = parole.every((p) =>
    /^(e|and|under|below|up|to|over|above|less|than|more|sotto|sopra|massimo|minimo|minore|fino|oltre|più|piu|di|a|da|tra|euro|euros|dollars|dollar|€|\$|\d+)$/i.test(p)
  );
  if (soloVincoli) return null;
  return t;
}

function ultimaQuerySostanziale(storico: MessaggioAssistente[]): string {
  const utenti = storico.filter((m) => m.role === "user").map((m) => m.content);
  const ultima = utenti[utenti.length - 1] ?? "";
  if (utenti.length >= 2) {
    const precedente = utenti[utenti.length - 2];
    if (!eQuerySostanziale(ultima)) return precedente;
  }
  return ultima;
}

export function nomiGiaMostrati(storico: MessaggioAssistente[]): string[] {
  const nomi = new Set<string>();
  for (const messaggio of storico.filter((m) => m.role === "assistant")) {
    const testo = messaggio.content ?? "";
    const regex = /^-\s+\*\*([^*]+)\*\*/gim;
    for (const match of testo.matchAll(regex)) {
      const nome = (match[1] ?? "").trim();
      if (nome) nomi.add(nome.toLowerCase());
    }
  }
  return Array.from(nomi);
}

// Guardie deterministiche per le intenzioni CHIARE: garantiscono che "ci sono
// offerte?", "cosa c'è questo weekend?", "voglio mangiare", "va bene" e
// "che cos'è InCittà?" scelgano SEMPRE il tool/risposta giusti, senza
// affidarsi alla disciplina del modello. Per tutto il resto decide l'LLM.
/**
 * S6.2 — Richiesta breve di prodotto con un'esclusione esplicita.
 *
 * "borsa without leather" non ha formule introduttive: la confidenza lessicale
 * resta bassa e il planner locale non produce un piano affidabile. La
 * comprensione ha però già soggetto di catalogo ed esclusione, quindi il
 * percorso ordinario dei prodotti è determinabile senza LLM: una sola
 * invocazione `searchProducts`, con esclusioni canoniche ("leather" → "pelle").
 *
 * Restituisce `null` quando il caso non ricorre, così il comportamento delle
 * altre richieste resta invariato.
 */
export function pianoProdottoEsclusionePino(
  analisi: PinoIntentAnalysis,
  semantica?: PinoSemanticPlan,
  richiesta?: string
): ToolInvocation[] | null {
  if (analisi.confidence !== "bassa") return null;
  if (analisi.intent === "generic" || analisi.intent === "service") return null;
  // Luoghi e attrazioni non sono prodotti: il loro percorso deterministico
  // (cinema, guida Attrazioni) resta prioritario anche con un'esclusione.
  if (richiesta && (richiestaGuidaAttrazioniPino(richiesta) || richiestaCinemaPino(richiesta))) {
    return null;
  }
  // Piano con esclusioni già riconosciute oppure piano locale deterministico
  // (stesso fallback usato dal planner quando Gemini non è disponibile).
  const piano =
    semantica && semantica.exclusions.length > 0
      ? semantica
      : richiesta?.trim()
        ? fallbackPlan(richiesta, analisi)
        : null;
  if (!piano) return null;
  // Le richieste di attività restano sul loro percorso (servizi/negozi).
  if (piano.surface === "stores" || piano.surface === "none") return null;
  const query = piano.query.trim();
  if (!query) return null;
  const esclusioni = Array.from(
    new Set(
      piano.exclusions
        .map((voce) => attributoCanonicoPino(voce) ?? String(voce ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (esclusioni.length === 0) return null;
  return [
    {
      tool: "searchProducts",
      params: { query, limit: 8, esclusioni },
    },
  ];
}

function pianoPredefinito(
  storico: MessaggioAssistente[],
  analisi: PinoIntentAnalysis,
  semantica?: PinoSemanticPlan,
  richiestaContestuale?: string
): { directReply: string | null; tools: ToolInvocation[]; followUp?: FollowUp } | null {
  const utenti = storico.filter((m) => m.role === "user").map((m) => m.content);
  const ultimo = (utenti[utenti.length - 1] ?? "").trim().toLowerCase();
  const inglese = rilevaLinguaConversazionePino(storico) === "en";
  if (!ultimo) return null;

  const RE_PIATTAFORMA =
    /che cos'è incittà|che cos'e incitta|cos'è incittà|come funziona|cos'è il sito|what is incitta|what is incittà|how does incitta work|how does incittà work|what is this site/;

  // Meteo e farmacie: riconoscimento UNICO e condiviso con il router della
  // barra di ricerca (lib/assistente/local-intents.ts), che normalizza accenti
  // e apostrofi. Con regex locali non normalizzate "com'è il tempo" scivolava
  // al planner LLM e la risposta elencava prodotti di catalogo assurdi.
  const pianoLocale = pianoIntentoLocale(utenti[utenti.length - 1] ?? "");

  if (pianoLocale?.tool === "getWeather") {
    return {
      directReply: null,
      tools: [{ tool: "getWeather", params: {} }],
    };
  }

  if (pianoLocale?.tool === "searchPharmacies") {
    // stato già deciso dal riconoscimento condiviso: "aperte" = solo farmacie
    // con stato realmente aperto, "turno" = solo con turno realmente
    // valorizzato (e per i sintomi). Mai una farmacia presunta.
    return {
      directReply: null,
      tools: [
        {
          tool: "searchPharmacies",
          params: { stato: pianoLocale.stato, limit: 8 },
        },
      ],
    };
  }
  const RE_OFFERTE = /\bofferte\b|\bpromozion|\bsconti?\b|\bsaldo\b|\bsaldi\b|\boffers?\b|\bdeals?\b|\bdiscounts?\b|\bsales?\b/;
  const RE_EVENTI =
    /\beventi?\b|weekend|fine settimana|manifestazion|in programma|cosa c'è|cosa c'e|cosa succede|\bmostra\b|\bconcerto\b|\bfiera\b|\bevents?\b|what'?s on|what is on|\bconcerts?\b|\bfestivals?\b|\bexhibitions?\b/;
  const RE_CHIACCHIERA =
    /^(va bene|ok|okay|perfetto|grazie|grazie mille|ciao|buongiorno|buonasera|hi|hello|hey|thanks|thank you|perfect|good|great|goodbye|bye|see you|good morning|good evening|good afternoon|sure)$/;

  const rispostaIdentita = rispostaIdentitaPino(utenti[utenti.length - 1] ?? "");
  if (rispostaIdentita) {
    return { directReply: rispostaIdentita, tools: [] };
  }

  if (RE_PIATTAFORMA.test(ultimo)) {
    return {
      directReply: /\b(what|how)\b/i.test(ultimo)
        ? "InCittà is the local platform for your city. It brings together local businesses, products and prices, offers and promotions, events and useful information. You can search for businesses, compare products, check opening hours and contact local shops."
        : "InCittà è la piattaforma locale della tua città: raccoglie le attività commerciali del territorio con i loro negozi, prodotti e prezzi, offerte e promozioni, eventi e manifestazioni. Puoi cercare attività, confrontare prodotti, vedere orari e contatti e contattare i negozi direttamente.",
      tools: [],
    };
  }
  if (RE_OFFERTE.test(ultimo)) {
    // params vuoti = TUTTE le offerte attive (query non specificata)
    return { directReply: null, tools: [{ tool: "searchOffers", params: {} }] };
  }
  if (RE_EVENTI.test(ultimo)) {
    // params vuoti = TUTTI gli eventi attivi (query non specificata)
    return { directReply: null, tools: [{ tool: "searchEvents", params: {} }] };
  }
  if (RE_CHIACCHIERA.test(ultimo)) {
    return {
      directReply: inglese
        ? "Sure! I'm here to help you find local shops, products, offers and events. What are you looking for?"
        : "Va bene, sono qui! Posso aiutarti a trovare negozi, prodotti, offerte ed eventi nella tua città. Dimmi pure cosa cerchi.",
      tools: [],
    };
  }

  // ── Pino Conversazionale v1: follow-up sul risultato precedente ───────────
  // Una richiesta BREVE ("solo aperti ora", "solo economici", "fammi vedere
  // altro", "vicino a me"...) NON deve diventare una ricerca generica: mantiene
  // il SOGGETTO della richiesta precedente e ne modifica i risultati. Il filtro
  // viene applicato DOPO il recupero (vedi rispostaFollowUp).
  const followUp = rilevaFollowUp(ultimo);
  if (followUp && utenti.length >= 2 && (analisi.intent === "generic" || analisi.confidence === "bassa")) {
    const soggetto = soggettoPrecedente(utenti);
    if (soggetto) {
      // Se il soggetto precedente era una lista di offerte/eventi, il follow-up
      // resta su quella superficie (non su negozi/prodotti).
      if (RE_OFFERTE.test(soggetto)) {
        return { directReply: null, tools: [{ tool: "searchOffers", params: {} }], followUp };
      }
      if (RE_EVENTI.test(soggetto)) {
        return { directReply: null, tools: [{ tool: "searchEvents", params: {} }], followUp };
      }
      const analisiPrec = analizzaIntentoPino(soggetto);
      // "fammi vedere altro" allarga il recupero per poter mostrare opzioni
      // diverse da quelle già elencate.
      const limiteAlto = followUp.tipo === "altro" ? 20 : undefined;
      const giaMostrati = followUp.tipo === "altro" ? nomiGiaMostrati(storico) : [];

      // Mantieni la superficie PRODOTTI anche nei follow-up di una ricerca
      // alimentare esplicita: "Show me more" non deve trasformarsi in negozi.
      if (isExplicitFoodProductRequest(soggetto)) {
        return {
          directReply: null,
          tools: [{
            tool: "searchProducts",
            params: {
              query: normalizzaQueryCatalogo(soggetto),
              limit: limiteAlto ?? 8,
              ...(limiteAlto ? { escludiNomi: giaMostrati } : {}),
            },
          }],
          followUp,
        };
      }

      let tools: ToolInvocation[] = [];
      if (analisiPrec.intent !== "generic" && analisiPrec.confidence !== "bassa") {
        tools = pianoIntento(analisiPrec, soggetto).map((t) => ({
          tool: t.tool,
          params: {
            query: t.query,
            ...(limiteAlto
              ? { limit: limiteAlto, escludiNomi: giaMostrati }
              : t.tool === "searchProducts"
                ? { limit: 8 }
                : {}),
          },
        }));
      }
      if (tools.length === 0) {
        tools = [
          {
            tool: "searchStores",
            params: {
              query: soggetto,
              ...(limiteAlto ? { limit: limiteAlto, escludiNomi: giaMostrati } : {}),
            },
          },
          {
            tool: "searchProducts",
            params: {
              query: soggetto,
              limit: limiteAlto ?? 8,
              ...(limiteAlto ? { escludiNomi: giaMostrati } : {}),
            },
          },
        ];
      }
      return { directReply: null, tools, followUp };
    }
  }

  // Una richiesta esplicita di un alimento come bene da acquistare deve
  // interrogare il catalogo prodotti, non aggiungere automaticamente panifici
  // e ristoranti. Questo evita che una ricerca "pasta" diventi una lista negozi.
  if (isExplicitFoodProductRequest(ultimo)) {
    const queryProdotto = semantica?.query?.trim() || normalizzaQueryCatalogo(ultimo);
    return {
      directReply: null,
      tools: [{
        tool: "searchProducts",
        params: {
          query: queryProdotto,
          maxPrice: semantica?.maxPrice,
          minPrice: semantica?.minPrice,
          esclusioni: semantica?.exclusions,
          limit: 8,
        },
      }],
    };
  }

  // ── Pino Semantic Planner v2 ─────────────────────────────────────────────
  // Per richieste naturali/composte il planner trasforma il linguaggio umano
  // in un piano strutturato: soggetto + sinonimi + prezzo + esclusioni +
  // città + "aperto ora". I tool restano deterministici e grounded.
  if (semantica && semantica.confidence !== "bassa" && semantica.query) {
    const base = semantica.query;
    const paramsBase: ToolParams = {
      query: base,
      citta: semantica.city ?? undefined,
      esclusioni: semantica.exclusions.length ? semantica.exclusions : undefined,
      apertiOra: semantica.openNow || undefined,
      maxPrice: semantica.maxPrice,
      minPrice: semantica.minPrice,
      limit: 8,
    };

    if (semantica.surface === "stores") {
      return {
        directReply: null,
        tools: [{ tool: "searchStores", params: paramsBase }],
      };
    }

    if (semantica.surface === "products") {
      return {
        directReply: null,
        tools: [{ tool: "searchProducts", params: paramsBase }],
      };
    }

    if (semantica.surface === "both") {
      const tools: ToolInvocation[] = [
        { tool: "searchProducts", params: paramsBase },
        { tool: "searchStores", params: { ...paramsBase, maxPrice: undefined, minPrice: undefined } },
      ];
      return { directReply: null, tools };
    }
  }

  // Follow-up con vincolo di prezzo ("sotto 500 euro", "massimo 100 euro"):
  // riusa il SOGGETTO della richiesta precedente con maxPrice, così il
  // contesto viene mantenuto in modo deterministico.
  if (utenti.length >= 2) {
    const precedente = utenti[utenti.length - 2] ?? "";
    const prezzo = ultimo.match(/(\d{1,6})/)?.[1];
    if (prezzo && RE_VINCOLO.test(ultimo)) {
      const soggetto = eQuerySostanziale(precedente) ?? precedente;
      if (soggetto) {
        return {
          directReply: null,
          tools: [
            {
              tool: "searchProducts",
              params: { query: soggetto, maxPrice: parseInt(prezzo, 10) },
            },
          ],
        };
      }
    }
  }

  // Follow-up con vincolo di città ("solo a Castrovillari"): riusa il SOGGETTO
  // precedente filtrando per città (mantiene il contesto della ricerca).
  if (utenti.length >= 2) {
    const precedente = utenti[utenti.length - 2] ?? "";
    const mCitta = ultimo.match(/solo\s+a\s+([a-zà-ù0-9\s-]+)/i);
    const citta = mCitta
      ? mCitta[1].trim().replace(/\s+.*/, "").toLowerCase()
      : "";
    if (citta && citta.length >= 3) {
      const soggetto = eQuerySostanziale(precedente) ?? precedente;
      if (soggetto) {
        return {
          directReply: null,
          tools: [
            { tool: "searchStores", params: { query: soggetto, citta } },
          ],
        };
      }
    }
  }

  // ── Pino Intent Layer v1 ─────────────────────────────────────────────────
  // L'intento è già classificato PRIMA di ogni ricerca. Da qui il piano è
  // guidato dall'intento:
  //   - generic → nessuna ricerca forzata: Pino chiede di specificare;
  //   - confidenza alta/media → piano deterministico coerente con l'intento;
  //   - confidenza bassa (nessun segnale di dominio) → decide il planner LLM,
  //     esattamente come prima dell'intent layer.
  // S6.2 — Richiesta breve di prodotto con esclusione: la comprensione
  // lessicale basta, non serve attendere la selezione LLM.
  const invocazioniEsclusione = pianoProdottoEsclusionePino(
    analisi,
    semantica,
    richiestaContestuale || utenti[utenti.length - 1] || ""
  );
  if (invocazioniEsclusione) {
    return { directReply: null, tools: invocazioniEsclusione };
  }

  if (analisi.intent === "generic") {
    return {
      directReply: inglese
        ? "What are you looking for in Castrovillari — a product, a shop, a service or a gift idea? A few details will help me give you a more precise answer."
        : "Dimmi cosa cerchi a Castrovillari: un prodotto, un negozio, un servizio o un'idea regalo. Più dettagli mi dai, più preciso sarò.",
      tools: [],
    };
  }

  if (analisi.confidence !== "bassa") {
    const piano = pianoIntento(analisi, ultimo);
    if (piano.length > 0) {
      return {
        directReply: null,
        tools: piano.map((t) => ({
          tool: t.tool,
          params: { query: t.query, ...(t.tool === "searchProducts" ? { limit: 8 } : {}) },
        })),
      };
    }
  }

  return null;
}

// ─── Fallback testuale quando la risposta finale LLM fallisce ────────────────

/** Risultati tipizzati → struttura per la composizione testuale (riuso). */
type ProdottoRisultatoTestualePino = RisultatiRecuperati["prodotti"][number] & {
  ha_varianti?: boolean;
};
type RisultatiRecuperatiPino = Omit<RisultatiRecuperati, "prodotti"> & {
  prodotti: ProdottoRisultatoTestualePino[];
};

function aRisultatiRecuperati(
  negozi: NegozioRicerca[],
  prodotti: ProdottoRicerca[],
  extra: Partial<RisultatiRecuperati> = {}
): RisultatiRecuperatiPino {
  return {
    negozi: negozi.map((n) => ({
      nome: n.nome,
      categoria: n.categoria ?? null,
      descrizione: n.descrizione ?? null,
      indirizzo: n.indirizzo ?? null,
      telefono: n.telefono ?? null,
    })),
    prodotti: prodotti.map((p) => ({
      nome: p.nome,
      prezzo: p.prezzo,
      negozio_nome: p.negozio_nome,
      categoria: p.categoria,
      descrizione: p.descrizione,
      ha_varianti: p.ha_varianti === true,
    })),
    offerte: [],
    eventi: [],
    categorie: [],
    meteo: null,
    farmacie: [],
    ...extra,
  };
}

/** Formattazione deterministica del prezzo di un prodotto Pino. */
export function formattaPrezzoProdottoPino(
  prodotto: Pick<ProdottoRicerca, "prezzo" | "ha_varianti">,
  lingua: "it" | "en" = "it"
): string {
  const prezzo = prezzoNumerico(prodotto?.prezzo);
  const inglese = lingua === "en";
  if (prezzo == null || prezzo <= 0) {
    return inglese ? "Price not available" : "Prezzo non disponibile";
  }
  if (prodotto?.ha_varianti === true) {
    return inglese ? `From €${prezzo}` : `A partire da €${prezzo}`;
  }
  return `€${prezzo}`;
}

/** Sezioni testuali dei risultati (condivise tra risposta normale e follow-up). */
function sezioniRisultati(
  risultati: RisultatiRecuperatiPino,
  budget?: number | null,
  lingua: "it" | "en" = "it"
): string[] {
  const inglese = lingua === "en";
  const sezioni: string[] = [];

  if (risultati.prodotti.length > 0) {
    sezioni.push(
      (inglese ? "**Products found**\n" : "**Prodotti trovati**\n") +
        risultati.prodotti
          .slice(0, 5)
          .map((p) => {
            const prezzo = prezzoNumerico(p.prezzo);
            const fuoriBudget =
              budget != null && prezzo != null && prezzo > 0 && prezzo > budget;
            // S5.3: il prezzo con varianti è il minimo delle varianti attive,
            // quindi va presentato come "a partire da", mai come prezzo della
            // variante richiesta. Un prezzo assente non diventa zero.
            // Nella riga dell'elenco la frase resta in minuscolo, come prima.
            const prezzoCanonico = formattaPrezzoProdottoPino(p, lingua);
            const prezzoTesto =
              prezzoCanonico.charAt(0).toLocaleLowerCase() + prezzoCanonico.slice(1);
            return `- **${p.nome}** — ${prezzoTesto} (${p.negozio_nome || (inglese ? "unknown store" : "negozio sconosciuto")})${fuoriBudget ? (inglese ? " — **over budget**" : " — **oltre il budget**") : ""}`;
          })
          .join("\n")
    );
  }
  if (risultati.negozi.length > 0) {
    sezioni.push(
      (inglese ? "**Relevant stores**\n" : "**Negozi pertinenti**\n") +
        risultati.negozi
          .slice(0, 5)
          .map((n) => `- **${n.nome}**${n.categoria ? ` (${n.categoria})` : ""}`)
          .join("\n")
    );
  }
  if (risultati.offerte.length > 0) {
    sezioni.push(
      (inglese ? "**Offers**\n" : "**Offerte**\n") +
        risultati.offerte
          .slice(0, 4)
          .map((o) => `- **${o.titolo}**${o.prezzo_offerta != null ? ` — €${o.prezzo_offerta}` : ""} (${o.negozio_nome || (inglese ? "unknown store" : "negozio sconosciuto")})`)
          .join("\n")
    );
  }
  if (risultati.eventi.length > 0) {
    sezioni.push(
      (inglese ? "**Events**\n" : "**Eventi**\n") +
        risultati.eventi
          .slice(0, 4)
          .map((e) => `- **${e.titolo}**${e.data_inizio ? ` — ${e.data_inizio.slice(0, 10)}` : ""} (${e.negozio_nome || (inglese ? "unknown store" : "negozio sconosciuto")})`)
          .join("\n")
    );
  }
  if (risultati.meteo) {
    sezioni.push(
      `**${inglese ? "Castrovillari weather" : "Meteo Castrovillari"}**\n- ${inglese ? "Now" : "Ora"}: ${risultati.meteo.temperatura}°C, ${risultati.meteo.descrizione}; ${inglese ? "today" : "oggi"} ${risultati.meteo.oggi.minima}°/${risultati.meteo.oggi.massima}°. ${inglese ? "Tomorrow" : "Domani"}: ${risultati.meteo.domani.descrizione}, ${risultati.meteo.domani.minima}°/${risultati.meteo.domani.massima}°.`
    );
  }
  if (risultati.farmacie.length > 0) {
    sezioni.push(
      (inglese ? "**Verified pharmacies**\n" : "**Farmacie verificate**\n") +
        risultati.farmacie
          .slice(0, 5)
          .map((f) => `- **${f.nome}**${f.stato ? ` — ${f.stato}` : (inglese ? " — status unverified" : " — stato non verificato")}${f.turno ? ` — ${f.turno}` : ""}${f.telefono ? ` — tel. ${f.telefono}` : ""}`)
          .join("\n")
    );
  }
  return sezioni;
}

function contaRisultati(risultati: RisultatiRecuperati): number {
  return (
    risultati.negozi.length +
    risultati.prodotti.length +
    risultati.offerte.length +
    risultati.eventi.length +
    (risultati.meteo ? 1 : 0) +
    risultati.farmacie.length
  );
}

function descriviCriteriRicerca(semantica?: PinoSemanticPlan, lingua: "it" | "en" = "it"): string {
  if (!semantica || semantica.confidence === "bassa" || !semantica.query) return "";

  const criteri: string[] = [];
  if (semantica.city) criteri.push(semantica.city);
  if (semantica.openNow) criteri.push(lingua === "en" ? "open now" : "aperto ora");
  if (semantica.minPrice != null && semantica.maxPrice != null) {
    criteri.push(lingua === "en" ? `between €${semantica.minPrice} and €${semantica.maxPrice}` : `tra €${semantica.minPrice} e €${semantica.maxPrice}`);
  } else if (semantica.maxPrice != null) {
    criteri.push(lingua === "en" ? `up to €${semantica.maxPrice}` : `fino a €${semantica.maxPrice}`);
  } else if (semantica.minPrice != null) {
    criteri.push(lingua === "en" ? `from €${semantica.minPrice}` : `da €${semantica.minPrice}`);
  }

  if (criteri.length === 0) return "";
  return lingua === "en" ? `I searched for **${semantica.query}** ${criteri.join(" · ")}.` : `Ho cercato **${semantica.query}** ${criteri.join(" · ")}.`;
}

export function fallbackTestuale(
  risultati: RisultatiRecuperati,
  notaVincolo = "",
  intent?: PinoIntent,
  semantica?: PinoSemanticPlan,
  budget?: number | null,
  lingua: "it" | "en" = "it"
): string {
  const inglese = lingua === "en";
  const sezioni = sezioniRisultati(risultati, budget, lingua);
  const totale = contaRisultati(risultati);
  const criteri = descriviCriteriRicerca(semantica, lingua);

  if (totale === 0) {
    if (criteri) {
        return inglese ? `${criteri} I couldn’t find results matching these criteria. I can broaden the search by relaxing a filter, changing the area, or looking for alternatives.` : `${criteri} Non trovo risultati con questi criteri. Posso allargare la ricerca togliendo un vincolo, cambiando zona o cercando un'alternativa.`;
    }
    // Anche senza risultati Pino deve restare proattivo: non scarica il
    // problema sull'utente con una frase passiva, ma suggerisce come
    // proseguire la ricerca.
    return inglese ? "I couldn’t find results for this request. I can try related categories, similar products, a different price range, or local stores that may carry it." : "Non trovo risultati per questa richiesta. Posso provare a cercare per categoria, sinonimo o negozio: ad esempio dimmi se vuoi un prodotto simile, una fascia di prezzo oppure un'attività che potrebbe averlo.";
  }

  const soloNegozi =
    risultati.prodotti.length === 0 &&
    risultati.negozi.length > 0 &&
    risultati.offerte.length === 0 &&
    risultati.eventi.length === 0;

  // Messaggio di apertura: dice sempre all'utente COSA ha trovato e cosa no,
  // in modo naturale. Per i servizi non ha senso parlare di "prodotto esatto".
  let introduzione = criteri ? `${criteri}\n\n` : "";
  if (risultati.prodotti.length > 0) {
    const n = risultati.prodotti.length;
    if (budget != null && Number.isFinite(budget)) {
      const entroBudget = risultati.prodotti.filter((p) => {
        const prezzo = prezzoNumerico(p.prezzo);
        return prezzo != null && prezzo > 0 && prezzo <= budget;
      }).length;
      // Prodotti senza prezzo pubblicato: non sono né dentro né fuori budget,
      // quindi non possiamo presentarli come "alternative più care" né
      // dichiarare che tutti i risultati rispettano la cifra.
      const senzaPrezzo = risultati.prodotti.filter(
        (p) => prezzoNumerico(p.prezzo) == null
      ).length;
      if (entroBudget === 0) {
        introduzione +=
          senzaPrezzo === 0
            ? (inglese ? `No products are within the €${budget} budget, so these are the closest alternatives, all above that amount.\n\n` : `Nessun prodotto rientra nel budget di €${budget}: ecco le alternative più vicine, tutte oltre la cifra indicata.\n\n`)
            : (inglese ? `No product with a published price is within the €${budget} budget: these alternatives are either above that amount or have no published price.\n\n` : `Nessun prodotto con prezzo pubblicato rientra nel budget di €${budget}: queste alternative superano la cifra indicata oppure non hanno un prezzo disponibile.\n\n`);
      } else if (entroBudget < n) {
        introduzione +=
          senzaPrezzo === 0
            ? (inglese ? `I found ${n} ${n === 1 ? "product" : "products"}: first those within the €${budget} budget, then more expensive alternatives.\n\n` : `Ho trovato ${n} ${n === 1 ? "prodotto" : "prodotti"}: prima quelli entro il budget di €${budget}, poi le alternative più care.\n\n`)
            : (inglese ? `I found ${n} ${n === 1 ? "product" : "products"}: first those within the €${budget} budget, then more expensive alternatives or products without a published price.\n\n` : `Ho trovato ${n} ${n === 1 ? "prodotto" : "prodotti"}: prima quelli entro il budget di €${budget}, poi le alternative più costose o senza prezzo disponibile.\n\n`);
      } else {
        introduzione += inglese ? `I found ${n} ${n === 1 ? "product" : "products"} within the €${budget} budget.\n\n` : `Ho trovato ${n} ${n === 1 ? "prodotto" : "prodotti"} entro il budget di €${budget}.\n\n`;
      }
    } else {
      introduzione += inglese ? `I found ${n} ${n === 1 ? "product" : "products"} matching your search.\n\n` : `Ho trovato ${n} ${n === 1 ? "prodotto" : "prodotti"} che ${n === 1 ? "corrisponde" : "corrispondono"} alla tua ricerca.\n\n`;
    }
  } else if (soloNegozi) {
    introduzione +=
      intent === "service"
        ? (inglese ? "I did not find the exact item, but these businesses may help.\n\n" : "Non ho trovato quello che cerchi, ma queste attività potrebbero aiutarti.\n\n")
        : (inglese ? "I did not find an exact match, but these businesses may help.\n\n" : "Non ho trovato esattamente quello che cerchi, ma queste attività potrebbero aiutarti.\n\n");
  } else if (totale > 0) {
    introduzione += inglese ? "I found some information relevant to your search.\n\n" : "Ho trovato alcune informazioni pertinenti alla tua ricerca.\n\n";
  }

  const motivazione = soloNegozi && !inglese ? motivoCategoria(risultati.negozi) : null;
  const nota = notaVincolo && !inglese ? `\n\n_${notaVincolo}_` : "";
  return (
    introduzione +
    sezioni.join("\n\n") +
    (motivazione ? "\n\n" + motivazione : "") +
    nota
  );
}

// ─── Risposta ai follow-up (Pino Conversazionale v1) ─────────────────────────
// Ogni follow-up MODIFICA i risultati del soggetto precedente: nessuna ricerca
// generica. Se il filtro non è applicabile sui dati reali, Pino lo dice in modo
// onesto invece di inventare.

async function rispostaFollowUp(input: {
  followUp: FollowUp;
  negozi: NegozioRicerca[];
  prodotti: ProdottoRicerca[];
  storico: MessaggioAssistente[];
  analisi: PinoIntentAnalysis;
  inizio: number;
  lingua?: "it" | "en";
}): Promise<RispostaAssistente> {
  const { followUp, negozi, prodotti, storico, analisi, inizio } = input;
  const lingua = input.lingua ?? rilevaLinguaConversazionePino(storico);
  const inglese = lingua === "en";
  const base = {
    processingMs: Date.now() - inizio,
    source: "assistente" as const,
    intent: analisi.intent,
    followUp: followUp.tipo,
  };

  const senzaPrecedenti = negozi.length === 0 && prodotti.length === 0;
  if (senzaPrecedenti) {
    return {
      ...base,
      negozi: [],
      prodotti: [],
      risposta: inglese
        ? "I don't have previous results to filter yet. Tell me what you're looking for first, and then I can apply that filter."
        : "Non avevo risultati precedenti da filtrare. Dimmi cosa cerchi e poi potrò applicare il filtro che hai indicato.",
    };
  }

  if (followUp.tipo === "aperti") {
    const ids = [...negozi.map((n) => n.id), ...prodotti.map((p) => p.negozio_id)];
    const orari = await orariPerNegozi(ids);
    const negoziAperti = negozi.filter((n) => apertoOra(orari.get(n.id)) === true);
    const prodottiAperti = prodotti.filter((p) => apertoOra(orari.get(p.negozio_id)) === true);
    if (negoziAperti.length === 0 && prodottiAperti.length === 0) {
      return {
        ...base,
        negozi: [],
        prodotti: [],
        risposta: inglese
          ? "None of the previous businesses can be verified as open right now based on the opening hours listed on InCittà."
          : "Tra i risultati precedenti, nessuna attività risulta aperta ora secondo gli orari registrati su InCittà.",
      };
    }
    const corpo = sezioniRisultati(aRisultatiRecuperati(negoziAperti, prodottiAperti), undefined, lingua).join("\n\n");
    return {
      ...base,
      negozi: negoziAperti,
      prodotti: prodottiAperti,
      risposta: inglese
        ? "Among the previous results, these businesses are listed as open now:\n\n" + corpo
        : "Tra i risultati precedenti, queste sono le attività aperte ora:\n\n" + corpo,
    };
  }

  if (followUp.tipo === "economici") {
    if (prodotti.length > 0) {
      const ordinati = [...prodotti].sort((a, b) => Number(a.prezzo) - Number(b.prezzo));
      const quanti = Math.max(1, Math.ceil(ordinati.length / 2));
      const economici = ordinati.slice(0, quanti);
      const corpo = sezioniRisultati(aRisultatiRecuperati([], economici), undefined, lingua).join("\n\n");
      return {
        ...base,
        negozi: [],
        prodotti: economici,
        risposta: (inglese
          ? "Among the previous results, here are the lower-priced options:\n\n"
          : "Tra i risultati precedenti, ecco le opzioni più economiche:\n\n") + corpo,
      };
    }
    const corpo = sezioniRisultati(aRisultatiRecuperati(negozi, []), undefined, lingua).join("\n\n");
    return {
      ...base,
      negozi,
      prodotti: [],
      risposta: inglese
        ? "Stores don't have a price attached, so I can't rank them by price. The 'cheaper' filter applies to products. Here are the businesses already found:\n\n" + corpo
        : "I negozi non hanno un prezzo associato, quindi non posso ordinarli per economicità: il filtro \"economici\" vale sui prodotti. Ecco le attività già trovate:\n\n" + corpo,
    };
  }

  if (followUp.tipo === "vicino") {
    const corpo = sezioniRisultati(aRisultatiRecuperati(negozi, prodotti), undefined, lingua).join("\n\n");
    return {
      ...base,
      negozi,
      prodotti,
      risposta: inglese
        ? "I don't have your location, so I can't calculate distances to these businesses. Tell me an area or street and I can narrow things down. In the meantime, here are the previous results:\n\n" + corpo
        : "Non conosco la tua posizione, quindi non posso calcolare la distanza dalle attività (a InCittà non arriva la geolocalizzazione dal browser). Dimmi la zona o la via e filtro di conseguenza. Intanto ecco i risultati precedenti:\n\n" + corpo,
    };
  }

  const giaMostrati = new Set(nomiGiaMostrati(storico));
  const giaMostrato = (nome: string) => giaMostrati.has(nome.toLowerCase().trim());
  const nuoviNegozi = negozi.filter((n) => !giaMostrato(n.nome));
  const nuoviProdotti = prodotti.filter((p) => !giaMostrato(p.nome));

  if (nuoviNegozi.length === 0 && nuoviProdotti.length === 0) {
    return {
      ...base,
      negozi: [],
      prodotti: [],
      risposta: inglese
        ? "I've already shown all the available options matching these criteria. Would you like to try a different area, category or price range?"
        : "Ho già mostrato tutte le opzioni disponibili per la tua ricerca: non ce ne sono altre con gli stessi criteri. Vuoi provare una zona diversa, un'altra categoria o un'altra fascia di prezzo?",
    };
  }
  const mostratiNegozi = nuoviNegozi.slice(0, 5);
  const mostratiProdotti = nuoviProdotti.slice(0, 5);
  const corpo = sezioniRisultati(aRisultatiRecuperati(mostratiNegozi, mostratiProdotti), undefined, lingua).join("\n\n");
  return {
    ...base,
    negozi: mostratiNegozi,
    prodotti: mostratiProdotti,
    risposta: (inglese
      ? "Here are some more options I haven't shown you yet:\n\n"
      : "Ecco altre opzioni che non ti avevo ancora mostrato:\n\n") + corpo,
  };
}

/**
 * Recupero intelligente quando la prima ricerca non restituisce nulla.
 * Pino non si ferma al primo zero: prova il concetto canonico, i termini
 * semantici alternativi e, quando ha senso, la superficie negozi per capire
 * dove reperire ciò che l'utente sta cercando.
 */
async function recuperaAlternativeSemantiche(
  domanda: string,
  storico: MessaggioAssistente[],
  analisi: PinoIntentAnalysis,
  memoria: Awaited<ReturnType<typeof recuperaMemoria>>,
  semanticaIniziale?: PinoSemanticPlan,
  maxInvocazioni: number = 3
): Promise<{
  negozi: NegozioRicerca[];
  prodotti: ProdottoRicerca[];
  piano: PinoSemanticPlan | undefined;
  descrizione: string | null;
}> {
  // Nessuna invocazione residua: non avviare né planner né retrieval.
  if (maxInvocazioni <= 0) {
    return { negozi: [], prodotti: [], piano: semanticaIniziale, descrizione: null };
  }
  const pianoInterpretato =
    semanticaIniziale ??
    (await interpretaRichiestaPino(domanda, storico, analisi, memoria));
  // Una richiesta alimentare esplicita resta sulla superficie prodotti anche
  // durante il recupero di secondo livello: non deve degradare a negozi.
  const piano = pianoInterpretato && isExplicitFoodProductRequest(domanda)
    ? { ...pianoInterpretato, surface: "products" as const }
    : pianoInterpretato;

  if (!piano || piano.confidence === "bassa" || !piano.query) {
    return { negozi: [], prodotti: [], piano, descrizione: null };
  }

  const esclusioni = piano.exclusions.length ? piano.exclusions : undefined;
  const baseParams: ToolParams = {
    citta: piano.city ?? undefined,
    esclusioni,
    apertiOra: piano.openNow || undefined,
    maxPrice: piano.maxPrice,
    minPrice: piano.minPrice,
    limit: 8,
  };

  const candidati = Array.from(
    new Set(
      [piano.query, ...piano.terms]
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 2)
    )
  ).slice(0, 5);

  const prodottiTrovati: ProdottoRicerca[] = [];
  const negoziTrovati: NegozioRicerca[] = [];
  // S5.1-C — Il recupero semantico consuma solo le invocazioni residue del
  // budget globale (3 meno quelle già eseguite). Niente più 5+3 chiamate.
  let residue = Math.max(0, Math.min(MASSIMO_INVOCAZIONI_PINO, Math.floor(maxInvocazioni)));

  // Prima allarga il concetto sullo stesso tipo di superficie.
  if (piano.surface === "products" || piano.surface === "both") {
    for (const q of candidati) {
      if (residue <= 0) break;
      residue -= 1;
      const trovati = await searchProducts(q, { ...baseParams, query: q });
      for (const p of trovati) {
        if (!prodottiTrovati.some((x) => x.id === p.id)) prodottiTrovati.push(p);
      }
      if (prodottiTrovati.length >= 8) break;
    }
  }

  // Se l'utente sta cercando dove reperire qualcosa, cerca anche attività
  // pertinenti. Non viene presentato come prodotto trovato: è un'alternativa
  // concreta e trasparente.
  if (
    (piano.surface === "stores" || piano.surface === "both" || analisi.intent === "product") &&
    negoziTrovati.length < 6 &&
    residue > 0
  ) {
    for (const q of candidati.slice(0, 3)) {
      if (residue <= 0) break;
      residue -= 1;
      const trovati = await searchStores(q, {
        citta: piano.city ?? undefined,
        esclusioni,
        apertiOra: piano.openNow || undefined,
        limit: 6,
      });
      for (const n of trovati) {
        if (!negoziTrovati.some((x) => x.id === n.id)) negoziTrovati.push(n);
      }
      if (negoziTrovati.length >= 6) break;
    }
  }

  if (prodottiTrovati.length === 0 && negoziTrovati.length === 0) {
    return {
      negozi: [],
      prodotti: [],
      piano,
      descrizione: null,
    };
  }

  const concetto = piano.query;
  const inglese = rilevaLinguaConversazionePino(storico) === "en";
  const descrizione =
    prodottiTrovati.length > 0
      ? (inglese
          ? `I didn't find an exact match for "${domanda}", so I broadened the search to "${concetto}" and related variants.`
          : `Non ho trovato una corrispondenza esatta per "${domanda}", quindi ho allargato la ricerca al concetto "${concetto}" e alle sue varianti.`)
      : (inglese
          ? `I didn't find the exact product for "${domanda}", but I found relevant businesses that may carry it.`
          : `Non ho trovato il prodotto esatto per "${domanda}", ma ho trovato attività pertinenti dove potrebbe essere reperito.`);

  return {
    negozi: negoziTrovati.slice(0, 8),
    prodotti: prodottiTrovati.slice(0, 10),
    piano,
    descrizione,
  };
}

// ─── Risposte deterministiche per dati sensibili al falso positivo ───────────
// Meteo e stato farmacie non devono mai essere "interpretati" da Gemini:
// una volta recuperati i dati, la risposta viene composta qui usando soltanto
// ciò che la fonte ha realmente restituito. Questo elimina le allucinazioni
// anche quando il modello finale sarebbe tentato di completare i buchi.

function descrizioneMeteoInglese(descrizione: string): string {
  return String(descrizione ?? "").toLowerCase()
    .replace(/parzialmente nuvoloso/g, "partly cloudy")
    .replace(/poco nuvoloso/g, "mostly clear")
    .replace(/pioggia moderata/g, "moderate rain")
    .replace(/pioggia leggera|pioviggine/g, "light rain")
    .replace(/pioggia intensa/g, "heavy rain")
    .replace(/temporale/g, "thunderstorm")
    .replace(/neve/g, "snow")
    .replace(/nuvoloso/g, "cloudy")
    .replace(/coperto/g, "overcast")
    .replace(/sereno/g, "clear")
    .replace(/pioggia/g, "rain");
}

function rispostaMeteoDeterministica(
  meteo: Awaited<ReturnType<typeof getWeatherCastrovillari>>,
  lingua: "it" | "en" = "it"
): string {
  const inglese = lingua === "en";
  if (!meteo) {
    return inglese
      ? "I can't verify the weather in Castrovillari right now. I won't make up a forecast — please try again shortly."
      : "Al momento non riesco a verificare il meteo di Castrovillari. Non ti do una previsione inventata: riprova tra poco.";
  }

  const oggiPioggia = meteo.oggi.probabilitaPioggia != null
    ? (inglese ? ", chance of rain " : ", probabilità di pioggia ") + meteo.oggi.probabilitaPioggia + "%"
    : "";
  const domaniPioggia = meteo.domani.probabilitaPioggia != null
    ? (inglese ? ", chance of rain " : ", probabilità di pioggia ") + meteo.domani.probabilitaPioggia + "%"
    : "";

  if (inglese) {
    return "In Castrovillari it is currently " + meteo.temperatura + "°C, " +
      descrizioneMeteoInglese(meteo.descrizione) + ", with a feels-like temperature of " +
      meteo.temperaturaPercepita + "°C and wind at " + meteo.ventoKmh + " km/h. " +
      "Today: " + meteo.oggi.minima + "° / " + meteo.oggi.massima + "°" + oggiPioggia + ". " +
      "Tomorrow: " + descrizioneMeteoInglese(meteo.domani.descrizione) + ", " +
      meteo.domani.minima + "° / " + meteo.domani.massima + "°" + domaniPioggia + ". " +
      "Data updated at " + meteo.aggiornato + ".";
  }

  return (
    "A Castrovillari ora ci sono " + meteo.temperatura + "°C, " +
    meteo.descrizione.toLowerCase() + ", con temperatura percepita di " +
    meteo.temperaturaPercepita + "°C e vento a " + meteo.ventoKmh + " km/h. " +
    "Oggi: " + meteo.oggi.minima + "° / " + meteo.oggi.massima + "°" +
    oggiPioggia + ". " +
    "Domani: " + meteo.domani.minima + "° / " + meteo.domani.massima + "°, " +
    meteo.domani.descrizione.toLowerCase() + domaniPioggia + ". " +
    "Dati aggiornati alle " + meteo.aggiornato + "."
  );
}

function rispostaFarmacieDeterministica(
  farmacie: Awaited<ReturnType<typeof searchPharmacies>>,
  statoRichiesto: ToolParams["stato"] = "turno",
  motivo?: string,
  lingua: "it" | "en" = "it"
): string {
  const inglese = lingua === "en";
  const turnoTradotto = (turno: string | null | undefined) =>
    turno ? (inglese ? "on duty: " + turno : turno) : null;

  if (statoRichiesto === "aperte") {
    const aperte = farmacie.filter((f) => f.stato === "aperta").slice(0, 5);
    if (aperte.length === 0) {
      return inglese
        ? "I can't verify any pharmacy as currently open in the available Castrovillari data. I won't list a pharmacy as open without confirmation."
        : "Al momento non risulta alcuna farmacia con stato APERTA verificato nei dati disponibili per Castrovillari. Non ti indico farmacie non verificate come aperte.";
    }

    const elenco = aperte.map((f) => {
      const dettagli = [
        f.indirizzo ? f.indirizzo : null,
        f.telefono ? "tel. " + f.telefono : null,
        f.apertura ? (inglese ? "hours: " : "orari: ") + f.apertura : null,
      ].filter(Boolean).join(" — ");
      return "- **" + f.nome + "**" + (dettagli ? " — " + dettagli : "");
    }).join("\n");

    return inglese
      ? "Based on today's verified data, these pharmacies are listed as open:\n" + elenco
      : "Dai dati verificati di oggi risultano aperte:\n" + elenco;
  }

  if (statoRichiesto === "tutte") {
    if (farmacie.length === 0) {
      return inglese
        ? "I don't currently have verified pharmacy information for Castrovillari."
        : "Al momento non ho dati verificati sulle farmacie di Castrovillari.";
    }

    const elenco = farmacie.slice(0, 8).map((f) => {
      const stato = f.turno
        ? (inglese ? "ON DUTY" : "DI TURNO")
        : f.stato === "aperta"
          ? (inglese ? "OPEN" : "APERTA")
          : f.stato === "chiusa"
            ? (inglese ? "CLOSED" : "CHIUSA")
            : (inglese ? "NOT VERIFIED" : "NON VERIFICATA");
      const dettagli = [
        f.indirizzo ? f.indirizzo : null,
        turnoTradotto(f.turno),
        f.telefono ? "tel. " + f.telefono : null,
      ].filter(Boolean).join(" — ");
      return "- **" + f.nome + "** — " + stato + (dettagli ? " — " + dettagli : "");
    }).join("\n");

    return inglese
      ? "Pharmacies with available information:\n" + elenco
      : "Farmacie per cui ho dati disponibili:\n" + elenco;
  }

  const turno = farmacie.filter((f) => Boolean(f.turno)).slice(0, 3);
  if (turno.length === 0) {
    const prefisso = motivo ? (inglese ? "For " : "Per ") + motivo + ", " : "";
    return inglese
      ? prefisso + "no on-duty pharmacy is currently verified in the available Castrovillari data. I won't provide an unverified name."
      : prefisso + "al momento non risulta alcuna farmacia di turno verificata nei dati disponibili per Castrovillari. Non ti indico un nome non verificato, per evitare un falso positivo.";
  }

  const elenco = turno.map((f) => {
    const dettagli = [
      turnoTradotto(f.turno),
      f.indirizzo ? f.indirizzo : null,
      f.telefono ? "tel. " + f.telefono : null,
    ].filter(Boolean).join(" — ");
    return "- **" + f.nome + "**" + (dettagli ? " — " + dettagli : "");
  }).join("\n");

  const prefisso = motivo
    ? (inglese ? "For " : "Per ") + motivo + (inglese
      ? ", you can contact an on-duty pharmacy. Today's verified data shows:\n"
      : ", puoi rivolgerti a una farmacia di turno. Dai dati verificati di oggi risulta:\n")
    : (inglese ? "Today's verified data shows these on-duty pharmacies:\n" : "Dai dati verificati di oggi risulta:\n");

  return prefisso + elenco;
}

// ─── Guida Attrazioni: intento di visita e pertinenza ──────────────────────
//
// S4.8 — Una richiesta di un luogo (museo, monumento, castello...) non è una
// ricerca commerciale. Se la guida Attrazioni non ha un risultato pertinente,
// Pino lo dichiara e si ferma: non deve proporre prodotti o negozi casuali né
// affermare che il luogo non esista in città.

const RE_INTENTO_GUIDA_PINO =
  /\b(muse[oi]|monument[oi]|attrazion[ei]|cosa vedere|luoghi da visitare|luoghi da vedere|visitare|palazz[oi]|castell[oi]|chies[ae]|teatr[oi]|biblioteca|archivio|borg[oh]i?|dintorni|centro storico|festival|mostre|parco|itinerario|turistic[oa]|museums?|monuments?|attractions?|things to see|places to visit|visit|palaces?|castles?|churches|theatres?|libraries|archives?|villages?|surroundings|historic center|historic centre|exhibitions?|parks?|itinerary|tourism|tourist|archaeological|amphitheat(?:re|er)s?|ruins?|sites?)\b/i;

// Parole che indicano un acquisto o un prodotto: «cerco un negozio di articoli
// per il teatro» non è una visita, anche se contiene «teatro».
const RE_CONTESTO_ACQUISTO_PINO =
  /\b(?:comprare|compro|acquistare|acquisto|negozi[oi]|boutique|commerciale|commerciali|supermercat[oi]|prodott[oi]|shampoo|regal[oi]|prezz[oi]|offerte?|sconti?|vendita|buy|buying|shop|shops|store|stores|malls?|products?|prices?|offers?|discounts?|sale|gifts?)\b/i;

// Parole di raccordo e categorie generiche di luogo: non identificano un
// risultato specifico della guida, quindi non vengono usate per scartare.
const TERMINI_NEUTRI_GUIDA_PINO = new Set([
  "dove","cosa","quali","quale","chi","come","quando","perche","posso","potrei",
  "vorrei","voglio","cerco","cercando","serve","servono","bisogno","sono","anche",
  "solo","questo","questa","questi","queste","quel","quella","quei","quelle",
  "il","lo","la","i","gli","le","un","uno","una","e","ed","o","di","da",
  "del","della","dei","degli","delle","al","alla","ai","agli","alle","dal",
  "dalla","dai","dagli","dalle","nel","nella","nei","negli","nelle","su","sul",
  "sulla","per","con","senza","non","che","si","mi","ho","piu","c","ci",
  "dell","dello","all","allo","nell","nello","sull","sullo","dall","dallo",
  "visitare","visit","visiting","visita","visite","vedere","see","seeing",
  "guardare","consigli","consigliami","mostrami",
  "what","can","i","the","a","an","any","there","some","me","you","we","do",
  "is","are","of","to","in","on","at","near","around","for","with","and","or",
  "about","my","should","best","where","how","which","this","that","these",
  "those","have","has","it","information","info","looking","find","things","places",
  "museo","musei","museum","museums","monumento","monumenti","monument","monuments",
  "attrazione","attrazioni","attraction","attractions","palazzo","palazzi","palace",
  "palaces","castello","castelli","castle","castles","chiesa","chiese","church",
  "churches","teatro","teatri","theatre","theatres","theater","theaters","biblioteca",
  "biblioteche","library","libraries","archivio","archivi","archive","archives","borgo",
  "borghi","village","villages","dintorni","surroundings","centro","storico","storica",
  "historic","historical","centre","center","festival","festivals","mostra","mostre",
  "exhibition","exhibitions","parco","parchi","park","parks","itinerario","itinerary",
  "turismo","tourism","turistico","turistica","tourist","archeologico","archeologica",
  "archeologici","archaeological","cultura","culture","arte","art","sito","siti",
  "site","sites","evento","eventi","event","events","luogo","luoghi","place",
  "castrovillari",
]);

// S4.8.1 — La ricerca della guida è lessicale e indicizzata su termini
// italiani. I plurali inglesi (museums, monuments, churches, castles, parks)
// non producevano alcun punteggio e la richiesta finiva nel messaggio di
// assenza. Qui le categorie inglesi vengono ricondotte ai termini già presenti
// nel catalogo, senza toccare nomi propri e qualificatori specifici.
const CATEGORIE_GUIDA_EN_IT: ReadonlyArray<readonly [RegExp, string]> = [
  [/\barchaeological\s+sites?\b/gi, "archeologico"],
  [/\bhistorical\s+sites?\b/gi, "monumenti"],
  [/\bhistorical\s+monuments?\b/gi, "monumenti"],
  [/\bmuseums?\b/gi, "museo"],
  [/\bmonuments?\b/gi, "monumenti"],
  [/\bchurches\b|\bchurch\b/gi, "chiesa"],
  [/\bcastles\b|\bcastle\b/gi, "castello"],
  [/\btheat(?:re|er)s?\b/gi, "teatro"],
  [/\bparks?\b/gi, "parco"],
];

export function espandiCategorieGuidaPino(query: string): string {
  return CATEGORIE_GUIDA_EN_IT.reduce(
    (testo, [categoria, termineItaliano]) => testo.replace(categoria, termineItaliano),
    String(query ?? "")
  );
}

function terminiSpecificiGuidaPino(query: string): string[] {
  return normalizza(String(query ?? ""))
    .split(/[^a-z0-9]+/)
    .filter((termine) => termine.length >= 3 && !TERMINI_NEUTRI_GUIDA_PINO.has(termine));
}

/**
 * Riconosce una richiesta di luogo/attrazione, escludendo gli acquisti.
 * Il nome di un luogo del catalogo resta sempre una richiesta valida.
 */
export function richiestaGuidaAttrazioniPino(query: string): boolean {
  const testo = String(query ?? "");
  // Un acquisto esplicito resta una ricerca commerciale anche quando contiene
  // il nome o la categoria di un luogo («negozio di articoli per il teatro»).
  if (RE_CONTESTO_ACQUISTO_PINO.test(testo)) return false;
  if (isAttractionNameQuery(testo)) return true;
  if (!RE_INTENTO_GUIDA_PINO.test(testo)) return false;
  return true;
}

/** Risposta onesta: assenza nella guida, non inesistenza nella città. */
export function rispostaGuidaAttrazioniAssentePino(lingua: "it" | "en" = "it"): string {
  return lingua === "en"
    ? "I can't currently find information about this place in InCittà's attractions guide. That doesn't necessarily mean it doesn't exist in Castrovillari. I won't suggest shops or products that have nothing to do with it."
    : "Al momento non trovo informazioni su questo luogo nella guida Attrazioni di InCittà. Questo non significa necessariamente che non esista a Castrovillari. Non ti propongo negozi o prodotti che non c'entrano.";
}

/**
 * Mantiene solo i luoghi che condividono un termine specifico con la richiesta.
 * Le domande ampie («cosa posso visitare?», «ci sono monumenti?») non hanno
 * termini specifici e conservano l'elenco completo della guida.
 */
export function filtraLuoghiPertinentiGuidaPino(
  query: string,
  luoghi: ReturnType<typeof searchAttractions>
): ReturnType<typeof searchAttractions> {
  const specifici = terminiSpecificiGuidaPino(query);
  if (specifici.length === 0) return luoghi;

  return luoghi.filter((luogo) => {
    const campi = normalizza(
      [luogo.nome, luogo.tipo, luogo.descrizione, luogo.queryMaps, ...luogo.alias].join(" ")
    ).split(/[^a-z0-9]+/);
    return specifici.some((termine) =>
      campi.some((campo) => {
        if (campo === termine) return true;
        if (termine.length < 4 || campo.length < 4) return false;
        return campo.slice(0, 4) === termine.slice(0, 4);
      })
    );
  });
}

// ─── S5.1: limite globale delle invocazioni tool ────────────────────────────
//
// Il vincolo architetturale è: massimo 3 invocazioni tool per richiesta.
// Una singola invocazione può eseguire internamente più query di retrieval
// previste dal proprio contratto (es. i gruppi di categorie regalo), mentre
// ogni voce di `invocazioni` qui rappresenta una chiamata tool distinta.

export const MASSIMO_INVOCAZIONI_PINO = 3;

// S5.2.1 — Soggetti che non identificano un articolo: non possono diventare
// una query di riserva ("prodotto", "regalo", "articolo"...).
const SOGGETTI_GENERICI_RISERVA_PINO = new Set([
  "prodotto", "prodotti", "regalo", "regali", "articolo", "articoli", "cosa",
  "cose", "oggetto", "oggetti", "idea", "idee", "qualcosa", "qualche", "altro",
  "altra", "product", "products", "gift", "gifts", "item", "items", "thing",
  "things", "something",
]);

/** Una query è utilizzabile se, dopo la normalizzazione, contiene un termine
 * che identifica un articolo (non solo parole generiche come "prodotto"). */
function queryRiservaUtilizzabilePino(query: unknown): boolean {
  const normalizzata = normalizzaQueryCatalogo(String(query ?? "")).trim();
  if (!normalizzata) return false;
  const token = normalizzata.split(/[^a-z0-9]+/).filter(Boolean);
  return token.some((voce) => !SOGGETTI_GENERICI_RISERVA_PINO.has(voce));
}

/** Soggetto specifico utilizzabile come query di riserva, oppure null. */
export function soggettoRiservaPino(soggetto: string): string | null {
  const riserva = normalizzaQueryCatalogo(String(soggetto ?? "")).trim();
  if (!riserva || riserva.length < 3) return null;
  const token = riserva.split(/[^a-z0-9]+/).filter(Boolean);
  if (token.length === 0) return null;
  if (token.every((voce) => SOGGETTI_GENERICI_RISERVA_PINO.has(voce))) return null;
  return riserva;
}

/**
 * S5.2.1 — Usa il soggetto del contratto SOLO per riempire una query vuota o
 * inutilizzabile su invocazioni già esistenti. Non crea nuove invocazioni,
 * non sovrascrive query valide e non tocca i parametri di vincolo (budget,
 * esclusioni, colori, materiali, città), che vengono conservati.
 */
export function applicaQueryRiservaPino(
  invocazioni: ToolInvocation[],
  comprensione?: PinoUnderstanding
): ToolInvocation[] {
  const elenco = Array.isArray(invocazioni) ? invocazioni : [];
  const riserva = soggettoRiservaPino(comprensione?.soggetto ?? "");
  if (!riserva) return elenco;
  return elenco.map((invocazione) => {
    if (
      invocazione.tool !== "searchProducts" &&
      invocazione.tool !== "searchStores" &&
      invocazione.tool !== "searchAll"
    ) {
      return invocazione;
    }
    const params = invocazione.params ?? {};
    if (queryRiservaUtilizzabilePino(params.query)) return invocazione;
    // Un criterio esplicito già utilizzabile non richiede la riserva.
    if (
      params.termini?.length ||
      params.categoria?.trim() ||
      params.tipo?.trim() ||
      params.servizio?.trim()
    ) {
      return invocazione;
    }
    return { ...invocazione, params: { ...params, query: riserva } };
  });
}

/**
 * S5.2.1 — Nota onesta per gli attributi che il catalogo non permette di
 * verificare (destinatario, età, taglia, provenienza, artigianalità). Non
 * dichiara idoneità o conformità e non esclude risultati.
 */
export function notaContestoAttributiPino(
  comprensione?: PinoUnderstanding,
  lingua: "it" | "en" = "it"
): string | null {
  if (!comprensione) return null;
  const attributi = comprensione.attributi;
  const vociIt: string[] = [];
  const vociEn: string[] = [];
  if (attributi.destinatario) {
    vociIt.push(`destinatario (${attributi.destinatario})`);
    vociEn.push(`recipient (${attributi.destinatario})`);
  }
  if (attributi.eta != null) {
    vociIt.push(`età (${attributi.eta} anni)`);
    vociEn.push(`age (${attributi.eta})`);
  }
  if (attributi.taglie.length > 0) {
    vociIt.push(`taglia (${attributi.taglie.join(", ")})`);
    vociEn.push(`size (${attributi.taglie.join(", ")})`);
  }
  if (attributi.provenienza.length > 0) {
    vociIt.push(`provenienza (${attributi.provenienza.join(", ")})`);
    vociEn.push(`origin (${attributi.provenienza.join(", ")})`);
  }
  if (attributi.altri.includes("artigianale")) {
    vociIt.push("artigianalità");
    vociEn.push("handmade production");
  }
  if (vociIt.length === 0) return null;
  return lingua === "en"
    ? `Note: the InCittà catalogue has no verifiable data on ${vociEn.join(", ")}. These results are not presented as meeting those criteria.`
    : `Nota: il catalogo InCittà non dispone di dati verificabili su ${vociIt.join(", ")}. I risultati non sono presentati come conformi a questi criteri.`;
}

/**
 * Riduce una lista di invocazioni al massimo consentito, preservando la
 * varietà delle superfici: prima la prima occorrenza di ogni tool, poi le
 * restanti nell'ordine originale. Non altera i parametri né i gate.
 */
export function limitaInvocazioniPino(
  invocazioni: ToolInvocation[],
  massimo: number = MASSIMO_INVOCAZIONI_PINO
): ToolInvocation[] {
  const limite = Number.isFinite(massimo)
    ? Math.max(0, Math.floor(Number(massimo)))
    : MASSIMO_INVOCAZIONI_PINO;
  const elenco = Array.isArray(invocazioni) ? invocazioni : [];
  if (elenco.length <= limite) return elenco;

  const scelte: ToolInvocation[] = [];
  const visti = new Set<string>();
  for (const invocazione of elenco) {
    if (scelte.length >= limite) break;
    const nome = String(invocazione?.tool ?? "");
    if (!nome || visti.has(nome)) continue;
    visti.add(nome);
    scelte.push(invocazione);
  }
  for (const invocazione of elenco) {
    if (scelte.length >= limite) break;
    if (scelte.includes(invocazione)) continue;
    scelte.push(invocazione);
  }
  return scelte;
}

/** Invocazioni ancora disponibili per il recupero semantico entro il limite. */
export function budgetInvocazioniRecuperoPino(usate: number): number {
  const numero = Number.isFinite(usate) ? Math.max(0, Math.floor(Number(usate))) : 0;
  return Math.max(0, MASSIMO_INVOCAZIONI_PINO - numero);
}

/**
 * S5.1-B — Fan-out regalo in 3 invocazioni tool, non 12.
 *
 * Le 12 categorie restano tutte coperte: vengono divise in 3 gruppi e ogni
 * gruppo è una singola invocazione `searchGiftCategories`, che esegue le
 * ricerche di categoria al proprio interno. Budget, esclusioni, città e
 * attributi viaggiano nei parametri e restano applicati dai tool.
 */
export function invocazioniRegaloPino(
  maxPrice?: number | null,
  extra: ToolParams = {}
): ToolInvocation[] {
  const categorie = [...CATEGORIE_REGALO];
  if (categorie.length === 0) return [];
  const gruppi = Math.min(MASSIMO_INVOCAZIONI_PINO, categorie.length);
  const dimensione = Math.ceil(categorie.length / gruppi);
  const invocazioni: ToolInvocation[] = [];
  for (let indice = 0; indice < categorie.length; indice += dimensione) {
    const termini = categorie.slice(indice, indice + dimensione);
    if (termini.length === 0) continue;
    invocazioni.push({
      tool: "searchGiftCategories",
      params: {
        ...extra,
        termini,
        limit: 3,
        ...(maxPrice != null && Number.isFinite(Number(maxPrice))
          ? { maxPrice: Number(maxPrice) }
          : {}),
      },
    });
  }
  return invocazioni.slice(0, MASSIMO_INVOCAZIONI_PINO);
}

// ─── Orchestratore principale ────────────────────────────────────────────────

export async function chatConAssistente(
  messages: MessaggioAssistente[]
): Promise<RispostaAssistente> {
  const inizio = Date.now();
  const storico = normalizzaMessaggi(messages);
  const ultimo = storico[storico.length - 1];
  // Cap sulla domanda: evita abuso di token e superfici di prompt injection
  // (la storia è già troncata a 300 caratteri per messaggio).
  const domanda = (ultimo && ultimo.role === "user" ? ultimo.content : "").slice(0, 500);

  // S4.1 — Una sola comprensione strutturata per richiesta.
  // Stato conversazionale, domanda contestuale e intento vengono calcolati qui
  // una volta sola e passati al contratto `PinoUnderstanding`, che non li
  // ricalcola. La comprensione guida la lingua della conversazione e la
  // decisione "solo preferenza linguistica → nessuna ricerca".
  const statoConversazionale = costruisciStatoConversazionale(storico);
  const domandaSemantica =
    statoConversazionale.richiesta ||
    arricchisciRichiestaConContesto(domanda, storico);
  const analisiSemantica = analizzaIntentoPino(domandaSemantica);
  const comprensione = analizzaComprensionePino(domanda, storico, {
    richiesta: domandaSemantica,
    analisi: analisiSemantica,
  });
  const linguaConversazione = comprensione.lingua;

  // Fast path conversazionale: non attendere memoria, planner semantico o Gemini
  // per saluti, domande personali e inviti a chiacchierare.
  const identitaDiretta = rispostaIdentitaPino(domanda);
  const rispostaDiretta = identitaDiretta ?? rispostaRelazionalePino(domanda, linguaConversazione) ?? rispostaSalutoPino(domanda);
  if (rispostaDiretta) {
    return {
      risposta: rispostaDiretta,
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
    };
  }


  // Preferenza linguistica: "I speak English", "please answer in English",
  // "vorrei parlare in inglese" sono comunicazioni sulla conversazione, non
  // ricerche di catalogo. Il contratto decide SE è solo lingua
  // (`languagePreferenceOnly`); greetings fornisce il testo della risposta.
  const preferenzaLingua = comprensione.languagePreferenceOnly
    ? rispostaPreferenzaLinguaPino(domanda)
    : null;
  if (comprensione.languagePreferenceOnly) {
    return {
      // Rete di sicurezza: anche se il testo non fosse disponibile, una
      // richiesta di sola lingua non deve MAI avviare una ricerca.
      risposta:
        preferenzaLingua ??
        (linguaConversazione === "en"
          ? "Got it — I'll continue in English."
          : "Va bene — continuo in italiano."),
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
    };
  }

  // Risposta diretta e cordiale ai saluti semplici, senza passare dal planner.
  const salutoPino = rispostaSalutoPino(domanda);
  if (salutoPino) {
    return {
      risposta: salutoPino,
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
    };
  }

  // Cinema: è un luogo/attività, non un prodotto. Nella guida Attrazioni di
  // InCittà non è presente una sala cinematografica: Pino dichiara di non poter
  // confermarla, senza affermare che in città non esistano cinema. Le rassegne
  // della guida sono citate come EVENTI, mai presentate come sala disponibile.
  if (richiestaCinemaPino(domanda)) {
    const inglese = linguaConversazione === "en";
    const rassegne = searchAttractions(domanda, 6).filter((luogo) =>
      /\b(?:film|cine)/i.test(`${luogo.nome} ${luogo.tipo} ${luogo.descrizione}`)
    );
    const elenco = rassegne
      .slice(0, 4)
      .map((luogo) => `- **${luogo.nome}** — ${luogo.tipo}${luogo.url ? ` · [${inglese ? "official source" : "fonte ufficiale"}](${luogo.url})` : ""}`)
      .join("\n");
    const rispostaCinema = (inglese
      ? "I can't find a cinema among the places listed in InCittà's Attractions guide, so I can't point you to a verified venue or confirm whether one exists in town. I won't suggest shops or products that have nothing to do with it."
      : "Nella guida Attrazioni di InCittà non trovo cinema tra i luoghi elencati, quindi non posso indicarti una sala verificata né confermarti se in città ce ne siano. Non ti propongo negozi o prodotti che non c'entrano.") +
      (elenco
        ? (inglese
            ? `\n\nAmong the events, these cinema-related initiatives are listed:\n\n${elenco}`
            : `\n\nTra gli eventi risultano queste iniziative legate al cinema:\n\n${elenco}`)
        : "");
    return {
      risposta: rispostaCinema,
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
    };
  }

  // Guida turistica InCittà: usa lo stesso catalogo della pagina /attrazioni.
  // Il filtro d'intento evita di deviare qui normali ricerche di prodotti o servizi.
  const richiestaTuristica = richiestaGuidaAttrazioniPino(domanda);
  const luoghi = filtraLuoghiPertinentiGuidaPino(
    domanda,
    searchAttractions(espandiCategorieGuidaPino(domanda), 6)
  );
  if (richiestaTuristica) {
    if (luoghi.length > 0) {
      const elenco = luoghi.map((luogo) => {
        const maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(luogo.queryMaps);
        return `- **${luogo.nome}** — ${luogo.tipo}. ${luogo.descrizione} [${linguaConversazione === "en" ? "Open in Google Maps" : "Apri su Google Maps"}](${maps})${luogo.url ? ` · [${linguaConversazione === "en" ? "Official source / website" : "Fonte / sito di riferimento"}](${luogo.url})` : ""}`;
      }).join("\n");
      const rispostaAttrazioni = linguaConversazione === "en"
        ? `I searched InCittà's Attractions guide. Here are the most relevant results:\n\n${elenco}\n\nFor opening hours, availability and event dates, always check the latest official sources.`
        : `Ho cercato nella guida Attrazioni di InCittà. Ecco i risultati più pertinenti:\n\n${elenco}\n\nPer orari, aperture e date degli eventi, verifica sempre le fonti ufficiali aggiornate.`;
      return {
        risposta: rispostaAttrazioni,
        negozi: [],
        prodotti: [],
        processingMs: Date.now() - inizio,
        source: "assistente",
      };
    }

    // La guida non ha un risultato pertinente: Pino si ferma qui e non delega
    // la richiesta a una ricerca commerciale. Il testo distingue l'assenza
    // nella guida dall'inesistenza del luogo in città.
    return {
      risposta: rispostaGuidaAttrazioniAssentePino(linguaConversazione),
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
    };
  }

  // Pino Intent Layer v1: la classificazione avviene PRIMA di ogni ricerca e
  // guida la scelta dei tool, le priorità di recupero e il messaggio finale.
  const analisi = analizzaIntentoPino(domanda);

  // `statoConversazionale`, `domandaSemantica` e `analisiSemantica` sono già
  // stati calcolati una sola volta all'inizio della richiesta (S4.1): qui non
  // vengono ricalcolati.
  const followUpBreve = rilevaFollowUp(domanda);

  // ── Domande informative/aggregate sul catalogo ──────────────────────────
  // "Quanti tipi di pasta ci sono?" NON è una ricerca per parola chiave: se
  // passa dal planner diventa query "quanti tipi di pasta ci sono", il gate di
  // pertinenza la azzera e Pino risponde con risultati non pertinenti.
  // Qui il soggetto (ed eventualmente il filtro già attivo) viene ricostruito
  // dalla conversazione e il conteggio usa SOLO i prodotti recuperati.
  const domandaAggregata = rilevaDomandaAggregata(domanda);
  if (domandaAggregata) {
    const precedenti = storico
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .slice(0, -1);
    const soggettoAggregato = risolviSoggettoAggregato(domanda, precedenti);

    if (soggettoAggregato) {
      const limite = 20;
      const qualificatore = soggettoAggregato.qualificatore;
      const prodottiSoggetto = await searchProducts(soggettoAggregato.soggetto, { limit: limite });
      const prodottiQualificatore = qualificatore
        ? (await searchProducts(qualificatore, { limit: limite })).filter((p) =>
            prodottoCorrispondeQualificatore(p, qualificatore)
          )
        : [];

      const risposta = componiRispostaAggregata({
        tipo: domandaAggregata.tipo,
        soggetto: soggettoAggregato.soggetto,
        qualificatore,
        prodottiSoggetto,
        prodottiQualificatore,
        limite,
        riferimentoContesto: domandaAggregata.riferimentoContesto,
        lingua: linguaConversazione,
      });

      console.log(
        "[pino-aggregata]",
        JSON.stringify({
          domanda,
          soggetto: soggettoAggregato.soggetto,
          qualificatore,
          daContesto: soggettoAggregato.daContesto,
          tipo: domandaAggregata.tipo,
          prodottiSoggetto: prodottiSoggetto.length,
          prodottiQualificatore: prodottiQualificatore.length,
        })
      );

      return {
        risposta,
        negozi: [],
        prodotti: prodottiQualificatore.length > 0 ? prodottiQualificatore : prodottiSoggetto,
        processingMs: Date.now() - inizio,
        source: "assistente",
        intent: analisi.intent,
      };
    }
  }

  // Meteo e farmacie sono intenti deterministici e non hanno bisogno di memoria.
  // Per tutte le altre richieste il recupero viene avviato senza saltare il
  // fast-path: così una correzione appresa può diventare immediatamente utile.
  const pianoLocale = pianoIntentoLocale(domanda);
  const memoriaPromise =
    pianoLocale?.tool === "getWeather" || pianoLocale?.tool === "searchPharmacies"
      ? Promise.resolve([])
      : recuperaMemoria(domandaSemantica);
  const memoria = await memoriaPromise;
  const attivaPlannerSemantico =
    !followUpBreve &&
    (
      usaFastPathSemantico(domandaSemantica, analisiSemantica) ||
      rilevaLinguaPino(domandaSemantica) === "en" ||
      domandaSemantica !== domanda ||
      domandaSemantica.length >= 22 ||
      /\b(?:non|senza|sotto|sopra|massimo|minimo|tra|entro|preferisco|tipo|per|aperto|aperta|ora|adesso|vicino)\b/i.test(domandaSemantica)
    );
  const semantica = attivaPlannerSemantico
    ? await interpretaRichiestaPino(
        domandaSemantica,
        storico,
        analisiSemantica,
        memoria,
        statoConversazionale
      )
    : undefined;

  // S4.1 — Vincoli effettivi verso i tool: piano prioritario, contratto in
  // appoggio. Il budget resta una preferenza (D-1), non un filtro.
  const vincoliComprensione = fondiVincoliPino(semantica, comprensione);

  // S4.5 — Richiesta di servizio: riconosciuta sul testo della richiesta, non
  // sulle descrizioni del catalogo. Se c'è, il catalogo interrogato è quello
  // delle attività con quel servizio dichiarato.
  const richiestaServizio = rilevaRichiestaServizioPino(domandaSemantica);

  // Stato dei risultati recuperati
  let negozi: NegozioRicerca[] = [];
  let prodotti: ProdottoRicerca[] = [];
  let offerte: Awaited<ReturnType<typeof searchOffers>> = [];
  let eventi: Awaited<ReturnType<typeof searchEvents>> = [];
  let categorie: Awaited<ReturnType<typeof getCategoriesList>> = [];
  let meteo: Awaited<ReturnType<typeof getWeatherCastrovillari>> = null;
  let farmacie: Awaited<ReturnType<typeof searchPharmacies>> = [];
  let directReply: string | null = null;
  let selezioneOk = false;
  let invocazioni: ToolInvocation[] = [];
  let followUp: FollowUp | null = null;

  // 1) Piano di ricerca: guardie deterministiche per le intenzioni chiare
  // (offerte, eventi, mangiare, chiacchiera, domande su InCittà); per tutto
  // il resto la selezione dei tool la fa l'LLM.
  const piano = pianoPredefinito(storico, analisi, semantica, domandaSemantica);

  if (piano) {
    directReply = piano.directReply;
    invocazioni = piano.tools.filter((t) => typeof t.tool === "string" && t.tool.trim());
    followUp = piano.followUp ?? null;
    selezioneOk = true;
  } else {
    try {
      const raw = await callGeminiText({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildToolSelectionPrompt(storico, descriviIntento(analisi)),
        maxTokens: 450,
        temperature: 0.1,
        timeoutMs: 45_000,
      });
      const parsed = JSON.parse(extractJsonFromText(raw)) as {
        tools?: ToolInvocation[];
        directReply?: string | null;
      };

      if (parsed && typeof parsed.directReply === "string" && parsed.directReply.trim()) {
        directReply = parsed.directReply.trim();
      }

      const tools = Array.isArray(parsed?.tools) ? parsed.tools.slice(0, 3) : [];
      invocazioni = tools.filter((t) => typeof t.tool === "string" && t.tool.trim());
      selezioneOk = true;
    } catch (error) {
      // Selezione fallita → ricerca completa di sicurezza sull'ultima domanda
      console.warn("[assistente] Selezione tool fallita, uso searchAll:", error);
    }
  }

  // Memoria semantica: associazioni già confermate diventano ricerche
  // aggiuntive sulle attività, senza sostituire il piano principale.
  const usaMemoriaSuRicerca = !directReply &&
    !followUp &&
    !richiestaServizio &&
    !isExplicitFoodProductRequest(domanda) &&
    memoria.length > 0 &&
    !invocazioni.some((t) => t.tool === "getWeather" || t.tool === "searchPharmacies");

  if (usaMemoriaSuRicerca) {
    const giaCercati = new Set(
      invocazioni.map((t) => String(t.params?.query ?? "").trim().toLowerCase()).filter(Boolean)
    );
    for (const voce of memoria.slice(0, 3)) {
      const qMemoria = voce.concetto;
      if (!qMemoria || giaCercati.has(qMemoria.toLowerCase())) continue;
      invocazioni.push({ tool: "searchStores", params: { query: qMemoria, limit: 6 } });
      giaCercati.add(qMemoria.toLowerCase());
    }
    if (invocazioni.length > 3) invocazioni = invocazioni.slice(0, 3);
    if (invocazioni.length > 0) selezioneOk = true;
  }

  // Esecuzione dei tool scelti (dal piano o dall'LLM).
  const queryDefault = ultimaQuerySostanziale(storico);

  // Piano semantico autorevole per ricerche di prodotti fisici.
  // La query restituita dal planner è il soggetto del catalogo, non la frase
  // conversazionale completa. Questo evita che inglese, budget e richieste di
  // alternative diventino termini obbligatori nel gate di pertinenza.
  const pianoProdottoAffidabile = Boolean(
    semantica &&
    semantica.surface === "products" &&
    (semantica.intent === "product" || semantica.intent === "food" || semantica.intent === "drink") &&
    semantica.confidence !== "bassa" &&
    semantica.query.trim()
  );
  if (pianoProdottoAffidabile && semantica) {
    invocazioni = [{
      tool: "searchProducts",
      params: {
        query: semantica.query,
        limit: 8,
        maxPrice: semantica.maxPrice,
        minPrice: semantica.minPrice,
        esclusioni: vincoliComprensione.esclusioni,
        escludiNomi: [],
      },
    }];
    directReply = null;
    followUp = null;
    selezioneOk = true;
  }

  // Guardrail catalogo: una richiesta generica di regalo deve cercare prodotti
  // in più categorie anche SENZA budget. Prima questa espansione era annidata
  // nel solo ramo con prezzo e il planner poteva restituire attività fuori tema.
  const richiestaCatalogoEsplicita =
    /\b(regalo|regali|regalare|idea regalo|idee regalo|prodotto|prodotti|orologio|orologi|scarpe|borsa|borse|telefono|telefoni|libro|libri|cuffie|smartwatch|gioiello|gioielli|anello|anelli|collana|collane|bracciale|bracciali|profumo|profumi|portafoglio|portafogli|cintura|cinture|occhiali|giocattolo|giocattoli|tablet|computer|auricolari|altoparlante|speaker|watch|watches|clock|clocks|shoes|handbag|bag|phone|book|headphones|jewelry|ring|necklace|bracelet|perfume|wallet|belt|glasses|toy|toys|earbuds|speaker)\b/i.test(domandaSemantica) || pianoProdottoAffidabile;
  const importoCatalogo = domandaSemantica.match(/(?:budget(?:\s+di)?|massimo|fino a|entro|sotto|non oltre|al massimo|under|below|up to|less than|not over|at most)\s*(?:di\s*)?(?:€\s*)?(\d+(?:[.,]\d+)?)/i)
    ?? domandaSemantica.match(/(?:€\s*)(\d+(?:[.,]\d+)?)/i)
    ?? domandaSemantica.match(/(\d+(?:[.,]\d+)?)\s*(?:euros?|eur)\b/i);
  const maxPriceCatalogo =
    semantica?.maxPrice ??
    vincoliComprensione.maxPrice ??
    (importoCatalogo && !/\b(?:sopra|minimo|oltre|over|above|more than|at least)\b/i.test(domandaSemantica)
      ? Number(importoCatalogo[1].replace(",", "."))
      : undefined);
  const haToolProdotti = invocazioni.some((t) => t.tool === "searchProducts" || t.tool === "searchAll");
  const regaloGenerico = isGenericGiftRequest(domanda) || isGenericGiftRequest(domandaSemantica);

  if (regaloGenerico) {
    // La frase "un regalo per mia moglie" descrive l'intento, non il nome di
    // un articolo. Cerchiamo categorie di prodotto reali e poi deduplichiamo
    // per ID; il ranking e i filtri di pertinenza esistenti restano invariati.
    // Il budget, se presente, viene applicato a ogni ricerca e verificato di nuovo
    // dopo il merge. Nessuna chiamata a servizi esterni o nuove dipendenze.
    invocazioni = invocazioniRegaloPino(maxPriceCatalogo, {
      ...(vincoliComprensione.esclusioni.length
        ? { esclusioni: vincoliComprensione.esclusioni }
        : {}),
      ...(semantica?.city ? { citta: semantica.city } : {}),
    });
    directReply = null;
    selezioneOk = true;
    console.info("[pino-gift-routing]", JSON.stringify({
      genericGiftFanout: CATEGORIE_REGALO.length,
      toolInvocations: invocazioni.length,
      hasBudget: maxPriceCatalogo !== undefined && Number.isFinite(maxPriceCatalogo),
    }));
  } else if (richiestaCatalogoEsplicita && maxPriceCatalogo !== undefined && Number.isFinite(maxPriceCatalogo)) {
    if (!haToolProdotti) {
      // Usa la query ripulita dal planner (senza prezzo/valuta): la frase
      // naturale intera non è una keyword di catalogo.
      const queryCatalogo = semantica?.query?.trim() || domandaSemantica;
      invocazioni = [{
        tool: "searchProducts",
        params: {
          query: queryCatalogo,
          limit: 8,
          maxPrice: maxPriceCatalogo,
          minPrice: vincoliComprensione.minPrice ?? undefined,
          esclusioni: vincoliComprensione.esclusioni.length
            ? vincoliComprensione.esclusioni
            : undefined,
        },
      }];
      directReply = null;
      selezioneOk = true;
    } else {
      invocazioni = invocazioni.map((t) =>
        t.tool === "searchProducts" || t.tool === "searchAll"
          ? { ...t, params: { ...(t.params ?? {}), maxPrice: maxPriceCatalogo } }
          : t
      );
    }
    console.info("[pino-budget-routing-guard]", JSON.stringify({ budget: maxPriceCatalogo, forcedSearch: !haToolProdotti }));
  }
  // S4.5 — Una richiesta di servizio non deve passare dai prodotti: una sola
  // ricerca attività, con il servizio riconosciuto e il soggetto come query.
  if (richiestaServizio && !directReply && !followUp) {
    invocazioni = invocazioniConServizioPino(invocazioni, richiestaServizio, {
      esclusioni: vincoliComprensione.esclusioni,
      citta: semantica?.city ?? null,
    });
    selezioneOk = true;
    console.info("[pino-servizio-routing]", JSON.stringify({
      servizio: richiestaServizio.servizio,
      attivita: richiestaServizio.attivita,
    }));
  }

  // S4.3: colore e materiale viaggiano nei parametri di ogni invocazione che
  // legge il catalogo prodotti, indipendentemente da chi l'ha scelta.
  invocazioni = applicaAttributiProdottiPino(invocazioni, comprensione, domandaSemantica);

  // S5.2.1 — Query di riserva: solo se l'invocazione è priva di una query
  // utilizzabile. Nessuna nuova chiamata tool, nessun vincolo rimosso.
  invocazioni = applicaQueryRiservaPino(invocazioni, comprensione);

  // S5.1-D — Invariante globale: nessun percorso può superare 3 invocazioni.
  invocazioni = limitaInvocazioniPino(invocazioni);

  if (invocazioni.length > 0) {
    const risultati = await Promise.all(
      invocazioni.map((t) => eseguiTool(t.tool as string, t.params ?? {}, queryDefault))
    );
    // Merge con deduplica per id: più tool possono restituire lo stesso
    // negozio/prodotto (es. ricerca cibo multi-termine).
    for (let i = 0; i < risultati.length; i++) {
      const r = risultati[i];
      const categoriaRegalo = regaloGenerico ? String(invocazioni[i]?.params?.query ?? "") : "";
      for (const n of r.negozi) if (!negozi.some((e) => e.id === n.id)) negozi = [...negozi, n];
      for (const p of r.prodotti) {
        // Nel fan-out regalo accettiamo solo prodotti che corrispondono alla
        // categoria specifica interrogata: nessun fallback su articoli casuali.
        if (categoriaRegalo && !prodottoCorrispondeCategoriaRegalo(p, categoriaRegalo)) continue;
        if (!prodotti.some((e) => e.id === p.id)) prodotti = [...prodotti, p];
      }
      for (const o of r.offerte) if (!offerte.some((e) => e.id === o.id)) offerte = [...offerte, o];
      for (const e of r.eventi) if (!eventi.some((x) => x.id === e.id)) eventi = [...eventi, e];
      for (const c of r.categorie) if (!categorie.some((x) => x.nome === c.nome)) categorie = [...categorie, c];
      if (r.meteo && !meteo) meteo = r.meteo;
      for (const f of r.farmacie) if (!farmacie.some((x) => x.id === f.id && x.nome === f.nome)) farmacie = [...farmacie, f];
    }
  }

  // ── Recupero intelligente v3 ─────────────────────────────────────────────
  // Uno zero al primo tentativo NON è la fine della conversazione. In questo
  // punto Pino ha già provato la ricerca principale: ora usa il planner
  // semantico per capire il concetto, allargare morfologia/sinonimi e, se
  // utile, cercare anche le attività che possono avere quel prodotto.
  let notaRecupero: string | null = null;
  if (
    selezioneOk &&
    !directReply &&
    !followUp &&
    !regaloGenerico &&
    !richiestaServizio &&
    negozi.length === 0 &&
    prodotti.length === 0 &&
    offerte.length === 0 &&
    eventi.length === 0 &&
    !invocazioni.some((t) =>
      t.tool === "getWeather" || t.tool === "searchPharmacies" || t.tool === "searchOffers" || t.tool === "searchEvents"
    )
  ) {
    const recupero = await recuperaAlternativeSemantiche(
      domanda,
      storico,
      analisi,
      memoria,
      semantica,
      budgetInvocazioniRecuperoPino(invocazioni.length)
    );
    if (recupero.prodotti.length > 0 || recupero.negozi.length > 0) {
      prodotti = recupero.prodotti;
      negozi = recupero.negozi;
      notaRecupero = recupero.descrizione;
      console.log(
        "[assistente] recupero semantico:",
        JSON.stringify({
          query: recupero.piano?.query ?? null,
          terms: recupero.piano?.terms ?? [],
          prodotti: prodotti.length,
          negozi: negozi.length,
        })
      );
    }
  }

  // S4.3 — Barriera finale su colore e materiale: vale per la ricerca ordinaria,
  // per il fan-out dei regali, per il recupero semantico e per il fallback.
  // Nessun percorso secondario può reintrodurre prodotti incompatibili.
  const attributiRichiesti = attributiProdottiPino(comprensione, domandaSemantica);
  const esitoAttributi = attributiRichiesti
    ? filtraProdottiPerAttributiPino(prodotti, attributiRichiesti)
    : null;
  if (esitoAttributi) {
    prodotti = esitoAttributi.prodotti;
    console.info("[pino-attributi-filter]", JSON.stringify({
      colori: attributiRichiesti?.colori ?? [],
      materiali: attributiRichiesti?.materiali ?? [],
      esclusi: esitoAttributi.esclusi,
      senzaColore: esitoAttributi.senzaColore,
      senzaMateriale: esitoAttributi.senzaMateriale,
      risultati: prodotti.length,
    }));
  }

  // Barriera finale: applica il budget dopo il merge e il recupero semantico,
  // così nessun risultato secondario può reintrodurre articoli fuori soglia.
  // D-1 (opzione B): il budget è INDICATIVO — ordina, non elimina — e vale
  // qualunque sia la lingua o la fonte della cifra (testo, piano, tool).
  const budgetDaTesto = rilevaBudgetIndicativoPino(domandaSemantica);
  const budgetDaPiano =
    semantica?.maxPrice != null && Number.isFinite(Number(semantica.maxPrice)) && Number(semantica.maxPrice) > 0
      ? Number(semantica.maxPrice)
      : null;
  const budgetDaTool =
    invocazioni
      .map((t) => t.params)
      .filter((p): p is ToolParams => !!p && p.maxPrice != null)
      .map((p) => Number(p.maxPrice))
      .filter((n) => Number.isFinite(n) && n > 0)
      .pop() ?? null;
  // Il budget riconosciuto dal contratto resta una PREFERENZA indicativa: qui
  // entra nell'ordinamento finale, mai come filtro rigido.
  const budgetDaComprensione =
    comprensione.maxPrice != null &&
    Number.isFinite(Number(comprensione.maxPrice)) &&
    Number(comprensione.maxPrice) > 0
      ? Number(comprensione.maxPrice)
      : null;
  const budgetPreferenza =
    budgetDaTesto ?? budgetDaPiano ?? budgetDaComprensione ?? budgetDaTool;
  if (budgetPreferenza != null && prodotti.length > 0) {
    prodotti = ordinaProdottiPerBudget(prodotti, { maxPrice: budgetPreferenza });
    console.info("[pino-budget-soft-order]", JSON.stringify({
      budget: budgetPreferenza,
      risultati: prodotti.length,
      entroBudget: prodotti.filter((p) => {
        const prezzo = prezzoNumerico(p.prezzo);
        return prezzo != null && prezzo > 0 && prezzo <= budgetPreferenza;
      }).length,
    }));
  }

  console.log(
    "[assistente] intento:",
    descriviIntento(analisi),
    followUp ? `| follow-up: ${followUp.tipo} (${followUp.segnale})` : "",
    "| segnali:",
    JSON.stringify(analisi.segnali),
    "| piano:",
    JSON.stringify(invocazioni.map((t) => t.tool)),
    "| comprensione:",
    JSON.stringify({
      lingua: comprensione.lingua,
      soggetto: comprensione.soggetto,
      attributi: comprensione.attributi,
      esclusioni: comprensione.esclusioni,
      minPrice: comprensione.minPrice,
      maxPrice: comprensione.maxPrice,
      servizio: richiestaServizio?.servizio ?? null,
    }),
    "| risultati — negozi:",
    negozi.length,
    "prodotti:",
    prodotti.length,
    "offerte:",
    offerte.length,
    "eventi:",
    eventi.length,
    "categorie:",
    categorie.length
  );

  // 2) Risposta diretta (chiacchiera / cortesia): nessuna ricerca
  if (directReply) {
    return {
      risposta: directReply,
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
      intent: analisi.intent,
    };
  }

  // 3) Dati deterministici: meteo e farmacie non passano MAI dal modello
  // finale. Se il dato non è disponibile, lo dichiariamo esplicitamente.
  const haMeteo = invocazioni.some((t) => t.tool === "getWeather");
  const haFarmacie = invocazioni.some((t) => t.tool === "searchPharmacies");

  if (haMeteo) {
    return {
      risposta: rispostaMeteoDeterministica(meteo, linguaConversazione),
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
      intent: analisi.intent,
    };
  }

  if (haFarmacie) {
    const statoFarmacia =
      invocazioni.find((t) => t.tool === "searchPharmacies")?.params?.stato ?? "turno";
    const motivoFebbre = REQUIRES_PHARMACY_REASON.test(domanda)
      ? (linguaConversazione === "en" ? "the symptoms you mentioned" : "i sintomi che hai indicato")
      : undefined;
    return {
      risposta: rispostaFarmacieDeterministica(farmacie, statoFarmacia, motivoFebbre, linguaConversazione),
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
      intent: analisi.intent,
    };
  }

  // 4) Fallback: ricerca completa SOLO se la selezione LLM è fallita.
  // Se l'LLM ha scelto tool che non hanno trovato nulla, i risultati sono
  // davvero vuoti → la risposta finale lo dirà onestamente.
  // Se l'LLM non ha scelto tool né risposta diretta (es. "va bene" senza
  // contesto), NON inventiamo una ricerca: rispondiamo in modo naturale.
  const toolsEseguiti = invocazioni.length > 0;
  if (!selezioneOk && !richiestaServizio) {
    // Fallback con gli stessi vincoli del piano: nessuna ricerca "pulita" che
    // possa reintrodurre prodotti esclusi o fuori budget.
    const tutto = await searchAll(
      domanda,
      parametriFallbackPiano(semantica, comprensione, domandaSemantica)
    );
    negozi = tutto.negozi;
    prodotti = tutto.prodotti;
    offerte = tutto.offerte;
    eventi = tutto.eventi;
    categorie = tutto.categorie;
  } else if (!directReply && !toolsEseguiti && !richiestaServizio) {
    return {
      risposta: linguaConversazione === "en"
        ? "I'm here! I can help you find local shops, products, offers and events. What are you looking for?"
        : "Va bene, sono qui! Posso aiutarti a trovare negozi, prodotti, offerte ed eventi nella tua città. Dimmi pure cosa cerchi.",
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
      intent: analisi.intent,
    };
  }

  // S5.3 — Barriera finale di disponibilità: vale per la ricerca ordinaria,
  // per il fallback e per qualsiasi percorso che abbia prodotto risultati.
  // La quantità netta è quella del checkout; i dati mancanti restano
  // "non verificati" e non vengono dichiarati esauriti.
  const prodottiPrimaDisponibilita = prodotti.length;
  let notaDisponibilita: string | null = null;
  if (prodottiPrimaDisponibilita > 0) {
    const esitoDisponibilita = filtraProdottiPerDisponibilitaPino(prodotti);
    prodotti = esitoDisponibilita.disponibili;
    notaDisponibilita = notaDisponibilitaProdottiPino(esitoDisponibilita, linguaConversazione);
    console.info("[pino-disponibilita-filter]", JSON.stringify({
      trovati: esitoDisponibilita.totale,
      disponibili: esitoDisponibilita.disponibili.length,
      nonDisponibili: esitoDisponibilita.nonDisponibili.length,
      nonVerificati: esitoDisponibilita.nonVerificati.length,
    }));
  }

  // Apprendimento non bloccante: impara solo da ricerche reali.
  if (!followUp && !haMeteo && !haFarmacie && !directReply && toolsEseguiti) {
    void registraEsitoMemoria({
      query: domanda,
      analisi,
      categorie: negozi.map((n) => n.categoria ?? "").filter(Boolean),
      risultati: contaRisultati(aRisultatiRecuperati(negozi, prodotti, { offerte, eventi })),
      memoriaUsata: memoria,
      semantica,
    });
  }

  // 4b) Pino Conversazionale v1: il follow-up MODIFICA i risultati del soggetto
  // precedente (aperti ora / economici / vicino / altro). Nessuna ricerca
  // generica: se il filtro non è applicabile sui dati reali, Pino lo dichiara.
  if (followUp) {
    return rispostaFollowUp({
      followUp,
      negozi,
      prodotti,
      storico,
      analisi,
      inizio,
      lingua: linguaConversazione,
    });
  }

  // 5) Contesto strutturato per la risposta finale
  const risultati: RisultatiRecuperati = aRisultatiRecuperati(negozi, prodotti, {
    offerte,
    eventi,
    categorie,
    meteo,
    farmacie,
  });
  const contesto = buildContextoRisultati(risultati);

  // Il prezzo è una preferenza: privilegia le opzioni entro budget senza
  // vietare alternative utili quando il catalogo non offre corrispondenze.
  const vincoliPrezzo = Array.from(
    new Set(
      invocazioni
        .map((t) => t.params)
        .filter((p): p is ToolParams => !!p && (p.maxPrice != null || p.minPrice != null))
        .map((p) => {
          const pezzi: string[] = [];
          if (p.minPrice != null) pezzi.push(`da €${p.minPrice}`);
          if (p.maxPrice != null) pezzi.push(`budget indicativo €${p.maxPrice}`);
          return pezzi.join(" e ");
        })
    )
  );
  const notaVincolo =
    vincoliPrezzo.length > 0
      ? `Preferenza di prezzo (${vincoliPrezzo.join("; ")}): mostra prima le opzioni nella fascia indicata, poi eventuali alternative più costose, con prezzi chiari.`
      : "";

  const contestoFinale = notaVincolo
    ? `${contesto}\n\n${notaVincolo}`
    : contesto;

  // 6) Risposta rapida grounded: i risultati sono già stati recuperati dai tool.
  // Evitiamo una seconda chiamata Gemini solo per riscrivere dati che abbiamo
  // già verificato: così Pino mostra i risultati molto prima.
  // S5.1-A — Un'unica fonte per la lingua: il contratto di comprensione
  // (preferenza esplicita inclusa), lo stesso usato dai rami anticipati.
  const linguaRisposta = linguaConversazione;
  // Le direttive interne (notaVincolo) restano nel contesto tecnico e non
  // vengono mai passate alla composizione della risposta: l'utente vede solo
  // testo naturale, senza istruzioni operative.
  const rispostaBase = fallbackTestuale(
    risultati,
    "",
    analisi.intent,
    semantica,
    budgetPreferenza,
    linguaRisposta
  );
  // S4.5 — Per le richieste di servizio la risposta è deterministica e usa solo
  // i servizi restituiti dal tool (prezzo e durata inclusi o dichiarati assenti).
  const rispostaServizioTrovata = richiestaServizio
    ? rispostaServizioPino(negozi, richiestaServizio.servizio, linguaRisposta)
    : null;
  // Se l'unico esito erano prodotti esauriti, la risposta di base non deve
  // dire "non ho trovato nulla": li ha trovati, ma non sono acquistabili.
  const soloProdottiEsauriti =
    Boolean(notaDisponibilita) &&
    prodottiPrimaDisponibilita > 0 &&
    prodotti.length === 0 &&
    negozi.length === 0 &&
    offerte.length === 0 &&
    eventi.length === 0 &&
    categorie.length === 0;
  const rispostaBaseEffettiva = rispostaServizioTrovata ??
    (soloProdottiEsauriti ? notaDisponibilita! : rispostaBase);
  // S4.3: nota solo quando il catalogo non permette di confermare l'attributo o
  // quando il filtro ha azzerato i risultati compatibili.
  const notaAttributi = esitoAttributi
    ? notaAttributiProdottiPino(esitoAttributi, comprensione, linguaRisposta, domandaSemantica)
    : null;
  // S5.2.1 — Contestare in modo trasparente gli attributi non verificabili
  // (destinatario, età, taglia, provenienza, artigianalità) senza filtri.
  const notaContestoAttributi = notaContestoAttributiPino(comprensione, linguaRisposta);
  const partiRisposta = [notaRecupero, notaAttributi, notaContestoAttributi];
  if (notaDisponibilita && !soloProdottiEsauriti) partiRisposta.push(notaDisponibilita);
  partiRisposta.push(rispostaBaseEffettiva);
  const risposta = partiRisposta
    .filter((parte): parte is string => Boolean(parte && parte.trim()))
    .join("\n\n");

  return {
    risposta,
    negozi: negozi.slice(0, 8),
    prodotti: prodotti.slice(0, 10),
    processingMs: Date.now() - inizio,
    source: "assistente",
    intent: analisi.intent,
  };
}
