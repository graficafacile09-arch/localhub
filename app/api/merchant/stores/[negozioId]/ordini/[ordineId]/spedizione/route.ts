import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { aggiornaStatoSpedizioneVenditore } from "@/lib/merchant/ordini";
import {
  azioneVersoStato,
  isAzioneSpedizione,
} from "@/lib/merchant/ordini-spedizioni";

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
 * PATCH /api/merchant/stores/[negozioId]/ordini/[ordineId]/spedizione
 *
 * Body: {
 *   "azione": "affida" | "transito" | "consegnata" | "problema" | "riassegna",
 *   "tracking_code": "...",      // OBBLIGATORIO per affida/riassegna
 *   "tracking_url": "...",       // opzionale, se presente deve essere http(s)
 *   "consegna_stimata": "..."    // opzionale
 * }
 *
 * Aggiornamento dello STATO SPEDIZIONE (macchina a stati indipendente dallo
 * stato ordine). La transizione è validata DAL DATABASE (RPC
 * aggiorna_stato_spedizione: ownership, lock, macchina a stati, tracking
 * obbligatorio). Nessun UPDATE diretto della tabella è consentito.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId, ordineId } = await context.params;

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
      ? body.consegna_stimata.trim().slice(0,120)
      : null;

  // Tracking obbligatorio per affida/riassegna (difesa in profondità; la RPC
  // ri-verifica comunque server-side).
  if ((body.azione === "affida" || body.azione === "riassegna") && !trackingCode) {
    return apiError("TRACKING_OBBLIGATORIO", "Inserisci il codice di tracking.", 422);
  }

  // URL opzionale ma, se presente, deve essere valido.
  if (trackingUrl && !urlTrackingValido(trackingUrl)) {
    return apiError("TRACKING_URL_NON_VALIDA", "URL di tracking non valido.", 422);
  }

  const nuovoStato = azioneVersoStato(body.azione);

  const esito = await aggiornaStatoSpedizioneVenditore(user.id, negozioId, ordineId, nuovoStato, {
    trackingCode,
    trackingUrl,
    consegnaStimata,
  });

  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }

  revalidatePath(`/merchant/${negozioId}/ordini`);
  revalidatePath(`/merchant/${negozioId}/ordini/${ordineId}`);
  // Il cliente deve vedere subito stato/tracking nella propria area.
  revalidatePath("/cliente/ordini");
  revalidatePath(`/ordini/conferma/${ordineId}`);

  return apiOk({ ordine: esito.ordine, cambiato: esito.cambiato });
}
