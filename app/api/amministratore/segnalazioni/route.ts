import { apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  getSegnalazioniAdmin,
  contaSegnalazioniAdmin,
  getSegnalazioniStats,
  type SegnalazioneFiltri,
} from "@/lib/segnalazioni";

const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);

  const filtri: SegnalazioneFiltri = {};

  const ricerca = url.searchParams.get("q");
  if (ricerca?.trim()) filtri.ricerca = ricerca.trim();

  const stato = url.searchParams.get("stato");
  if (stato) filtri.stato = stato as SegnalazioneFiltri["stato"];

  const priorita = url.searchParams.get("priorita");
  if (priorita) filtri.priorita = priorita as SegnalazioneFiltri["priorita"];

  const tipo = url.searchParams.get("tipo");
  if (tipo) filtri.tipo = tipo as SegnalazioneFiltri["tipo"];

  const targetType = url.searchParams.get("targetType");
  if (targetType) filtri.targetType = targetType as SegnalazioneFiltri["targetType"];

  const negozioId = url.searchParams.get("negozioId");
  if (negozioId) filtri.negozioId = negozioId;

  const userId = url.searchParams.get("userId");
  if (userId) filtri.userId = userId;

  const dataDa = url.searchParams.get("dataDa");
  if (dataDa) filtri.dataDa = dataDa;

  const dataA = url.searchParams.get("dataA");
  if (dataA) filtri.dataA = dataA;

  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), MAX_LIMIT);
  filtri.limit = limit;

  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
  filtri.offset = offset;

  const orderBy = url.searchParams.get("orderBy");
  if (orderBy === "priorita" || orderBy === "created_at") filtri.orderBy = orderBy;

  const orderDirection = url.searchParams.get("orderDirection");
  if (orderDirection === "asc" || orderDirection === "desc") filtri.orderDirection = orderDirection;

  const [segnalazioni, totale, stats] = await Promise.all([
    getSegnalazioniAdmin(filtri),
    contaSegnalazioniAdmin(filtri),
    getSegnalazioniStats(),
  ]);

  return apiOk({
    segnalazioni,
    totale,
    limit,
    offset,
    hasMore: offset + segnalazioni.length < totale,
    stats,
  });
}