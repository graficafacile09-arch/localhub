/**
 * LocalHub — Assistente AI: Prompt
 *
 * Prompt dell'assistente pubblico di InCittà:
 *   - SYSTEM_PROMPT: persona e regole (solo dati recuperati, niente invenzioni,
 *     alternative reali, niente sezioni "considerazioni/conclusioni").
 *   - buildToolSelectionPrompt: chiede al modello di scegliere i tool da
 *     eseguire (JSON) usando l'intero contesto della conversazione.
 *   - buildContextoRisultati: trasforma i dati recuperati in contesto
 *     strutturato per la risposta finale.
 *   - buildFinalPrompt: risposta finale con storia + contesto recuperato.
 *
 * @module lib/assistente/prompt
 */

import type { MessaggioAssistente } from "./index";
import type {
  OffertaAssistente,
  EventoAssistente,
} from "./tools";

// ─── System prompt ───────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Sei l'Assistente di InCittà, la piattaforma che raccoglie negozi, prodotti, offerte ed eventi locali.

INFORMAZIONI SULLA PIATTAFORMA (usa queste per rispondere a domande su InCittà stessa):
InCittà è la piattaforma locale della tua città (Castrovillari e dintorni): raccoglie le attività commerciali reali del territorio con i loro negozi, prodotti e prezzi, offerte e promozioni, eventi e manifestazioni. Gli utenti possono cercare attività, confrontare prodotti, vedere orari e contatti e mettersi in contatto con i negozi. I dati mostrati provengono ESCLUSIVAMENTE dal database della piattaforma.

REGOLE ASSOLUTE:
1. Usa ESCLUSIVAMENTE i dati recuperati da InCittà forniti nel contesto. NON inventare MAI negozi, prodotti, prezzi, offerte, eventi, orari, indirizzi o caratteristiche.
2. Se non trovi una corrispondenza esatta, proponi le alternative REALMENTE trovate nei dati e spiega brevemente perché sono pertinenti.
3. Se non ci sono proprio dati utili, dillo chiaramente e con gentilezza ("Non ho trovato risultati per questo", seguito da un suggerimento concreto, es. provare altre parole o guardare le categorie). NON usare mai "Non posso aiutarti".
4. Non usare "migliore" o "top" come giudizio assoluto: senza recensioni/rating nei dati usa "tra quelli che ho trovato, questi sono i più pertinenti".
5. Rispondi in modo breve, naturale e sintetico. NIENTE sezioni "Considerazioni", "Conclusioni", "Nota finale", "Premessa" o testo artificiale.
6. Usa Markdown leggero: elenchi puntati, grassetto per i nomi. Massimo ~250 parole.
7. Resta sempre nel contesto di InCittà: se la domanda esula dalla piattaforma (negozi, prodotti, offerte, eventi, categorie, servizi locali), rispondi riportando il discorso su ciò che InCittà può offrire.
8. Quando citi un prezzo usa il formato "€XX" e indica il negozio di provenienza.
9. Gestisci naturalmente frasi di cortesia ("ciao", "grazie", "va bene") e richieste successive che si riferiscono alla conversazione precedente (es. "e sotto i 300?" = applica il prezzo alla ricerca precedente).`;

// ─── Storia conversazione compatta ───────────────────────────────────────────

export function buildHistoryText(messages: MessaggioAssistente[]): string {
  if (messages.length === 0) return "(nessuna conversazione precedente)";

  return messages
    .slice(-10)
    .map((m) => {
      const chi = m.role === "user" ? "Utente" : "Assistente";
      const testo = m.content.replace(/\s+/g, " ").trim().slice(0, 400);
      return `${chi}: ${testo}`;
    })
    .join("\n");
}

// ─── Selezione tool (JSON) ───────────────────────────────────────────────────

export function buildToolSelectionPrompt(messages: MessaggioAssistente[]): string {
  const storico = buildHistoryText(messages);
  const ultimo = messages[messages.length - 1];
  const domanda = ultimo && ultimo.role === "user" ? ultimo.content : "";

  return `Sei il motore di pianificazione dell'Assistente di InCittà. Devi capire cosa cerca l'utente e decidere QUALI dati recuperare dal database pubblico.

CONVERSAZIONE RECENTE:
${storico}

ULTIMO MESSAGGIO UTENTE: "${domanda}"

TOOL DISPONIBILI (recuperano SOLO dati reali di InCittà):
- searchStores: query testuale → negozi/attività (nome, categoria, servizi, descrizione)
- searchProducts: query testuale + maxPrice/minPrice opzionali (in euro, numero intero) → prodotti attivi
- searchOffers: query testuale opzionale → offerte/promozioni/sconti attivi
- searchEvents: query testuale opzionale → eventi attivi
- getCategories: nessun parametro → elenco categorie con numero di negozi

REGOLE ASSOLUTE DI SCELTA TOOL:
1. Usa il CONTESTO della conversazione: se prima si parlava di un prodotto (es. TV) e ora l'utente dice "sotto 500 euro" o "e sotto i 300?", la query del tool deve RESTARE quella del prodotto precedente (es. "tv") e maxPrice deve contenere il prezzo.
2. Scelta dello strumento (NON deviare):
   - "offerte", "promozioni", "sconti", "saldo" → searchOffers. MAI searchProducts per questo.
   - "eventi", "weekend", "cosa c'è", "manifestazioni", "cosa succede" → searchEvents. MAI searchProducts per questo.
   - "mangiare", "ristorante", "pizza", "cena", "dove posso mangiare" → searchStores.
   - prodotti/con regalo + vincolo di prezzo → searchProducts con maxPrice.
   - "quale negozio vende X" → searchStores.
   - Combinazioni utili permesse (es. searchProducts + searchOffers se chiede prodotti in offerta).
3. Estrai i prezzi in numeri interi (es. "massimo 100 euro" → maxPrice: 100).
4. Chiacchiera/cortesia ("ciao", "grazie", "va bene", "ok", "perfetto") e domande su InCittà stessa ("che cos'è InCittà?", "come funziona?") → SEMPRE tools: [] e una directReply breve e naturale in italiano (per domande su InCittà usa le informazioni sulla piattaforma). MAI lanciare ricerche per questi messaggi.
5. Se l'utente non ha espresso una richiesta concreta, NON inventare una ricerca: usa directReply.

ESEMPI:
Utente: "cerco una TV" → {"tools":[{"tool":"searchProducts","params":{"query":"tv","maxPrice":null,"minPrice":null}}],"directReply":null}
Utente: "sotto 500 euro" (precedente: TV) → {"tools":[{"tool":"searchProducts","params":{"query":"tv","maxPrice":500,"minPrice":null}}],"directReply":null}
Utente: "ci sono offerte?" → {"tools":[{"tool":"searchOffers","params":{"query":null}}],"directReply":null}
Utente: "cosa c'è questo weekend?" → {"tools":[{"tool":"searchEvents","params":{"query":null}}],"directReply":null}
Utente: "voglio mangiare" → {"tools":[{"tool":"searchStores","params":{"query":"mangiare"}}],"directReply":null}
Utente: "va bene" → {"tools":[],"directReply":"Perfetto! Se hai bisogno di qualcosa dimmi pure: posso aiutarti a trovare negozi, prodotti, offerte ed eventi nella tua città."}
Utente: "che cos'è InCittà?" → {"tools":[],"directReply":"InCittà è la piattaforma locale della tua città: raccoglie le attività commerciali del territorio con i loro negozi, prodotti e prezzi, offerte ed eventi. Puoi cercare attività, confrontare prodotti e contattare i negozi direttamente."}

Rispondi SOLO con JSON valido, senza testo esterno, nel formato esatto sopra.`;
}

// ─── Contesto risultati recuperati ───────────────────────────────────────────

export type RisultatiRecuperati = {
  negozi: { nome: string; categoria: string | null; descrizione: string | null; indirizzo: string | null; telefono: string | null }[];
  prodotti: { nome: string; prezzo: number; negozio_nome: string; categoria: string | null; descrizione: string | null }[];
  offerte: OffertaAssistente[];
  eventi: EventoAssistente[];
  categorie: { nome: string; count: number }[];
};

export function buildContextoRisultati(r: RisultatiRecuperati): string {
  const righe: string[] = [];
  righe.push("=== DATI RECUPERATI DA INCITTA (unici e reali) ===");

  if (r.negozi.length > 0) {
    righe.push("");
    righe.push("NEGOZI:");
    for (const n of r.negozi.slice(0, 8)) {
      const dettagli = [
        n.indirizzo ? `indirizzo: ${n.indirizzo}` : null,
        n.telefono ? `telefono: ${n.telefono}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      righe.push(
        `- ${n.nome}${n.categoria ? ` (categoria: ${n.categoria})` : ""}: ${n.descrizione ?? "nessuna descrizione"}${dettagli ? `. ${dettagli}` : ""}`
      );
    }
  }

  if (r.prodotti.length > 0) {
    righe.push("");
    righe.push("PRODOTTI:");
    for (const p of r.prodotti.slice(0, 10)) {
      righe.push(
        `- ${p.nome} — EUR ${p.prezzo}${p.categoria ? ` (${p.categoria})` : ""}, negozio: ${p.negozio_nome || "sconosciuto"}${p.descrizione ? `. ${p.descrizione.slice(0, 160)}` : ""}`
      );
    }
  }

  if (r.offerte.length > 0) {
    righe.push("");
    righe.push("OFFERTE:");
    for (const o of r.offerte.slice(0, 8)) {
      const prezzo = o.prezzo_offerta != null
        ? `EUR ${o.prezzo_offerta}${o.prezzo_originale != null ? ` (era EUR ${o.prezzo_originale})` : ""}`
        : "prezzo non indicato";
      righe.push(`- "${o.titolo}" → ${o.negozio_nome || "negozio sconosciuto"} — ${prezzo}${o.data_fine ? `, scade il ${o.data_fine.slice(0, 10)}` : ""}${o.descrizione ? `. ${o.descrizione.slice(0, 140)}` : ""}`);
    }
  }

  if (r.eventi.length > 0) {
    righe.push("");
    righe.push("EVENTI:");
    for (const e of r.eventi.slice(0, 8)) {
      righe.push(
        `- "${e.titolo}" → ${e.negozio_nome || "negozio sconosciuto"}${e.data_inizio ? `, il ${e.data_inizio.slice(0, 10)}` : ""}${e.luogo ? `, luogo: ${e.luogo}` : ""}${e.descrizione ? `. ${e.descrizione.slice(0, 140)}` : ""}`
      );
    }
  }

  if (r.categorie.length > 0) {
    righe.push("");
    righe.push("CATEGORIE DISPONIBILI:");
    righe.push(r.categorie.slice(0, 12).map((c) => `${c.nome} (${c.count} negozi)`).join(", "));
  }

  const totale = r.negozi.length + r.prodotti.length + r.offerte.length + r.eventi.length;
  if (totale === 0) {
    righe.push("");
    righe.push("(Nessun risultato trovato per questa ricerca.)");
  }

  righe.push("");
  return righe.join("\n");
}

// ─── Prompt risposta finale ──────────────────────────────────────────────────

export function buildFinalPrompt(
  messages: MessaggioAssistente[],
  contesto: string
): string {
  const storico = buildHistoryText(messages);
  const ultimo = messages[messages.length - 1];
  const domanda = ultimo && ultimo.role === "user" ? ultimo.content : "";

  return `CONVERSAZIONE RECENTE:
${storico}

ULTIMO MESSAGGIO UTENTE: "${domanda}"

${contesto}

Rispondi all'ultimo messaggio dell'utente usando SOLO i dati sopra. Sii utile, sintetico e naturale: proponi le alternative più pertinenti, indica negozio e prezzo dove disponibili, e se non c'è nulla di pertinente dillo chiaramente suggerendo come affinare la ricerca.`;
}
