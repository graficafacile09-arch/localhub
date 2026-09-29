import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rimborsaOrdine, MAX_MOTIVO_RIMBORSO } from "@/lib/pagamenti/rimborsi";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const AZIONI = new Set([
  "presa_in_carico",
  "istruzioni_reso",
  "reso_ricevuto",
  "rimborso_avviato",
  "rimborsata",
  "chiusa",
  "rifiuta",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string; richiestaId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;

  const { negozioId, ordineId, richiestaId } = await context.params;

  let body: { azione?: unknown; nota?: unknown; importoRimborsato?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  if (typeof body.azione !== "string" || !AZIONI.has(body.azione)) {
    return apiError("VALIDATION_ERROR", "Azione non valida.", 422);
  }

  const nota = typeof body.nota === "string" ? body.nota.trim().slice(0, 1500) : null;
  let importo = body.importoRimborsato == null || body.importoRimborsato === ""
    ? null
    : Number(body.importoRimborsato);

  if (importo !== null && (!Number.isFinite(importo) || importo <= 0)) {
    return apiError("VALIDATION_ERROR", "Importo rimborsato non valido.", 422);
  }

  if (body.azione === "rimborsata") {
    if (importo === null) {
      return apiError("IMPORTO_RIMBORSO_MANCANTE", "Indica l'importo da rimborsare.", 422);
    }
    const esitoRimborso = await rimborsaOrdine({
      ordineId,
      importo,
      motivo: nota?.slice(0, MAX_MOTIVO_RIMBORSO) ?? null,
      userId: sessione.user.id,
      idempotencyKey: request.headers.get("Idempotency-Key")?.trim() || randomUUID(),
    });
    if (!esitoRimborso.ok) {
      return apiError(esitoRimborso.codice, esitoRimborso.errore, esitoRimborso.status);
    }
    if (esitoRimborso.pending) {
      return apiOk({
        pratica: null,
        negozioId,
        ordineId,
        richiestaId,
        aggiornata: false,
        rimborso: { pending: true, refundId: esitoRimborso.refundId, operazioneId: esitoRimborso.operazioneId },
        message: "Il rimborso è in riconciliazione. La pratica resta nello stato attuale.",
      }, 202);
    }
    if (!("importoRimborsato" in esitoRimborso)) {
      return apiError("SAVE_FAILED", "Il rimborso non ha restituito un importo definitivo.", 502);
    }
    importo = esitoRimborso.importoRimborsato;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error: rpcError } = await supabase.rpc("gestisci_richiesta_recesso", {
    p_richiesta_id: richiestaId,
    p_azione: body.azione,
    p_nota: nota,
    p_importo_rimborsato: importo,
    p_rimborso_operazione_id: body.azione === "rimborsata" ? esitoRimborso.operazioneId : null,
  });

  if (rpcError) {
    console.error("[api-recesso] RPC:", rpcError.message);
    return apiError("SAVE_FAILED", "Impossibile aggiornare la pratica.", 500);
  }

  if (!data?.ok) {
    const status = data?.codice === "NOT_FOUND" ? 404 : data?.codice === "UNAUTHORIZED" ? 401 : 422;
    return apiError(data?.codice || "SAVE_FAILED", data?.messaggio || "Impossibile aggiornare la pratica.", status);
  }

  const url = new URL(request.url);

  // Aggiornamento su supporto durevole per gli stati che modificano
  // concretamente la gestione del recesso. L'email viene inviata solo
  // dopo la conferma del cambio stato nel database.
  if (["presa_in_carico", "istruzioni_reso", "reso_ricevuto", "rimborso_avviato", "rimborsata", "rifiuta"].includes(body.azione)) {
    try {
      const admin = createAdminSupabaseClient();
      const { data: praticaEmail } = await admin
        .from("richieste_recesso")
        .select("numero, cliente_nome, cliente_email, stato, importo_previsto, importo_rimborsato")
        .eq("id", richiestaId)
        .maybeSingle();

      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? "InCittà <onboarding@resend.dev>";

      if (praticaEmail?.cliente_email && resendKey) {
        const resend = new Resend(resendKey);
        const statoTesto = {
          presa_in_carico: "presa in carico dal venditore",
          istruzioni_reso: "accompagnata dalle istruzioni per il reso",
          reso_ricevuto: "segnalata come reso ricevuto",
          rimborso_avviato: "con rimborso avviato",
          rimborsata: "rimborsata",
          rifiuta: "rifiutata dal venditore",
        }[body.azione] ?? body.azione;

        const dettagliRimborso =
          body.azione === "rimborsata" && praticaEmail.importo_rimborsato != null
            ? "\nImporto rimborsato: € " + Number(praticaEmail.importo_rimborsato).toFixed(2).replace(".", ",") + "\n"
            : "";

        const notaEmail = nota ? "\nNota del venditore:\n" + nota + "\n" : "";

        await resend.emails.send({
          from: fromEmail,
          to: String(praticaEmail.cliente_email),
          subject: "Aggiornamento richiesta di recesso " + String(praticaEmail.numero) + " — InCittà",
          text:
            "Ciao " + String(praticaEmail.cliente_nome || "") + ",\n\n" +
            "La tua richiesta di recesso " + String(praticaEmail.numero) + " è stata " + statoTesto + ".\n" +
            dettagliRimborso +
            notaEmail +
            "\nPuoi consultare l'ordine dalla tua area InCittà:\n" +
            url.origin + "/ordini/conferma/" + encodeURIComponent(String(ordineId)) + "\n",
        });
      }
    } catch (emailError) {
      // L'aggiornamento della pratica resta valido anche se il provider email
      // non risponde: la comunicazione non deve annullare un'operazione già registrata.
      console.error("[api-recesso] email stato:", emailError);
    }
  }

  return apiOk({
    pratica: data,
    negozioId,
    ordineId,
    richiestaId,
    aggiornata: true,
    origin: url.origin,
    rimborso: body.azione === "rimborsata" ? { pending: false, importoRimborsato: importo, operazioneId: esitoRimborso.operazioneId } : null,
  });
}
