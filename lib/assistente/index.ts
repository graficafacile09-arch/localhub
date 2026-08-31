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
}> {
  const vuoto = { negozi: [], prodotti: [], offerte: [], eventi: [], categorie: [] };
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
    case "getCategories":
      return { ...vuoto, categorie: await getCategoriesList() };
    case "searchOffers":
    case "searchEvents":
    case "getCategories":
    default:
      return vuoto;
  }
}

// Ultima query "sostanziale" dell'utente: se il messaggio corrente è solo un
// vincolo/follow-up ("sotto 500 euro", "e sotto i 300?", "più economico"),
// usa la richiesta precedente come soggetto della ricerca.
const RE_VINCOLO = /^(e\s+)?(sotto|sopra|massimo|minimo|meno di|più di|piu di|più economico|piu economico|che altro|più caro|piu caro|oltre|fino a|tra)\b/i;

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
  storico: MessaggioAssistente[]
): { directReply: string | null; tools: ToolInvocation[] } | null {
  const utenti = storico.filter((m) => m.role === "user").map((m) => m.content);
  const ultimo = (utenti[utenti.length - 1] ?? "").trim().toLowerCase();
  if (!ultimo) return null;

  const RE_PIATTAFORMA =
    /che cos'è incittà|che cos'e incitta|cos'è incittà|come funziona|chi sei|cosa sei|cos'è il sito/;
  const RE_OFFERTE = /\bofferte\b|\bpromozion|\bsconti?\b|\bsaldo\b|\bsaldi\b/;
  const RE_EVENTI =
    /\beventi?\b|weekend|fine settimana|manifestazion|in programma|cosa c'è|cosa c'e|cosa succede|\bmostra\b|\bconcerto\b|\bfiera\b/;
  const RE_CIBO =
    /\bmangiare\b|ristorant|trattoria|pizzeria|\bpizza\b|cena|pranzo|aperitiv|\bpanificio\b|\bforno\b/;
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
  if (RE_CIBO.test(ultimo)) {
    // Cerchiamo su PIÙ termini alimentari: l'espansione sinonimi di
    // "mangiare" viene troncata a 12 termini in cercaNegozi, quindi termini
    // come "panificio"/"forno" non arriverebbero mai al DB. Lanciando più
    // ricerche specifiche il Panificio/ristorante viene sempre trovato.
    const specifico = ultimo.includes("pizzeria") || ultimo.includes("pizza")
      ? "pizza"
      : ultimo.includes("ristorante") ? "ristorante"
      : ultimo.includes("trattoria") ? "trattoria"
      : ultimo.includes("panificio") ? "panificio"
      : ultimo.includes("forno") ? "forno"
      : ultimo.includes("gelateria") ? "gelateria"
      : ultimo.includes("bar") ? "bar"
      : ultimo.includes("cena") ? "cena"
      : ultimo.includes("pranzo") ? "pranzo"
      : "";
    const termini = Array.from(
      new Set(
        (specifico ? [specifico] : []).concat(["mangiare", "panificio", "forno", "ristorante", "pizzeria"])
      )
    );
    return {
      directReply: null,
      tools: termini.map((query) => ({ tool: "searchStores", params: { query } })),
    };
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

  return null;
}

// ─── Fallback testuale quando la risposta finale LLM fallisce ────────────────

function fallbackTestuale(
  risultati: RisultatiRecuperati,
  domanda: string,
  notaVincolo = ""
): string {
  const sezioni: string[] = [];
  const totale =
    risultati.negozi.length +
    risultati.prodotti.length +
    risultati.offerte.length +
    risultati.eventi.length;

  if (totale === 0) {
    const richiesta = domanda.replace(/\s+/g, " ").trim().slice(0, 100);
    return `Non ho trovato risultati per "${richiesta}". Prova con termini diversi o guarda le categorie disponibili su InCittà.`;
  }

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

  const nota = notaVincolo ? `\n\n_${notaVincolo}_` : "";
  return sezioni.join("\n\n") + nota;
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

  // Stato dei risultati recuperati
  let negozi: NegozioRicerca[] = [];
  let prodotti: ProdottoRicerca[] = [];
  let offerte: Awaited<ReturnType<typeof searchOffers>> = [];
  let eventi: Awaited<ReturnType<typeof searchEvents>> = [];
  let categorie: Awaited<ReturnType<typeof getCategoriesList>> = [];
  let directReply: string | null = null;
  let selezioneOk = false;
  let invocazioni: ToolInvocation[] = [];

  // 1) Piano di ricerca: guardie deterministiche per le intenzioni chiare
  // (offerte, eventi, mangiare, chiacchiera, domande su InCittà); per tutto
  // il resto la selezione dei tool la fa l'LLM.
  const piano = pianoPredefinito(storico);

  if (piano) {
    directReply = piano.directReply;
    invocazioni = piano.tools.filter((t) => typeof t.tool === "string" && t.tool.trim());
    selezioneOk = true;
  } else {
    try {
      const raw = await callGeminiText({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildToolSelectionPrompt(storico),
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
    }
  }

  console.log(
    "[assistente] piano:",
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
    };
  }

  // 3) Fallback: ricerca completa SOLO se la selezione LLM è fallita.
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
    };
  }

  // 4) Contesto strutturato per la risposta finale
  const risultati: RisultatiRecuperati = {
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
    offerte,
    eventi,
    categorie,
  };
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

  // 5) Risposta finale AI
  let risposta: string;
  try {
    risposta = await callGeminiText({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildFinalPrompt(storico, contestoFinale),
      maxTokens: 700,
      temperature: 0.2,
      timeoutMs: 45_000,
    });
  } catch (error) {
    console.warn("[assistente] Risposta finale fallita, uso elenco risultati:", error);
    risposta = fallbackTestuale(risultati, domanda, notaVincolo);
  }

  return {
    risposta,
    negozi: negozi.slice(0, 8),
    prodotti: prodotti.slice(0, 10),
    processingMs: Date.now() - inizio,
    source: "assistente",
  };
}
