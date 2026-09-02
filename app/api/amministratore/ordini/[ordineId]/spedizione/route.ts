import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { aggiornaStatoSpedizioneAdmin } from "@/lib/amministratore/ordini";
import {
  azioneVersoStato,
  isAzioneSpedizione,
} from "@/lib/merchant/ordini-spedizioni";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

/** Valida un URL di tracking opzionale: vuoto oppure http(s) valido. */
function urlTrackingValido(url: string | null): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * PATCH /api/amministratore/ordini/[ordineId]/spedizione
 *
 * Body: { "azione": "affida" | "transito" | "consegnata" | "problema" | "riassegna",
 *         "tracking_code", "tracking_url", "consegna_stimata" }
 *
 * Cambio stato SPEDIZIONE lato admin. Riusa la RPC `aggiorna_stato_spedizione`
 * (macchina a stati + ownership owner/admin + tracking obbligatorio).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { ordineId } = await context.params;

  let body: {
    azione?: unknown;
    tracking_code?: unknown;
    tracking_url?: unknown;
    consegna_stimata?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  if (!isAzioneSpedizione(body.azione)) {
    return apiError("VALIDATION_ERROR", "Azione spedizione non valida.", 422);
  }

  const trackingCode =
    typeof body.tracking_code === "string" && body.tracking_code.trim()
      ? body.tracking_code.trim().slice(0, 120)
      : null;
  const trackingUrl =
    typeof body.tracking_url === "string" && body.tracking_url.trim()
      ? body.tracking_url.trim().slice(0, 500)
      : null;
  const consegnaStimata =
    typeof body.consegna_stimata === "string" && body.consegna_stimata.trim()
      ? body.consegna_stimata.trim().slice(0, 120)
      : null;

  if ((body.azione === "affida" || body.azione === "riassegna") && !trackingCode) {
    return apiError("TRACKING_OBBLIGATORIO", "Inserisci il codice di tracking.", 422);
  }
  if (trackingUrl && !urlTrackingValido(trackingUrl)) {
    return apiError("TRACKING_URL_NON_VALIDA", "URL di tracking non valido.", 422);
  }

  const statoSpedizioneNuovo = azioneVersoStato(body.azione);

  const esito = await aggiornaStatoSpedizioneAdmin(
    sessione.user.id,
    ordineId,
    statoSpedizioneNuovo,
    { trackingCode, trackingUrl, consegnaStimata }
  );

  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }

  // Registra l'operazione amministrativa SOLO dopo il successo (stesso
  // pattern degli altri moduli: nessun log senza mutazione riuscita).
  const ordine = esito.ordine;
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.ORDINE_SPEDIZIONE_MODIFICATA,
    targetType: TARGET_TYPES.ORDINE,
    targetId: ordineId,
    targetName: ordine?.numero ?? ordineId,
    negozioId: ordine?.negozioId ?? null,
    negozioNome: ordine?.negozioNome ?? null,
    result: "success",
    detail: {
      azione: body.azione,
      stato_spedizione: statoSpedizioneNuovo,
      tracking_code: trackingCode,
      consegna_stimata: consegnaStimata,
    },
  });

  revalidatePath("/amministratore/ordini");
  revalidatePath(`/amministratore/ordini/${ordineId}`);

  return apiOk({ ordine: esito.ordine, cambiato: esito.cambiato });
}
