/**
 * Formattatori PURi per gli ordini (senza alcun import server).
 *
 * Separati dal servizio (lib/cliente/ordini.ts) perché possono essere
 * importati anche dai COMPONENT CLIENT (es. la pagina di recupero ordini
 * guest), che non possono includere codice server-only (next/headers,
 * cookie di sessione) nel bundle browser.
 */

import type { RigaOrdine, StatoOrdine } from "./types";

/** Formatta una data ISO in formato italiano (es. "16 agosto 2026"). */
export function formattaDataOrdine(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Formatta una data/ora ISO in formato italiano breve (es. "16/08 10:30"). */
export function formattaDataOraEvento(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formatta data/ora ISO in formato card italiano (es. "10/08/2026 · 18:42").
 * Separatore " · " come richiesto dal design system ordini.
 */
export function formattaDataOraCard(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const parti = d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // it-IT usa la virgola (es. "10/08/2026, 18:42") → la sostituiamo con " · ".
  return parti.replace(/,\s*/, " · ");
}

/** Etichetta leggibile della modalità di consegna. */
export function etichettaModalita(modalita: "ritiro" | "spedizione"): string {
  return modalita === "ritiro" ? "Ritiro" : "Spedizione";
}

/**
 * Sintesi leggibile dei prodotti dell'ordine da mostrare accanto al numero:
 * - un solo prodotto → il suo nome ("#LH-000058 · Integratore Vitamina D");
 * - più prodotti → "N prodotti" ("#LH-000058 · 3 prodotti");
 * - nessuna riga → stringa vuota (il chiamante decide il fallback).
 * MAI l'UUID dell'ordine come identificativo.
 */
export function sintesiProdotti(righe: Pick<RigaOrdine, "nomeProdotto">[]): string {
  const n = Array.isArray(righe) ? righe.length : 0;
  if (n === 0) return "";
  if (n === 1) return (righe[0]?.nomeProdotto ?? "").trim();
  return `${n} prodotti`;
}

/** Etichetta leggibile dello stato dell'ordine. */
export function etichettaStato(stato: StatoOrdine): string {
  switch (stato) {
    case "in_preparazione":
      return "Nuovo";
    case "confermato":
      return "Confermato";
    case "in_lavorazione":
      return "In lavorazione";
    case "pronto":
      return "Pronto";
    case "in_consegna":
      return "In consegna";
    case "consegnato":
      return "Completato";
    case "cancellato":
      return "Annullato";
    default:
      return "In preparazione";
  }
}

/**
 * Configurazione VISIVA dello stato ordine — UNICA fonte per banner e badge.
 *
 * LO STATO DEL DB COMANDA LA GRAFICA: questa funzione centralizza la mappa
 * stato → (icona lucide, emoji informativa, etichetta banner, classi banner,
 * classi badge, colore puntino timeline) così che cliente e venditore usino
 * lo STESSO linguaggio visivo e che un ordine ANNULLATO non possa MAI
 * ricevere la grafica di un ordine confermato. Testabile in modo puro
 * (scripts/test-ordini-vista.ts).
 *
 * Palette identità InCittà (blu struttura + giallo accento):
 *   NUOVO          → giallo (attenzione)
 *   CONFERMATO     → blu chiaro (informazione)
 *   IN LAVORAZIONE → giallo (in corso, icona martello)
 *   PRONTO         → giallo intenso (evidenziato)
 *   IN CONSEGNA    → blu (in transito, icona camion)
 *   COMPLETATO     → blu intenso (positivo, concluso)
 *   ANNULLATO      → blu scuro + icona ban (errore) — MAI giallo/blu positivo.
 * La differenziazione tra stati avviene tramite ICONA, bordo e intensità
 * (mai rosso/verde/arancio): tutti i toni restano blu/giallo.
 */
export type ConfigStatoOrdine = {
  /** Nome dell'icona lucide (renderizzata via components/ordini/StatoIcona). */
  icona: string;
  /** Emoji informativa (solo dove ha funzione informativa). */
  emoji: string;
  /** Etichetta maiuscola per il banner (es. "ORDINE ANNULLATO"). */
  etichettaBanner: string;
  /** Riga descrittiva sotto il banner per l'area CLIENTE. */
  descrizioneCliente: string;
  /** Riga descrittiva sotto il banner per l'area VENDITORE. */
  descrizioneVenditore: string;
  /** Classi del banner grande (sfondo, bordo). */
  banner: string;
  /** Classe del colore testo del banner. */
  testo: string;
  /** Classi del badge compatto (liste e header). */
  badge: string;
  /** Classe icona (testo) del banner. */
  iconaTesto: string;
  /** Colore del puntino nella timeline. */
  dot: string;
  /** true solo per stati terminali (annullato/completato). */
  terminale: boolean;
};

export function configStatoOrdine(stato: StatoOrdine): ConfigStatoOrdine {
  switch (stato) {
    case "in_preparazione":
      return {
        icona: "bell",
        emoji: "🆕",
        etichettaBanner: "ORDINE NUOVO",
        descrizioneCliente: "Il negozio ha ricevuto il tuo ordine.",
        descrizioneVenditore: "Ordine appena ricevuto: confermalo per iniziare la lavorazione.",
        banner: "border-yellow-200 bg-yellow-50/70",
        testo: "text-yellow-950",
        badge: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
        iconaTesto: "text-yellow-600",
        dot: "bg-yellow-500",
        terminale: false,
      };
    case "confermato":
      return {
        icona: "badge-check",
        emoji: "🟢",
        etichettaBanner: "ORDINE CONFERMATO",
        descrizioneCliente: "Il negozio ha confermato il tuo ordine.",
        descrizioneVenditore: "Ordine confermato: puoi iniziare la lavorazione.",
        banner: "border-blue-200 bg-blue-50/70",
        testo: "text-blue-950",
        badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
        iconaTesto: "text-blue-600",
        dot: "bg-blue-500",
        terminale: false,
      };
    case "in_lavorazione":
      return {
        icona: "hammer",
        emoji: "🔵",
        etichettaBanner: "IN LAVORAZIONE",
        descrizioneCliente: "Il negozio sta preparando il tuo ordine.",
        descrizioneVenditore: "Lavorazione in corso: segna l'ordine come pronto quando è pronto.",
        banner: "border-yellow-200 bg-yellow-50/70",
        testo: "text-yellow-950",
        badge: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
        iconaTesto: "text-yellow-600",
        dot: "bg-yellow-500",
        terminale: false,
      };
    case "pronto":
      return {
        icona: "package-check",
        emoji: "🟡",
        etichettaBanner: "ORDINE PRONTO",
        descrizioneCliente: "Il tuo ordine è pronto.",
        descrizioneVenditore: "Ordine pronto: completalo alla consegna.",
        banner: "border-blue-200 bg-blue-50/70",
        testo: "text-blue-950",
        badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
        iconaTesto: "text-blue-600",
        dot: "bg-blue-500",
        terminale: false,
      };
    case "in_consegna":
      return {
        icona: "truck",
        emoji: "🚚",
        etichettaBanner: "IN CONSEGNA",
        descrizioneCliente: "Il tuo ordine è in consegna.",
        descrizioneVenditore: "Ordine in consegna al cliente.",
        banner: "border-blue-200 bg-blue-50/70",
        testo: "text-blue-950",
        badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
        iconaTesto: "text-blue-600",
        dot: "bg-blue-500",
        terminale: false,
      };
    case "consegnato":
      return {
        icona: "circle-check",
        emoji: "✅",
        etichettaBanner: "ORDINE COMPLETATO",
        descrizioneCliente: "Il tuo ordine è stato completato.",
        descrizioneVenditore: "Ordine completato: nessuna azione necessaria.",
        banner: "border-blue-300 bg-blue-100/70",
        testo: "text-blue-950",
        badge: "bg-blue-100 text-blue-800 ring-1 ring-blue-300",
        iconaTesto: "text-blue-700",
        dot: "bg-blue-600",
        terminale: true,
      };
    case "cancellato":
      return {
        icona: "ban",
        emoji: "⛔",
        etichettaBanner: "ORDINE ANNULLATO",
        descrizioneCliente: "Il negozio non ha potuto evadere il tuo ordine.",
        descrizioneVenditore: "Ordine annullato: terminale, nessuna azione disponibile.",
        banner: "border-blue-900/40 bg-blue-950/5",
        testo: "text-blue-950",
        badge: "bg-blue-950 text-blue-100 ring-1 ring-blue-900",
        iconaTesto: "text-blue-900",
        dot: "bg-blue-900",
        terminale: true,
      };
    default:
      return configStatoOrdine("in_preparazione");
  }
}

/**
 * Filtri dell'elenco ordini dell'AREA CLIENTE (presentazione pura, nessuna
 * query: i dati arrivano già dal servizio e vengono filtrati in pagina).
 * Lo stato del DB resta l'unica fonte: nessuna logica duplicata.
 */
export type FiltroOrdiniCliente = "tutti" | "in_corso" | "completati" | "annullati";

export const FILTRI_ORDINI_CLIENTE: ReadonlyArray<{
  key: FiltroOrdiniCliente;
  etichetta: string;
}> = [
  { key: "tutti", etichetta: "Tutti" },
  { key: "in_corso", etichetta: "In corso" },
  { key: "completati", etichetta: "Completati" },
  { key: "annullati", etichetta: "Annullati" },
];

export function isFiltroOrdiniCliente(
  value: string | null | undefined
): value is FiltroOrdiniCliente {
  return FILTRI_ORDINI_CLIENTE.some((f) => f.key === value);
}

/** Applica il filtro cliente a un elenco di ordini (dalla lista completa). */
export function filtraOrdiniCliente<T extends { stato: StatoOrdine }>(
  ordini: T[],
  filtro: FiltroOrdiniCliente
): T[] {
  switch (filtro) {
    case "in_corso":
      return ordini.filter((o) => !["consegnato", "cancellato"].includes(o.stato));
    case "completati":
      return ordini.filter((o) => o.stato === "consegnato");
    case "annullati":
      return ordini.filter((o) => o.stato === "cancellato");
    default:
      return ordini;
  }
}
