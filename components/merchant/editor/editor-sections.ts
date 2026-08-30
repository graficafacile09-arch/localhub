import type { Negozio } from "@/types/negozio";
import { getModuliAttiviNegozio } from "@/lib/profili-attivita";

/**
 * SEZIONI — nuova struttura dell'editor a 6 sezioni logiche.
 *
 * Sostituisce la rigida sequenza di 8 step con sezioni funzionali che
 * raggruppano più blocchi. La visibilità di ogni blocco dipende dai moduli
 * attivi del negozio (profilo da `data.tipo_attivita`, altrimenti
 * `moduli_attivi`). Un blocco non ne esclude un altro: le attività miste
 * (prodotti + servizi, es. farmacia) mostrano entrambi i blocchi.
 */

export type SezioneId =
  | "attivita"
  | "contatti-orari"
  | "presentazione"
  | "catalogo"
  | "vendita"
  | "pubblicazione";

export type BloccoId =
  | "identita"
  | "contatti-orari"
  | "presentazione"
  | "catalogo-prodotti"
  | "servizi-strutturati"
  | "offerte"
  | "vendita-commerciale"
  | "prenotazioni"
  | "richiesta-info"
  | "anteprima"
  | "pubblicazione";

export type EditorSezione = {
  id: SezioneId;
  numero: string;
  titolo: string;
  sottotitolo: string;
  blocchi: BloccoId[];
};

export const EDITOR_SEZIONI: EditorSezione[] = [
  { id: "attivita", numero: "01", titolo: "Attività", sottotitolo: "Nome, categoria, descrizione, logo e copertina", blocchi: ["identita"] },
  { id: "contatti-orari", numero: "02", titolo: "Contatti e orari", sottotitolo: "Indirizzo, telefono, email, social e orari di apertura", blocchi: ["contatti-orari"] },
  { id: "presentazione", numero: "03", titolo: "Presentazione", sottotitolo: "Galleria, descrizione estesa e caratteristiche", blocchi: ["presentazione"] },
  { id: "catalogo", numero: "04", titolo: "Catalogo e servizi", sottotitolo: "Prodotti e servizi offerti", blocchi: ["catalogo-prodotti", "servizi-strutturati", "offerte"] },
  { id: "vendita", numero: "05", titolo: "Vendita e agenda", sottotitolo: "Modalità di vendita, pagamenti, agenda e richieste", blocchi: ["vendita-commerciale", "prenotazioni", "richiesta-info"] },
  { id: "pubblicazione", numero: "06", titolo: "Anteprima e pubblicazione", sottotitolo: "Riepilogo, controlli e pubblicazione", blocchi: ["anteprima", "pubblicazione"] },
];

export type BloccoStatus = "completata" | "attenzione" | "da-completare";

/** Restituisce i moduli attivi del negozio (null = nessuna info → tutti). */
export function getModuli(store: Negozio | null | undefined): string[] | null {
  return getModuliAttiviNegozio(store);
}

function hasModulo(moduli: string[] | null, slug: string): boolean {
  return moduli === null || moduli.includes(slug);
}

/** True se il blocco deve essere mostrato per i moduli attivi. */
export function isBloccoVisibile(blocco: BloccoId, moduli: string[] | null): boolean {
  switch (blocco) {
    case "catalogo-prodotti":
      return hasModulo(moduli, "prodotti");
    case "servizi-strutturati":
      return hasModulo(moduli, "servizi");
    case "offerte":
      return hasModulo(moduli, "offerte");
    case "prenotazioni":
      return hasModulo(moduli, "prenotazioni");
    case "richiesta-info":
      return hasModulo(moduli, "richiesta_info");
    default:
      return true;
  }
}

export function getBlocchiVisibili(sezione: EditorSezione, moduli: string[] | null): BloccoId[] {
  return sezione.blocchi.filter((b) => isBloccoVisibile(b, moduli));
}

/** Sezioni con i rispettivi blocchi visibili per il negozio. */
export function getSezioniVisibili(
  store: Negozio | null | undefined
): { sezione: EditorSezione; blocchi: BloccoId[] }[] {
  const moduli = getModuli(store);
  return EDITOR_SEZIONI.map((s) => ({ sezione: s, blocchi: getBlocchiVisibili(s, moduli) }));
}

/** Sezione a cui appartiene concettualmente un blocco (per navigazione mirata). */
export function getSezioneDiBlocco(blocco: BloccoId): EditorSezione | undefined {
  return EDITOR_SEZIONI.find((s) => s.blocchi.includes(blocco));
}

/** Conteggi necessari ai controlli di pubblicazione. */
export type ConteggiEditor = {
  prodotti: number;
  offerte: number;
  servizi: number;
};

/**
 * Prerequisiti di pubblicazione dinamici per moduli/profilo:
 * - prodotti attivo → richiesto ≥1 prodotto;
 * - servizi attivo  → richiesto ≥1 servizio strutturato;
 * - misti (entrambi) → richiesto ≥1 dell'uno O dell'altro (o di entrambi se presenti);
 * - nessun blocco commerciale → nessun prerequisito catalogo;
 * - senza profilo/moduli → comportamento attuale (prodotto richiesto).
 */
export function getElementiMancantiDinamici(
  store: Negozio | null | undefined,
  counts: ConteggiEditor
): string[] {
  const mancanti: string[] = [];
  const nome = (store?.nome ?? "").trim();
  const categoria = (store?.categoria ?? "").trim();
  const logo = store?.logo_url;
  const copertina = store?.copertina_url;
  const contatto = !!(store?.telefono || store?.email_negozio || store?.whatsapp);

  if (!nome) mancanti.push("Nome del negozio");
  if (!categoria) mancanti.push("Categoria");
  if (!logo && !copertina) mancanti.push("Logo o immagine di copertina");
  if (!contatto) mancanti.push("Un contatto (telefono, email o WhatsApp)");

  const moduli = getModuli(store);
  if (moduli === null) {
    if (counts.prodotti === 0) mancanti.push("Almeno un prodotto nel catalogo");
    return mancanti;
  }
  const prodottiAttivi = moduli.includes("prodotti");
  const serviziAttivi = moduli.includes("servizi");
  if (prodottiAttivi && serviziAttivi) {
    if (counts.prodotti === 0 && counts.servizi === 0)
      mancanti.push("Almeno un prodotto o un servizio nel catalogo");
    else if (counts.prodotti === 0) mancanti.push("Aggiungi almeno un prodotto");
    else if (counts.servizi === 0) mancanti.push("Aggiungi almeno un servizio");
  } else if (prodottiAttivi) {
    if (counts.prodotti === 0) mancanti.push("Almeno un prodotto nel catalogo");
  } else if (serviziAttivi) {
    if (counts.servizi === 0) mancanti.push("Almeno un servizio nel catalogo");
  }
  return mancanti;
}

export function isProntoPerPubblicazioneDinamico(
  store: Negozio | null | undefined,
  counts: ConteggiEditor
): boolean {
  return getElementiMancantiDinamici(store, counts).length === 0;
}