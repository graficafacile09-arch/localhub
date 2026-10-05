import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { apiError, apiOk } from "@/lib/api/response";
import { getSessionArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { orderAccessCookieName, verifyOrderAccessToken } from "@/lib/cliente/order-access";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.incitta.online";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "";
const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO_EMAIL?.trim() || null;

async function risolviAccesso(ordineId, token) {
  const sessione = await getSessionArea();

  if (sessione?.area === "cliente") {
    return { userId: sessione.user.id, guest: false };
  }

  const cookieToken = (await cookies()).get(orderAccessCookieName(ordineId))?.value ?? null;
  const effectiveToken = token?.trim() || cookieToken;

  if (!verifyOrderAccessToken(effectiveToken, ordineId)) return null;
  return { userId: null, guest: true };
}

async function inviaRicevuta(richiestaId) {
  const db = createAdminSupabaseClient();
  const { data: richiesta } = await db
    .from("richieste_recesso")
    .select(
      "id, numero, ordine_id, negozio_id, cliente_nome, cliente_cognome, cliente_email, venditore_email, " +
      "motivo_cliente, note_cliente, ricevuta_at, termine_recesso_at, conferma_esito"
    )
    .eq("id", richiestaId)
    .maybeSingle();

  if (!richiesta || !richiesta.cliente_email || richiesta.conferma_esito === "inviata") return;

  const { data: righe } = await db
    .from("richieste_recesso_righe")
    .select("nome_prodotto, quantita_richiesta")
    .eq("richiesta_id", richiestaId);

  const elenco = (righe ?? [])
    .map((r) => String(r.nome_prodotto) + " — quantità " + String(r.quantita_richiesta))
    .join("\n");

  const ricevuta = new Date(String(richiesta.ricevuta_at)).toLocaleString("it-IT");
  const termine = richiesta.termine_recesso_at
    ? new Date(String(richiesta.termine_recesso_at)).toLocaleDateString("it-IT")
    : "14 giorni dalla consegna";

  const { data: ordineEmail } = await db
    .from("ordini")
    .select("numero")
    .eq("id", richiesta.ordine_id)
    .maybeSingle();
  const numeroOrdine = ordineEmail?.numero ? String(ordineEmail.numero) : String(richiesta.ordine_id);
  const clienteNomeCompleto = [richiesta.cliente_nome, richiesta.cliente_cognome]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const motivoCliente = String(richiesta.motivo_cliente ?? "").trim();
  const noteCliente = String(richiesta.note_cliente ?? "").trim();
  const messaggioCliente = [
    motivoCliente ? ["Motivo", motivoCliente] : null,
    noteCliente && noteCliente !== motivoCliente ? ["Nota", noteCliente] : null,
  ].filter(Boolean);

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("RESEND_API_KEY non configurata");
  const resend = new Resend(resendKey);
  const link = SITE_URL + "/ordini/conferma/" + encodeURIComponent(String(richiesta.ordine_id));

  if (!FROM_EMAIL) throw new Error("RESEND_FROM_EMAIL non configurata");

  const articoliHtml = (righe ?? [])
    .map((r) =>
      "<li style=\"margin:0 0 6px;color:#334155;\">" +
      escapeHtml(String(r.nome_prodotto)) +
      " — quantità " +
      escapeHtml(String(r.quantita_richiesta)) +
      "</li>"
    )
    .join("");

  const html = "<!DOCTYPE html><html lang=\"it\"><body style=\"margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;\">" +
    "<div style=\"max-width:560px;margin:0 auto;padding:24px 16px;\">" +
    "<div style=\"background:#2563eb;border-radius:16px 16px 0 0;padding:24px;text-align:center;\">" +
    "<p style=\"margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#dbeafe;font-weight:700;\">Ricevuta richiesta</p>" +
    "<p style=\"margin:8px 0 0;font-size:20px;font-weight:800;color:#fff;\">Richiesta di recesso</p>" +
    "<p style=\"margin:6px 0 0;font-size:13px;color:#dbeafe;\">Pratica " + escapeHtml(String(richiesta.numero)) + "</p>" +
    "</div>" +
    "<div style=\"background:#fff;border-radius:0 0 16px 16px;padding:24px;\">" +
    "<p style=\"margin:0;font-size:15px;line-height:1.6;color:#0f172a;\">Ciao " + escapeHtml(String(richiesta.cliente_nome)) + ", abbiamo registrato la tua richiesta di recesso.</p>" +
    "<div style=\"margin-top:18px;border:1px solid #e2e8f0;border-radius:12px;padding:14px;\">" +
    "<p style=\"margin:0;font-size:13px;color:#475569;\"><strong>Data e ora di ricezione:</strong> " + escapeHtml(ricevuta) + "</p>" +
    "<p style=\"margin:7px 0 0;font-size:13px;color:#475569;\"><strong>Termine ordinario:</strong> " + escapeHtml(termine) + "</p>" +
    "</div>" +
    "<p style=\"margin:20px 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;\">Articoli interessati</p>" +
    "<ul style=\"margin:0;padding-left:20px;\">" + articoliHtml + "</ul>" +
    "<p style=\"margin:20px 0 0;font-size:14px;line-height:1.6;color:#475569;\">La richiesta è stata trasmessa al venditore per la gestione del reso e del rimborso, quando previsto.</p>" +
    "<div style=\"margin-top:24px;text-align:center;\"><a href=\"" + link + "\" style=\"display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:700;\">Visualizza ordine</a></div>" +
    "<p style=\"margin:20px 0 0;font-size:11px;line-height:1.6;color:#94a3b8;text-align:center;\">Email transazionale relativa alla tua richiesta di recesso su InCittà.</p>" +
    "</div></div></body></html>";

  const testo = "Ciao " + String(richiesta.cliente_nome) + ",\n\n" +
    "abbiamo registrato la tua richiesta di recesso.\n\n" +
    "Pratica: " + String(richiesta.numero) + "\n" +
    "Data e ora di ricezione: " + ricevuta + "\n" +
    "Termine ordinario: " + termine + "\n\n" +
    "Articoli:\n" + elenco + "\n\n" +
    "La richiesta è stata trasmessa al venditore.\n" +
    "Visualizza ordine: " + link + "\n";

  const emailResult = await resend.emails.send({
    from: FROM_EMAIL,
    to: String(richiesta.cliente_email),
    subject: "Ricevuta richiesta di recesso " + String(richiesta.numero) + " — InCittà",
    html,
    text: testo,
    ...(REPLY_TO_EMAIL ? { replyTo: REPLY_TO_EMAIL } : {}),
  });

  if (emailResult.error) {
    await db
      .from("richieste_recesso")
      .update({
        conferma_esito: "fallita",
        conferma_email: String(richiesta.cliente_email),
        updated_at: new Date().toISOString(),
      })
      .eq("id", richiestaId);
    throw new Error(emailResult.error.message || "Invio ricevuta di recesso fallito");
  }

  await db
    .from("richieste_recesso")
    .update({
      conferma_inviata_at: new Date().toISOString(),
      conferma_email: String(richiesta.cliente_email),
      conferma_message_id: emailResult.data?.id ?? null,
      conferma_esito: "inviata",
      updated_at: new Date().toISOString(),
    })
    .eq("id", richiestaId);

  if (richiesta.venditore_email) {
    const ordineVenditore = SITE_URL + "/merchant/" +
      encodeURIComponent(String(richiesta.negozio_id)) +
      "/ordini/" + encodeURIComponent(String(richiesta.ordine_id));

    await resend.emails.send({
      from: FROM_EMAIL,
      to: String(richiesta.venditore_email),
      subject: "Nuova richiesta di recesso " + String(richiesta.numero) + " — ordine InCittà",
      html:
        "<!DOCTYPE html><html lang=\"it\"><body style=\"margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;\">" +
        "<div style=\"max-width:560px;margin:0 auto;padding:24px 16px;\"><div style=\"background:#2563eb;border-radius:16px 16px 0 0;padding:22px;color:#fff;\">" +
        "<div style=\"font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#dbeafe;font-weight:700;\">InCittà — attenzione richiesta</div>" +
        "<div style=\"margin-top:7px;font-size:21px;font-weight:800;\">Nuova richiesta di recesso</div>" +
        "</div><div style=\"background:#fff;border-radius:0 0 16px 16px;padding:24px;\">" +
        "<p style=\"margin:0;font-size:15px;color:#0f172a;\">È stata registrata una richiesta di recesso relativa a un tuo ordine.</p>" +
        "<p style=\"margin:16px 0 0;font-size:14px;color:#475569;\"><strong>Numero pratica:</strong> " + escapeHtml(String(richiesta.numero)) + "</p>" +
        "<p style=\"margin:7px 0 0;font-size:14px;color:#475569;\"><strong>Numero ordine:</strong> " + escapeHtml(numeroOrdine) + "</p>" +
        "<p style=\"margin:7px 0 0;font-size:14px;color:#475569;\"><strong>Cliente:</strong> " + escapeHtml(clienteNomeCompleto || String(richiesta.cliente_nome ?? "")) + "</p>" +
        "<p style=\"margin:7px 0 0;font-size:14px;color:#475569;\"><strong>Ricezione:</strong> " + escapeHtml(ricevuta) + "</p>" +
        (messaggioCliente.length
          ? "<div style=\"margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#f8fafc;\">" +
            "<p style=\"margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;\">Messaggio del cliente</p>" +
            messaggioCliente
              .map(([label, value]) =>
                "<p style=\"margin:7px 0 0;font-size:14px;color:#475569;\"><strong>" + escapeHtml(label) + ":</strong> " + escapeHtml(value) + "</p>"
              )
              .join("") +
            "</div>"
          : "") +
        "<div style=\"margin-top:22px;text-align:center;\"><a href=\"" + ordineVenditore + "\" style=\"display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:700;\">Apri ordine e pratica</a></div>" +
        "</div></div></body></html>",
      text:
        "È stata registrata una nuova richiesta di recesso relativa a un tuo ordine.\n\n" +
        "Numero pratica: " + String(richiesta.numero) + "\n" +
        "Numero ordine: " + numeroOrdine + "\n" +
        "Cliente: " + (clienteNomeCompleto || String(richiesta.cliente_nome ?? "")) + "\n" +
        "Ricezione: " + ricevuta + "\n" +
        (messaggioCliente.length
          ? "\nMessaggio del cliente:\n" + messaggioCliente.map(([label, value]) => label + ": " + value).join("\n") + "\n"
          : "") +
        "\nApri l'ordine e la pratica: " + ordineVenditore + "\n",
      ...(REPLY_TO_EMAIL ? { replyTo: REPLY_TO_EMAIL } : {}),
    });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function GET(request, context) {
  const { ordineId } = await context.params;
  const token = new URL(request.url).searchParams.get("token");
  const accesso = await risolviAccesso(ordineId, token);
  if (!accesso) return apiError("UNAUTHORIZED", "Accesso all'ordine non autorizzato.", 401);

  const db = createAdminSupabaseClient();
  const { data: ordine, error: ordineError } = await db
    .from("ordini")
    .select("id, numero, stato, cliente_user_id, consegnata_at")
    .eq("id", ordineId)
    .maybeSingle();

  if (ordineError || !ordine) return apiError("NOT_FOUND", "Ordine non trovato.", 404);
  if (!accesso.guest && ordine.cliente_user_id !== accesso.userId) {
    return apiError("FORBIDDEN", "Non puoi gestire questo ordine.", 403);
  }

  const { data: righe, error: righeError } = await db
    .from("ordini_righe")
    .select(
      "id, nome_prodotto, prezzo_unitario, quantita, " +
      "recesso_applicabile, recesso_esclusione_codice, recesso_esclusione_dettaglio"
    )
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: true });

  if (righeError) return apiError("READ_FAILED", "Impossibile leggere le righe dell'ordine.", 500);

  const { data: richiesta } = await db
    .from("richieste_recesso")
    .select("id, numero, stato, richiesta_at, ricevuta_at, termine_recesso_at, motivo_cliente, note_cliente")
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let eventi = [];
  if (richiesta?.id) {
    const { data: eventiData } = await db
      .from("richieste_recesso_eventi")
      .select("id, tipo, autore_user_id, stato_precedente, stato_nuovo, messaggio, created_at")
      .eq("richiesta_id", richiesta.id)
      .order("created_at", { ascending: true });
    eventi = eventiData ?? [];
  }

  return apiOk({
    ordineNumero: ordine.numero,
    ordineStato: ordine.stato,
    consegnataAt: ordine.consegnata_at,
    termineRecessoAt: ordine.consegnata_at
      ? new Date(new Date(ordine.consegnata_at).getTime() + 14 * 86400000).toISOString()
      : null,
    righe: righe ?? [],
    richiesta: richiesta ?? null,
    eventi,
  });
}

export async function POST(request, context) {
  const { ordineId } = await context.params;

  let body;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const accesso = await risolviAccesso(ordineId, typeof body.token === "string" ? body.token : null);
  if (!accesso) return apiError("UNAUTHORIZED", "Accesso all'ordine non autorizzato.", 401);

  const db = createAdminSupabaseClient();
  const { data: ordine, error: ordineError } = await db
    .from("ordini")
    .select("id, cliente_user_id, cliente_email, cliente_telefono")
    .eq("id", ordineId)
    .maybeSingle();

  if (ordineError || !ordine) return apiError("NOT_FOUND", "Ordine non trovato.", 404);
  if (!accesso.guest && ordine.cliente_user_id !== accesso.userId) {
    return apiError("FORBIDDEN", "Non puoi gestire questo ordine.", 403);
  }

  const righe = Array.isArray(body.righe)
    ? body.righe.map((r) => {
        const item = r ?? {};
        return {
          ordineRigaId: typeof item.ordineRigaId === "string" ? item.ordineRigaId : "",
          quantita: Number(item.quantita),
        };
      })
    : [];

  const { data, error } = await db.rpc("crea_richiesta_recesso", {
    p_ordine_id: ordineId,
    p_cliente_user_id: accesso.guest ? null : accesso.userId,
    p_guest_email: accesso.guest ? String(ordine.cliente_email ?? "") : null,
    p_guest_telefono: accesso.guest ? String(ordine.cliente_telefono ?? "") : null,
    p_righe: righe,
    p_motivo: typeof body.motivo === "string" ? body.motivo.trim() : null,
    p_note: typeof body.note === "string" ? body.note.trim() : null,
  });

  if (error) {
    console.error("[recesso] RPC:", error.message);
    return apiError("SAVE_FAILED", "Impossibile registrare la richiesta di recesso.", 500);
  }

  const result = data ?? {};
  if (result.ok !== true) {
    const codice = String(result.codice ?? "SAVE_FAILED");
    const status =
      codice === "FORBIDDEN" ? 403 :
      codice === "ORDINE_NON_TROVATO" ? 404 :
      codice === "FUORI_TERMINE" ? 409 :
      codice === "RECESSO_ESCLUSO" ? 409 :
      codice === "RECESSO_NON_CONFIGURATO" ? 409 :
      codice === "QUANTITA_NON_VALIDA" || codice === "QUANTITA_GIA_RICHIESTA" ? 409 :
      codice === "VALIDATION_ERROR" ? 422 : 500;
    return apiError(codice, String(result.messaggio ?? "Impossibile registrare la richiesta di recesso."), status);
  }

  if (!result.giaEsistente) {
    try {
      await inviaRicevuta(String(result.id));
    } catch (emailError) {
      console.error("[recesso] email:", emailError);
    }
  }

  revalidatePath("/cliente/ordini/" + ordineId);
  revalidatePath("/ordini/conferma/" + ordineId);

  return apiOk({ richiesta: result }, result.giaEsistente ? 200 : 201);
}
