/**
 * PRENOTAZIONI — email al merchant (Fase 6g).
 *
 * Invio BEST-EFFORT con Resend, STESSA infrastruttura di `richiesta-info` e
 * ordini: nessun secondo sistema email. La prenotazione NON deve MAI fallire
 * per un problema di notifica.
 *
 * SOLO server-side: importa Resend, non importabile da componenti client.
 *
 * Per testabilità il sender è iniettabile tramite il parametro opzionale
 * `sender` (default = Resend reale già usato dal progetto). La UI/client non
 * usa mai questo parametro; serve esclusivamente ai test per NON chiamare
 * Resend né la rete.
 */

import { Resend } from "resend";

/** Timeout dell'invio (la richiesta non deve restare appesa). */
const RESEND_TIMEOUT_MS = 8_000;

export type DatiNotificaPrenotazione = {
  numero: string;
  servizioNome: string;
  durataMin: number | null;
  giorno: string;
  oraInizio: string;
  oraFine: string;
  clienteNome: string;
  clienteCognome: string;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  note: string | null;
};

/** Escapa il testo per l'HTML dell'email (mai HTML non sanificato). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Costruisce l'HTML dell'email "Nuova prenotazione" (tutti i dati escapati). */
export function buildPrenotazioneEmailHtml(
  negozioNome: string,
  dati: DatiNotificaPrenotazione
): string {
  const righe: [string, string][] = [
    ["Numero", escapeHtml(dati.numero)],
    ["Servizio", escapeHtml(dati.servizioNome)],
    ["Durata", dati.durataMin ? `${escapeHtml(String(dati.durataMin))} minuti` : "-"],
    ["Data", escapeHtml(dati.giorno)],
    [
      "Ora",
      `${escapeHtml(dati.oraInizio.slice(0, 5))} – ${escapeHtml(dati.oraFine.slice(0, 5))}`,
    ],
    [
      "Cliente",
      `${escapeHtml(dati.clienteNome)} ${escapeHtml(dati.clienteCognome)}`,
    ],
    ...(dati.clienteTelefono
      ? ([["Telefono", escapeHtml(dati.clienteTelefono)]] as [string, string][])
      : []),
    ...(dati.clienteEmail
      ? ([["Email", escapeHtml(dati.clienteEmail)]] as [string, string][])
      : []),
    ...(dati.note
      ? ([["Note", escapeHtml(dati.note)]] as [string, string][])
      : []),
  ];

  return `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">
<h2 style="margin:0 0 4px">Nuova prenotazione ricevuta</h2>
<p style="margin:0 0 12px;color:#64748b">${escapeHtml(negozioNome)}</p>
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
}

/**
 * Contratto del sender iniettabile. Production usa la firma Resend real
 * (`{ data, error }`); i test forniscono una funzione compatibile.
 */
export interface SenderPrenotazioneEmail {
  send: (payload: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }) => Promise<{ data?: { id?: string } | null; error?: { message: string } | null }>;
}

const senderResend = (apiKey: string): SenderPrenotazioneEmail => {
  const resend = new Resend(apiKey);
  return {
    send: (p) =>
      resend.emails.send({
        from: p.from,
        to: p.to,
        subject: p.subject,
        html: p.html,
      }),
  };
};

/** Un `esito` RPC con gli unici campi necessari per la notifica. */
export type EsitoPrenotazioneNotifica = {
  giaEsistente?: boolean;
  prenotazione?: Record<string, unknown> | null;
};

export type RisultatoNotifica = {
  stato: "sent" | "skipped" | "error";
  motivo?: string;
};

/** Mappa l'esito RPC camellizzato nei dati della notifica. */
function datiDaEsito(
  p: Record<string, unknown>
): DatiNotificaPrenotazione {
  return {
    numero: String(p.numero ?? ""),
    servizioNome: String(p.servizioNome ?? ""),
    durataMin: typeof p.durataMin === "number" ? p.durataMin : null,
    giorno: String(p.giorno ?? ""),
    oraInizio: String(p.oraInizio ?? ""),
    oraFine: String(p.oraFine ?? ""),
    clienteNome: String(p.clienteNome ?? ""),
    clienteCognome: String(p.clienteCognome ?? ""),
    clienteTelefono:
      typeof p.clienteTelefono === "string" ? p.clienteTelefono : null,
    clienteEmail:
      typeof p.clienteEmail === "string" ? p.clienteEmail : null,
    note: typeof p.note === "string" ? p.note : null,
  };
}

/**
 * Invia (o salta) la notifica per una prenotazione appena creata.
 *
 * Retry/`giaEsistente===true` → sender NON chiamato (mai). Prima chiamata →
 * sender chiamato. `sender` opzionale SOLO per i test; production usa Resend.
 */
export async function notificaMerchantPrenotazione(opts: {
  destinatario: string;
  negozioNome: string;
  esito: EsitoPrenotazioneNotifica;
  sender?: SenderPrenotazioneEmail;
}): Promise<RisultatoNotifica> {
  // idempotente / retry → nessuna email
  if (opts.esito.giaEsistente === true) {
    return { stato: "skipped", motivo: "prenotazione già esistente (retry)" };
  }

  const p = opts.esito.prenotazione ?? null;
  if (!p || !String(p.numero ?? "")) {
    return { stato: "skipped", motivo: "nessuna prenotazione da notificare" };
  }

  return inviaPrenotazioneEmail(
    opts.destinatario,
    opts.negozioNome,
    datiDaEsito(p),
    opts.sender
  );
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
 * Email "Nuova prenotazione" al merchant (best-effort, mai un'eccezione).
 * - PRENOTAZIONI_EMAIL_ENABLED=true richiesto (false/assente → skipped);
 * - destinatario o RESEND_API_KEY assenti → skipped;
 * - errore/sollevazione del sender → error (la prenotazione resta salvata).
 *
 * `sender` opzionale SOLO per test: in production viene sempre usato Resend.
 */
export async function inviaPrenotazioneEmail(
  destinatario: string,
  negozioNome: string,
  dati: DatiNotificaPrenotazione,
  sender?: SenderPrenotazioneEmail
): Promise<{ stato: "sent" | "skipped" | "error"; motivo?: string }> {
  if (process.env.PRENOTAZIONI_EMAIL_ENABLED !== "true") {
    return { stato: "skipped", motivo: "PRENOTAZIONI_EMAIL_ENABLED non è true" };
  }
  if (!destinatario.trim()) {
    return { stato: "skipped", motivo: "nessuna email negozio configurata" };
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { stato: "skipped", motivo: "RESEND_API_KEY non configurata" };
  }

  const html = buildPrenotazioneEmailHtml(negozioNome, dati);
  const inviatore = sender ?? senderResend(apiKey);

  try {
    const { data, error } = await conTimeout(
      inviatore.send({
        from: process.env.RESEND_FROM_EMAIL ?? "InCittà <onboarding@resend.dev>",
        to: destinatario,
        subject: `Nuova prenotazione – ${dati.numero}`,
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