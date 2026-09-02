import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  creaOffertaAdmin,
  getOfferteAdmin,
  validaCampiOfferta,
  type FiltriOfferte,
} from "@/lib/offerte";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

/** Elenco offerte per il pannello Amministratore (ricerca, filtro negozio, stato). */
export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);
  const ricerca = url.searchParams.get("q") ?? undefined;
  const negozioId = url.searchParams.get("negozioId") ?? undefined;
  const statoParam = url.searchParams.get("stato") ?? undefined;
  const stato = statoParam === "attive" || statoParam === "disattivate" ? statoParam : undefined;

  const filtri: FiltriOfferte = {};
  if (ricerca) filtri.ricerca = ricerca;
  if (negozioId) filtri.negozioId = negozioId;
  if (stato) filtri.stato = stato;

  const offerte = await getOfferteAdmin(filtri);
  return apiOk({ offerte });
}

/**
 * Creazione di un'offerta dal pannello Amministratore.
 * L'admin sceglie il negozio: il payload richiede negozio_id valido
 * (negozio reale, non cestinato) più i campi dell'offerta. La validazione
 * dei campi è la stessa dei flussi venditore (validaCampiOfferta).
 */
export async function POST(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const negozioId = typeof body.negozio_id === "string" ? body.negozio_id.trim() : "";
  if (!negozioId) {
    return apiError("VALIDATION_ERROR", "Seleziona il negozio dell'offerta.", 422);
  }

  const esito = validaCampiOfferta(body, { parziale: false });
  if (esito.errore) {
    return apiError("VALIDATION_ERROR", esito.errore, 422);
  }

  // Il negozio deve esistere e NON essere cestinato (creazione solo per negozi reali).
  const db = createAdminSupabaseClient();
  const { data: negozio, error: erroreNegozio } = await db
    .from("negozi")
    .select("id, nome")
    .is("deleted_at", null)
    .eq("id", negozioId)
    .maybeSingle();
  if (erroreNegozio || !negozio) {
    return apiError("VALIDATION_ERROR", "Il negozio selezionato non è disponibile.", 422);
  }

  // In POST il titolo è garantito dalla validazione (parziale: false).
  const campi = esito.valore!;
  const risultato = await creaOffertaAdmin({
    negozio_id: negozioId,
    ...campi,
    titolo: campi.titolo as string,
  });
  if (!risultato.ok) {
    return apiError("CREATE_FAILED", risultato.errore, 500);
  }

  const offerta = risultato.data;
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.OFFERTA_CREATA,
    targetType: TARGET_TYPES.OFFERTA,
    targetId: offerta.id,
    targetName: offerta.titolo,
    negozioId: offerta.negozio_id,
    negozioNome: offerta.negozio_nome ?? negozio.nome as string,
    result: "success",
    detail: { azione: "creata dal pannello amministratore" },
  });

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/offerte");
  if (offerta.negozio_slug) revalidatePath(`/negozio/${offerta.negozio_slug}`);

  return apiOk({ offerta }, 201);
}
