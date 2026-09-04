/**
 * EMAIL DI CONFERMA ORDINE — InCittà.
 *
 * Riutilizza l'infrastruttura Resend già presente nel progetto
 * (lib/password-reset-email.ts): stessa chiave API, stessa ENV
 * RESEND_FROM_EMAIL, stesso pacchetto. Nessun secondo sistema email.
 *
 * Principio fondamentale (identico a ntfy/WhatsApp): l'invio è
 * BEST-EFFORT — non può MAI determinare il successo dell'ordine.
 * - ordine OK + email OK  → tutto ok;
 * - ordine OK + email KO  → ordine confermato, stock corretto, risposta
 *   200/201; l'errore viene SOLO loggato.
 *
 * La funzione non lancia MAI eccezioni: restituisce sempre uno stato
 * (sent / skipped / error). Il chiamante (lib/cliente/orders.ts) la invoca
 * SOLO per ordini REALMENTE nuovi (mai per i retry idempotenti con la
 * stessa idempotency_key): stessa chiave → un solo ordine, una sola email.
 *
 * SOLO server-side: importata esclusivamente da codice server. Nessuna
 * chiave API viene mai esposta al browser né stampata nei log.
 */

import { Resend } from "resend";
import { createOrderConfirmationUrl } from "@/lib/cliente/order-access";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { etichettaMotivoAnnullamento } from "@/lib/merchant/ordini-stati";
import {
  caricaContestoReclamo,
  type ProdottoNotifica,
} from "@/lib/ordine-reclami";

/** Mittente (stessa ENV del password reset). */
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "InCittà <onboarding@resend.dev>";

/** URL del sito (per il link \"Visualizza ordine\"). */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.incitta.online";

/** Esito dell'invio (mai un'eccezione: l'ordine non deve fallire). */
export type EsitoEmailOrdine =
  | { stato: "sent"; messageId: string | null }
  | { stato: "skipped"; motivo: string }
  | { stato: "error"; motivo: string };

/** Riga prodotto dell'email. */
export type RigaEmailOrdine = {
  nomeProdotto: string;
  prezzoUnitario: number;
  quantita: number;
  /** Snapshot storico della variante (Fase E5); null per i prodotti legacy. */
  varianteNome: string | null;
};

/** Dati dell'ordine necessari all'email (tutti derivati dal DB). */
export type DatiEmailOrdine = {
  id: string;
  numero: string;
  stato: string;
  totale: number;
  costoSpedizione: number;
  createdAt: string;
  modalita: "ritiro" | "spedizione";
  negozioNome: string;
  email: string;
  /** Metodo di pagamento (es. "carta", "paypal", "klarna", "bonifico");
   *  usato nell'email di conferma pagamento. Opzionale: assente nelle email
   *  legacy/di creazione che non lo costruiscono. */
  metodoPagamento?: string | null;
  ritiroData: string | null;
  ritiroFascia: string | null;
  spedizioneIndirizzo: string | null;
  spedizioneCap: string | null;
  spedizioneCitta: string | null;
  spedizioneProvincia: string | null;
  spedizioneNote: string | null;
  note: string | null;
  righe: RigaEmailOrdine[];
};

/** Client DB strutturale minimo (per iniettare un fake nei test). */
export type DbLike = {
  from: (tabella: string) => unknown;
};

/** Formatta un importo in euro in formato italiano (\"12,90\"). */
export function formattaEuroEmail(importo: number): string {
  if (!Number.isFinite(importo)) return "0,00";
  return importo.toFixed(2).replace(".", ",");
}

/** Formatta una data in formato italiano leggibile (es. \"16 agosto 2026\"). */
export function formattaDataEmail(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Oggetto dell'email: \"Conferma ordine LH-000043 — InCittà\". */
export function costruisciOggettoOrdine(dati: Pick<DatiEmailOrdine, "numero">): string {
  const numero = (dati.numero || "").trim() || "ordine";
  return `Conferma ordine ${numero} — InCittà`;
}

/** Oggetto dell'email di conferma pagamento (inviata post-webhook). */
export function costruisciOggettoPagamento(dati: Pick<DatiEmailOrdine, "numero">): string {
  const numero = (dati.numero || "").trim() || "ordine";
  return `Pagamento ricevuto — ordine ${numero}`;
}

/** Etichetta leggibile del metodo di pagamento per l'email post-pagamento. */
export function etichettaMetodoPagamento(metodo: string | null | undefined): string {
  switch (metodo) {
    case "paypal":
      return "PayPal";
    case "klarna":
      return "Klarna";
    case "bonifico":
      return "Bonifico bancario";
    case "carta":
    default:
      return "Carta di credito/debito (Stripe)";
  }
}

/** Etichetta leggibile dello stato. */
export function etichettaStatoEmail(stato: string | null | undefined): string {
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
 * Costruisce l'HTML dell'email (puro, testabile): layout a colonna singola,
 * stili INLINE (i client email ignorano i fogli esterni), leggibile da
 * smartphone. Nessun dato sensibile superfluo.
 */
export function costruisciHtmlConfermaOrdine(dati: DatiEmailOrdine): string {
  const righeHtml = dati.righe
    .map((r) => {
      const subtotale = (Number(r.prezzoUnitario) || 0) * (Number(r.quantita) || 1);
      const varianteHtml = (r.varianteNome || "").trim()
        ? `<div style="color:#64748b;font-size:12px;margin-top:2px;">Variante: ${escapeHtml((r.varianteNome || "").trim())}</div>`
        : "";
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eef2f7;font-size:14px;color:#0f172a;">
            <strong>${escapeHtml(r.nomeProdotto || "Prodotto")}</strong>
            ${varianteHtml}
            <div style="color:#64748b;font-size:12px;margin-top:2px;">${Number(r.quantita) || 1} × €${formattaEuroEmail(Number(r.prezzoUnitario) || 0)}</div>
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #eef2f7;font-size:14px;font-weight:700;color:#0f172a;white-space:nowrap;">
            €${formattaEuroEmail(subtotale)}
          </td>
        </tr>`;
    })
    .join("");

  // Blocco consegna: ritiro (data/fascia) oppure indirizzo di spedizione.
  let consegnaHtml: string;
  if (dati.modalita === "spedizione") {
    const indirizzo = [
      dati.spedizioneIndirizzo,
      dati.spedizioneCap,
      dati.spedizioneCitta,
      dati.spedizioneProvincia,
    ]
      .filter((v): v is string => Boolean(v && v.trim()))
      .join(", ");
    consegnaHtml = `
      <p style="margin:0;font-size:14px;color:#0f172a;font-weight:600;">Spedizione a domicilio</p>
      ${indirizzo ? `<p style="margin:4px 0 0;font-size:14px;color:#475569;line-height:1.5;">${escapeHtml(indirizzo)}</p>` : ""}
      ${dati.spedizioneNote ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b;">Note consegna: ${escapeHtml(dati.spedizioneNote)}</p>` : ""}`;
  } else {
    const ritiro = [dati.ritiroData, dati.ritiroFascia].filter(Boolean).join(" — ");
    consegnaHtml = `
      <p style="margin:0;font-size:14px;color:#0f172a;font-weight:600;">Ritiro in negozio</p>
      ${ritiro ? `<p style="margin:4px 0 0;font-size:14px;color:#475569;">📅 ${escapeHtml(ritiro)}</p>` : `<p style="margin:4px 0 0;font-size:14px;color:#475569;">📅 Data da definire con il negozio</p>`}`;
  }

  const noteTesto = (dati.note || "").trim();
  const noteHtml = noteTesto
    ? `<p style="margin:0;font-size:14px;color:#475569;line-height:1.5;">📝 ${escapeHtml(noteTesto)}</p>`
    : "";

  const linkOrdine = createOrderConfirmationUrl(SITE_URL, dati.id);

  return `
  <!DOCTYPE html>
  <html lang="it">
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <!-- Intestazione -->
      <div style="background:#059669;border-radius:16px 16px 0 0;padding:24px;text-align:center;">
        <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a7f3d0;font-weight:700;">Conferma ordine</p>
        <p style="margin:8px 0 0;font-size:20px;font-weight:800;color:#ffffff;">${escapeHtml(dati.numero)}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#d1fae5;">Grazie ${escapeHtml((dati.email || "").split("@")[0] || "")} — il negozio è stato avvisato.</p>
      </div>

      <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">

        <!-- Negozio + data -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:14px;color:#0f172a;"><strong>🏪 ${escapeHtml(dati.negozioNome || "Negozio")}</strong></td>
            <td align="right" style="font-size:12px;color:#64748b;">${formattaDataEmail(dati.createdAt)}</td>
          </tr>
        </table>

        <!-- Stato -->
        <p style="margin:16px 0 0;display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700;">
          ${etichettaStatoEmail(dati.stato)}
        </p>

        <!-- Prodotti -->
        <p style="margin:20px 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Prodotti</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${righeHtml}
        </table>

        <!-- Totale -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
          ${Number(dati.costoSpedizione) > 0
            ? `<tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;">Spedizione</td>
                <td align="right" style="padding:6px 0;font-size:13px;color:#64748b;">€${formattaEuroEmail(Number(dati.costoSpedizione))}</td>
              </tr>`
            : ""}
          <tr>
            <td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:700;">Totale</td>
            <td align="right" style="padding:8px 0;font-size:20px;font-weight:800;color:#0f172a;">€${formattaEuroEmail(Number(dati.totale))}</td>
          </tr>
        </table>

        <!-- Consegna -->
        <p style="margin:20px 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Consegna</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
          ${consegnaHtml}
        </div>

        ${noteHtml ? `<p style="margin:16px 0 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Note</p><div style="margin-top:4px;">${noteHtml}</div>` : ""}

        <!-- CTA -->
        <div style="margin-top:24px;text-align:center;">
          <a href="${linkOrdine}"
             style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:700;">
            Visualizza ordine
          </a>
        </div>

        <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.6;">
          Hai domande? Contatta direttamente ${escapeHtml(dati.negozioNome || "il negozio")}.
          <br/>Questa email è un riepilogo del tuo ordine su InCittà.
        </p>
      </div>
    </div>
  </body>
  </html>`;
}

/**
 * HTML dell'email di CONFERMA PAGAMENTO (post-webhook Stripe): indica
 * esplicitamente che il pagamento è andato a buon fine, con importo e metodo.
 * Stesso layout/responsive della conferma ordine; riusa gli helper condivisi
 * (escapeHtml, formattaEuroEmail, formattaDataEmail, SITE_URL). Nessun dato
 * sensibile oltre al necessario.
 */
export function costruisciHtmlConfermaPagamento(dati: DatiEmailOrdine): string {
  const nome = (dati.email || "").split("@")[0] || "";
  const metodo = etichettaMetodoPagamento(dati.metodoPagamento);

  const righeHtml = dati.righe
    .map((r) => {
      const subtotale = (Number(r.prezzoUnitario) || 0) * (Number(r.quantita) || 1);
      const varianteHtml = (r.varianteNome || "").trim()
        ? `<div style="color:#64748b;font-size:12px;margin-top:2px;">Variante: ${escapeHtml((r.varianteNome || "").trim())}</div>`
        : "";
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eef2f7;font-size:14px;color:#0f172a;">
            <strong>${escapeHtml(r.nomeProdotto || "Prodotto")}</strong>
            ${varianteHtml}
            <div style="color:#64748b;font-size:12px;margin-top:2px;">${Number(r.quantita) || 1} × €${formattaEuroEmail(Number(r.prezzoUnitario) || 0)}</div>
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #eef2f7;font-size:14px;font-weight:700;color:#0f172a;white-space:nowrap;">
            €${formattaEuroEmail(subtotale)}
          </td>
        </tr>`;
    })
    .join("");

  let consegnaHtml: string;
  if (dati.modalita === "spedizione") {
    const indirizzo = [
      dati.spedizioneIndirizzo,
      dati.spedizioneCap,
      dati.spedizioneCitta,
      dati.spedizioneProvincia,
    ]
      .filter((v): v is string => Boolean(v && v.trim()))
      .join(", ");
    consegnaHtml = `
      <p style="margin:0;font-size:14px;color:#0f172a;font-weight:600;">Spedizione a domicilio</p>
      ${indirizzo ? `<p style="margin:4px 0 0;font-size:14px;color:#475569;line-height:1.5;">${escapeHtml(indirizzo)}</p>` : ""}
      ${dati.spedizioneNote ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b;">Note consegna: ${escapeHtml(dati.spedizioneNote)}</p>` : ""}`;
  } else {
    const ritiro = [dati.ritiroData, dati.ritiroFascia].filter(Boolean).join(" — ");
    consegnaHtml = `
      <p style="margin:0;font-size:14px;color:#0f172a;font-weight:600;">Ritiro in negozio</p>
      ${ritiro ? `<p style="margin:4px 0 0;font-size:14px;color:#475569;">📅 ${escapeHtml(ritiro)}</p>` : `<p style="margin:4px 0 0;font-size:14px;color:#475569;">📅 Data da definire con il negozio</p>`}`;
  }

  const noteTesto = (dati.note || "").trim();
  const noteHtml = noteTesto
    ? `<p style="margin:0;font-size:14px;color:#475569;line-height:1.5;">📝 ${escapeHtml(noteTesto)}</p>`
    : "";

  const linkOrdine = createOrderConfirmationUrl(SITE_URL, dati.id);

  return `
  <!DOCTYPE html>
  <html lang="it">
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <!-- Intestazione -->
      <div style="background:#059669;border-radius:16px 16px 0 0;padding:24px;text-align:center;">
        <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a7f3d0;font-weight:700;">Pagamento ricevuto</p>
        <p style="margin:8px 0 0;font-size:20px;font-weight:800;color:#ffffff;">${escapeHtml(dati.numero)}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#d1fae5;">Grazie ${escapeHtml(nome)} — il tuo pagamento è stato confermato.</p>
      </div>

      <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">

        <!-- Negozio + data -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:14px;color:#0f172a;"><strong>🏪 ${escapeHtml(dati.negozioNome || "Negozio")}</strong></td>
            <td align="right" style="font-size:12px;color:#64748b;">${formattaDataEmail(dati.createdAt)}</td>
          </tr>
        </table>

        <!-- Pagamento ricevuto -->
        <div style="margin-top:16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:14px;">
          <p style="margin:0;font-size:14px;font-weight:800;color:#047857;">✅ Pagamento ricevuto</p>
          <p style="margin:6px 0 0;font-size:14px;color:#047857;line-height:1.5;">
            Il pagamento di <strong>€${formattaEuroEmail(Number(dati.totale))}</strong> con ${escapeHtml(metodo)} è andato a buon fine.
          </p>
        </div>

        <!-- Prodotti -->
        <p style="margin:20px 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Prodotti</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${righeHtml}
        </table>

        <!-- Totale -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
          ${Number(dati.costoSpedizione) > 0
            ? `<tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;">Spedizione</td>
                <td align="right" style="padding:6px 0;font-size:13px;color:#64748b;">€${formattaEuroEmail(Number(dati.costoSpedizione))}</td>
              </tr>`
            : ""}
          <tr>
            <td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:700;">Totale</td>
            <td align="right" style="padding:8px 0;font-size:20px;font-weight:800;color:#0f172a;">€${formattaEuroEmail(Number(dati.totale))}</td>
          </tr>
        </table>

        <!-- Consegna -->
        <p style="margin:20px 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Consegna</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
          ${consegnaHtml}
        </div>

        ${noteHtml ? `<p style="margin:16px 0 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Note</p><div style="margin-top:4px;">${noteHtml}</div>` : ""}

        <!-- CTA -->
        <div style="margin-top:24px;text-align:center;">
          <a href="${linkOrdine}"
             style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:700;">
            Visualizza ordine
          </a>
        </div>

        <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.6;">
          Hai domande? Contatta direttamente ${escapeHtml(dati.negozioNome || "il negozio")}.
          <br/>Questa email è un riepilogo del tuo ordine su InCittà.
        </p>
      </div>
    </div>
  </body>
  </html>`;
}

/** Escape HTML dei valori provenienti dal DB (mai fidarsi del contenuto). */
function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Timeout dell'invio Resend (la checkout non deve MAI restare appesa). */
const RESEND_TIMEOUT_MS = 8_000;

/** Attende una Promise con timeout (come l'AbortController di ntfy/whatsapp). */
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

/** Invio effettivo con Resend (sostituibile nei test con `opts.invia`).
 *  Restituisce il messageId Resend se disponibile (mai secret nei log). */
async function inviaConResend(
  dati: DatiEmailOrdine,
  oggetto: string,
  html: string
): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY non configurata");
  }
  const resend = new Resend(apiKey);
  const { data, error } = await conTimeout(
    resend.emails.send({
      from: FROM_EMAIL,
      to: dati.email,
      subject: oggetto,
      html,
    }),
    RESEND_TIMEOUT_MS
  );
  if (error) {
    throw new Error(`Resend: ${error.message}`);
  }
  return data?.id ?? null;
}

/** Opzioni per i test (iniezione di db e funzione di invio). */
export type OpzioniEmailOrdine = {
  db?: DbLike;
  /** Restituisce il messageId Resend se disponibile (null/void nei test). */
  invia?: (dati: DatiEmailOrdine) => Promise<string | null | void>;
};

/** Esito del caricamento dei dati ordine per una email (con motivo di skip/error). */
type EsitoCaricaDatiEmail =
  | { ok: true; dati: DatiEmailOrdine; email: string }
  | { ok: false; stato: "skipped" | "error"; motivo: string };

/**
 * Recupera ordine + righe dal DB e costruisce DatiEmailOrdine applicando le
 * guardie (email presente/valida). NON lancia MAI: gli errori sono loggati e
 * restituiti come stato. Estratto per non duplicare la logica tra la conferma
 * di creazione e la conferma di pagamento.
 */
async function caricaDatiEmailOrdine(
  db: { from: (t: string) => any },
  ordineId: string
): Promise<EsitoCaricaDatiEmail> {
  // ── Recupero dati ordine ────────────────────────────────────────────────
  const { data: ordine, error: errOrdine } = await db
    .from("ordini")
    .select("*")
    .eq("id", ordineId)
    .single();
  if (errOrdine || !ordine) {
    console.error(
      `[ordine-email] ordine ${ordineId}: ordine non trovato (${errOrdine?.message ?? "null"})`
    );
    return { ok: false, stato: "error", motivo: "ordine_non_trovato" };
  }

  const { data: righe, error: errRighe } = await db
    .from("ordini_righe")
    .select("*")
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: true });
  if (errRighe) {
    // Le righe mancanti non bloccano l'email: si invia il riepilogo con le
    // sole informazioni disponibili, loggando il problema.
    console.error(`[ordine-email] ordine ${ordineId}: lettura righe fallita: ${errRighe.message}`);
  }

  // ── Guardie: niente email → skipped (mai un errore per l'ordine) ────────
  const email = String(ordine.cliente_email ?? "").trim();
  if (!email) {
    console.log(`[ordine-email] ordine ${ordine.numero ?? "?"}: email cliente assente, invio saltato`);
    return { ok: false, stato: "skipped", motivo: "email_assente" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.warn(`[ordine-email] ordine ${ordine.numero ?? "?"}: email non valida, invio saltato`);
    return { ok: false, stato: "skipped", motivo: "email_non_valida" };
  }

  const dati: DatiEmailOrdine = {
    id: String(ordine.id ?? ordineId),
    numero: String(ordine.numero ?? ""),
    stato: String(ordine.stato ?? "in_preparazione"),
    totale: Number(ordine.totale ?? 0),
    costoSpedizione: Number(ordine.costo_spedizione ?? 0),
    createdAt: String(ordine.created_at ?? ""),
    modalita: ordine.modalita === "spedizione" ? "spedizione" : "ritiro",
    negozioNome: String(ordine.negozio_nome ?? ""),
    email,
    metodoPagamento: (ordine.metodo_pagamento as string | null) ?? null,
    ritiroData: ordine.ritiro_data ?? null,
    ritiroFascia: ordine.ritiro_fascia ?? null,
    spedizioneIndirizzo: ordine.spedizione_indirizzo ?? null,
    spedizioneCap: ordine.spedizione_cap ?? null,
    spedizioneCitta: ordine.spedizione_citta ?? null,
    spedizioneProvincia: ordine.spedizione_provincia ?? null,
    spedizioneNote: ordine.spedizione_note ?? null,
    note: ordine.note ?? null,
    righe: (righe ?? []).map((r: Record<string, unknown>) => ({
      nomeProdotto: String(r.nome_prodotto ?? ""),
      prezzoUnitario: Number(r.prezzo_unitario ?? 0),
      quantita: Number(r.quantita ?? 1),
      varianteNome: (r.variante_nome as string | null) ?? null,
    })),
  };

  return { ok: true, dati, email };
}

/**
 * Invia l'email di conferma per un ordine appena creato.
 *
 * Recupera ordine + righe dal DB, applica le guardie (email presente,
 * formato valido) e invia via Resend. MAI throw: ogni problema viene
 * loggato e restituito come stato, lasciando l'ordine intatto.
 */
export async function inviaEmailConfermaOrdine(
  ordineId: string,
  opts: OpzioniEmailOrdine = {}
): Promise<EsitoEmailOrdine> {
  try {
    const db = (opts.db ?? createAdminSupabaseClient()) as {
      from: (t: string) => any;
    };
    const carico = await caricaDatiEmailOrdine(db, ordineId);
    if (!carico.ok) {
      return { stato: carico.stato, motivo: carico.motivo };
    }
    const { dati, email } = carico;

    const invia: (d: DatiEmailOrdine) => Promise<string | null | void> =
      opts.invia ??
      ((d) => inviaConResend(d, costruisciOggettoOrdine(d), costruisciHtmlConfermaOrdine(d)));
    const messageId = (await invia(dati)) ?? null;

    console.log(
      `[ordine-email] ordine ${dati.numero || "?"}: conferma_ordine sent${messageId ? ` (messageId=${messageId})` : ""} a ${maskEmail(email)}`
    );
    return { stato: "sent", messageId };
  } catch (err) {
    console.error(
      `[ordine-email] ordine ${ordineId}: conferma_ordine error: ${(err as Error)?.message ?? "sconosciuto"}`
    );
    return { stato: "error", motivo: "invio_fallito" };
  }
}

/**
 * Invia l'email di CONFERMA PAGAMENTO al cliente. Deve essere chiamata SOLO
 * dopo che il webhook del provider ha registrato il pagamento (marcaPagato
 * ok). Oggetto/corpo specifici ("Pagamento ricevuto", importo + metodo).
 *
 * L'idempotenza NON è interna a questa funzione ma garantita a monte dal
 * chiamante tramite pagamenti_eventi (UNIQUE event_id): lo stesso evento
 * Stripe viene processato una sola volta, quindi questa email parte una sola
 * volta anche in caso di retry. MAI throw: un errore email non fa mai fallire
 * il webhook.
 */
export async function inviaEmailConfermaPagamento(
  ordineId: string,
  opts: OpzioniEmailOrdine = {}
): Promise<EsitoEmailOrdine> {
  try {
    const db = (opts.db ?? createAdminSupabaseClient()) as {
      from: (t: string) => any;
    };
    const carico = await caricaDatiEmailOrdine(db, ordineId);
    if (!carico.ok) {
      console.log(
        `[ordine-email] ordine ${ordineId}: conferma_pagamento ${carico.stato} (${carico.motivo})`
      );
      return { stato: carico.stato, motivo: carico.motivo };
    }
    const { dati, email } = carico;

    const invia: (d: DatiEmailOrdine) => Promise<string | null | void> =
      opts.invia ??
      ((d) => inviaConResend(d, costruisciOggettoPagamento(d), costruisciHtmlConfermaPagamento(d)));
    const messageId = (await invia(dati)) ?? null;

    console.log(
      `[ordine-email] ordine ${dati.numero || "?"}: conferma_pagamento sent${messageId ? ` (messageId=${messageId})` : ""} a ${maskEmail(email)}`
    );
    return { stato: "sent", messageId };
  } catch (err) {
    console.error(
      `[ordine-email] ordine ${ordineId}: conferma_pagamento error: ${(err as Error)?.message ?? "sconosciuto"}`
    );
    return { stato: "error", motivo: "invio_fallito" };
  }
}

/** Email mascherata nei log (mai stampare l'email completa). */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local?.slice(0, 2) ?? "";
  return `${visible}***@${domain}`;
}

// ═══════════════════════════════════════════════════════════════════════
// EMAIL MESSAGGIO RECLAMO (il venditore ha scritto al cliente)
// Invio BEST-EFFORT dopo il salvataggio del messaggio sul reclamo: il
// messaggio DB NON fallisce mai per un errore email (stesso principio di
// ntfy/WhatsApp). Skip silenziosi: email assente o non valida.
// ═══════════════════════════════════════════════════════════════════════

/** Prodotto acquistato mostrato nelle email reclamo (tipo condiviso). */
export type ProdottoEmailReclamo = ProdottoNotifica;

/** Dati del messaggio reclamo necessari all'email (dal DB). */
export type DatiMessaggioReclamo = {
  reclamoId: string;
  ordineId: string;
  numero: string;
  negozioNome: string;
  clienteEmail: string;
  clienteNome: string;
  mittenteNome: string;
  corpo: string;
  createdAt: string;
  /** Prodotti acquistati nell'ordine (per identificare subito l'articolo). */
  prodotti: ProdottoEmailReclamo[];
  /** Link diretto alla conversazione/reclamo del cliente. */
  linkReclamo: string;
};

/** Opzioni per i test dell'email messaggio reclamo. */
export type OpzioniEmailMessaggioReclamo = {
  db?: DbLike;
  invia?: (dati: DatiMessaggioReclamo) => Promise<void>;
};

/**
 * Oggetto dell'email: "Il negozio ti ha scritto sul tuo reclamo — Ordine
 * #LH-XXXX" (con nome negozio se noto, mai dati inventati).
 */
export function costruisciOggettoMessaggioReclamo(
  numero: string,
  negozioNome: string
): string {
  const n = (numero || "").trim() || "ordine";
  const negozio = (negozioNome || "").trim();
  const ordine = `Ordine #${n.replace(/^#/, "")}`;
  return negozio
    ? `${negozio} ti ha scritto sul tuo reclamo — ${ordine}`
    : `Il negozio ti ha scritto sul tuo reclamo — ${ordine}`;
}

/**
 * HTML dell'email "il venditore ti ha scritto" (puro, testabile).
 * Identifica subito: ordine (#LH-XXXX), prodotto con codice articolo e
 * link all'annuncio, il messaggio del negozio e il pulsante APRI IL RECLAMO
 * che porta direttamente alla conversazione del cliente.
 */
export function costruisciHtmlMessaggioReclamo(dati: DatiMessaggioReclamo): string {
  const linkOrdine = `${SITE_URL.replace(/\/+$/, "")}/cliente/ordini/${encodeURIComponent(dati.ordineId)}`;
  const linkReclamo = (dati.linkReclamo || "").trim() || linkOrdine;
  const prodotti = Array.isArray(dati.prodotti) ? dati.prodotti : [];

  // Prodotto primario + eventuali righe aggiuntive dell'ordine.
  let prodottiHtml = "";
  if (prodotti.length === 0) {
    prodottiHtml = `
      <p style="margin:0;font-size:14px;color:#475569;">—</p>`;
  } else {
    prodottiHtml = prodotti
      .map((p) => {
        const annuncio = (p.urlAnnuncio || "").trim();
        const annuncioLink = annuncio
          ? `<a href="${annuncio}" style="color:#2563eb;text-decoration:none;font-size:13px;">Apri annuncio →</a>`
          : `<span style="color:#94a3b8;font-size:13px;">Annuncio non disponibile</span>`;
        return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;">
            <strong>${escapeHtml(p.nomeProdotto || "Prodotto")}</strong>
            <div style="color:#64748b;font-size:12px;margin-top:2px;">Codice articolo: ${escapeHtml((p.codiceArticolo || "").trim() || "—")} · ${annuncioLink}</div>
          </td>
        </tr>`;
      })
      .join("");
  }

  return `
  <!DOCTYPE html>
  <html lang="it">
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <div style="background:#dc2626;border-radius:16px 16px 0 0;padding:24px;text-align:center;">
        <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#fecaca;font-weight:700;">Reclamo ordine</p>
        <p style="margin:8px 0 0;font-size:20px;font-weight:800;color:#ffffff;">Ordine #${escapeHtml(dati.numero)}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#fee2e2;">${escapeHtml(dati.negozioNome || "Il negozio")} ti ha scritto</p>
      </div>

      <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
        <p style="margin:0;font-size:14px;color:#0f172a;line-height:1.6;">
          Ciao ${escapeHtml((dati.clienteNome || dati.clienteEmail || "").split(" ")[0] || "")},
        </p>
        <p style="margin:10px 0 0;font-size:14px;color:#334155;line-height:1.6;">
          ${escapeHtml(dati.mittenteNome || "Il negozio")} ha risposto alla tua segnalazione:
        </p>

        <div style="margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px;color:#7f1d1d;font-size:14px;line-height:1.6;">
          “${escapeHtml(dati.corpo)}”
        </div>

        <!-- Prodotto/i dell'ordine -->
        <p style="margin:20px 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Articolo segnalato</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${prodottiHtml}
        </table>

        <div style="margin-top:24px;text-align:center;">
          <a href="${linkReclamo}"
             style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:700;">
            APRI IL RECLAMO
          </a>
        </div>

        <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.6;">
          Puoi rispondere direttamente dal dettaglio del tuo ordine.
          <br/>Questa email riguarda la tua segnalazione su InCittà.
        </p>
      </div>
    </div>
  </body>
  </html>`;
}

/**
 * Invia al cliente l'email con il messaggio scritto dal venditore sul
 * reclamo. MAI throw: ogni problema viene loggato e restituito come stato;
 * il messaggio resta salvato nel DB a prescindere dall'esito dell'email.
 * `corpo` è il testo del messaggio appena salvato (dal DB, mai dal browser).
 * I dati descrittivi (prodotto, codice articolo, link annuncio, link
 * reclamo) vengono recuperati qui dal DB con caricaContestoReclamo:
 * nessun valore inviato dal browser.
 */
export async function inviaEmailMessaggioReclamo(
  reclamoId: string,
  corpo: string,
  mittenteNome?: string,
  opts: OpzioniEmailMessaggioReclamo = {}
): Promise<EsitoEmailOrdine> {
  try {
    const db = (opts.db ?? createAdminSupabaseClient()) as DbLike;
    const contesto = await caricaContestoReclamo(reclamoId, { db });
    if (!contesto) {
      console.error(`[ordine-email] reclamo ${reclamoId}: reclamo non trovato`);
      return { stato: "error", motivo: "reclamo_non_trovato" };
    }

    const email = contesto.clienteEmail;
    if (!email) {
      console.log(`[ordine-email] reclamo ${reclamoId}: email cliente assente, invio saltato`);
      return { stato: "skipped", motivo: "email_assente" };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.warn(`[ordine-email] reclamo ${reclamoId}: email non valida, invio saltato`);
      return { stato: "skipped", motivo: "email_non_valida" };
    }

    const dati: DatiMessaggioReclamo = {
      reclamoId,
      ordineId: contesto.ordineId,
      numero: contesto.numero,
      negozioNome: contesto.negozioNome,
      clienteEmail: email,
      clienteNome: contesto.clienteNome,
      mittenteNome: (mittenteNome ?? "").trim() || "Il negozio",
      corpo: (corpo || "").trim() || "Risposta del negozio.",
      createdAt: new Date().toISOString(),
      prodotti: contesto.prodotti,
      linkReclamo: contesto.linkCliente || "",
    };

    await (opts.invia ??
      (async (d) => {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) throw new Error("RESEND_API_KEY non configurata");
        const resend = new Resend(apiKey);
        const { error } = await conTimeout(
          resend.emails.send({
            from: FROM_EMAIL,
            to: d.clienteEmail,
            subject: costruisciOggettoMessaggioReclamo(d.numero, d.negozioNome),
            html: costruisciHtmlMessaggioReclamo(d),
          }),
          RESEND_TIMEOUT_MS
        );
        if (error) throw new Error(`Resend: ${error.message}`);
      }))(dati);

    console.log(`[ordine-email] reclamo ${reclamoId}: email messaggio inviata a ${maskEmail(email)}`);
    return { stato: "sent", messageId: null };
  } catch (err) {
    console.error(
      `[ordine-email] reclamo ${reclamoId}: invio messaggio fallito (best-effort): ${(err as Error)?.message ?? "sconosciuto"}`
    );
    return { stato: "error", motivo: "invio_fallito" };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EMAIL RISPOSTA DEL CLIENTE → VENDITORE (il cliente ha risposto al reclamo)
// Invio BEST-EFFORT dopo il salvataggio della risposta: il messaggio DB NON
// fallisce mai per un errore email. Destinatario: il VENDITORE (owner del
// negozio dell'ordine, email da auth.users; fallback negozi.email_negozio).
// Skip silenziosi: email venditore assente o non valida.
// ═══════════════════════════════════════════════════════════════════════

/** Dati della risposta del cliente necessari all'email al venditore. */
export type DatiRispostaClienteVenditore = {
  reclamoId: string;
  ordineId: string;
  negozioId: string;
  numero: string;
  negozioNome: string;
  venditoreEmail: string;
  clienteNome: string;
  corpo: string;
  createdAt: string;
  /** Prodotti acquistati (righe ordine) con codice e link annuncio. */
  prodotti: ProdottoEmailReclamo[];
};

/** Opzioni per i test dell'email risposta cliente → venditore. */
export type OpzioniEmailRispostaCliente = {
  db?: DbLike;
  invia?: (dati: DatiRispostaClienteVenditore) => Promise<void>;
};

/** Oggetto email: "Il cliente ha risposto sul reclamo ordine LH-XXXX — InCittà". */
export function costruisciOggettoRispostaClienteVenditore(
  numero: string,
  negozioNome: string
): string {
  const n = (numero || "").trim() || "ordine";
  const negozio = (negozioNome || "").trim();
  return negozio
    ? `Il cliente ha risposto sul reclamo ${n} — ${negozio}`
    : `Il cliente ha risposto sul reclamo ${n} — InCittà`;
}

/**
 * HTML dell'email "il cliente ha risposto al reclamo" (puro, testabile).
 * Include la risposta del cliente, l'articolo segnalato (nome + codice +
 * link annuncio) e il link diretto alla console operativa del venditore.
 */
export function costruisciHtmlRispostaClienteVenditore(
  dati: DatiRispostaClienteVenditore
): string {
  const linkVenditore = `${SITE_URL.replace(/\/+$/, "")}/merchant/${encodeURIComponent(
    dati.negozioId
  )}/ordini/${encodeURIComponent(dati.ordineId)}`;
  const prodotti = Array.isArray(dati.prodotti) ? dati.prodotti : [];
  const prodottiHtml =
    prodotti.length === 0
      ? `<p style="margin:0;font-size:14px;color:#475569;">—</p>`
      : prodotti
          .map((p) => {
            const annuncio = (p.urlAnnuncio || "").trim();
            const annuncioLink = annuncio
              ? `<a href="${annuncio}" style="color:#2563eb;text-decoration:none;font-size:13px;">Apri annuncio →</a>`
              : `<span style="color:#94a3b8;font-size:13px;">Annuncio non disponibile</span>`;
            return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;">
            <strong>${escapeHtml(p.nomeProdotto || "Prodotto")}</strong>
            <div style="color:#64748b;font-size:12px;margin-top:2px;">Codice articolo: ${escapeHtml((p.codiceArticolo || "").trim() || "—")} · ${annuncioLink}</div>
          </td>
        </tr>`;
          })
          .join("");
  return `
  <!DOCTYPE html>
  <html lang="it">
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <div style="background:#2563eb;border-radius:16px 16px 0 0;padding:24px;text-align:center;">
        <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#dbeafe;font-weight:700;">Reclamo ordine</p>
        <p style="margin:8px 0 0;font-size:20px;font-weight:800;color:#ffffff;">Ordine #${escapeHtml(dati.numero)}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#dbeafe;">Il cliente ha risposto alla tua segnalazione</p>
      </div>

      <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:14px;color:#0f172a;"><strong>🏪 ${escapeHtml(dati.negozioNome || "Negozio")}</strong></td>
            <td align="right" style="font-size:12px;color:#64748b;">${formattaDataEmail(dati.createdAt)}</td>
          </tr>
        </table>

        <p style="margin:14px 0 0;font-size:14px;color:#334155;line-height:1.6;">
          <strong>${escapeHtml(dati.clienteNome || "Il cliente")}</strong> ha risposto alla tua segnalazione:
        </p>

        <div style="margin-top:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px;color:#1e3a8a;font-size:14px;line-height:1.6;">
          “${escapeHtml(dati.corpo)}”
        </div>

        <!-- Articolo/i segnalato/i -->
        <p style="margin:20px 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Articolo segnalato</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${prodottiHtml}
        </table>

        <div style="margin-top:24px;text-align:center;">
          <a href="${linkVenditore}"
             style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:700;">
            Gestisci reclamo
          </a>
        </div>

        <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.6;">
          Puoi rispondere al cliente dal pannello venditore.
          <br/>Questa email riguarda una segnalazione su InCittà.
        </p>
      </div>
    </div>
  </body>
  </html>`;
}

/**
 * Invia al VENDITORE l'email con la risposta del cliente sul reclamo.
 * MAI throw: ogni problema viene loggato e restituito come stato; il
 * messaggio resta salvato nel DB a prescindere dall'esito dell'email.
 * `corpo` è il testo della risposta appena salvata (dal DB, mai dal browser).
 * Il contesto (ordine, articoli, link) arriva da caricaContestoReclamo.
 */
export async function inviaEmailRispostaClienteReclamo(
  reclamoId: string,
  corpo: string,
  clienteNome?: string,
  opts: OpzioniEmailRispostaCliente = {}
): Promise<EsitoEmailOrdine> {
  try {
    const db = (opts.db ?? createAdminSupabaseClient()) as {
      from: (t: string) => any;
    };
    const contesto = await caricaContestoReclamo(reclamoId, { db });
    if (!contesto) {
      console.error(`[ordine-email] reclamo ${reclamoId}: reclamo non trovato`);
      return { stato: "error", motivo: "reclamo_non_trovato" };
    }

    const ordineId = contesto.ordineId;
    const negozioId = contesto.negozioId;

    // ── Email del VENDITORE: owner del negozio (auth.users), fallback
    //    negozi.email_negozio. Mai un valore inviato dal browser. ────────
    let venditoreEmail = "";
    const { data: negozio, error: errNegozio } = await db
      .from("negozi")
      .select("owner_user_id, email_negozio")
      .eq("id", negozioId)
      .maybeSingle();
    if (errNegozio) {
      console.error(`[ordine-email] reclamo ${reclamoId}: lettura negozio fallita: ${errNegozio.message}`);
    }
    const ownerUserId = negozio?.owner_user_id ? String(negozio.owner_user_id) : "";
    if (ownerUserId) {
      const { data: owner, error: errOwner } = await db
        .from("auth.users")
        .select("email")
        .eq("id", ownerUserId)
        .maybeSingle();
      if (errOwner) {
        console.error(`[ordine-email] reclamo ${reclamoId}: lettura owner fallita: ${errOwner.message}`);
      }
      venditoreEmail = String(owner?.email ?? "").trim();
    }
    if (!venditoreEmail) {
      venditoreEmail = String(negozio?.email_negozio ?? "").trim();
    }

    if (!venditoreEmail) {
      console.log(`[ordine-email] reclamo ${reclamoId}: email venditore assente, invio saltato`);
      return { stato: "skipped", motivo: "email_assente" };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(venditoreEmail)) {
      console.warn(`[ordine-email] reclamo ${reclamoId}: email venditore non valida, invio saltato`);
      return { stato: "skipped", motivo: "email_non_valida" };
    }

    const dati: DatiRispostaClienteVenditore = {
      reclamoId,
      ordineId,
      negozioId,
      numero: contesto.numero,
      negozioNome: contesto.negozioNome,
      venditoreEmail,
      clienteNome: (clienteNome ?? contesto.clienteNome ?? "").toString().trim() || "Il cliente",
      corpo: (corpo || "").trim() || "Risposta del cliente.",
      createdAt: new Date().toISOString(),
      prodotti: contesto.prodotti,
    };

    await (opts.invia ??
      (async (d) => {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) throw new Error("RESEND_API_KEY non configurata");
        const resend = new Resend(apiKey);
        const { error } = await conTimeout(
          resend.emails.send({
            from: FROM_EMAIL,
            to: d.venditoreEmail,
            subject: costruisciOggettoRispostaClienteVenditore(d.numero, d.negozioNome),
            html: costruisciHtmlRispostaClienteVenditore(d),
          }),
          RESEND_TIMEOUT_MS
        );
        if (error) throw new Error(`Resend: ${error.message}`);
      }))(dati);

    console.log(`[ordine-email] reclamo ${reclamoId}: email risposta cliente inviata a ${maskEmail(venditoreEmail)}`);
    return { stato: "sent", messageId: null };
  } catch (err) {
    console.error(
      `[ordine-email] reclamo ${reclamoId}: invio risposta cliente fallito (best-effort): ${(err as Error)?.message ?? "sconosciuto"}`
    );
    return { stato: "error", motivo: "invio_fallito" };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EMAIL DI AGGIORNAMENTO STATO ORDINE (azione del venditore)
// Invio BEST-EFFORT dopo un cambio stato riuscito: ordine/stato NON fallisce
// mai per un errore email. Solo per stati "visibili al cliente" (confermato,
// pronto, completato, annullato). Per l'annullamento include motivo e nota.
// ═══════════════════════════════════════════════════════════════════════

/** Stati per cui il cliente riceve l'email di aggiornamento. */
const STATI_EMAIL_CLIENTE = new Set(["confermato", "pronto", "consegnato", "cancellato"]);

/** Oggetto dell'email in base al nuovo stato. */
export function costruisciOggettoStatoOrdine(
  numero: string,
  stato: string
): string {
  const n = (numero || "").trim() || "ordine";
  switch (stato) {
    case "confermato":
      return `Ordine ${n} confermato — InCittà`;
    case "pronto":
      return `Il tuo ordine ${n} è pronto — InCittà`;
    case "consegnato":
      return `Ordine ${n} completato — InCittà`;
    case "cancellato":
      return `Ordine ${n} annullato — InCittà`;
    default:
      return `Aggiornamento ordine ${n} — InCittà`;
  }
}

/** Messaggio introduttivo in base al nuovo stato. */
function messaggioStato(stato: string): string {
  switch (stato) {
    case "confermato":
      return "Il negozio ha confermato il tuo ordine e sta preparando i prodotti.";
    case "pronto":
      return "Il tuo ordine è pronto. Puoi recarti in negozio per il ritiro (o partiremo con la spedizione).";
    case "consegnato":
      return "Il tuo ordine è stato completato. Grazie per aver acquistato su InCittà!";
    case "cancellato":
      return "Purtroppo il negozio ha dovuto annullare il tuo ordine.";
    default:
      return "Lo stato del tuo ordine è stato aggiornato.";
  }
}

/**
 * HTML dell'email di aggiornamento stato (puro, testabile).
 * `motivo`/`nota` sono inclusi solo per l'annullamento.
 */
export function costruisciHtmlStatoOrdine(
  dati: DatiEmailOrdine,
  stato: string,
  motivo: string | null,
  nota: string | null
): string {
  const motivoEtichetta = etichettaMotivoAnnullamento(motivo);
  const motivoHtml = stato === "cancellato"
    ? `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px;margin-top:16px;">
        <p style="margin:0;font-size:13px;color:#991b1b;font-weight:700;">Motivo dell'annullamento</p>
        ${motivoEtichetta ? `<p style="margin:6px 0 0;font-size:14px;color:#7f1d1d;">${escapeHtml(motivoEtichetta)}</p>` : ""}
        ${nota && nota.trim() ? `<p style="margin:6px 0 0;font-size:13px;color:#7f1d1d;line-height:1.5;">${escapeHtml(nota.trim())}</p>` : ""}
      </div>`
    : "";

  const linkOrdine = createOrderConfirmationUrl(SITE_URL, dati.id);

  return `
  <!DOCTYPE html>
  <html lang="it">
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <div style="background:#2563eb;border-radius:16px 16px 0 0;padding:24px;text-align:center;">
        <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#dbeafe;font-weight:700;">Aggiornamento ordine</p>
        <p style="margin:8px 0 0;font-size:20px;font-weight:800;color:#ffffff;">${escapeHtml(dati.numero)}</p>
        <p style="margin:6px 0 0;display:inline-block;background:rgba(255,255,255,0.15);border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700;color:#ffffff;">
          ${etichettaStatoEmail(stato)}
        </p>
      </div>

      <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
        <p style="margin:0;font-size:14px;color:#0f172a;line-height:1.6;">Ciao ${escapeHtml((dati.email || "").split("@")[0] || "")},</p>
        <p style="margin:10px 0 0;font-size:14px;color:#334155;line-height:1.6;">${messaggioStato(stato)}</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
          <tr>
            <td style="font-size:14px;color:#0f172a;"><strong>🏪 ${escapeHtml(dati.negozioNome || "Negozio")}</strong></td>
            <td align="right" style="font-size:12px;color:#64748b;">Totale: <strong>€${formattaEuroEmail(Number(dati.totale))}</strong></td>
          </tr>
        </table>

        ${motivoHtml}

        <div style="margin-top:24px;text-align:center;">
          <a href="${linkOrdine}"
             style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:700;">
            Visualizza ordine
          </a>
        </div>
      </div>
    </div>
  </body>
  </html>`;
}

/** Opzioni per i test dell'email di aggiornamento stato. */
export type OpzioniEmailStatoOrdine = {
  db?: DbLike;
  invia?: (payload: {
    dati: DatiEmailOrdine;
    stato: string;
    motivo: string | null;
    nota: string | null;
  }) => Promise<void>;
};

/**
 * Invia l'email di aggiornamento stato al cliente.
 * BEST-EFFORT: MAI throw; ordine/stato restano validi anche se Resend fallisce.
 * Solo per gli stati "visibili al cliente"; skip silenzioso per gli altri.
 */
export async function inviaEmailAggiornamentoStatoOrdine(
  ordineId: string,
  opts: OpzioniEmailStatoOrdine = {}
): Promise<EsitoEmailOrdine> {
  try {
    const db = (opts.db ?? createAdminSupabaseClient()) as {
      from: (t: string) => any;
    };

    const { data: ordine, error: errOrdine } = await db
      .from("ordini")
      .select("*")
      .eq("id", ordineId)
      .single();
    if (errOrdine || !ordine) {
      console.error(`[ordine-email] ordine ${ordineId}: ordine non trovato (${errOrdine?.message ?? "null"})`);
      return { stato: "error", motivo: "ordine_non_trovato" };
    }

    const stato = String(ordine.stato ?? "");
    if (!STATI_EMAIL_CLIENTE.has(stato)) {
      return { stato: "skipped", motivo: "stato_non_notificato" };
    }

    const email = String(ordine.cliente_email ?? "").trim();
    if (!email) {
      console.log(`[ordine-email] ordine ${ordine.numero ?? "?"}: email cliente assente, invio saltato`);
      return { stato: "skipped", motivo: "email_assente" };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.warn(`[ordine-email] ordine ${ordine.numero ?? "?"}: email non valida, invio saltato`);
      return { stato: "skipped", motivo: "email_non_valida" };
    }

    const dati: DatiEmailOrdine = {
      id: String(ordine.id ?? ordineId),
      numero: String(ordine.numero ?? ""),
      stato,
      totale: Number(ordine.totale ?? 0),
      costoSpedizione: Number(ordine.costo_spedizione ?? 0),
      createdAt: String(ordine.created_at ?? ""),
      modalita: ordine.modalita === "spedizione" ? "spedizione" : "ritiro",
      negozioNome: String(ordine.negozio_nome ?? ""),
      email,
      ritiroData: ordine.ritiro_data ?? null,
      ritiroFascia: ordine.ritiro_fascia ?? null,
      spedizioneIndirizzo: ordine.spedizione_indirizzo ?? null,
      spedizioneCap: ordine.spedizione_cap ?? null,
      spedizioneCitta: ordine.spedizione_citta ?? null,
      spedizioneProvincia: ordine.spedizione_provincia ?? null,
      spedizioneNote: ordine.spedizione_note ?? null,
      note: ordine.note ?? null,
      righe: [],
    };

    await (opts.invia ??
      (async (payload) => {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) throw new Error("RESEND_API_KEY non configurata");
        const resend = new Resend(apiKey);
        const { error } = await conTimeout(
          resend.emails.send({
            from: FROM_EMAIL,
            to: payload.dati.email,
            subject: costruisciOggettoStatoOrdine(payload.dati.numero, payload.stato),
            html: costruisciHtmlStatoOrdine(payload.dati, payload.stato, payload.motivo, payload.nota),
          }),
          RESEND_TIMEOUT_MS
        );
        if (error) throw new Error(`Resend: ${error.message}`);
      }))({
      dati,
      stato,
      motivo: (ordine.annullato_motivo as string | null) ?? null,
      nota: (ordine.annullato_nota as string | null) ?? null,
    });

    console.log(`[ordine-email] ordine ${dati.numero || "?"}: email di stato inviata a ${maskEmail(email)}`);
    return { stato: "sent", messageId: null };
  } catch (err) {
    console.error(
      `[ordine-email] ordine ${ordineId}: invio stato fallito (best-effort): ${(err as Error)?.message ?? "sconosciuto"}`
    );
    return { stato: "error", motivo: "invio_fallito" };
  }
}
