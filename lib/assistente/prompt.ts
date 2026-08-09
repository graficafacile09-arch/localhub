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
 * NB: il prompt è volutamente COMPATTO: la chiave Gemini è su un piano con
 * limite di token giornaliero, quindi ogni token risparmiato per chiamata
 * aumenta i messaggi che l'assistente può gestire.
 *
 * @module lib/assistente/prompt
 */

import type { MessaggioAssistente } from "./index";
import type {
  OffertaAssistente,
  EventoAssistente,
} from "./tools";

// ─── System prompt ───────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Sei l'Assistente di InCittà, la piattaforma che raccoglie negozi, prodotti, offerte ed eventi locali (Castrovillari e dintorni). Gli utenti cercano attività, confrontano prodotti, vedono orari e contatti e contattano i negozi.

REGOLE:
1. Usa SOLO i dati recuperati da InCittà forniti nel contesto. NON inventare MAI negozi, prodotti, prezzi, offerte, eventi, orari, indirizzi o caratteristiche.
2. Se non trovi una corrispondenza esatta, proponi le alternative REALMENTE trovate e spiega perché sono pertinenti.
3. Se non ci sono dati utili, dillo chiaramente e con gentilezza, suggerendo come affinare la ricerca. MAI "Non posso aiutarti".
4. Senza recensioni/rating nei dati, non usare "migliore"/"top" come giudizio assoluto: usa "tra quelli che ho trovato, questi sono i più pertinenti".
5. Rispondi breve, naturale e sintetico (max ~250 parole), Markdown leggero. NIENTE sezioni "Considerazioni", "Conclusioni", "Premessa" o testo artificiale.
6. Prezzi nel formato "€XX" con il nome del negozio.
7. Gestisci naturalmente cortesia ("ciao", "grazie", "va bene") e follow-up che si riferiscono alla conversazione precedente ("e sotto i 300?" = applica il prezzo alla ricerca precedente).
8. Resta sempre nel contesto di InCittà.`;

// ─── Storia conversazione compatta ───────────────────────────────────────────

export function buildHistoryText(messages: MessaggioAssistente[]): string {
  if (messages.length === 0) return "(nessuna conversazione precedente)";

  return messages
    .slice(-8)
    .map((m) => {
      const chi = m.role === "user" ? "Utente" : "Assistente";
      const testo = m.content.replace(/\s+/g, " ").trim().slice(0, 300);
      return `${chi}: ${testo}`;
    })
    .join("\n");
}

// ─── Selezione tool (JSON) ───────────────────────────────────────────────────

export function buildToolSelectionPrompt(messages: MessaggioAssistente[]): string {
  const storico = buildHistoryText(messages);
  const ultimo = messages[messages.length - 1];
  const domanda = ultimo && ultimo.role === "user" ? ultimo.content : "";

  return `Sei il motore di pianificazione dell'Assistente di InCittà: decidi QUALI dati recuperare dal database pubblico, usando il CONTESTO della conversazione (se prima si parlava di TV e ora dice "sotto 500 euro", la query resta "tv" e maxPrice=500).

CONVERSAZIONE RECENTE:
${storico}

ULTIMO MESSAGGIO UTENTE: "${domanda}"

TOOL:
- searchStores: query → negozi/attività
- searchProducts: query + maxPrice/minPrice (numeri interi, euro) → prodotti
- searchOffers: query opzionale → offerte/promozioni/sconti
- searchEvents: query opzionale → eventi
- getCategories: nessun parametro → categorie con conteggio negozi

SCELTA TOOL:
- "offerte"/"promozioni"/"sconti"/"saldo" → searchOffers. MAI searchProducts.
- "eventi"/"weekend"/"cosa c'è"/"manifestazioni"/"cosa succede" → searchEvents. MAI searchProducts.
- "mangiare"/"ristorante"/"pizza"/"cena"/"dove posso mangiare" → searchStores.
- prodotto/regalo con prezzo → searchProducts con maxPrice/minPrice.
- "quale negozio vende X" → searchStores.
- Chiacchiera/cortesia ("ciao","grazie","va bene","ok","perfetto") e domande su InCittà ("che cos'è InCittà?","come funziona?") → tools: [] + directReply breve e naturale in italiano. MAI lanciare ricerche per questi.
- Se non c'è richiesta concreta, NON inventare una ricerca: usa directReply.

ESEMPI:
Utente: "cerco una TV" → {"tools":[{"tool":"searchProducts","params":{"query":"tv","maxPrice":null,"minPrice":null}}],"directReply":null}
Utente: "sotto 500 euro" (precedente: TV) → {"tools":[{"tool":"searchProducts","params":{"query":"tv","maxPrice":500,"minPrice":null}}],"directReply":null}
Utente: "ci sono offerte?" → {"tools":[{"tool":"searchOffers","params":{}}],"directReply":null}
Utente: "cosa c'è questo weekend?" → {"tools":[{"tool":"searchEvents","params":{}}],"directReply":null}
Utente: "va bene" → {"tools":[],"directReply":"Perfetto! Dimmi pure cosa cerchi: posso aiutarti a trovare negozi, prodotti, offerte ed eventi nella tua città."}

Rispondi SOLO con JSON valido, senza testo esterno.`;
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

Rispondi all'ultimo messaggio usando SOLO i dati sopra. Sii utile, sintetico e naturale: proponi le alternative più pertinenti con negozio e prezzo dove disponibili; se non c'è nulla di pertinente dillo chiaramente e suggerisci come affinare la ricerca.`;
}
