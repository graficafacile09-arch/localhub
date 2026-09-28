import { Resend } from "resend";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createOrderConfirmationUrl } from "@/lib/cliente/order-access";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.incitta.online";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "InCittà <onboarding@resend.dev>";
const RESEND_TIMEOUT_MS = 8000;

export type EsitoEmailRecesso =
  | { stato: "inviata"; messageId: string | null }
  | { stato: "saltata"; motivo: string }
  | { stato: "fallita"; motivo: string };

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function conTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function inviaEmailConfermaRecesso(
  richiestaId: string,
): Promise<EsitoEmailRecesso> {
  const db = createAdminSupabaseClient();

  try {
    const { data: richiesta, error } = await db
      .from("richieste_recesso")
      .select(
        "id,numero,ordine_id,cliente_nome,cliente_cognome,cliente_email," +
        "venditore_denominazione_legale,venditore_nome_commerciale,venditore_email," +
        "venditore_pec,ricevuta_at,dichiarazione_testo,termine_recesso_at,conferma_esito"
      )
      .eq("id", richiestaId)
      .maybeSingle();

    if (error || !richiesta) {
      return { stato: "fallita", motivo: "richiesta_non_trovata" };
    }

    const email = String(richiesta.cliente_email ?? "").trim();
    if (!email) return { stato: "saltata", motivo: "email_assente" };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { stato: "saltata", motivo: "email_non_valida" };
    }

    if (String(richiesta.conferma_esito ?? "") === "inviata") {
      return { stato: "inviata", messageId: null };
    }

    const ordineId = String(richiesta.ordine_id);
    const linkOrdine = createOrderConfirmationUrl(SITE_URL, ordineId);
    const numero = String(richiesta.numero ?? "");
    const ricevuta = new Date(String(richiesta.ricevuta_at)).toLocaleString("it-IT");
    const termine = richiesta.termine_recesso_at
      ? new Date(String(richiesta.termine_recesso_at)).toLocaleDateString("it-IT")
      : "14 giorni dalla consegna";

    const { data: righe } = await db
      .from("richieste_recesso_righe")
      .select("nome_prodotto,prezzo_unitario,quantita_richiesta")
      .eq("richiesta_id", richiestaId);

    const righeHtml = ((righe ?? []) as Record<string, unknown>[])
      .map((r) => {
        const nome = escapeHtml(String(r.nome_prodotto ?? "Prodotto"));
        const q = Number(r.quantita_richiesta ?? 0);
        const prezzo = Number(r.prezzo_unitario ?? 0).toFixed(2).replace(".", ",");
        return \`<li style="margin:0 0 8px;color:#334155;">\${nome} — \${q} × €\${prezzo}</li>\`;
      })
      .join("");

    const html = \`<!DOCTYPE html>
<html lang="it">
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#2563eb;border-radius:16px 16px 0 0;padding:22px;text-align:center;color:#fff;">
      <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#dbeafe;font-weight:700;">Richiesta di recesso</div>
      <div style="margin-top:7px;font-size:21px;font-weight:800;">\${escapeHtml(numero)}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;">
      <p style="margin:0;font-size:15px;color:#0f172a;">Ciao \${escapeHtml(String(richiesta.cliente_nome ?? ""))},</p>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#334155;">
        abbiamo registrato la tua richiesta di recesso relativa all'ordine collegato.
      </p>
      <div style="margin-top:18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px;">
        <p style="margin:0;font-size:13px;color:#1e3a8a;"><strong>Data e ora di ricezione:</strong> \${escapeHtml(ricevuta)}</p>
        <p style="margin:7px 0 0;font-size:13px;color:#1e3a8a;"><strong>Termine ordinario:</strong> \${escapeHtml(termine)}</p>
      </div>
      <p style="margin:20px 0 7px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Articoli indicati</p>
      <ul style="padding-left:20px;margin:0;">\${righeHtml}</ul>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#475569;">
        La richiesta è stata trasmessa al venditore. Le istruzioni operative sul reso e le successive verifiche saranno comunicate nella gestione della pratica.
      </p>
      <div style="margin-top:22px;text-align:center;">
        <a href="\${linkOrdine}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:700;font-size:14px;">Visualizza ordine</a>
      </div>
      <p style="margin:20px 0 0;font-size:11px;line-height:1.6;color:#94a3b8;text-align:center;">
        Il messaggio costituisce conferma della trasmissione della richiesta tramite InCittà.
      </p>
    </div>
  </div>
</body>
</html>\`;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY non configurata");
    const resend = new Resend(apiKey);
    const { data: sent, error: sendError } = await conTimeout(
      resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: \`Ricevuta richiesta di recesso \${numero} — InCittà\`,
        html,
      }),
      RESEND_TIMEOUT_MS
    );
    if (sendError) throw new Error(sendError.message);

    const messageId = sent?.id ? String(sent.id) : null;
    await db
      .from("richieste_recesso")
      .update({
        conferma_inviata_at: new Date().toISOString(),
        conferma_email: email,
        conferma_message_id: messageId,
        conferma_esito: "inviata",
        updated_at: new Date().toISOString(),
      })
      .eq("id", richiestaId);

    return { stato: "inviata", messageId };
  } catch (error) {
    await db
      .from("richieste_recesso")
      .update({
        conferma_esito: "fallita",
        updated_at: new Date().toISOString(),
      })
      .eq("id", richiestaId)
      .catch(() => undefined);

    console.error("[recesso-email] conferma fallita:", (error as Error)?.message ?? "sconosciuto");
    return { stato: "fallita", motivo: "invio_fallito" };
  }
}


export async function inviaEmailNotificaVenditore(
  richiestaId: string,
): Promise<EsitoEmailRecesso> {
  const db = createAdminSupabaseClient();

  try {
    const { data: richiesta, error } = await db
      .from("richieste_recesso")
      .select(
        "id,numero,ordine_id,negozio_id,cliente_nome,cliente_cognome,cliente_email," +
        "venditore_email,ricevuta_at,importo_previsto"
      )
      .eq("id", richiestaId)
      .maybeSingle();

    if (error || !richiesta) {
      return { stato: "fallita", motivo: "richiesta_non_trovata" };
    }

    const emailVenditore = String(richiesta.venditore_email ?? "").trim();
    if (!emailVenditore) return { stato: "saltata", motivo: "email_venditore_assente" };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVenditore)) {
      return { stato: "saltata", motivo: "email_venditore_non_valida" };
    }

    const linkOrdine =
      SITE_URL + "/merchant/" +
      encodeURIComponent(String(richiesta.negozio_id)) +
      "/ordini/" +
      encodeURIComponent(String(richiesta.ordine_id));
    const ricevuta = new Date(String(richiesta.ricevuta_at)).toLocaleString("it-IT");
    const importo = Number(richiesta.importo_previsto ?? 0).toFixed(2).replace(".", ",");

    const html =
      "<!DOCTYPE html><html lang=\"it\"><body style=\"margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;\">" +
      "<div style=\"max-width:560px;margin:0 auto;padding:24px 16px;\">" +
      "<div style=\"background:#2563eb;border-radius:16px 16px 0 0;padding:22px;color:#fff;\">" +
      "<div style=\"font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#dbeafe;font-weight:700;\">InCittà — nuova pratica</div>" +
      "<div style=\"margin-top:7px;font-size:21px;font-weight:800;\">Richiesta di recesso " + escapeHtml(String(richiesta.numero)) + "</div>" +
      "</div><div style=\"background:#fff;border-radius:0 0 16px 16px;padding:24px;\">" +
      "<p style=\"margin:0;font-size:15px;color:#0f172a;\">È stata registrata una nuova richiesta di recesso.</p>" +
      "<div style=\"margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;padding:14px;\">" +
      "<p style=\"margin:0;font-size:13px;color:#334155;\"><strong>Cliente:</strong> " + escapeHtml(String(richiesta.cliente_nome ?? "")) + " " + escapeHtml(String(richiesta.cliente_cognome ?? "")) + "</p>" +
      "<p style=\"margin:7px 0 0;font-size:13px;color:#334155;\"><strong>Ricezione:</strong> " + escapeHtml(ricevuta) + "</p>" +
      "<p style=\"margin:7px 0 0;font-size:13px;color:#334155;\"><strong>Valore articoli indicati:</strong> €" + escapeHtml(importo) + "</p>" +
      "</div>" +
      "<p style=\"margin:18px 0 0;font-size:13px;line-height:1.6;color:#475569;\">Apri la scheda ordine per gestire la pratica e le successive fasi del reso.</p>" +
      "<div style=\"margin-top:22px;text-align:center;\"><a href=\"" + linkOrdine + "\" style=\"display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:700;font-size:14px;\">Apri ordine e pratica</a></div>" +
      "</div></div></body></html>";

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY non configurata");

    const resend = new Resend(apiKey);
    const { error: sendError } = await conTimeout(
      resend.emails.send({
        from: FROM_EMAIL,
        to: emailVenditore,
        subject: "Nuova richiesta di recesso " + String(richiesta.numero) + " — InCittà",
        html,
      }),
      RESEND_TIMEOUT_MS
    );

    if (sendError) throw new Error(sendError.message);
    return { stato: "inviata", messageId: null };
  } catch (error) {
    console.error("[recesso-email] notifica venditore fallita:", (error as Error)?.message ?? "sconosciuto");
    return { stato: "fallita", motivo: "invio_fallito" };
  }
}
