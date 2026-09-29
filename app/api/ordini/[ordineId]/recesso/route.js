import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { apiError, apiOk } from "@/lib/api/response";
import { getSessionArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { orderAccessCookieName, verifyOrderAccessToken } from "@/lib/cliente/order-access";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.incitta.online";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "InCittà <onboarding@resend.dev>";

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
      "id, numero, ordine_id, cliente_nome, cliente_email, venditore_email, " +
      "ricevuta_at, termine_recesso_at, conferma_esito"
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

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    await db.from("richieste_recesso").update({
      conferma_email: String(richiesta.cliente_email),
      conferma_esito: "fallita",
      updated_at: new Date().toISOString(),
    }).eq("id", richiestaId);
    await db.from("richieste_recesso_eventi").insert({
      richiesta_id: richiestaId,
      tipo: "ricevuta",
      messaggio: "Ricevuta e-mail non inviata: servizio di posta non configurato.",
      metadata: { esito: "fallita" },
    });
    return;
  }
  const resend = new Resend(resendKey);
  const link = SITE_URL + "/ordini/conferma/" + encodeURIComponent(String(richiesta.ordine_id));

  let emailResult;
  try {
    emailResult = await resend.emails.send({
      from: FROM_EMAIL,
    to: String(richiesta.cliente_email),
    subject: "Ricevuta richiesta di recesso " + String(richiesta.numero) + " — InCittà",
    text:
      "Ciao " + String(richiesta.cliente_nome) + ",\n\n" +
      "abbiamo registrato la tua richiesta di recesso.\n\n" +
      "Pratica: " + String(richiesta.numero) + "\n" +
      "Data e ora di ricezione: " + ricevuta + "\n" +
      "Termine ordinario: " + termine + "\n\n" +
      "Articoli:\n" + elenco + "\n\n" +
      "La richiesta è stata trasmessa al venditore.\n" +
      "Ordine: " + link + "\n"
    });
  } catch (sendError) {
    await db.from("richieste_recesso").update({
      conferma_email: String(richiesta.cliente_email),
      conferma_esito: "fallita",
      updated_at: new Date().toISOString(),
    }).eq("id", richiestaId);
    await db.from("richieste_recesso_eventi").insert({
      richiesta_id: richiestaId,
      tipo: "ricevuta",
      messaggio: "Invio della ricevuta e-mail non riuscito.",
      metadata: { esito: "fallita", errore: String(sendError) },
    });
    return;
  }

  if (emailResult.error) {
    await db
      .from("richieste_recesso")
      .update({
        conferma_email: String(richiesta.cliente_email),
        conferma_esito: "fallita",
        updated_at: new Date().toISOString(),
      })
      .eq("id", richiestaId);

    await db.from("richieste_recesso_eventi").insert({
      richiesta_id: richiestaId,
      tipo: "ricevuta",
      messaggio: "Invio della ricevuta e-mail non riuscito.",
      metadata: { esito: "fallita" },
    });
    return;
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

  await db.from("richieste_recesso_eventi").insert({
    richiesta_id: richiestaId,
    tipo: "ricevuta",
    messaggio: "Ricevuta e-mail di conferma inviata al cliente.",
    metadata: {
      esito: "inviata",
      message_id: emailResult.data?.id ?? null,
    },
  });

  if (richiesta.venditore_email) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: String(richiesta.venditore_email),
      subject: "Nuova richiesta di recesso " + String(richiesta.numero) + " — InCittà",
      text:
        "È stata registrata una nuova richiesta di recesso.\n\n" +
        "Pratica: " + String(richiesta.numero) + "\n" +
        "Cliente: " + String(richiesta.cliente_nome) + "\n" +
        "Ricezione: " + ricevuta + "\n\n" +
        "Apri l'ordine nell'area venditore per gestire la pratica."
    });
  }
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
    .select("id, numero, stato, richiesta_at, ricevuta_at, termine_recesso_at")
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return apiOk({
    ordineNumero: ordine.numero,
    ordineStato: ordine.stato,
    consegnataAt: ordine.consegnata_at,
    termineRecessoAt: ordine.consegnata_at
      ? new Date(new Date(ordine.consegnata_at).getTime() + 14 * 86400000).toISOString()
      : null,
    righe: righe ?? [],
    richiesta: richiesta ?? null,
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
