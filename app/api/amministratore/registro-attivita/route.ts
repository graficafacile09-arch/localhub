import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  getAttivitaAdmin,
  contaAttivitaAdmin,
  getAttivitaStats,
  type AdminActivityFiltri,
  type AdminActivityLog,
  type AdminActivityStats,
} from "@/lib/amministratore/activity-log";

const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);

  const filtri: AdminActivityFiltri = {};

  const ricerca = url.searchParams.get("q");
  if (ricerca?.trim()) filtri.ricerca = ricerca.trim();

  const operationType = url.searchParams.get("operationType");
  if (operationType) filtri.operationType = operationType;

  const targetType = url.searchParams.get("targetType");
  if (targetType) filtri.targetType = targetType;

  const negozioId = url.searchParams.get("negozioId");
  if (negozioId) filtri.negozioId = negozioId;

  const dataDa = url.searchParams.get("dataDa");
  if (dataDa) filtri.dataDa = dataDa;

  const dataA = url.searchParams.get("dataA");
  if (dataA) filtri.dataA = dataA;

  const result = url.searchParams.get("result");
  if (result === "success" || result === "error") filtri.result = result;

  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), MAX_LIMIT);
  filtri.limit = limit;

  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
  filtri.offset = offset;

  const [attivita, totale, stats] = await Promise.all([
    getAttivitaAdmin(filtri),
    contaAttivitaAdmin(filtri),
    getAttivitaStats(),
  ]);

  return apiOk({
    attivita,
    totale,
    limit,
    offset,
    hasMore: offset + attivita.length < totale,
    stats,
  });
}