import { randomUUID } from "node:crypto";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import { rimborsaOrdine, validaImportoRimborso } from "@/lib/pagamenti/rimborsi";

const STATI_TERMINALI = new Set(["rimborsata", "rifiutata", "annullata", "chiusa"]);

async function autorizza(userId: string, negozioId: string) {
  const store = await getMerchantStoreForUser(userId, negozioId);
  if (store.setupRequired) return { ok: false as const, response: apiError("SETUP_REQUIRED", store.errorMessage ?? "Configurazione database non completata.", 503) };
  if (!store.data) return { ok: false as const, response: apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403) };
  return { ok: true as const };
}

async function caricaPratica(negozioId: string, ordineId: string) {
  const db = createAdminSupabaseClient();
  const { data: richiesta, error } = await db
    .from("richieste_recesso")
    .select(
      "id,numero,ordine_id,negozio_id,cliente_nome,cliente_cognome,cliente_email,cliente_telefono," +
      "ricevuta_at,richiesta_at,decorrenza_at,termine_recesso_at,stato,motivo_cliente,note_cliente," +
      "rifiuto_codice,rifiuto_nota,importo_previsto,importo_rimborsato,rimborso_avviato_at,rimborsata_at"
    )
    .eq("negozio_id", negozioId)
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !richiesta) return null;

  const { data: righe } = await db
    .from("richieste_recesso_righe")
    .select(
      "id,ordine_riga_id,nome_prodotto,prezzo_unitario,quantita_richiesta," +
      "recesso_applicabile,recesso_esclusione_codice,recesso_esclusione_dettaglio"
    )
    .eq("richiesta_id", String(richiesta.id));

  const { data: ordine } = await db
    .from("ordini")
    .select("numero,totale,payment_status,payment_amount,payment_refunded_amount,payment_provider")
    .eq("id", ordemId)
    .maybeSingle();

  return { richiesta, righe: righe ?? [], ordine: ordine ?? null };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string }> }
) {
  const { negozioId, ordineId } = await context.params;
  const auth = await requireApiArea("merchant");
  if (auth.error) return auth.error;
  const accesso = await autorizza(auth.sessione.user.id, negozioId);
  if (!accesso.ok) return accesso.response;

  const pratica = await caricaPratica(negozioId, ordineId);
  if (!pratica) return apiOk({ richiesta: null });

  const ordine = pratica.ordine as Record<string, unknown> | null;
  const residuo = Math.max(
    0,
    Number(ordine?.payment_amount ?? 0) - Number(ordine?.payment_refunded_amount ?? 0)
  );

  return apiOk({
    richiesta: pratica.richiesta,
    righe: pratica.righe,
    ordine: pratica.ordine,
    residuoRimborsabile: residuo,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string }> }
) {
  const { negozioId, ordineId } = await context.params;
  const auth = await requireApiArea("merchant");
  if (auth.error) return auth.error;
  const accesso = await autorizza(auth.sessione.user.id, negozioId);
  if (!accesso.ok) return accesso.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const azione = typeof body.azione === "string" ? body.azione : "";
  const pratica = await caricaPratica(negozioId, ordineId);
  if (!pratica) return apiError("NOT_FOUND", "Nessuna pratica di recesso per questo ordine.", 404);

  const richiesta = pratica.richiesta as Record<string, unknown>;
  const stato = String(richiesta.stato);
  const db = createAdminSupabaseClient();
  const now = new Date().toISOString();

  if (azione === "presa_in_carico") {
    if (stato !== "richiesta") return apiError("INVALID_STATE", "La pratica non è nello stato previsto.", 409);
    const { error } = await db.from("richieste_recesso").update({
      stato: "presa_in_carico",
      presa_in_carico_at: now,
      updated_at: now,
    }).eq("id", String(richiesta.id));
    if (error) return apiError("SAVE_FAILED", "Impossibile aggiornare la pratica.", 500);
    return apiOk({ stato: "presa_in_carico" });
  }

  if (azione === "istruzioni_reso") {
    if (!["richiesta", "presa_in_carico"].includes(stato)) {
      return apiError("INVALID_STATE", "Le istruzioni per il reso non possono essere inviate nello stato attuale.", 409);
    }
    const messaggio = typeof body.messaggio === "string" ? body.messaggio.trim().slice(0, 2000) : "";
    if (!messaggio) return apiError("VALIDATION_ERROR", "Inserisci le istruzioni per il reso.", 422);

    const { error } = await db.from("richieste_recesso").update({
      stato: "istruzioni_reso",
      istruzioni_reso_at: now,
      updated_at: now,
    }).eq("id", String(richiesta.id));
    if (error) return apiError("SAVE_FAILED", "Impossibile aggiornare la pratica.", 500);

    await db.from("richieste_recesso_eventi").insert({
      richiesta_id: String(richiesta.id),
      tipo: "istruzioni_reso",
      autore_user_id: auth.sessione.user.id,
      messaggio,
      metadata: { negozio_id: negozioId },
    });
    return apiOk({ stato: "istruzioni_reso" });
  }

  if (azione === "reso_ricevuto") {
    if (stato !== "istruzioni_reso") {
      return apiError("INVALID_STATE", "Prima devono essere presenti le istruzioni per il reso.", 409);
    }
    const { error } = await db.from("richieste_recesso").update({
      stato: "reso_ricevuto",
      reso_ricevuto_at: now,
      updated_at: now,
    }).eq("id", String(richiesta.id));
    if (error) return apiError("SAVE_FAILED", "Impossibile aggiornare la pratica.", 500);
    return apiOk({ stato: "reso_ricevuto" });
  }

  if (azione === "rifiuta") {
    if (!["richiesta", "presa_in_carico", "istruzioni_reso"].includes(stato)) {
      return apiError("INVALID_STATE", "La pratica non può essere rifiutata nello stato attuale.", 409);
    }

    const codice = typeof body.codice === "string" ? body.codice : "";
    const consentiti = new Set([
      "fuori_termine",
      "esclusione_legale",
      "ordine_non_ammissibile",
      "pagamento_non_rimborsabile",
      "altro_documentato",
    ]);
    if (!consentiti.has(codice)) return apiError("VALIDATION_ERROR", "Motivo di rifiuto non valido.", 422);

    const nota = typeof body.nota === "string" ? body.nota.trim().slice(0, 2000) : "";
    if (!nota) return apiError("VALIDATION_ERROR", "Inserisci la motivazione documentata del rifiuto.", 422);

    const { error } = await db.from("richieste_recesso").update({
      stato: "rifiutata",
      rifiuto_codice: codice,
      rifiuto_nota: nota,
      updated_at: now,
    }).eq("id", String(richiesta.id));
    if (error) return apiError("SAVE_FAILED", "Impossibile aggiornare la pratica.", 500);

    await db.from("richieste_recesso_eventi").insert({
      richiesta_id: String(richiesta.id),
      tipo: "nota",
      autore_user_id: auth.sessione.user.id,
      messaggio: nota,
      metadata: { codice, azione: "rifiuta", negozio_id: negozioId },
    });
    return apiOk({ stato: "rifiutata" });
  }

  if (azione === "rimborso") {
    if (stato !== "reso_ricevuto") {
      return apiError("INVALID_STATE", "Il rimborso può essere avviato dopo la registrazione del reso ricevuto.", 409);
    }

    const ordine = pratica.ordine as Record<string, unknown> | null;
    const residuo = Math.max(
      0,
      Number(ordine?.payment_amount ?? 0) - Number(ordine?.payment_refunded_amount ?? 0)
    );
    const importo = validaImportoRimborso(body.importo, residuo);
    if (importo === null) return apiError("VALIDATION_ERROR", "Importo di rimborso non valido o superiore al residuo.", 422);

    const esito = await rimborsaOrdine({
      ordineId,
      importo,
      motivo: "Recesso " + String(richiesta.numero),
      userId: auth.sessione.user.id,
      idempotencyKey: request.headers.get("Idempotency-Key")?.trim() || randomUUID(),
    });

    if (!esito.ok) return apiError(esito.codice, esito.errore, esito.status);

    if (esito.pending) {
      await db.from("richieste_recesso").update({
        stato: "rimborso_in_elaborazione",
        importo_previsto: importo,
        rimborso_avviato_at: now,
        updated_at: now,
      }).eq("id", String(richiesta.id));
      return apiOk({ stato: "rimborso_in_elaborazione", importo, refundId: esito.refundId, pending: true }, 202);
    }

    const { error } = await db.from("richieste_recesso").update({
      stato: "rimborsata",
      importo_previsto: importo,
      importo_rimborsato: esito.importoRimborsato,
      rimborso_avviato_at: now,
      rimborsata_at: now,
      updated_at: now,
    }).eq("id", String(richiesta.id));
    if (error) return apiError("SAVE_FAILED", "Rimborso eseguito ma pratica non aggiornata: verificare dalla console.", 500);

    return apiOk({
      stato: "rimborsata",
      importoRimborsato: esito.importoRimborsato,
      refundId: esito.refundId,
      pending: false,
    });
  }

  if (azione === "chiudi") {
    if (!STATI_TERMINALI.has(stato)) {
      return apiError("INVALID_STATE", "La pratica non può essere chiusa nello stato attuale.", 409);
    }
    const { error } = await db.from("richieste_recesso").update({
      stato: "chiusa",
      chiusa_at: now,
      updated_at: now,
    }).eq("id", String(richiesta.id));
    if (error) return apiError("SAVE_FAILED", "Impossibile chiudere la pratica.", 500);
    return apiOk({ stato: "chiusa" });
  }

  return apiError("VALIDATION_ERROR", "Azione non riconosciuta.", 422);
}
