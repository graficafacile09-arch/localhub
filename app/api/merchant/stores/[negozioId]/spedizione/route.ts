import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  getConfigPaccoSpedizione,
  getMetodiSpedizioneNegozio,
  updateConfigPaccoSpedizione,
  updateMetodiSpedizioneNegozio,
} from "@/lib/merchant/data";
import {
  CATALOGO_SPEDIZIONE,
  isCarrierCodice,
  isServizioValidoPerCarrier,
  type CarrierCodice,
  type ServizioCodice,
} from "@/lib/spedizioni/catalogo";

/** Etichetta leggibile di un servizio (coerente con il catalogo checkout). */
function labelServizio(carrier: string, servizio: string): string {
  if (carrier === "poste_italiane") {
    return servizio === "express" ? "Poste Italiane — Express" : "Poste Italiane — Standard";
  }
  if (carrier === "brt") return "BRT — Online";
  if (carrier === "locale") return "Corriere locale";
  return `${carrier} — ${servizio}`;
}

/**
 * GET /api/merchant/stores/[negozioId]/spedizione
 *
 * Configurazione spedizione del negozio: PACCO (peso/dimensioni) + METODI
 * (corrieri/servizi attivi). Restituisce SEMPRE l'intero catalogo dei
 * servizi, ognuno con `attivo` reale (fail-closed: assente = non attivo).
 * Solo il venditore proprietario (o admin) può leggerla.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;

  const config = await getConfigPaccoSpedizione(user.id, negozioId);
  if (config === null) {
    return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);
  }

  const righe = await getMetodiSpedizioneNegozio(user.id, negozioId);
  const perChiave = new Map<string, { attivo: boolean; ordine_mostra: number }>();
  for (const r of righe ?? []) {
    perChiave.set(`${r.carrier}:${r.servizio}`, {
      attivo: r.attivo,
      ordine_mostra: r.ordine_mostra,
    });
  }

  const metodi = CATALOGO_SPEDIZIONE.map((v, index) => {
    const p = perChiave.get(`${v.carrier}:${v.servizio}`);
    return {
      carrier: v.carrier,
      servizio: v.servizio,
      attivo: p?.attivo ?? false,
      ordine_mostra: p?.ordine_mostra ?? index,
      label: labelServizio(v.carrier, v.servizio),
    };
  });

  return apiOk({ config, metodi });
}

/** Intero > 0 oppure null; ritorna null se valido, altrimenti un messaggio. */
function validaInteroPositivo(
  valore: unknown,
  etichetta: string
): { valore: number | null; errore?: string } {
  if (valore === null || valore === undefined || valore === "") {
    return { valore: null };
  }
  const n = Number(valore);
  if (!Number.isInteger(n) || n <= 0) {
    return { valore: null, errore: `${etichetta} deve essere un intero maggiore di zero.` };
  }
  return { valore: n };
}

/**
 * PATCH /api/merchant/stores/[negozioId]/spedizione
 *
 * Body: { paccoPesoGrammi?, paccoLunghezzaCm?, paccoLarghezzaCm?,
 *         paccoAltezzaCm?, paccoPesoMaxGrammi?, metodi? }
 *   - campi pacco: tutti possono essere null (pacco non configurato);
 *   - metodi: [{ carrier, servizio, attivo, ordine_mostra }] — validati
 *     contro il catalogo (mai valori arbitrari dal client).
 * Nessun valore viene inventato lato server.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  // ── 1. Metodi di spedizione (se presenti) ───────────────────────────────
  const metodiRaw = body.metodi;
  let metodiSalvati = false;
  if (metodiRaw !== undefined) {
    if (!Array.isArray(metodiRaw)) {
      return apiError("VALIDATION_ERROR", "Campo 'metodi' non valido.", 422);
    }
    const metodi: Array<{
      carrier: CarrierCodice;
      servizio: ServizioCodice;
      attivo: boolean;
      ordine_mostra: number;
    }> = [];
    for (const entry of metodiRaw) {
      const e = (entry ?? {}) as Record<string, unknown>;
      const carrier = String(e.carrier ?? "");
      const servizio = String(e.servizio ?? "");
      if (!isCarrierCodice(carrier)) {
        return apiError("VALIDATION_ERROR", `Corriere non valido: ${carrier}`, 422);
      }
      if (!isServizioValidoPerCarrier(carrier, servizio)) {
        return apiError("VALIDATION_ERROR", `Servizio non valido: ${servizio}`, 422);
      }
      const ordineMostra =
        typeof e.ordine_mostra === "number" && Number.isInteger(e.ordine_mostra)
          ? Math.min(Math.max(e.ordine_mostra, 0), 99)
          : 0;
      metodi.push({
        carrier,
        servizio,
        attivo: e.attivo === true,
        ordine_mostra: ordineMostra,
      });
    }
    const esito = await updateMetodiSpedizioneNegozio(user.id, negozioId, metodi);
    if (!esito.ok) {
      return apiError("UPDATE_FAILED", esito.errore ?? "Impossibile salvare i metodi di spedizione.", 500);
    }
    metodiSalvati = true;
  }

  // ── 2. Pacco (se presente almeno un campo pacco) ────────────────────────
  const haCampiPacco = [
    "paccoPesoGrammi",
    "paccoLunghezzaCm",
    "paccoLarghezzaCm",
    "paccoAltezzaCm",
    "paccoPesoMaxGrammi",
  ].some((k) => k in body);

  if (haCampiPacco) {
    const peso = validaInteroPositivo(body.paccoPesoGrammi, "Il peso del pacco");
    const lunghezza = validaInteroPositivo(body.paccoLunghezzaCm, "La lunghezza");
    const larghezza = validaInteroPositivo(body.paccoLarghezzaCm, "La larghezza");
    const altezza = validaInteroPositivo(body.paccoAltezzaCm, "L'altezza");
    const pesoMax = validaInteroPositivo(body.paccoPesoMaxGrammi, "Il peso massimo");

    const primoErrore =
      peso.errore ?? lunghezza.errore ?? larghezza.errore ?? altezza.errore ?? pesoMax.errore;
    if (primoErrore) {
      return apiError("VALIDATION_ERROR", primoErrore, 422);
    }

    const esito = await updateConfigPaccoSpedizione(user.id, negozioId, {
      paccoPesoGrammi: peso.valore,
      paccoLunghezzaCm: lunghezza.valore,
      paccoLarghezzaCm: larghezza.valore,
      paccoAltezzaCm: altezza.valore,
      paccoPesoMaxGrammi: pesoMax.valore,
    });

    if (!esito.ok) {
      return apiError("UPDATE_FAILED", esito.errore ?? "Impossibile salvare la configurazione.", 500);
    }
  }

  revalidatePath(`/merchant/${negozioId}`);
  revalidatePath(`/merchant/${negozioId}/impostazioni`);

  return apiOk({ saved: true, metodi: metodiSalvati });
}
