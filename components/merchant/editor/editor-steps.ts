import type { Negozio } from "@/types/negozio";

/**
 * NUOVA ARCHITETTURA EDITOR — percorso numerato e sequenziale (01–08).
 * Ogni step ha uno stato: COMPLETATA / DA COMPLETARE / ATTENZIONE.
 */

export type StepId =
  | "identita"
  | "contatti"
  | "presentazione"
  | "catalogo"
  | "offerte"
  | "commerciale"
  | "anteprima"
  | "pubblicazione";

export type StepStatus = "completata" | "da-completare" | "attenzione";

export type EditorStep = {
  id: StepId;
  numero: string;
  titolo: string;
  sottotitolo: string;
};

export const EDITOR_STEPS: EditorStep[] = [
  {
    id: "identita",
    numero: "01",
    titolo: "Identità del negozio",
    sottotitolo: "Nome, logo, copertina e categoria",
  },
  {
    id: "contatti",
    numero: "02",
    titolo: "Informazioni e contatti",
    sottotitolo: "Indirizzo, telefono, orari e social",
  },
  {
    id: "presentazione",
    numero: "03",
    titolo: "Presentazione",
    sottotitolo: "Galleria, descrizione estesa e servizi",
  },
  {
    id: "catalogo",
    numero: "04",
    titolo: "Catalogo / Prodotti",
    sottotitolo: "I prodotti che vendi nel tuo negozio",
  },
  {
    id: "offerte",
    numero: "05",
    titolo: "Offerte",
    sottotitolo: "Promozioni e sconti attivi",
  },
  {
    id: "commerciale",
    numero: "06",
    titolo: "Impostazioni commerciali",
    sottotitolo: "Modalità di vendita e pagamenti",
  },
  {
    id: "anteprima",
    numero: "07",
    titolo: "Anteprima",
    sottotitolo: "Come vedono il negozio i clienti",
  },
  {
    id: "pubblicazione",
    numero: "08",
    titolo: "Pubblicazione",
    sottotitolo: "Riepilogo e stato del negozio",
  },
];

export type StepCounts = {
  prodotti: number;
  offerte: number;
};

export type ModalitaVendita = {
  ritiro: boolean;
  consegna: boolean;
  spedizione: boolean;
};

export const MODALITA_VENDITA_DEFAULT: ModalitaVendita = {
  ritiro: true,
  consegna: true,
  spedizione: true,
};

export function getModalitaVendita(store: Negozio | null | undefined): ModalitaVendita {
  const raw = (store?.data as Record<string, unknown> | null | undefined)?.modalita_vendita as
    | Partial<ModalitaVendita>
    | null
    | undefined;
  if (!raw || typeof raw !== "object") return { ...MODALITA_VENDITA_DEFAULT };
  return {
    ritiro: raw.ritiro !== false,
    consegna: raw.consegna !== false,
    spedizione: raw.spedizione !== false,
  };
}

function hasOrari(orari: Negozio["orari"] | undefined): boolean {
  if (!orari || typeof orari !== "object") return false;
  return Object.values(orari).some(
    (d) => d && typeof d === "object" && ((d as { chiuso?: boolean }).chiuso === true || (d as { apertura1?: string }).apertura1)
  );
}

/**
 * Calcola lo stato di uno step in base ai dati reali del negozio.
 * - completata: tutti i campi essenziali dello step sono valorizzati;
 * - attenzione: compilato parzialmente (qualcosa manca);
 * - da-completare: nessun campo essenziale compilato.
 */
export function statoStep(
  id: StepId,
  store: Negozio | null | undefined,
  counts: StepCounts
): StepStatus {
  const s = store;
  const nome = (s?.nome ?? "").trim();
  const categoria = (s?.categoria ?? "").trim();
  const descrizione = (s?.descrizione ?? "").trim();
  const logo = s?.logo_url ?? null;
  const copertina = s?.copertina_url ?? null;
  const galleria = Array.isArray(s?.galleria) ? (s.galleria as string[]) : [];
  const servizi = Array.isArray(s?.servizi) ? (s.servizi as string[]) : [];
  const descCompleta = (s?.descrizione_completa ?? "").trim();

  switch (id) {
    case "identita": {
      if (!nome || !categoria) return "da-completare";
      if (nome && categoria && (logo || copertina) && descrizione) return "completata";
      return "attenzione";
    }

    case "contatti": {
      const hasContatto = !!(s?.telefono || s?.email_negozio || s?.whatsapp);
      const hasIndirizzo = !!(s?.indirizzo && s?.citta);
      const hasOrario = hasOrari(s?.orari);
      const filled = [hasContatto, hasIndirizzo, hasOrario].filter(Boolean).length;
      if (filled === 3) return "completata";
      if (filled > 0) return "attenzione";
      return "da-completare";
    }

    case "presentazione": {
      const hasContent = galleria.length > 0 || servizi.length > 0 || !!descCompleta;
      return hasContent ? "completata" : "da-completare";
    }

    case "catalogo": {
      return counts.prodotti > 0 ? "completata" : "da-completare";
    }

    case "offerte": {
      return counts.offerte > 0 ? "completata" : "da-completare";
    }

    case "commerciale": {
      const modalita = getModalitaVendita(s);
      return modalita.ritiro || modalita.consegna || modalita.spedizione ? "completata" : "attenzione";
    }

    case "anteprima":
    case "pubblicazione":
      return "completata";
  }
}

/** Elementi mancanti che bloccano la pubblicazione (per lo step 08). */
export function getElementiMancanti(store: Negozio | null | undefined, counts: StepCounts): string[] {
  const mancanti: string[] = [];
  if (!(store?.nome ?? "").trim()) mancanti.push("Nome del negozio");
  if (!(store?.categoria ?? "").trim()) mancanti.push("Categoria");
  if (!store?.logo_url && !store?.copertina_url) mancanti.push("Logo o immagine di copertina");
  if (counts.prodotti === 0) mancanti.push("Almeno un prodotto nel catalogo");
  if (!(store?.telefono || store?.email_negozio || store?.whatsapp)) mancanti.push("Un contatto (telefono, email o WhatsApp)");
  return mancanti;
}

/** True se il negozio è pronto per essere pubblicato (requisiti essenziali). */
export function isProntoPerPubblicazione(store: Negozio | null | undefined, counts: StepCounts): boolean {
  return getElementiMancanti(store, counts).length === 0;
}

export type StepProps = {
  storeId: string;
  store: Negozio;
  basePath: string;
  counts: StepCounts;
  /** Notifica che i dati sono cambiati (per aggiornare stato/riepilogo). */
  onDataChanged: () => void;
};
