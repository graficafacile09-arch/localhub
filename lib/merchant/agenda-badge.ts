/**
 * AGENDA — BADGE APPUNTAMENTI NUOVI (letto/non letto).
 *
 * Non esiste una colonna `letto_at` sulle prenotazioni (niente migration/schema):
 * lo stato di lettura è salvato in `negozi.data.agenda_ultima_lettura` (jsonb
 * già esistente, ISO UTC), la stessa tecnica di `prenotazioni_config` e
 * `agenda_eccezioni`.
 *
 * Definizione di "nuovo/non letto":
 *   un appuntamento è NUOVO se appartiene al negozio corrente, è nello stato
 *   `confermata` ed è stato creato DOPO `agenda_ultima_lettura`.
 *
 * Regole:
 *  - Agenda mai aperta (`ultimaLettura` null) → conteggio 0: il badge NON va
 *    mai gonfiato con lo storico degli appuntamenti.
 *  - Quando il merchant apre l'Agenda, `agenda_ultima_lettura` viene aggiornato
 *    a `now` → gli appuntamenti visualizzati risultano letti e il badge si
 *    azzera (best-effort, mai bloccante).
 *
 * SOLO funzioni pure: riusabili da route/page (server) e testabili.
 */

/**
 * Timestamp ISO UTC dell'ultima volta che il merchant ha aperto l'Agenda
 * (`negozi.data.agenda_ultima_lettura`). null = Agenda mai aperta.
 */
export function getUltimaLetturaAgenda(
  data: Record<string, unknown> | null | undefined
): string | null {
  const v = data?.agenda_ultima_lettura;
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * Conteggio appuntamenti NUOVI per il SOLO `negozioId` corrente.
 *
 * `prenotazioni` è l'elenco (snapshot DB) del negozio; ogni riga deve avere
 * `negozio_id`, `stato`, `created_at`. Conteggio = righe del negozio corrente
 * con `stato === "confermata"` e `created_at` STRETTAMENTE dopo `ultimaLettura`.
 * Agenda mai aperta o timestamp non valido → 0 (mai storico nel badge).
 */
export function contaNuoviAppuntamenti(
  prenotazioni: Array<{
    negozio_id: string;
    stato: string;
    created_at: string | null;
  }>,
  negozioId: string,
  ultimaLettura: string | null
): number {
  if (!ultimaLettura) return 0;
  const soglia = new Date(ultimaLettura).getTime();
  if (Number.isNaN(soglia)) return 0;
  return prenotazioni.filter((p) => {
    if (!p || p.negozio_id !== negozioId) return false;
    if (p.stato !== "confermata") return false;
    if (typeof p.created_at !== "string" || !p.created_at) return false;
    const creato = new Date(p.created_at).getTime();
    return !Number.isNaN(creato) && creato > soglia;
  }).length;
}

/**
 * Normalizza una riga prenotazioni dal DB (campi snake_case) per
 * `contaNuoviAppuntamenti`. Tollera valori null/undefined.
 */
export function rigaPrenotazionePerBadge(
  raw: {
    negozio_id?: string | null;
    stato?: string | null;
    created_at?: string | null;
  } | null
): { negozio_id: string; stato: string; created_at: string | null } {
  return {
    negozio_id: String(raw?.negozio_id ?? ""),
    stato: String(raw?.stato ?? ""),
    created_at:
      typeof raw?.created_at === "string" && raw.created_at ? raw.created_at : null,
  };
}
