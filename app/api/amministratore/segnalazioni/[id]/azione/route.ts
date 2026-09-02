import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSegnalazioneAdmin } from "@/lib/segnalazioni";
import { isAdminEmail } from "@/lib/auth/roles";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

/**
 * AZIONI DI MODERAZIONE dal dettaglio di una segnalazione.
 *
 * La segnalazione NON è mai una scorciatoia per modificare oggetti arbitrari:
 * il client indica SOLO l'azione; l'oggetto su cui agire viene determinato qui
 * lato SERVER leggendo la segnalazione (target_type/target_id/negozio_id). Un
 * ID manipolato dal client non può indirizzare una modifica diversa.
 *
 * Azioni supportate (nessuna nuova architettura: stesse operazioni dei moduli
 * esistenti del back office, eseguite qui in modo mirato):
 *  - disattiva_negozio   → negozio.attivo = false (sospensione, come nel
 *                          modulo Negozi/attività);
 *  - disattiva_prodotto  → prodotto.attivo = false (come nel modulo Prodotti);
 *  - sospendi_utente     → blocco temporaneo 7 giorni (ban_duration + riga
 *                          user_account_stati, stessa semantica del modulo Utenti);
 *  - banna_utente        → blocco permanente (stessa semantica del modulo Utenti).
 *
 * Ogni azione è protetta da requireApiArea("admin") e registrata in
 * admin_activity_log con riferimento alla segnalazione che l'ha originata.
 */

type AzioneAmmessa =
  | "disattiva_negozio"
  | "disattiva_prodotto"
  | "sospendi_utente"
  | "banna_utente";

const AZIONI: AzioneAmmessa[] = [
  "disattiva_negozio",
  "disattiva_prodotto",
  "sospendi_utente",
  "banna_utente",
];

const SOSPENSIONE_GIORNI = 7;
const BAN_PERMANENTE = "876000h";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const db = createAdminSupabaseClient();
  const { id } = await context.params;

  const segnalazione = await getSegnalazioneAdmin(id);
  if (!segnalazione) {
    return apiError("NOT_FOUND", "Segnalazione non trovata.", 404);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const azione = body?.azione;
  if (typeof azione !== "string" || !AZIONI.includes(azione as AzioneAmmessa)) {
    return apiError("VALIDATION_ERROR", "Azione di moderazione non valida.", 422);
  }

  const tipoAzione = azione as AzioneAmmessa;

  // ── Negozio: l'oggetto è dedotto dalla segnalazione (mai dal client). ────
  if (tipoAzione === "disattiva_negozio") {
    const negozioId =
      segnalazione.negozio_id ??
      (segnalazione.target_type === "negozio" ? segnalazione.target_id : null);
    if (!negozioId) {
      return apiError(
        "AZIONE_NON_APPLICABILE",
        "La segnalazione non individua un negozio da disattivare.",
        422
      );
    }
    const { data: negozio } = await db
      .from("negozi")
      .select("id, nome, attivo")
      .eq("id", negozioId)
      .single();
    if (!negozio) {
      return apiError("NOT_FOUND", "Negozio non trovato.", 404);
    }
    if (negozio.attivo === false) {
      return apiError("AZIONE_NON_APPLICABILE", "Il negozio è già disattivato.", 422);
    }
    const { error: updateError } = await db
      .from("negozi")
      .update({ attivo: false, updated_at: new Date().toISOString() })
      .eq("id", negozioId);
    if (updateError) {
      return apiError("UPDATE_FAILED", updateError.message ?? "Impossibile disattivare il negozio.", 500);
    }
    await registraAttivitaAdmin({
      adminUserId: sessione.user.id,
      adminEmail: sessione.user.email ?? "",
      operationType: OPERATION_TYPES.NEGOZIO_MODIFICATO,
      targetType: TARGET_TYPES.NEGOZIO,
      targetId: String(negozioId),
      targetName: String(negozio.nome ?? "Negozio"),
      result: "success",
      detail: {
        azione: "moderazione: negozio disattivato",
        segnalazione_id: id,
      },
    });
    revalidatePath("/");
    revalidatePath("/negozi");
    return apiOk({ azione: tipoAzione, eseguita: true, negozioId });
  }

  // ── Prodotto: target_type "prodotto" + target_id della segnalazione. ─────
  if (tipoAzione === "disattiva_prodotto") {
    if (segnalazione.target_type !== "prodotto" || !segnalazione.target_id) {
      return apiError(
        "AZIONE_NON_APPLICABILE",
        "La segnalazione non riguarda un prodotto.",
        422
      );
    }
    const { data: prodotto } = await db
      .from("prodotti")
      .select("id, nome, negozio_id, attivo")
      .eq("id", segnalazione.target_id)
      .single();
    if (!prodotto) {
      return apiError("NOT_FOUND", "Prodotto non trovato.", 404);
    }
    if (prodotto.attivo === false) {
      return apiError("AZIONE_NON_APPLICABILE", "Il prodotto è già disattivato.", 422);
    }
    const { error: updateError } = await db
      .from("prodotti")
      .update({ attivo: false, updated_at: new Date().toISOString() })
      .eq("id", prodotto.id);
    if (updateError) {
      return apiError("UPDATE_FAILED", updateError.message ?? "Impossibile disattivare il prodotto.", 500);
    }
    await registraAttivitaAdmin({
      adminUserId: sessione.user.id,
      adminEmail: sessione.user.email ?? "",
      operationType: OPERATION_TYPES.PRODOTTO_MODIFICATO,
      targetType: TARGET_TYPES.PRODOTTO,
      targetId: String(prodotto.id),
      targetName: String(prodotto.nome ?? "Prodotto"),
      negozioId: prodotto.negozio_id as string | null,
      result: "success",
      detail: {
        azione: "moderazione: prodotto disattivato",
        segnalazione_id: id,
      },
    });
    revalidatePath("/");
    revalidatePath("/negozi");
    return apiOk({ azione: tipoAzione, eseguita: true, productId: prodotto.id });
  }

  // ── Utente (comportamento): target_type "utente" + target_id. ────────────
  const utenteTargetId =
    segnalazione.target_type === "utente" ? segnalazione.target_id : null;
  if (tipoAzione === "sospendi_utente" || tipoAzione === "banna_utente") {
    if (!utenteTargetId) {
      return apiError(
        "AZIONE_NON_APPLICABILE",
        "La segnalazione non individua un utente da moderare.",
        422
      );
    }
    const { data: target } = await db.auth.admin.getUserById(utenteTargetId);
    if (!target?.user) {
      return apiError("NOT_FOUND", "Utente segnalato non trovato.", 404);
    }
    const emailTarget = target.user.email ?? "";
    // Protezioni identiche al modulo Utenti: mai l'admin autorizzato, mai se stesso.
    if (isAdminEmail(emailTarget)) {
      return apiError(
        "PROTECTED_USER",
        "L'account amministratore autorizzato non può essere moderato dal pannello.",
        422
      );
    }
    if (target.user.id === sessione.user.id) {
      return apiError("PROTECTED_USER", "Non puoi moderare il tuo stesso account.", 422);
    }
    if (segnalazione.user_id === target.user.id) {
      return apiError("AZIONE_NON_APPLICABILE", "Impossibile moderare il segnalante stesso.", 422);
    }

    const permanente = tipoAzione === "banna_utente";
    const { data: aggiornato, error: banError } = await db.auth.admin.updateUserById(
      target.user.id,
      permanente ? { ban_duration: BAN_PERMANENTE } : { ban_duration: `${SOSPENSIONE_GIORNI * 24}h` }
    );
    if (banError) {
      return apiError("UPDATE_FAILED", banError.message ?? "Impossibile bloccare l'utente.", 500);
    }
    const fine = aggiornato?.user?.banned_until ?? null;
    try {
      await db.from("user_account_stati").upsert(
        {
          user_id: target.user.id,
          stato: permanente ? "bannato" : "sospeso",
          motivo: `Segnalazione ${id}`,
          iniziato_il: new Date().toISOString(),
          fino_al: fine,
          aggiornato_da: sessione.user.id,
          aggiornato_il: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch (err) {
      console.warn(
        "[segnalazioni/azione] user_account_stati non aggiornata:",
        err instanceof Error ? err.message : String(err)
      );
    }
    await registraAttivitaAdmin({
      adminUserId: sessione.user.id,
      adminEmail: sessione.user.email ?? "",
      operationType: OPERATION_TYPES.UTENTE_MODIFICATO,
      targetType: TARGET_TYPES.UTENTE,
      targetId: target.user.id,
      targetName: emailTarget || target.user.id,
      result: "success",
      detail: {
        azione: permanente ? "moderazione: ban utente" : "moderazione: sospensione utente",
        segnalazione_id: id,
        giorni: permanente ? null : SOSPENSIONE_GIORNI,
      },
    });
    return apiOk({ azione: tipoAzione, eseguita: true, utenteId: target.user.id });
  }

  return apiError("VALIDATION_ERROR", "Azione non supportata.", 422);
}
