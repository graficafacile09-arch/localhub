/**
 * RICHIESTA INFORMAZIONI — canale cliente → attività (Fase 4).
 *
 * Configurazione salvata in `negozi.data.richiesta_info` (jsonb, merge del
 * PUT settings esistente): nessuna nuova tabella/migration.
 *
 * Invio email con Resend, STESSA infrastruttura di ordini/password reset:
 * nessun secondo sistema email. L'invio è BEST-EFFORT — la richiesta non
 * deve MAI fallire per un problema di notifica (pattern ntfy/ordine-email).
 *
 * SOLO server-side: questo modulo importa Resend e non deve essere
 * importato da componenti client.
 */

import { Resend } from "resend";

/** Timeout dell'invio (la richiesta non deve restare appesa). */
const RESEND_TIMEOUT_MS = 8_000;

export type TipoRichiestaInfo = "informazioni" | "preventivo" | "consulenza";

export type ConfigRichiestaInfo = {
  attiva: boolean;
  titolo: string;
  testo: string;
  tipo: TipoRichiestaInfo;
  telefono_obbligatorio: boolean;
  email_obbligatoria: boolean;
  messaggio_obbligatorio: boolean;
};

export const RICHIESTA_INFO_DEFAULT: ConfigRichiestaInfo = {
  attiva: false,
  titolo: "Richiedi informazioni",
  testo: "Contattaci per maggiori informazioni.",
  tipo: "informazioni",
  telefono_obbligatorio: false,
  email_obbligatoria: true,
  messaggio_obbligatorio: true,
};

/** Legge la configurazione da `negozi.data.richiesta_info` (difensivo). */
export function getConfigRichiestaInfo(
  data: Record<string, unknown> | null | undefined
): ConfigRichiestaInfo {
  const raw = data?.richiesta_info as Partial<ConfigRichiestaInfo> | null | undefined;
  if (!raw || typeof raw !== "object") return { ...RICHIESTA_INFO_DEFAULT };
  return {
    attiva: raw.attiva === true,
    titolo:
      typeof raw.titolo === "string" && raw.titolo.trim()
        ? raw.titolo.trim()
        : RICHIESTA_INFO_DEFAULT.titolo,
    testo: typeof raw.testo === "string" ? raw.testo : RICHIESTA_INFO_DEFAULT.testo,
    tipo:
      raw.tipo === "preventivo" || raw.tipo === "consulenza"
        ? raw.tipo
        : "informazioni",
    telefono_obbligatorio: raw.telefono_obbligatorio === true,
    email_obbligatoria: raw.email_obbligatoria !== false,
    messaggio_obbligatorio: raw.messaggio_obbligatorio !== false,
  };
}

/** Etichetta pubblica del tipo di richiesta. */
export function etichettaTipoRichiesta(tipo: TipoRichiestaInfo): string {
  switch (tipo) {
    case "preventivo":
      return "Richiesta preventivo";
    case "consulenza":
      return "Richiesta consulenza";
    default:
      return "Richiesta informazioni";
  }
}

export type DatiRichiestaInfo = {
  nome: string;
  email: string | null;
  telefono: string | null;
  messaggio: string;
  tipo: TipoRichiestaInfo;
  pagina_origine?: string | null;
  oggetto_riferimento?: string | null;
  oggetto_tipo?: string | null;
  oggetto_id?: string | null;
};

/** Escapa il testo per l'HTML dell'email (mai HTML non sanificato). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function conTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout dopo ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Invio email della richiesta al merchant (best-effort, mai un'eccezione).
 * - RICHIESTA_INFO_EMAIL_ENABLED=false → skipped (test / disattivazione);
 * - RESEND_API_KEY assente → skipped;
 * - errore Resend → error (loggato dal chiamante), la richiesta resta accettata.
 */
export async function inviaRichiestaInfoEmail(
  destinatario: string,
  negozioNome: string,
  dati: DatiRichiestaInfo
): Promise<{ stato: "sent" | "skipped" | "error"; motivo?: string }> {
  if (process.env.RICHIESTA_INFO_EMAIL_ENABLED === "false") {
    return { stato: "skipped", motivo: "RICHIESTA_INFO_EMAIL_ENABLED=false" };
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { stato: "skipped", motivo: "RESEND_API_KEY non configurata" };
  }

  const righe: [string, string][] = [
    ["Cliente", escapeHtml(dati.nome)],
    ...(dati.email ? ([["Email", escapeHtml(dati.email)]] as [string, string][]) : []),
    ...(dati.telefono ? ([["Telefono", escapeHtml(dati.telefono)]] as [string, string][]) : []),
    ["Tipo richiesta", etichettaTipoRichiesta(dati.tipo)],
    ["Messaggio", escapeHtml(dati.messaggio)],
    ...(dati.pagina_origine ? ([["Pagina di origine", escapeHtml(dati.pagina_origine)]] as [string, string][]) : []),
    ...(dati.oggetto_riferimento ? ([["Riferimento", escapeHtml(dati.oggetto_riferimento)]] as [string, string][]) : []),
  ];

  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">
<h2 style="margin:0 0 12px">Nuova richiesta di informazioni — ${escapeHtml(negozioNome)}</h2>
<table style="border-collapse:collapse">
${righe
  .map(
    ([k, v]) =>
      `<tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#64748b;vertical-align:top">${k}</td><td style="padding:4px 0;white-space:pre-wrap">${v}</td></tr>`
  )
  .join("")}
</table>
<p style="margin-top:12px;color:#94a3b8;font-size:12px">${new Date().toLocaleString("it-IT")}</p>
</div>`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await conTimeout(
      resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "InCittà <onboarding@resend.dev>",
        to: destinatario,
        subject: `Nuova richiesta di informazioni — ${negozioNome}`,
        html,
      }),
      RESEND_TIMEOUT_MS
    );
    if (error) {
      return { stato: "error", motivo: `Resend: ${error.message}` };
    }
    return { stato: "sent", motivo: data?.id ?? undefined };
  } catch (err) {
    return {
      stato: "error",
      motivo: err instanceof Error ? err.message : "errore sconosciuto",
    };
  }
}
