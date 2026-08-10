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

/** Dati minimi per il messaggio ntfy del reclamo. */
export type DatiNotificaReclamoNtfy = {
  numero: string;
  negozioNome: string;
  clienteNome: string;
  tipo: TipoReclamo;
  messaggio: string | null;
  linkOrdine: string | null;
};

/** Costruisce il corpo del messaggio reclamo (formato richiesto). */
export function costruisciMessaggioReclamoNtfy(dati: DatiNotificaReclamoNtfy): string {
  const righe: string[] = [];
  righe.push(`🚨 RECLAMO ORDINE #${(dati.numero || "").trim() || "—"}`);
  righe.push("");
  righe.push(`Negozio: ${(dati.negozioNome || "").trim() || "—"}`);
  righe.push(`Cliente: ${(dati.clienteNome || "").trim() || "—"}`);
  righe.push(`Tipo: ${ETICHETTA_TIPO_RECLAMO[dati.tipo] ?? dati.tipo}`);
  const messaggio = (dati.messaggio || "").trim();
  righe.push(`Messaggio: ${messaggio || "(nessun messaggio)"}`);
  if (dati.linkOrdine) {
    righe.push("");
    righe.push(`Apri ordine: ${dati.linkOrdine}`);
  }
  return righe.join("\n");
}
