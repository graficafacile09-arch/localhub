import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/roles";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";
import { getUtenteAdminById } from "@/lib/amministratore/utenti-queries";
import {
  creaTokenReset,
  invalidaTokenPrecedenti,
} from "@/lib/password-reset";
import { inviaEmailResetPassword } from "@/lib/password-reset-email";

/**
 * UTENTI — azioni amministrative (PATCH) ed eliminazione (DELETE).
 *
 * PATCH gestisce, in una sola chiamata, più operazioni indipendenti:
 *  - ruoli: aggiungiRuolo / rimuoviRuolo (multi-ruolo ESPLICITO);
 *           campo legacy `ruolo` = sostituzione con ruolo singolo;
 *  - stato account: sospendi / banna / riattiva (l'unico meccanismo reale
 *    di blocco resta Supabase banned_until; motivo e durate sono registrati
 *    in user_account_stati per la UI e l'audit);
 *  - sicurezza: resetPassword (invia link di reset via email, riusa
 *    l'infrastruttura esistente di token+Resend);
 *  - profilo: profilo.nome (aggiorna user_metadata.full_name, identità
 *    dell'account; cliente_profili resta gestito dall'utente).
 *
 * Protezioni (server-side, mai fidarsi del client):
 *  - solo sessione admin autorizzata (requireApiArea);
 *  - l'account amministratore AUTORIZZATO (email autorizzata) non può essere
 *    modificato/eliminato dal pannello in nessun modo;
 *  - il ruolo amministratore può essere assegnato SOLO all'email autorizzata;
 *  - un utente deve mantenere almeno un ruolo;
 *  - ogni modifica viene registrata in admin_activity_log.
 */

const RUOLI_DB = {
  amministratore: "admin",
  commerciante: "merchant",
  utente: "customer",
} as const;

type RuoloArea = keyof typeof RUOLI_DB;

function ruoloValido(value: unknown): value is RuoloArea {
  return value === "amministratore" || value === "commerciante" || value === "utente";
}

/** Ban "permanente" storico (≈100 anni): stessa durata del vecchio disattiva. */
const BAN_PERMANENTE = "876000h";

/** Limite massimo sospensione (10 anni, espresso in giorni). */
const MAX_GIORNI_SOSPENSIONE = 3650;

const MAX_MOTIVO = 200;
const MAX_NOME = 120;

function testoLimitato(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const testo = value.trim();
  if (!testo) return null;
  return testo.slice(0, max);
}

async function registraLog(
  sessione: { user: { id: string; email?: string | null } },
  utenteId: string,
  targetEmail: string | null | undefined,
  operazioni: string[]
) {
  if (operazioni.length === 0) return;
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.UTENTE_MODIFICATO,
    targetType: TARGET_TYPES.UTENTE,
    targetId: utenteId,
    targetName: targetEmail ?? utenteId,
    result: "success",
    detail: { operazioni: operazioni.join(", ") },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ utenteId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("admin");
  if (errArea) return errArea;

  const db = createAdminSupabaseClient();
  const { utenteId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  // Chiavi note di PATCH; qualsiasi altra chiave viene ignorata (mai errori
  // per campi sconosciuti, mai scritture arbitrarie).
  const presenti = Object.keys(body).filter((chiave) =>
    [
      "ruolo",
      "stato",
      "aggiungiRuolo",
      "rimuoviRuolo",
      "sospendi",
      "banna",
      "riattiva",
      "resetPassword",
      "profilo",
    ].includes(chiave)
  );
  if (presenti.length === 0) {
    return apiError("VALIDATION_ERROR", "Nessun campo da aggiornare.", 422);
  }

  // ── Destinatario: deve esistere e NON essere l'account admin autorizzato.
  const { data: target, error: erroreTarget } = await db.auth.admin.getUserById(utenteId);
  if (erroreTarget || !target.user) return apiError("NOT_FOUND", "Utente non trovato.", 404);

  const emailTarget = target.user.email ?? "";
  const èAccountProtetto = isAdminEmail(emailTarget);
  if (èAccountProtetto) {
    return apiError(
      "PROTECTED_USER",
      "L'account amministratore autorizzato non può essere modificato dal pannello.",
      422
    );
  }

  const operazioni: string[] = [];
  const bodyPresente = (chiave: string) =>
    Object.prototype.hasOwnProperty.call(body, chiave);

  // ── Ruoli correnti del destinatario (per add/remove e guardie). ────────
  const { data: righeRuoli } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", utenteId);
  const ruoliAggiornati = new Set<string>(
    (righeRuoli ?? []).map((riga) => String(riga.role))
  );

  // ── 1) Legacy: sostituzione con ruolo singolo. ──────────────────────────
  if (bodyPresente("ruolo")) {
    if (!ruoloValido(body.ruolo)) {
      return apiError("VALIDATION_ERROR", "Ruolo non valido.", 422);
    }
    const ruoloDb = RUOLI_DB[body.ruolo];
    const { error: deleteRoleError } = await db
      .from("user_roles")
      .delete()
      .eq("user_id", utenteId);
    if (deleteRoleError) return apiError("ROLE_FAILED", deleteRoleError.message, 422);

    const { error: insertRoleError } = await db
      .from("user_roles")
      .insert({ user_id: utenteId, role: ruoloDb });
    if (insertRoleError) {
      // Rollback sui ruoli precedenti.
      if (ruoliAggiornati.size > 0) {
        await db.from("user_roles").insert(
          Array.from(ruoliAggiornati).map((ruolo) => ({ user_id: utenteId, role: ruolo }))
        );
      }
      return apiError("ROLE_FAILED", insertRoleError.message, 422);
    }
    ruoliAggiornati.clear();
    ruoliAggiornati.add(ruoloDb);
    operazioni.push(`ruolo: ${body.ruolo}`);
  }

  // ── 2) Aggiunta di un ruolo singolo (multi-ruolo ESPLICITO). ────────────
  if (bodyPresente("aggiungiRuolo")) {
    if (!ruoloValido(body.aggiungiRuolo)) {
      return apiError("VALIDATION_ERROR", "Ruolo non valido.", 422);
    }
    if (body.aggiungiRuolo === "amministratore" && !isAdminEmail(emailTarget)) {
      return apiError(
        "VALIDATION_ERROR",
        "Il ruolo amministratore è riservato all'account autorizzato.",
        422
      );
    }
    const ruoloDb = RUOLI_DB[body.aggiungiRuolo];
    if (!ruoliAggiornati.has(ruoloDb)) {
      const { error: insertError } = await db
        .from("user_roles")
        .insert({ user_id: utenteId, role: ruoloDb });
      const èDuplicato =
        insertError != null &&
        (insertError.code === "23505" ||
          (typeof insertError.message === "string" &&
            insertError.message.includes("duplicate key")));
      if (insertError && !èDuplicato) {
        return apiError("ROLE_FAILED", insertError.message, 422);
      }
      ruoliAggiornati.add(ruoloDb);
      operazioni.push(`ruolo aggiunto: ${body.aggiungiRuolo}`);
    }
  }

  // ── 3) Rimozione di un ruolo singolo. ───────────────────────────────────
  if (bodyPresente("rimuoviRuolo")) {
    if (!ruoloValido(body.rimuoviRuolo)) {
      return apiError("VALIDATION_ERROR", "Ruolo non valido.", 422);
    }
    const ruoloDb = RUOLI_DB[body.rimuoviRuolo];
    if (ruoliAggiornati.has(ruoloDb)) {
      // L'utente deve mantenere almeno un ruolo (mai un account senza area).
      if (ruoliAggiornati.size < 2) {
        return apiError(
          "VALIDATION_ERROR",
          "L'utente deve mantenere almeno un ruolo: rimuovine uno solo quando ne possiede almeno due.",
          422
        );
      }
      const { error: deleteError } = await db
        .from("user_roles")
        .delete()
        .eq("user_id", utenteId)
        .eq("role", ruoloDb);
      if (deleteError) return apiError("ROLE_FAILED", deleteError.message, 422);
      ruoliAggiornati.delete(ruoloDb);
      operazioni.push(`ruolo rimosso: ${body.rimuoviRuolo}`);
    }
  }

  // ── 4) Stato account: sospendi / banna / riattiva. ──────────────────────
  // Le azioni esplicite (riattiva/sospendi/banna) hanno priorità sui campi
  // legacy; il legacy "stato" mappa attivo→riattiva e disattivato→ban
  // permanente (stesso significato storico).
  const haStatoLegacy = bodyPresente("stato");
  const statoLegacy = haStatoLegacy ? body.stato : undefined;

  let azioneStato: "sospendi" | "banna" | "riattiva" | null = null;
  let motivo: string | null = null;
  let giorni = 7;

  const sospendi = body.sospendi && typeof body.sospendi === "object"
    ? (body.sospendi as Record<string, unknown>)
    : {};
  const banna = body.banna && typeof body.banna === "object"
    ? (body.banna as Record<string, unknown>)
    : {};

  if (bodyPresente("riattiva")) {
    azioneStato = "riattiva";
  } else if (bodyPresente("sospendi")) {
    azioneStato = "sospendi";
    const motivoValue = testoLimitato(sospendi?.motivo, MAX_MOTIVO);
    if (sospendi.motivo !== undefined && sospendi.motivo !== null && !motivoValue) {
      return apiError("VALIDATION_ERROR", "Motivo non valido.", 422);
    }
    motivo = motivoValue;
    const giorniRaw = sospendi.giorni ?? 7;
    const giorniNum = Number(giorniRaw);
    if (!Number.isInteger(giorniNum) || giorniNum < 1 || giorniNum > MAX_GIORNI_SOSPENSIONE) {
      return apiError(
        "VALIDATION_ERROR",
        `La durata della sospensione deve essere tra 1 e ${MAX_GIORNI_SOSPENSIONE} giorni.`,
        422
      );
    }
    giorni = giorniNum;
  } else if (bodyPresente("banna")) {
    azioneStato = "banna";
    const motivoValue = testoLimitato(banna?.motivo, MAX_MOTIVO);
    if (banna.motivo !== undefined && banna.motivo !== null && !motivoValue) {
      return apiError("VALIDATION_ERROR", "Motivo non valido.", 422);
    }
    motivo = motivoValue;
  } else if (statoLegacy === "attivo") {
    azioneStato = "riattiva";
  } else if (statoLegacy === "disattivato") {
    // "disattivato" legacy → ban permanente (stesso significato storico).
    azioneStato = "banna";
  }

  if (azioneStato === "riattiva") {
    const { error: unbanError } = await db.auth.admin.updateUserById(utenteId, {
      ban_duration: "none",
    });
    if (unbanError) return apiError("STATUS_FAILED", unbanError.message, 422);
    try {
      await db.from("user_account_stati").delete().eq("user_id", utenteId);
    } catch {
      // Tabella opzionale non disponibile: il blocco è comunque rimosso.
    }
    operazioni.push("stato: attivo (riattivato)");
  } else if (azioneStato === "banna") {
    const { data: bannato, error: banError } = await db.auth.admin.updateUserById(
      utenteId,
      { ban_duration: BAN_PERMANENTE }
    );
    if (banError) return apiError("STATUS_FAILED", banError.message, 422);
    const fine = bannato?.user?.banned_until ?? null;
    try {
      await db.from("user_account_stati").upsert(
        {
          user_id: utenteId,
          stato: "bannato",
          motivo,
          iniziato_il: new Date().toISOString(),
          fino_al: fine,
          aggiornato_da: sessione.user.id,
          aggiornato_il: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch (err) {
      console.warn(
        "[amministratore/utenti] user_account_stati non aggiornata (ban):",
        err instanceof Error ? err.message : String(err)
      );
    }
    operazioni.push("stato: bannato");
  } else if (azioneStato === "sospendi") {
    const ore = giorni * 24;
    const { data: sospeso, error: sospendiError } = await db.auth.admin.updateUserById(
      utenteId,
      { ban_duration: `${ore}h` }
    );
    if (sospendiError) return apiError("STATUS_FAILED", sospendiError.message, 422);
    const fine = sospeso?.user?.banned_until ?? null;
    try {
      await db.from("user_account_stati").upsert(
        {
          user_id: utenteId,
          stato: "sospeso",
          motivo,
          iniziato_il: new Date().toISOString(),
          fino_al: fine,
          aggiornato_da: sessione.user.id,
          aggiornato_il: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch (err) {
      console.warn(
        "[amministratore/utenti] user_account_stati non aggiornata (sospensione):",
        err instanceof Error ? err.message : String(err)
      );
    }
    operazioni.push(`stato: sospeso (${giorni} giorni)`);
  }

  // ── 5) Reset password: invia il link di reset via email. ────────────────
  if (bodyPresente("resetPassword") && body.resetPassword === true) {
    try {
      await invalidaTokenPrecedenti(utenteId);
      const token = await creaTokenReset(utenteId);
      const resetUrl = new URL("/reset-password", request.url);
      resetUrl.searchParams.set("token", token);
      await inviaEmailResetPassword({ to: emailTarget, resetUrl: resetUrl.toString() });
      operazioni.push("reset password: link inviato via email");
    } catch (err) {
      const messaggio =
        err instanceof Error ? err.message : "Impossibile inviare l'email di reset.";
      return apiError("RESET_EMAIL_FAILED", `Link di reset non inviato: ${messaggio}`, 500);
    }
  }

  // ── 6) Profilo: aggiorna il NOME dell'account (identità). ───────────────
  // Scrive SOLO user_metadata.full_name (la fonte usata da registrazione e
  // flussi venditore). NON tocca cliente_profili: lì nome/cognome sono campi
  // separati gestiti dall'utente nell'area cliente (usati da checkout e
  // profilo); sovrascriverli con un nome completo svuoterebbe cognome.
  if (bodyPresente("profilo")) {
    const profilo =
      body.profilo && typeof body.profilo === "object"
        ? (body.profilo as Record<string, unknown>)
        : null;
    const nome = testoLimitato(profilo?.nome, MAX_NOME);
    if (profilo && (profilo.nome === undefined || profilo.nome === null)) {
      // nessun campo profilo valido
    } else if (!nome) {
      return apiError("VALIDATION_ERROR", "Nome completo non valido.", 422);
    }
    if (nome) {
      const metadata = {
        ...(target.user.user_metadata ?? {}),
        full_name: nome,
      };
      const { error: metaError } = await db.auth.admin.updateUserById(utenteId, {
        user_metadata: metadata,
      });
      if (metaError) return apiError("PROFILE_FAILED", metaError.message, 422);
      operazioni.push(`profilo: nome aggiornato`);
    }
  }

  if (operazioni.length === 0) {
    return apiError("VALIDATION_ERROR", "Nessuna modifica effettiva da applicare.", 422);
  }

  // Registra attività (una sola voce riepilogativa per chiamata).
  await registraLog(sessione, utenteId, emailTarget, operazioni);

  // Ritorna l'utente aggiornato (stessa forma della tabella) per il refresh UI.
  const utente = await getUtenteAdminById(utenteId);
  return apiOk({ utente });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ utenteId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("admin");
  if (errArea) return errArea;

  const db = createAdminSupabaseClient();
  const { utenteId } = await context.params;
  const { data: user, error: userError } = await db.auth.admin.getUserById(utenteId);
  if (userError || !user.user) return apiError("NOT_FOUND", "Utente non trovato.", 404);
  if (isAdminEmail(user.user.email ?? "")) {
    return apiError("PROTECTED_USER", "L'account amministratore autorizzato non può essere eliminato.", 422);
  }
  // Un admin non può eliminare il proprio account dal pannello.
  if (user.user.id === sessione.user.id) {
    return apiError("PROTECTED_USER", "Non puoi eliminare il tuo stesso account dal pannello.", 422);
  }

  const { error: deleteError } = await db.auth.admin.deleteUser(utenteId);
  if (deleteError) return apiError("DELETE_FAILED", deleteError.message, 422);

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.UTENTE_MODIFICATO,
    targetType: TARGET_TYPES.UTENTE,
    targetId: utenteId,
    targetName: user.user.email ?? utenteId,
    result: "success",
    detail: { azione: "eliminato" },
  });

  return apiOk({ deleted: true, userId: utenteId });
}
