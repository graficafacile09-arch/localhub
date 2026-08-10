/**
 * RECLAMI ORDINE — PARTE PURA (nessun import server).
 *
 * Tipi, macchina a stati, etichette e costruttore del messaggio ntfy:
 * importabili SENZA rischi da componenti client (nessun import di
 * Supabase/cookies). Specchia la macchina a stati della RPC
 * `aggiorna_stato_reclamo` (migrazione 20260816). Le transizioni vengono
 * SEMPRE ri-validate lato DB.
 */

export type StatoReclamo = "aperto" | "in_gestione" | "risolto" | "chiuso";
export type TipoReclamo = "ordine_non_arrivato";

export type ReclamoOrdine = {
  id: string;
  ordineId: string;
  negozioId: string;
  clienteUserId: string | null;
  clienteNome: string;
  clienteEmail: string | null;
  clienteTelefono: string | null;
  tipo: TipoReclamo;
  messaggio: string | null;
  stato: StatoReclamo;
  createdAt: string;
  updatedAt: string;
  gestitoAt: string | null;
  gestitoDa: string | null;
  gestitoNota: string | null;
};

export const ETICHETTE_STATO_RECLAMO: Record<StatoReclamo, string> = {
  aperto: "Aperto",
  in_gestione: "In gestione",
  risolto: "Risolto",
  chiuso: "Chiuso",
};

export const ETICHETTA_TIPO_RECLAMO: Record<TipoReclamo, string> = {
  ordine_non_arrivato: "Ordine non arrivato",
};

export function isStatoReclamo(value: unknown): value is StatoReclamo {
  return (
    typeof value === "string" &&
    (["aperto", "in_gestione", "risolto", "chiuso"] as const).includes(value as StatoReclamo)
  );
}

export function isTipoReclamo(value: unknown): value is TipoReclamo {
  return value === "ordine_non_arrivato";
}

/** Transizione consentita (stesso stato → no-op idempotente). */
export function transizioneReclamoConsentita(da: StatoReclamo, a: StatoReclamo): boolean {
  if (da === a) return true;
  switch (da) {
    case "aperto":
      return a === "in_gestione" || a === "risolto" || a === "chiuso";
    case "in_gestione":
      return a === "risolto" || a === "chiuso";
    case "risolto":
      return a === "chiuso";
    case "chiuso":
      return false;
    default:
      return false;
  }
}

export type AzioneReclamo = { stato: StatoReclamo; etichetta: string };

/** Azioni del venditore su un reclamo (pulsanti del dettaglio ordine). */
export function azioniReclamoDisponibili(stato: StatoReclamo): AzioneReclamo[] {
  switch (stato) {
    case "aperto":
      return [
        { stato: "in_gestione", etichetta: "Prendi in carico" },
        { stato: "risolto", etichetta: "Segna come risolto" },
        { stato: "chiuso", etichetta: "Chiudi" },
      ];
    case "in_gestione":
      return [
        { stato: "risolto", etichetta: "Segna come risolto" },
        { stato: "chiuso", etichetta: "Chiudi" },
      ];
    case "risolto":
      return [{ stato: "chiuso", etichetta: "Chiudi" }];
    case "chiuso":
      return [];
    default:
      return [];
  }
}

/**
 * Dati per il messaggio ntfy del reclamo. Tutti derivati dal DB lato
 * server (ordine + snapshot del reclamo): numero ordine LEGGIBILE
 * (es. "LH-00125", MAI l'UUID interno), nome negozio, cliente, stato
 * attuale dell'ordine (con motivo/nota se annullato), data/ora e link.
 */
export type DatiNotificaReclamoNtfy = {
  numero: string;
  negozioNome: string;
  clienteNome: string;
  /** Etichetta leggibile dello stato ordine (es. "Nuovo", "Annullato"). */
  statoOrdine: string;
  /** Etichetta del motivo di annullamento (solo se ordine ANNULLATO). */
  motivoAnnullamento: string | null;
  /** Nota del venditore relativa all'annullamento (se presente). */
  notaAnnullamento: string | null;
  /** Data/ora del reclamo nel formato "GG/MM/AAAA HH:MM" (fuso Europe/Rome). */
  dataOra: string;
  messaggio: string | null;
  linkOrdine: string | null;
};

/**
 * Formatta una data ISO in "GG/MM/AAAA HH:MM" nel fuso Europe/Rome
 * (identifica subito quando è stato inviato il reclamo). Fallback: se la
 * data non è valida restituisce la stringa originale (mai "Invalid Date").
 */
export function formattaDataOraReclamo(iso: string | null | undefined): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  try {
    const parti = new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Rome",
    }).formatToParts(data);
    const valore = (tipo: string) =>
      parti.find((p) => p.type === tipo)?.value ?? "";
    return `${valore("day")}/${valore("month")}/${valore("year")} ${valore("hour")}:${valore("minute")}`;
  } catch {
    return iso;
  }
}

/** Costruisce il corpo del messaggio reclamo (formato richiesto). */
export function costruisciMessaggioReclamoNtfy(dati: DatiNotificaReclamoNtfy): string {
  const righe: string[] = [];
  righe.push(`🚨 RECLAMO ORDINE #${(dati.numero || "").trim() || "—"}`);
  righe.push("");
  righe.push(`🏪 Negozio: ${(dati.negozioNome || "").trim() || "—"}`);
  righe.push(`👤 Cliente: ${(dati.clienteNome || "").trim() || "—"}`);
  righe.push(`⚠️ Stato ordine: ${(dati.statoOrdine || "").trim() || "—"}`);
  const motivo = (dati.motivoAnnullamento || "").trim();
  if (motivo) righe.push(`📌 Motivo: ${motivo}`);
  const nota = (dati.notaAnnullamento || "").trim();
  if (nota) righe.push(`📌 Nota: ${nota}`);
  const messaggio = (dati.messaggio || "").trim();
  righe.push(`📝 Problema: ${messaggio || "(nessun messaggio)"}`);
  righe.push(`📅 Data: ${(dati.dataOra || "").trim() || "—"}`);
  if (dati.linkOrdine) {
    righe.push("");
    righe.push("🔗 Gestisci ordine:");
    righe.push(dati.linkOrdine);
  } else {
    // Fallback sicuro e leggibile: MAI un URL rotto con doppie slash.
    righe.push("");
    righe.push("🔗 Gestione ordine: disponibile dal pannello venditore");
  }
  return righe.join("\n");
}
