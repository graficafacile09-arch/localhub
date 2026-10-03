import { Resend } from "resend";
import { ADMIN_EMAIL } from "@/lib/auth/roles";

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "LocalHub <onboarding@resend.dev>";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[registrazione-email] RESEND_API_KEY non configurata.");
    return null;
  }
  return new Resend(apiKey);
}

async function inviaEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  try {
    const resend = getResend();
    if (!resend) return false;

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });

    if (error) {
      console.error("[registrazione-email] Resend:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[registrazione-email] Invio fallito:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export async function inviaEmailRegistrazioneUtente(opts: {
  to: string;
  nome: string;
  area: "cliente" | "merchant" | "courier";
  negozio?: string | null;
  /**
   * Password in CHIARO, disponibile solo durante la richiesta di
   * registrazione. Viene usata esclusivamente per comporre questa email e NON
   * deve mai essere salvata, loggata o inserita in URL/notifiche.
   */
  password: string;
}): Promise<boolean> {
  const nome = escapeHtml(opts.nome || "Utente");
  // Non esiste un campo "username" separato: l'identificativo di accesso è
  // l'indirizzo email usato per la registrazione.
  const username = escapeHtml(opts.to);
  const password = escapeHtml(opts.password ?? "");
  const area =
    opts.area === "merchant"
      ? "venditore/commerciante"
      : opts.area === "courier"
        ? "corriere locale"
        : "cliente";
  const negozio = opts.negozio ? escapeHtml(opts.negozio) : "";

  return inviaEmail({
    to: opts.to,
    subject: "Registrazione ricevuta — InCittà",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#334155">
        <h2 style="margin:0 0 16px;color:#0f172a">Registrazione ricevuta</h2>
        <p style="line-height:1.65">Ciao ${nome},</p>
        <p style="line-height:1.65">
          la tua registrazione a <strong>InCittà</strong> è stata completata
          come ${area}.
        </p>
        ${negozio ? `<p style="line-height:1.65">Negozio indicato: <strong>${negozio}</strong>.</p>` : ""}
        <div style="margin:20px 0;padding:16px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0">
          <p style="margin:0 0 10px;font-weight:bold;color:#0f172a">Le tue credenziali InCittà</p>
          <p style="margin:0 0 6px;line-height:1.65"><strong>Username:</strong> ${username}</p>
          <p style="margin:0;line-height:1.65"><strong>Password:</strong> ${password}</p>
        </div>
        <p style="line-height:1.65">
          <strong>Conserva queste credenziali:</strong> ti serviranno per accedere a InCittà dopo l'approvazione del tuo account.
        </p>
        <p style="line-height:1.65">
          Il tuo account è ora <strong>in attesa di approvazione amministrativa</strong>.
          Fino all'approvazione non potrai utilizzare le aree personali della piattaforma.
        </p>
        <p style="line-height:1.65">
          Ti abbiamo già effettuato l'accesso e puoi visualizzare la schermata
          di attesa. Riceverai una nuova comunicazione quando lo stato dell'account
          verrà modificato.
        </p>
        <p style="margin-top:24px;color:#64748b;font-size:13px">
          Questa è una comunicazione automatica di InCittà.
        </p>
      </div>
    `,
  });
}

export async function inviaEmailNuovaRegistrazioneAdmin(opts: {
  nome: string;
  email: string;
  area: "cliente" | "merchant" | "courier";
  negozio?: string | null;
}): Promise<boolean> {
  const nome = escapeHtml(opts.nome || "Utente");
  const email = escapeHtml(opts.email);
  const area =
    opts.area === "merchant"
      ? "Venditore"
      : opts.area === "courier"
        ? "Corriere locale"
        : "Cliente";
  const negozio = opts.negozio ? escapeHtml(opts.negozio) : "";

  return inviaEmail({
    to: ADMIN_EMAIL,
    subject: "Nuova registrazione da approvare — InCittà",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#334155">
        <h2 style="margin:0 0 16px;color:#0f172a">Nuova registrazione da approvare</h2>
        <p style="line-height:1.65">
          È stato creato un nuovo account InCittà che richiede approvazione amministrativa.
        </p>
        <div style="margin:20px 0;padding:16px;border-radius:14px;background:#f8fafc">
          <p style="margin:0 0 8px"><strong>Nome:</strong> ${nome}</p>
          <p style="margin:0 0 8px"><strong>Email:</strong> ${email}</p>
          <p style="margin:0 0 8px"><strong>Tipo:</strong> ${area}</p>
          ${negozio ? `<p style="margin:0"><strong>Negozio:</strong> ${negozio}</p>` : ""}
        </div>
        <p style="line-height:1.65">
          Apri il pannello <strong>Amministratore → Utenti</strong> per controllare
          la registrazione e approvare o rifiutare l'account.
        </p>
      </div>
    `,
  });
}

export async function inviaEmailEsitoApprovazione(opts: {
  to: string;
  nome: string;
  approvato: boolean;
  motivo?: string | null;
}): Promise<boolean> {
  const nome = escapeHtml(opts.nome || "Utente");

  if (opts.approvato) {
    return inviaEmail({
      to: opts.to,
      subject: "Account approvato — InCittà",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#334155">
          <h2 style="margin:0 0 16px;color:#0f172a">Account approvato</h2>
          <p style="line-height:1.65">Ciao ${nome},</p>
          <p style="line-height:1.65">
            il tuo account InCittà è stato <strong>approvato dall'amministratore</strong>.
            Da questo momento puoi utilizzare le aree personali della piattaforma.
          </p>
        </div>
      `,
    });
  }

  const motivo = opts.motivo
    ? `<p style="line-height:1.65"><strong>Motivo:</strong> ${escapeHtml(opts.motivo)}</p>`
    : "";

  return inviaEmail({
    to: opts.to,
    subject: "Esito registrazione — InCittà",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#334155">
        <h2 style="margin:0 0 16px;color:#0f172a">Registrazione non approvata</h2>
        <p style="line-height:1.65">Ciao ${nome},</p>
        <p style="line-height:1.65">
          l'amministratore ha rifiutato la richiesta di approvazione del tuo account InCittà.
        </p>
        ${motivo}
        <p style="line-height:1.65">
          Se ritieni che si tratti di un errore, contatta l'assistenza.
        </p>
      </div>
    `,
  });
}
