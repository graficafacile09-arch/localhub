import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  CHIAVI_SALVABILI,
  aggiornaImpostazioni,
  getImpostazioniAdmin,
} from "@/lib/platform/settings";

/**
 * IMPOSTAZIONI PIATTAFORMA — pannello Amministratore.
 *
 * GET  → elenco delle impostazioni modificabili (chiavi whitelist + valore
 *        attuale + descrizione), SOLO per l'area admin.
 * PATCH → aggiorna SOLO le chiavi della whitelist: il client non può inviare
 *        chiavi arbitrarie né valori segreti (sono config pubbliche del sito).
 */
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

  return apiOk({ impostazioni: modificabili });
}

export async function PATCH(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

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

  const esito = await aggiornaImpostazioni(valori);
  if (!esito.ok) {
    return apiError("UPDATE_FAILED", esito.errore, 500);
  }

  // Le impostazioni pubbliche alimentano layout, header e footer: aggiorna
  // subito la cache delle pagine che le mostrano.
  revalidatePath("/");
  revalidatePath("/login");
  revalidatePath("/negozi");
  revalidatePath("/categorie");
  revalidatePath("/amministratore/impostazioni");

  return apiOk({ successo: true });
}