import { createHash } from "node:crypto";
import { isIP } from "node:net";
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

type DiagnosticaQuota = (fase: string, dettagli?: Record<string, unknown>) => void;

interface ErroreRpcQuota {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

function tipoDi(valore: unknown): string {
  if (valore === null) return "null";
  if (Array.isArray(valore)) return "array";
  return typeof valore;
}

function sembraBase64Breve(token: string): boolean {
  if (token.length < 6 || token.length >= 80) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(token)) return false;
  const senzaPadding = token.replace(/=+$/, "");
  if (senzaPadding.length < 4) return false;

  // Padding e simboli +/ sono segnali forti. Senza di essi accettiamo solo
  // token lunghi con tutte e tre le classi: riduce i falsi positivi su
  // parole e identificativi brevi, ma non elimina l'ambiguità di fondo.
  if (token.includes("=") || /[+/]/.test(token)) return true;
  // Limite noto: i token senza padding sotto 14 caratteri (es. "aGVsbG8")
  // restano volutamente visibili per non oscurare identificativi comuni.
  if (token.length < 14 || token.length % 4 === 1) return false;
  const cifre = (token.match(/[0-9]/g) ?? []).length;
  if (cifre * 4 > token.length) return false;
  return /[a-z]/.test(token) && /[A-Z]/.test(token) && /[0-9]/.test(token);
}

const RE_CANDIDATO_IPV6 =
  /\[[0-9a-f:.]{2,}(?:%[0-9a-z_.~%-]+)?\]|[0-9a-f:.]{2,}(?:%[0-9a-z_.~%-]+)?/gi;

function oscuraIpv6(testo: string): string {
  return testo.replace(RE_CANDIDATO_IPV6, (originale) => {
    const bordi = originale.match(/^([\[(<]*)(.*?)([\]>),.;!?]*)$/);
    if (!bordi) return originale;
    const [, prefisso, candidato, suffisso] = bordi;
    if ((candidato.match(/:/g)?.length ?? 0) < 2) return originale;

    const senzaZona = candidato.replace(/%.*$/, "");

    if (isIP(senzaZona) === 6) {
      if (prefisso === "[" && suffisso === "]") return "[ip redatto]";
      return `${prefisso}[ip redatto]${suffisso}`;
    }
    if (!suffisso && candidato.endsWith(":") && isIP(candidato.slice(0, -1)) === 6) {
      return `${prefisso}[ip redatto]:`;
    }
    return originale;
  });
}

function sanificaTesto(valore: unknown, massimo = 300): string | null {
  if (typeof valore !== "string") return null;
  const sanificato = oscuraIpv6(valore)
    .replace(/anon:[0-9a-f]{16,}/gi, "anon:[redatto]")
    .replace(/utente:[0-9a-f-]{36}/gi, "utente:[redatto]")
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[immagine redatta]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redatto]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      "[jwt redatto]"
    )
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/gi, "[chiave supabase redatta]")
    .replace(/([?&](?:token|key|apikey|access_token)=)[^&\s]+/gi, "$1[redatto]")
    .replace(/[A-Za-z0-9+/]{6,}={0,2}/g, (token) => {
      if (token.length >= 80) return "[dato lungo redatto]";
      return sembraBase64Breve(token) ? "[base64 redatto]" : token;
    })
    .replace(/\b[a-f0-9]{32,}\b/gi, "[hash redatto]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redatta]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip redatto]");
  return sanificato.slice(0, massimo);
}

function descriviCampi(riga: unknown): Record<string, string> | null {
  if (riga === null || typeof riga !== "object" || Array.isArray(riga)) return null;
  const campi: Record<string, string> = {};
  for (const [nome, valore] of Object.entries(riga as Record<string, unknown>)) {
    campi[nome] = valore === null ? "null" : Array.isArray(valore) ? "array" : typeof valore;
  }
  return campi;
}

function descriviRisposta(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) {
    return { tipo: "array", lunghezza: data.length, prima_riga: descriviCampi(data[0]) };
  }
  if (data === null) return { tipo: "null" };
  if (typeof data === "object") return { tipo: "object", campi: descriviCampi(data) };
  return { tipo: typeof data };
}

function descriviErroreRpc(errore: unknown): Record<string, unknown> {
  if (errore === null || typeof errore !== "object") return { tipo: tipoDi(errore) };
  const e = errore as Record<string, unknown>;
  return {
    tipo: "object",
    code: sanificaTesto(e.code),
    message: sanificaTesto(e.message),
    details: sanificaTesto(e.details),
    hint: sanificaTesto(e.hint),
  };
}

export function descriviEccezioneQuota(causa: unknown): Record<string, unknown> {
  return {
    tipo: causa instanceof Error ? sanificaTesto(causa.name, 80) || "Error" : tipoDi(causa),
    codice: causa instanceof ErroreRadiciScan ? causa.codice : null,
    messaggio: causa instanceof Error ? sanificaTesto(causa.message, 240) : null,
  };
}

function registraDiagnostica(
  fase: string,
  dettagli: Record<string, unknown> = {}
): void {
  console.error("[radiscan][quota]", { fase, ...dettagli });
}

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
  modalita: ModalitaQuota,
  diagnostica?: DiagnosticaQuota
): EsitoQuota {
  const attesi = limitiQuota(modalita);
  const valore = Array.isArray(riga) ? riga[0] : riga;

  if (valore === null || typeof valore !== "object") {
    diagnostica?.("validazione_fallita", {
      regola: "riga_non_oggetto",
      tipo_ricevuto: tipoDi(valore),
    });
    throw erroreQuotaNonDisponibile();
  }

  const record = valore as Record<string, unknown>;
  const limiteMinuto = numeroIntero(record.limite_minuto);
  const limiteGiorno = numeroIntero(record.limite_giorno);
  const usatiOggi = numeroIntero(record.usati_oggi);

  const regoleValidazione: string[] = [];
  if (typeof record.allowed !== "boolean") regoleValidazione.push("allowed_non_booleano");
  if (limiteMinuto === null) regoleValidazione.push("limite_minuto_non_intero");
  if (limiteGiorno === null) regoleValidazione.push("limite_giorno_non_intero");
  if (usatiOggi === null) regoleValidazione.push("usati_oggi_non_intero");
  if (regoleValidazione.length > 0) {
    diagnostica?.("validazione_fallita", {
      regola: regoleValidazione,
      campi_ricevuti: descriviCampi(record),
    });
  }

  if (
    typeof record.allowed !== "boolean" ||
    limiteMinuto === null ||
    limiteGiorno === null ||
    usatiOggi === null
  ) {
    throw erroreQuotaNonDisponibile();
  }

  if (limiteMinuto !== attesi.minuto || limiteGiorno !== attesi.giorno) {
    diagnostica?.("validazione_fallita", {
      regola: "limiti_non_corrispondenti",
      limite_minuto_atteso: attesi.minuto,
      limite_giorno_atteso: attesi.giorno,
      limite_minuto_ricevuto: limiteMinuto,
      limite_giorno_ricevuto: limiteGiorno,
    });
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
    diagnostica?.("validazione_fallita", { regola: "retry_after_non_valido" });
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
) => Promise<{ data: unknown; error: ErroreRpcQuota | null }>;

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

  let risposta: { data: unknown; error: ErroreRpcQuota | null };
  try {
    risposta = await rpc("radiscan_consume_usage", {
      p_chiave: chiave,
      p_modalita: modalita,
      p_etichetta: etichetta,
    });
  } catch (causa) {
    registraDiagnostica("rpc_eccezione", {
      modalita,
      ...descriviEccezioneQuota(causa),
    });
    throw erroreQuotaNonDisponibile();
  }

  if (risposta === null || typeof risposta !== "object") {
    registraDiagnostica("rpc_risposta_non_valida", {
      modalita,
      tipo_ricevuto: tipoDi(risposta),
    });
    throw erroreQuotaNonDisponibile();
  }

  if (risposta.error) {
    registraDiagnostica("rpc_errore", {
      modalita,
      errore: descriviErroreRpc(risposta.error),
      risposta: descriviRisposta(risposta.data),
    });
    throw erroreQuotaNonDisponibile();
  }

  try {
    return interpretaRigaQuota(risposta.data, modalita, registraDiagnostica);
  } catch (causa) {
    registraDiagnostica("interpretazione_eccezione", {
      modalita,
      ...descriviEccezioneQuota(causa),
      risposta: descriviRisposta(risposta.data),
    });
    throw causa;
  }
}
