import { Resend } from "resend";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "LocalHub <onboarding@resend.dev>";

/**
 * Invia l'email di recupero password con il link che porta a
 * /reset-password?token=...
 *
 * L'invio usa la chiave API di Resend. Se RESEND_API_KEY non è configurata
 * l'email NON parte: logghiamo l'errore (l'API resta anti-enumeration per chi
 * richiede il link).
 */
export async function inviaEmailResetPassword(opts: {
  to: string;
  resetUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn(
      "[password-reset-email] RESEND_API_KEY non configurata: email NON inviata",
    );
    throw new Error("RESEND_API_KEY non configurata");
  }
  if (!isSupabaseConfigured()) {
    throw new Error("Configurazione Supabase mancante");
  }

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: opts.to,
    subject: "Recupero password LocalHub",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1e293b;margin-bottom:16px">Recupero password</h2>
        <p style="color:#475569;line-height:1.6">
          Hai richiesto di impostare una nuova password per il tuo account.
          Il link è valido per 30 minuti.
        </p>
        <p>
          <a href="${opts.resetUrl}"
             style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:bold">
            Imposta una nuova password
          </a>
        </p>
        <p style="color:#64748b;font-size:13px;line-height:1.6">
          Se non hai richiesto tu questo link, ignora questa email: la tua
          password attuale continuerà a funzionare.
        </p>
      </div>
    `,
  });

  // [E2E-TEMP] conferma che Resend ha accettato l'invio.
  if (data?.id) {
    console.log(`[e2e] RESEND_ID=${data.id}`);
  }

  if (error) {
    console.error("[password-reset-email] Resend:", error.message);
    throw new Error(`Resend: ${error.message}`);
  }
}