import { createHash } from "node:crypto";
import { CODICI_ERRORE, ErroreRadiciScan, erroreQuotaNonDisponibile } from "./errori";

/**
 * RadiciScan — quote autonome.
 *
 * Rispecchia la RPC `radiscan_consume_usage(text, text, text)` della
 * migration 20261125 (incrementale sulla 20261118): modalità `anonimo` /
 * `autenticato`, limiti derivati dalla modalità, chiave tra 16 e 128 caratteri.
 *
 * Regola non negoziabile: qualunque anomalia (errore RPC, risposta vuota o
 * malformata, limiti diversi da quelli attesi) produce un'eccezione. Non
 * esiste un percorso che restituisca "consentita" senza conferma del
 * database.
 */

export const LIMITI_QUOTA = {
  anonimo: { minuto: 10, giorno: 100 },
  autenticato: { minuto: 30, giorno: 300 },
} as const;

export type ModalitaQuota = keyof typeof LIMITI_QUOTA;

export const LUNGHEZZA_MINIMA_CHIAVE = 16;
export const LUNGHEZZA_MASSIMA_CHIAVE = 128;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function validaChiaveQuota(chiave: string): boolean {
  if (typeof chiave !== "string") return false;
  const lunghezza = chiave.length;
  return (
    lunghezza >= LUNGHEZZA_MINIMA_CHIAVE && lunghezza <= LUNGHEZZA_MASSIMA_CHIAVE
  );
}

/**
 * Chiave anonima: hash salato dell'identificativo di rete.
 * Il sale è fornito dal chiamante (2C), mai un valore fisso nel codice.
 */
export function creaChiaveQuotaAnonima(
  identificativoRete: string,
  sale: string
): string {
  const rete = identificativoRete.trim();
  const segreto = sale.trim();
  if (!rete) throw new Error("Identificativo di rete assente.");
  if (segreto.length < LUNGHEZZA_MINIMA_CHIAVE) {
    throw new Error("Sale troppo corto: attesi almeno 16 caratteri.");
  }
  const digest = createHash("sha256")
    .update(`${segreto}|${rete}`, "utf8")
    .digest("hex");
  const chiave = `anon:${digest}`;
  if (!validaChiaveQuota(chiave)) {
    throw new Error("Chiave di quota anonima fuori misura.");
  }
  return chiave;
}

/** Chiave autenticata: id utente canonico, nessun dato personale in chiaro. */
export function creaChiaveQuotaAutenticata(utenteId: string): string {
  const id = utenteId.trim().toLowerCase();
  if (!RE_UUID.test(id)) {
    throw new Error("Identificativo utente non valido: atteso UUID.");
  }
  const chiave = `utente:${id}`;
  if (!validaChiaveQuota(chiave)) {
    throw new Error("Chiave di quota autenticata fuori misura.");
  }
  return chiave;
}

export function limitiQuota(modalita: ModalitaQuota): { minuto: number; giorno: number } {
  const limiti = LIMITI_QUOTA[modalita];
  if (!limiti) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.QUOTA_CONFIGURAZIONE,
      "Modalità di quota non valida."
    );
  }
  return limiti;
}

export type EsitoQuota =
  | {
      consentita: true;
      usatiOggi: number;
      limiteGiorno: number;
      limiteMinuto: number;
    }
  | {
      consentita: false;
      motivo: string;
      riprovaTraSecondi: number;
      usatiOggi: number;
      limiteGiorno: number;
      limiteMinuto: number;
    };

function numeroIntero(valore: unknown): number | null {
  return typeof valore === "number" && Number.isInteger(valore) && valore >= 0
    ? valore
    : null;
}

/**
 * Interpreta la riga restituita dalla RPC. Qualsiasi scostamento dai limiti
 * attesi è un errore di configurazione, non un permesso.
 */
export function interpretaRigaQuota(
  riga: unknown,
  modalita: ModalitaQuota
): EsitoQuota {
  const attesi = limitiQuota(modalita);
  const valore = Array.isArray(riga) ? riga[0] : riga;

  if (valore === null || typeof valore !== "object") {
    throw erroreQuotaNonDisponibile();
  }

  const record = valore as Record<string, unknown>;
  const limiteMinuto = numeroIntero(record.limite_minuto);
  const limiteGiorno = numeroIntero(record.limite_giorno);
  const usatiOggi = numeroIntero(record.usati_oggi);

  if (
    typeof record.allowed !== "boolean" ||
    limiteMinuto === null ||
    limiteGiorno === null ||
    usatiOggi === null
  ) {
    throw erroreQuotaNonDisponibile();
  }

  if (limiteMinuto !== attesi.minuto || limiteGiorno !== attesi.giorno) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.QUOTA_CONFIGURAZIONE,
      "I limiti restituiti dal database non corrispondono a quelli previsti."
    );
  }

  if (record.allowed) {
    return {
      consentita: true,
      usatiOggi,
      limiteGiorno,
      limiteMinuto,
    };
  }

  const riprova = numeroIntero(record.retry_after);
  if (riprova === null || riprova < 1) {
    throw erroreQuotaNonDisponibile();
  }

  return {
    consentita: false,
    motivo:
      typeof record.reason === "string" && record.reason.trim()
        ? record.reason.trim()
        : "Limite di utilizzo raggiunto.",
    riprovaTraSecondi: riprova,
    usatiOggi,
    limiteGiorno,
    limiteMinuto,
  };
}

export type RpcQuota = (
  nome: string,
  parametri: Record<string, string>
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export interface DipendenzeQuota {
  rpc: RpcQuota;
  chiave: string;
  modalita: ModalitaQuota;
  etichetta?: string;
}

/**
 * Consuma una unità di quota. Fail-closed: su errore o risposta ambigua
 * solleva `ErroreRadiciScan` con codice `RADICSCAN_QUOTA_NON_DISPONIBILE`
 * (la route risponde 503).
 */
export async function consumaQuota(dipendenze: DipendenzeQuota): Promise<EsitoQuota> {
  const { rpc, chiave, modalita, etichetta = "analisi" } = dipendenze;

  limitiQuota(modalita);

  if (!validaChiaveQuota(chiave)) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.QUOTA_CONFIGURAZIONE,
      "Chiave di quota non conforme: attesi 16-128 caratteri."
    );
  }

  let risposta: { data: unknown; error: { message?: string } | null };
  try {
    risposta = await rpc("radiscan_consume_usage", {
      p_chiave: chiave,
      p_modalita: modalita,
      p_etichetta: etichetta,
    });
  } catch {
    throw erroreQuotaNonDisponibile();
  }

  if (risposta === null || typeof risposta !== "object" || risposta.error) {
    throw erroreQuotaNonDisponibile();
  }

  return interpretaRigaQuota(risposta.data, modalita);
}
