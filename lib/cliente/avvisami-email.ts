/**
 * EMAIL "PRODOTTO TORNATO DISPONIBILE" — InCittà.
 *
 * Riutilizza l'infrastruttura Resend già presente nel progetto
 * (lib/password-reset-email.ts, lib/cliente/ordine-email.ts): stessa chiave
 * API (RESEND_API_KEY), stesso mittente (RESEND_FROM_EMAIL). Nessun secondo
 * sistema email.
 *
 * L'invio è BEST-EFFORT: restituisce sempre uno stato (sent / skipped /
 * error) e non lancia MAI eccezioni. Il chiamante
 * (lib/prodotti-avvisami.ts) marca la richiesta come notified solo dopo un
 * invio riuscito, e in caso di errore la riporta a "active" per un retry
 * senza perdere la richiesta.
 *
 * SOLO server-side: nessuna chiave API esposta al browser.
 */

import { Resend } from "resend";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "InCittà <onboarding@resend.dev>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.incitta.online";

export type EsitoEmailAvviso =
  | { stato: "sent" }
  | { stato: "skipped"; motivo: string }
  | { stato: "error"; motivo: string };

export async function inviaEmailProdottoDisponibile(opts: {
  to: string;
  prodottoNome: string;
  prodottoUrl: string;
}): Promise<EsitoEmailAvviso> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { stato: "skipped", motivo: "RESEND_API_KEY non configurata" };
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: opts.to,
    subject: `Buone notizie: ${opts.prodottoNome} è di nuovo disponibile`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1e293b;margin-bottom:16px">È di nuovo disponibile 🎉</h2>
        <p style="color:#475569;line-height:1.6">
          Il prodotto che stavi aspettando è tornato disponibile:
        </p>
        <p style="font-weight:bold;color:#0f172a;margin:16px 0">
          ${opts.prodottoNome}
        </p>
        <p>
          <a href="${opts.prodottoUrl}"
             style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:bold">
            Vai al prodotto
          </a>
        </p>
        <p style="color:#64748b;font-size:13px;line-height:1.6;margin-top:24px">
          Ti abbiamo avvisato perché hai richiesto di essere avvisato quando
          questo prodotto sarebbe tornato disponibile su InCittà.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[avvisami-email] Resend:", error.message);
    return { stato: "error", motivo: error.message };
  }

  return { stato: "sent" };
}
