import { apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getOfferteAdmin, type FiltriOfferte } from "@/lib/offerte";

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