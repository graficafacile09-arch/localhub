/**
 * LocalHub — Assistente AI: Orchestratore
 *
 * Flusso (2 chiamate LLM, come da analisi):
 *   1. comprensione intenzione + scelta dei tool (JSON) usando TUTTA la
 *      conversazione recente ("e sotto i 300?" viene risolto col contesto);
 *   2. esecuzione dei tool (retrieval su dati pubblici, riuso funzioni esistenti);
 *   3. contesto strutturato dei risultati → risposta finale dell'AI.
 *
 * Usa GROQ_API_KEY (già presente nel progetto), modello già in uso
 * (llama-3.3-70b-versatile), timeout su ogni chiamata, max_tokens e
 * temperature. Fallback: se la selezione tool fallisce → searchAll sulla
 * domanda; se la risposta finale fallisce → elenco testuale dei risultati
 * recuperati. Nessuna scrittura su DB.
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

const GROQ_MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 45_000;

type ToolInvocation = {
  tool?: string;
  params?: ToolParams;
};

// ─── Chiamata Groq con timeout ───────────────────────────────────────────────

async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("Chiave API Groq mancante. Aggiungi GROQ_API_KEY al file .env.local.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      if (response.status === 429 || response.status === 402) {
        throw new Error(`Quota superata (HTTP ${response.status}).`);
      }
      if (response.status >= 500 && response.status < 600) {
        throw new Error(`Errore server AI (HTTP ${response.status}).`);
      }
      throw new Error(`Errore Groq (HTTP ${response.status}): ${errorText.slice(0, 200)}`);
    }

    const resData = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = resData.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error("Risposta AI vuota.");

    return content;
  } catch (caught: unknown) {
    clearTimeout(timeoutId);
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw new Error(`Timeout chiamata AI (${TIMEOUT_MS / 1000}s).`);
    }
    if (caught instanceof Error) throw caught;
    throw new Error("Errore sconosciuto chiamata AI.");
  }
}

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
      const q = eQuerySostanziale(params?.query ?? "") || fallbackQuery;
      if (!q) return vuoto;
      if (nome === "searchStores") {
        return { ...vuoto, negozi: await searchStores(q, limit) };
      }
      return {
        ...vuoto,
        prodotti: await searchProducts(q, { ...params, limit }),
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
    /\beventi?\b|weekend|fine settimana|manifestazion|in programma|cosa c'è|cosa c'e|cosa succede|mostra|concerto|fiera/;
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
    const termine = ultimo.includes("pizzeria") || ultimo.includes("pizza")
      ? "pizza"
      : ultimo.includes("ristorante") ? "ristorante"
      : ultimo.includes("trattoria") ? "trattoria"
      : ultimo.includes("panificio") ? "panificio"
      : ultimo.includes("forno") ? "forno"
      : ultimo.includes("cena") ? "cena"
      : ultimo.includes("pranzo") ? "pranzo"
      : "mangiare";
    return { directReply: null, tools: [{ tool: "searchStores", params: { query: termine } }] };
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

  return null;
}

// ─── Fallback testuale quando la risposta finale LLM fallisce ────────────────

function fallbackTestuale(
  risultati: RisultatiRecuperati,
  domanda: string
): string {
  const sezioni: string[] = [];
  const totale =
    risultati.negozi.length +
    risultati.prodotti.length +
    risultati.offerte.length +
    risultati.eventi.length;

  if (totale === 0) {
    return `Non ho trovato risultati per "${domanda}". Prova con termini diversi o guarda le categorie disponibili su InCittà.`;
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

  return sezioni.join("\n\n");
}

// ─── Orchestratore principale ────────────────────────────────────────────────

export async function chatConAssistente(
  messages: MessaggioAssistente[]
): Promise<RispostaAssistente> {
  const inizio = Date.now();
  const storico = normalizzaMessaggi(messages);
  const ultimo = storico[storico.length - 1];
  const domanda = ultimo && ultimo.role === "user" ? ultimo.content : "";

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
      const raw = await callGroq(SYSTEM_PROMPT, buildToolSelectionPrompt(storico), 700, 0.1);
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
    for (const r of risultati) {
      if (r.negozi.length > 0) negozi = [...negozi, ...r.negozi];
      if (r.prodotti.length > 0) prodotti = [...prodotti, ...r.prodotti];
      if (r.offerte.length > 0) offerte = [...offerte, ...r.offerte];
      if (r.eventi.length > 0) eventi = [...eventi, ...r.eventi];
      if (r.categorie.length > 0) categorie = [...categorie, ...r.categorie];
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

  // 5) Risposta finale AI
  let risposta: string;
  try {
    risposta = await callGroq(SYSTEM_PROMPT, buildFinalPrompt(storico, contesto), 900, 0.2);
  } catch (error) {
    console.warn("[assistente] Risposta finale fallita, uso elenco risultati:", error);
    risposta = fallbackTestuale(risultati, domanda);
  }

  return {
    risposta,
    negozi: negozi.slice(0, 8),
    prodotti: prodotti.slice(0, 10),
    processingMs: Date.now() - inizio,
    source: "assistente",
  };
}
