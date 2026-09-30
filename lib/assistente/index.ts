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
import type { NegozioRicerca, ProdottoRicerca } from "@/lib/ricerca-ai";
import { pianoIntentoLocale } from "./local-intents";
import {
  analizzaIntentoPino,
  pianoIntento,
  descriviIntento,
  type PinoIntent,
  type PinoIntentAnalysis,
} from "./intent";
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

type ToolInvocation = {
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

// Ultima query "sostanziale" dell'utente: se il messaggio corrente è solo un
// vincolo/follow-up ("sotto 500 euro", "e sotto i 300?", "più economico"),
// usa la richiesta precedente come soggetto della ricerca.
const RE_VINCOLO = /^(e\s+)?(sotto|sopra|massimo|minimo|meno di|più di|piu di|più economico|piu economico|che altro|più caro|piu caro|oltre|fino a|tra)\b/i;

// Intenzione salute → farmacia: usata anche nella risposta deterministica.
const REQUIRES_PHARMACY_REASON =
  /\bfebbre\b|\btemperatura alta\b|\bmal di gola\b|\braffreddore\b|\binfluenza\b|\btosse\b/i;

function eQuerySostanziale(q: string): string | null {
  const t = q.trim();
  if (!t || t.length <= 3) return null;
  if (RE_VINCOLO.test(t)) return null;
  const parole = t.split(/\s+/);
  const soloVincoli = parole.every((p) =>
    /^(e|sotto|sopra|massimo|minimo|minore|fino|oltre|più|piu|di|a|da|tra|euro|€|\d+)$/i.test(p)
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

// Guardie deterministiche per le intenzioni CHIARE: garantiscono che "ci sono
// offerte?", "cosa c'è questo weekend?", "voglio mangiare", "va bene" e
// "che cos'è InCittà?" scelgano SEMPRE il tool/risposta giusti, senza
// affidarsi alla disciplina del modello. Per tutto il resto decide l'LLM.
function pianoPredefinito(
  storico: MessaggioAssistente[],
  analisi: PinoIntentAnalysis
): { directReply: string | null; tools: ToolInvocation[]; followUp?: FollowUp } | null {
  const utenti = storico.filter((m) => m.role === "user").map((m) => m.content);
  const ultimo = (utenti[utenti.length - 1] ?? "").trim().toLowerCase();
  if (!ultimo) return null;

  const RE_PIATTAFORMA =
    /che cos'è incittà|che cos'e incitta|cos'è incittà|come funziona|chi sei|cosa sei|cos'è il sito/;

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
  const RE_OFFERTE = /\bofferte\b|\bpromozion|\bsconti?\b|\bsaldo\b|\bsaldi\b/;
  const RE_EVENTI =
    /\beventi?\b|weekend|fine settimana|manifestazion|in programma|cosa c'è|cosa c'e|cosa succede|\bmostra\b|\bconcerto\b|\bfiera\b/;
  const RE_CHIACCHIERA =
    /^(va bene|ok|okay|perfetto|grazie|grazie mille|ciao|buongiorno|buonasera)$/;

  if (RE_PIATTAFORMA.test(ultimo)) {
    return {
      directReply:
        "InCittà è la piattaforma locale della tua città: raccoglie le attività commerciali del territorio con i loro negozi, prodotti e prezzi, offerte e promozioni, eventi e manifestazioni. Puoi cercare attività, confrontare prodotti, vedere orari e contatti e contattare i negozi direttamente.",
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
      directReply:
        "Va bene, sono qui! Posso aiutarti a trovare negozi, prodotti, offerte ed eventi nella tua città. Dimmi pure cosa cerchi.",
      tools: [],
    };
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

  // ── Pino Conversazionale v1: follow-up sul risultato precedente ───────────
  // Una richiesta BREVE ("solo aperti ora", "solo economici", "fammi vedere
  // altro", "vicino a me"...) NON deve diventare una ricerca generica: mantiene
  // il SOGGETTO della richiesta precedente e ne modifica i risultati. Il filtro
  // viene applicato DOPO il recupero (vedi rispostaFollowUp).
  const followUp = rilevaFollowUp(ultimo);
  if (followUp && utenti.length >= 2) {
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
      const limiteAlto = followUp.tipo === "altro" ? 12 : undefined;
      let tools: ToolInvocation[] = [];
      if (analisiPrec.intent !== "generic" && analisiPrec.confidence !== "bassa") {
        tools = pianoIntento(analisiPrec, soggetto).map((t) => ({
          tool: t.tool,
          params: {
            query: t.query,
            ...(limiteAlto
              ? { limit: limiteAlto }
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
            params: { query: soggetto, ...(limiteAlto ? { limit: limiteAlto } : {}) },
          },
          { tool: "searchProducts", params: { query: soggetto, limit: limiteAlto ?? 8 } },
        ];
      }
      return { directReply: null, tools, followUp };
    }
  }

  // ── Pino Intent Layer v1 ─────────────────────────────────────────────────
  // L'intento è già classificato PRIMA di ogni ricerca. Da qui il piano è
  // guidato dall'intento:
  //   - generic → nessuna ricerca forzata: Pino chiede di specificare;
  //   - confidenza alta/media → piano deterministico coerente con l'intento;
  //   - confidenza bassa (nessun segnale di dominio) → decide il planner LLM,
  //     esattamente come prima dell'intent layer.
  if (analisi.intent === "generic") {
    return {
      directReply:
        "Dimmi cosa cerchi a Castrovillari: un prodotto, un negozio, un servizio o un'idea regalo. Più dettagli mi dai, più preciso sarò.",
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
function aRisultatiRecuperati(
  negozi: NegozioRicerca[],
  prodotti: ProdottoRicerca[],
  extra: Partial<RisultatiRecuperati> = {}
): RisultatiRecuperati {
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
    })),
    offerte: [],
    eventi: [],
    categorie: [],
    meteo: null,
    farmacie: [],
    ...extra,
  };
}

/** Sezioni testuali dei risultati (condivise tra risposta normale e follow-up). */
function sezioniRisultati(risultati: RisultatiRecuperati): string[] {
  const sezioni: string[] = [];

  if (risultati.prodotti.length > 0) {
    sezioni.push(
      "**Prodotti trovati**\n" +
        risultati.prodotti
          .slice(0, 5)
          .map((p) => `- **${p.nome}** — €${p.prezzo} (${p.negozio_nome || "negozio sconosciuto"})`)
          .join("\n")
    );
  }
  if (risultati.negozi.length > 0) {
    sezioni.push(
      "**Negozi pertinenti**\n" +
        risultati.negozi
          .slice(0, 5)
          .map((n) => `- **${n.nome}**${n.categoria ? ` (${n.categoria})` : ""}`)
          .join("\n")
    );
  }
  if (risultati.offerte.length > 0) {
    sezioni.push(
      "**Offerte**\n" +
        risultati.offerte
          .slice(0, 4)
          .map((o) => `- **${o.titolo}**${o.prezzo_offerta != null ? ` — €${o.prezzo_offerta}` : ""} (${o.negozio_nome || "negozio sconosciuto"})`)
          .join("\n")
    );
  }
  if (risultati.eventi.length > 0) {
    sezioni.push(
      "**Eventi**\n" +
        risultati.eventi
          .slice(0, 4)
          .map((e) => `- **${e.titolo}**${e.data_inizio ? ` — ${e.data_inizio.slice(0, 10)}` : ""} (${e.negozio_nome || "negozio sconosciuto"})`)
          .join("\n")
    );
  }
  if (risultati.meteo) {
    sezioni.push(
      `**Meteo Castrovillari**\n- Ora: ${risultati.meteo.temperatura}°C, ${risultati.meteo.descrizione}; oggi ${risultati.meteo.oggi.minima}°/${risultati.meteo.oggi.massima}°. Domani: ${risultati.meteo.domani.descrizione}, ${risultati.meteo.domani.minima}°/${risultati.meteo.domani.massima}°.`
    );
  }
  if (risultati.farmacie.length > 0) {
    sezioni.push(
      "**Farmacie verificate**\n" +
        risultati.farmacie
          .slice(0, 5)
          .map((f) => `- **${f.nome}**${f.stato ? ` — ${f.stato}` : " — stato non verificato"}${f.turno ? ` — ${f.turno}` : ""}${f.telefono ? ` — tel. ${f.telefono}` : ""}`)
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

function fallbackTestuale(
  risultati: RisultatiRecuperati,
  notaVincolo = "",
  intent?: PinoIntent
): string {
  const sezioni = sezioniRisultati(risultati);
  const totale = contaRisultati(risultati);

  if (totale === 0) {
    // Nessun risultato: Pino spiega cosa ha fatto e chiede di meglio.
    return "Non ho trovato esattamente quello che cerchi. Prova a descrivere meglio cosa cerchi: posso cercare negozi, prodotti, offerte ed eventi a Castrovillari.";
  }

  const soloNegozi =
    risultati.prodotti.length === 0 &&
    risultati.negozi.length > 0 &&
    risultati.offerte.length === 0 &&
    risultati.eventi.length === 0;

  // Messaggio di apertura: dice sempre all'utente COSA ha trovato e cosa no,
  // in modo naturale. Per i servizi non ha senso parlare di "prodotto esatto".
  let introduzione = "";
  if (risultati.prodotti.length > 0) {
    const n = risultati.prodotti.length;
    introduzione = `Ho trovato ${n} ${n === 1 ? "prodotto" : "prodotti"} che ${n === 1 ? "corrisponde" : "corrispondono"} alla tua ricerca.\n\n`;
  } else if (soloNegozi) {
    introduzione =
      intent === "service"
        ? "Non ho trovato quello che cerchi, ma queste attività potrebbero aiutarti.\n\n"
        : "Non ho trovato esattamente quello che cerchi, ma queste attività potrebbero aiutarti.\n\n";
  } else if (totale > 0) {
    introduzione = "Ho trovato alcune informazioni pertinenti alla tua ricerca.\n\n";
  }

  // Motivazione basata sui dati reali (solo quando mostriamo attività senza
  // prodotto): cita la categoria registrata, mai caratteristiche inventate.
  const motivazione = soloNegozi ? motivoCategoria(risultati.negozi) : null;
  const nota = notaVincolo ? `\n\n_${notaVincolo}_` : "";
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
}): Promise<RispostaAssistente> {
  const { followUp, negozi, prodotti, storico, analisi, inizio } = input;
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
      risposta:
        "Non avevo risultati precedenti da filtrare. Dimmi cosa cerchi e poi potrò applicare il filtro che hai indicato.",
    };
  }

  // ── Aperti ora ──
  if (followUp.tipo === "aperti") {
    const ids = [...negozi.map((n) => n.id), ...prodotti.map((p) => p.negozio_id)];
    const orari = await orariPerNegozi(ids);
    const negoziAperti = negozi.filter((n) => apertoOra(orari.get(n.id)) === true);
    const prodottiAperti = prodotti.filter(
      (p) => apertoOra(orari.get(p.negozio_id)) === true
    );
    if (negoziAperti.length === 0 && prodottiAperti.length === 0) {
      return {
        ...base,
        negozi: [],
        prodotti: [],
        risposta:
          "Tra i risultati precedenti, nessuna attività risulta aperta ora secondo gli orari registrati su InCittà.",
      };
    }
    const corpo = sezioniRisultati(aRisultatiRecuperati(negoziAperti, prodottiAperti)).join("\n\n");
    return {
      ...base,
      negozi: negoziAperti,
      prodotti: prodottiAperti,
      risposta: `Tra i risultati precedenti, queste sono le attività aperte ora:\n\n${corpo}`,
    };
  }

  // ── Solo economici ── (ordinabili solo i prodotti: i negozi non hanno prezzo)
  if (followUp.tipo === "economici") {
    if (prodotti.length > 0) {
      const ordinati = [...prodotti].sort((a, b) => Number(a.prezzo) - Number(b.prezzo));
      const quanti = Math.max(1, Math.ceil(ordinati.length / 2));
      const economici = ordinati.slice(0, quanti);
      const corpo = sezioniRisultati(aRisultatiRecuperati([], economici)).join("\n\n");
      return {
        ...base,
        negozi: [],
        prodotti: economici,
        risposta: `Tra i risultati precedenti, ecco le opzioni più economiche:\n\n${corpo}`,
      };
    }
    const corpo = sezioniRisultati(aRisultatiRecuperati(negozi, [])).join("\n\n");
    return {
      ...base,
      negozi,
      prodotti: [],
      risposta:
        "I negozi non hanno un prezzo associato, quindi non posso ordinarli per economicità: il filtro \"economici\" vale sui prodotti. Ecco le attività già trovate:\n\n" +
        corpo,
    };
  }

  // ── Solo vicino ── (nessuna posizione utente: niente distanza inventata)
  if (followUp.tipo === "vicino") {
    const corpo = sezioniRisultati(aRisultatiRecuperati(negozi, prodotti)).join("\n\n");
    return {
      ...base,
      negozi,
      prodotti,
      risposta:
        "Non conosco la tua posizione, quindi non posso calcolare la distanza dalle attività (a InCittà non arriva la geolocalizzazione dal browser). Dimmi la zona o la via e filtro di conseguenza. Intanto ecco i risultati precedenti:\n\n" +
        corpo,
    };
  }

  // ── Fammi vedere altro / alternative ──
  const precedenteAssistente = [...storico]
    .reverse()
    .find((m) => m.role === "assistant")?.content ?? "";
  const giaMostrato = (nome: string) =>
    precedenteAssistente.toLowerCase().includes(nome.toLowerCase());
  const nuoviNegozi = negozi.filter((n) => !giaMostrato(n.nome));
  const nuoviProdotti = prodotti.filter((p) => !giaMostrato(p.nome));

  if (nuoviNegozi.length === 0 && nuoviProdotti.length === 0) {
    return {
      ...base,
      negozi: [],
      prodotti: [],
      risposta:
        "Ho già mostrato tutte le opzioni disponibili per la tua ricerca: non ce ne sono altre con gli stessi criteri. Vuoi provare una zona diversa, un'altra categoria o un'altra fascia di prezzo?",
    };
  }
  const corpo = sezioniRisultati(aRisultatiRecuperati(nuoviNegozi, nuoviProdotti)).join("\n\n");
  return {
    ...base,
    negozi: nuoviNegozi,
    prodotti: nuoviProdotti,
    risposta: `Ecco altre opzioni che non ti avevo ancora mostrato:\n\n${corpo}`,
  };
}

// ─── Risposte deterministiche per dati sensibili al falso positivo ───────────
// Meteo e stato farmacie non devono mai essere "interpretati" da Gemini:
// una volta recuperati i dati, la risposta viene composta qui usando soltanto
// ciò che la fonte ha realmente restituito. Questo elimina le allucinazioni
// anche quando il modello finale sarebbe tentato di completare i buchi.

function rispostaMeteoDeterministica(meteo: Awaited<ReturnType<typeof getWeatherCastrovillari>>): string {
  if (!meteo) {
    return "Al momento non riesco a verificare il meteo di Castrovillari. Non ti do una previsione inventata: riprova tra poco.";
  }

  const oggiPioggia =
    meteo.oggi.probabilitaPioggia != null
      ? ", probabilità di pioggia " + meteo.oggi.probabilitaPioggia + "%"
      : "";
  const domaniPioggia =
    meteo.domani.probabilitaPioggia != null
      ? ", probabilità di pioggia " + meteo.domani.probabilitaPioggia + "%"
      : "";

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
  motivo?: string
): string {
  if (statoRichiesto === "aperte") {
    const aperte = farmacie.filter((f) => f.stato === "aperta").slice(0, 5);
    if (aperte.length === 0) {
      return "Al momento non risulta alcuna farmacia con stato APERTA verificato nei dati disponibili per Castrovillari. Non ti indico farmacie non verificate come aperte.";
    }

    const elenco = aperte
      .map((f) => {
        const dettagli = [
          f.indirizzo ? f.indirizzo : null,
          f.telefono ? "tel. " + f.telefono : null,
          f.apertura ? "orari: " + f.apertura : null,
        ]
          .filter(Boolean)
          .join(" — ");
        return "- **" + f.nome + "**" + (dettagli ? " — " + dettagli : "");
      })
      .join("\n");

    return "Dai dati verificati di oggi risultano aperte:\n" + elenco;
  }

  if (statoRichiesto === "tutte") {
    if (farmacie.length === 0) {
      return "Al momento non ho dati verificati sulle farmacie di Castrovillari.";
    }

    const elenco = farmacie
      .slice(0, 8)
      .map((f) => {
        const stato =
          f.turno ? "DI TURNO" : f.stato === "aperta" ? "APERTA" : f.stato === "chiusa" ? "CHIUSA" : "NON VERIFICATA";
        const dettagli = [
          f.indirizzo ? f.indirizzo : null,
          f.turno ? f.turno : null,
          f.telefono ? "tel. " + f.telefono : null,
        ]
          .filter(Boolean)
          .join(" — ");
        return "- **" + f.nome + "** — " + stato + (dettagli ? " — " + dettagli : "");
      })
      .join("\n");

    return "Farmacie per cui ho dati disponibili:\n" + elenco;
  }

  const turno = farmacie.filter((f) => Boolean(f.turno)).slice(0, 3);

  if (turno.length === 0) {
    const prefisso = motivo ? "Per " + motivo + ", " : "";
    return (
      prefisso +
      "al momento non risulta alcuna farmacia di turno verificata nei dati disponibili per Castrovillari. " +
      "Non ti indico un nome non verificato, per evitare un falso positivo."
    );
  }

  const elenco = turno
    .map((f) => {
      const dettagli = [
        f.turno ? f.turno : null,
        f.indirizzo ? f.indirizzo : null,
        f.telefono ? "tel. " + f.telefono : null,
      ]
        .filter(Boolean)
        .join(" — ");
      return "- **" + f.nome + "**" + (dettagli ? " — " + dettagli : "");
    })
    .join("\n");

  const prefisso = motivo
    ? "Per " + motivo + ", puoi rivolgerti a una farmacia di turno. Dai dati verificati di oggi risulta:\n"
    : "Dai dati verificati di oggi risulta:\n";

  return prefisso + elenco;
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

  // Pino Intent Layer v1: la classificazione avviene PRIMA di ogni ricerca e
  // guida la scelta dei tool, le priorità di recupero e il messaggio finale.
  const analisi = analizzaIntentoPino(domanda);

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
  const piano = pianoPredefinito(storico, analisi);

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

  // Esecuzione dei tool scelti (dal piano o dall'LLM).
  const queryDefault = ultimaQuerySostanziale(storico);
  if (invocazioni.length > 0) {
    const risultati = await Promise.all(
      invocazioni.map((t) => eseguiTool(t.tool as string, t.params ?? {}, queryDefault))
    );
    // Merge con deduplica per id: più tool possono restituire lo stesso
    // negozio/prodotto (es. ricerca cibo multi-termine).
    for (const r of risultati) {
      for (const n of r.negozi) if (!negozi.some((e) => e.id === n.id)) negozi = [...negozi, n];
      for (const p of r.prodotti) if (!prodotti.some((e) => e.id === p.id)) prodotti = [...prodotti, p];
      for (const o of r.offerte) if (!offerte.some((e) => e.id === o.id)) offerte = [...offerte, o];
      for (const e of r.eventi) if (!eventi.some((x) => x.id === e.id)) eventi = [...eventi, e];
      for (const c of r.categorie) if (!categorie.some((x) => x.nome === c.nome)) categorie = [...categorie, c];
      if (r.meteo && !meteo) meteo = r.meteo;
      for (const f of r.farmacie) if (!farmacie.some((x) => x.id === f.id && x.nome === f.nome)) farmacie = [...farmacie, f];
    }
  }

  console.log(
    "[assistente] intento:",
    descriviIntento(analisi),
    followUp ? `| follow-up: ${followUp.tipo} (${followUp.segnale})` : "",
    "| segnali:",
    JSON.stringify(analisi.segnali),
    "| piano:",
    JSON.stringify(invocazioni.map((t) => t.tool)),
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
      risposta: rispostaMeteoDeterministica(meteo),
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
      ? "i sintomi che hai indicato"
      : undefined;
    return {
      risposta: rispostaFarmacieDeterministica(farmacie, statoFarmacia, motivoFebbre),
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
  if (!selezioneOk) {
    const tutto = await searchAll(domanda, {});
    negozi = tutto.negozi;
    prodotti = tutto.prodotti;
    offerte = tutto.offerte;
    eventi = tutto.eventi;
    categorie = tutto.categorie;
  } else if (!directReply && !toolsEseguiti) {
    return {
      risposta:
        "Va bene, sono qui! Posso aiutarti a trovare negozi, prodotti, offerte ed eventi nella tua città. Dimmi pure cosa cerchi.",
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
      intent: analisi.intent,
    };
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

  // Nota sul vincolo di prezzo applicato: quando l'utente chiede un limite
  // ("sotto 500 euro") e i prodotti recuperati lo superano, l'AI deve
  // segnalarli onestamente come alternative fuori budget.
  const vincoliPrezzo = invocazioni
    .map((t) => t.params)
    .filter((p): p is ToolParams => !!p && (p.maxPrice != null || p.minPrice != null))
    .map((p) => {
      const pezzi: string[] = [];
      if (p.minPrice != null) pezzi.push(`min €${p.minPrice}`);
      if (p.maxPrice != null) pezzi.push(`max €${p.maxPrice}`);
      return pezzi.join(" e ");
    });
  const notaVincolo =
    vincoliPrezzo.length > 0
      ? `Nota: la tua richiesta indicava un limite di prezzo (${vincoliPrezzo.join("; ")}). Se un prodotto/opzione elencato supera il limite, è l'alternativa più vicina realmente trovata: segnalalo sempre con il prezzo reale.`
      : "";

  const contestoFinale = notaVincolo
    ? `${contesto}\n\n${notaVincolo}`
    : contesto;

  // 6) Risposta rapida grounded: i risultati sono già stati recuperati dai tool.
  // Evitiamo una seconda chiamata Gemini solo per riscrivere dati che abbiamo
  // già verificato: così Pino mostra i risultati molto prima.
  const risposta = fallbackTestuale(risultati, notaVincolo, analisi.intent);

  return {
    risposta,
    negozi: negozi.slice(0, 8),
    prodotti: prodotti.slice(0, 10),
    processingMs: Date.now() - inizio,
    source: "assistente",
    intent: analisi.intent,
  };
}
