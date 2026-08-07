import { apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getEventiAdmin, type FiltriEventi } from "@/lib/eventi";

/** Elenco eventi per il pannello Amministratore (ricerca, filtro negozio, stato). */
export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);
  const ricerca = url.searchParams.get("q") ?? undefined;
  const negozioId = url.searchParams.get("negozioId") ?? undefined;
  const statoParam = url.searchParams.get("stato") ?? undefined;
  const stato =
    statoParam === "attivi" || statoParam === "disattivati" ? statoParam : undefined;

  const filtri: FiltriEventi = {};
  if (ricerca) filtri.ricerca = ricerca;
  if (negozioId) filtri.negozioId = negozioId;
  if (stato) filtri.stato = stato;

  const eventi = await getEventiAdmin(filtri);
  return apiOk({ eventi });
}