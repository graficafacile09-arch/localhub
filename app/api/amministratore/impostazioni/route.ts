import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  CHIAVI_SALVABILI,
  aggiornaImpostazioni,
  getImpostazioniAdmin,
} from "@/lib/platform/settings";
import {
  CHIAVE_COMMISSIONE_PERCENTUALE,
  getCommissionePercentuale,
} from "@/lib/pagamenti/commissione";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";

/**
 * IMPOSTAZIONI PIATTAFORMA — pannello Amministratore.
 *
 * GET  → elenco delle impostazioni modificabili (chiavi whitelist + valore
 *        attuale + descrizione), SOLO per l'area admin. Include la
 *        commissione piattaforma (piattaforma_config.commissione_percentuale,
 *        default 10) che NON passa dalla whitelist di piattaforma_settings.
 * PATCH → aggiorna SOLO le chiavi della whitelist (piattaforma_settings) e,
 *        separatamente, la chiave commissione_percentuale su
 *        piattaforma_config.valore_numeric (validazione 0–10 inclusi,
 *        decimali ammessi). Il client non può inviare chiavi arbitrarie né
 *        valori segreti.
 */

/** Limite superiore della commissione configurabile dal pannello (0–10). */
const MASSIMO_COMMISSIONE_PERCENTUALE = 10;

export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const tutte = await getImpostazioniAdmin();
  const modificabili = tutte
    .filter((impostazione) => impostazione.chiave in CHIAVI_SALVABILI)
    .map((impostazione) => ({
      chiave: impostazione.chiave,
      valore: impostazione.valore ?? "",
      descrizione: impostazione.descrizione ?? "",
      etichetta: CHIAVI_SALVABILI[impostazione.chiave as keyof typeof CHIAVI_SALVABILI] ?? "",
    }));

  // Commissione piattaforma: fonte autorevole piattaforma_config (default 10).
  const commissionePercentuale = await getCommissionePercentuale();

  return apiOk({ impostazioni: modificabili, commissionePercentuale });
}

export async function PATCH(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  // ── Commissione piattaforma (gestione SEPARATA da piattaforma_settings) ──
  // Validazione server-side: solo numero finito 0 ≤ n ≤ 10, decimali ammessi.
  let commissioneDaSalvare: number | null = null;
  if (Object.prototype.hasOwnProperty.call(body, CHIAVE_COMMISSIONE_PERCENTUALE)) {
    const valore = body[CHIAVE_COMMISSIONE_PERCENTUALE];
    if (typeof valore !== "string") {
      return apiError(
        "VALIDATION_ERROR",
        `Valore non valido per la chiave "${CHIAVE_COMMISSIONE_PERCENTUALE}": inserire un numero tra 0 e 10.`,
        422
      );
    }
    const testo = valore.trim();
    if (testo === "") {
      return apiError(
        "VALIDATION_ERROR",
        `Valore non valido per la chiave "${CHIAVE_COMMISSIONE_PERCENTUALE}": inserire un numero tra 0 e 10.`,
        422
      );
    }
    const n = Number(testo);
    if (!Number.isFinite(n) || n < 0 || n > MASSIMO_COMMISSIONE_PERCENTUALE) {
      return apiError(
        "VALIDATION_ERROR",
        `Valore non valido per la chiave "${CHIAVE_COMMISSIONE_PERCENTUALE}": consentito 0–10 (decimali inclusi, es. 7.5).`,
        422
      );
    }
    commissioneDaSalvare = n;
    delete body[CHIAVE_COMMISSIONE_PERCENTUALE];
  }

  // ── Impostazioni pubbliche (whitelist piattaforma_settings) ──────────────
  const valori: Record<string, string> = {};
  for (const [chiave, valore] of Object.entries(body)) {
    if (typeof valore !== "string") {
      return apiError(
        "VALIDATION_ERROR",
        `Valore non valido per la chiave "${chiave}".`,
        422
      );
    }
    valori[chiave] = valore;
  }

  const chiaviModificate: string[] = [];
  if (Object.keys(valori).length > 0) {
    const esito = await aggiornaImpostazioni(valori);
    if (!esito.ok) {
      return apiError("UPDATE_FAILED", esito.errore, 500);
    }
    chiaviModificate.push(...Object.keys(valori));
  }

  // ── Salvataggio commissione su piattaforma_config.valore_numeric ─────────
  if (commissioneDaSalvare !== null) {
    const db = createAdminSupabaseClient();
    const { error: cfgErr } = await db
      .from("piattaforma_config")
      .upsert(
        { chiave: CHIAVE_COMMISSIONE_PERCENTUALE, valore_numeric: commissioneDaSalvare },
        { onConflict: "chiave" }
      );
    if (cfgErr) {
      return apiError("UPDATE_FAILED", cfgErr.message, 500);
    }
    chiaviModificate.push(CHIAVE_COMMISSIONE_PERCENTUALE);
  }

  if (chiaviModificate.length === 0) {
    return apiError("VALIDATION_ERROR", "Nessuna impostazione ammessa da aggiornare.", 422);
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.IMPOSTAZIONI_MODIFICATE,
    targetType: TARGET_TYPES.IMPOSTAZIONI,
    targetId: "platform_settings",
    targetName: "Impostazioni piattaforma",
    result: "success",
    detail: { chiavi_modificate: chiaviModificate.join(", ") },
  });

  // Le impostazioni pubbliche alimentano layout, header e footer: aggiorna
  // subito la cache delle pagine che le mostrano.
  revalidatePath("/");
  revalidatePath("/login");
  revalidatePath("/negozi");
  revalidatePath("/categorie");
  revalidatePath("/amministratore/impostazioni");

  return apiOk({ successo: true });
}
