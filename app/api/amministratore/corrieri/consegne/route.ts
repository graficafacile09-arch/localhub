import { NextResponse } from "next/server";
import { getSessionArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/api/response";

async function requireAdmin() {
  const sessione = await getSessionArea();
  if (!sessione || sessione.area !== "admin") return null;
  return sessione;
}

export async function GET() {
  const sessione = await requireAdmin();
  if (!sessione) return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const [{ data: couriers, error: courierError }, { data: localRows, error: localError }, { data: users, error: usersError }] =
    await Promise.all([
      admin.from("user_roles").select("user_id").eq("role", "courier"),
      admin.from("corrieri_locali").select("ordine_id,corriere_user_id,stato,latitudine,longitudine,assegnata_at,accettata_at,ritirata_at,in_consegna_at,consegnata_at,problema_at,problema_nota,note_corriere").order("updated_at", { ascending: false }),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  if (courierError || localError || usersError) {
    return NextResponse.json({ error: "Impossibile leggere le consegne locali." }, { status: 500 });
  }

  const courierIds = new Set((couriers ?? []).map((row) => row.user_id));
  const approvedRows = await admin
    .from("account_approvazioni")
    .select("user_id")
    .eq("stato", "approved")
    .in("user_id", [...courierIds]);

  if (approvedRows.error) return NextResponse.json({ error: "Impossibile leggere i corrieri approvati." }, { status: 500 });

  const approvedIds = new Set((approvedRows.data ?? []).map((row) => row.user_id));
  const userMap = new Map((users?.users ?? []).map((user) => [user.id, user]));

  const orderIds = (localRows ?? []).map((row) => row.ordine_id);
  const { data: orders, error: orderError } = orderIds.length
    ? await admin
        .from("ordini")
        .select("id,numero,stato,stato_spedizione,cliente_nome,cliente_cognome,cliente_telefono,spedizione_indirizzo,spedizione_cap,spedizione_citta,spedizione_provincia,spedizione_note,spedizione_carrier,spedizione_servizio,negozio_nome")
        .in("id", orderIds)
    : { data: [], error: null };

  if (orderError) return NextResponse.json({ error: "Impossibile leggere gli ordini." }, { status: 500 });

  const orderMap = new Map((orders ?? []).map((order) => [order.id, order]));
  const data = (localRows ?? [])
    .map((row) => ({
      ...row,
      ordine: orderMap.get(row.ordine_id) ?? null,
      corriere: row.corriere_user_id
        ? {
            userId: row.corriere_user_id,
            nome: userMap.get(row.corriere_user_id)?.user_metadata?.nome ?? "",
            cognome: userMap.get(row.corriere_user_id)?.user_metadata?.cognome ?? "",
            email: userMap.get(row.corriere_user_id)?.email ?? "",
          }
        : null,
    }))
    .filter((row) => row.ordine?.spedizione_carrier === "locale" && row.ordine?.spedizione_servizio === "locale");

  const corrieriApprovati = [...approvedIds].map((userId) => ({
    userId,
    nome: userMap.get(userId)?.user_metadata?.nome ?? "",
    cognome: userMap.get(userId)?.user_metadata?.cognome ?? "",
    email: userMap.get(userId)?.email ?? "",
  }));

  return NextResponse.json({ data, corrieri: corrieriApprovati });
}

export async function PATCH(request: Request) {
  const sessione = await requireAdmin();
  if (!sessione) return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const ordineId = typeof body?.ordineId === "string" ? body.ordineId : "";
  const corriereUserId =
    body?.corriereUserId === null || body?.corriereUserId === ""
      ? null
      : typeof body?.corriereUserId === "string"
        ? body.corriereUserId
        : "";

  if (!ordineId) return NextResponse.json({ error: "Ordine non valido." }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from("ordini")
    .select("id,modalita,spedizione_carrier,spedizione_servizio,stato")
    .eq("id", ordineId)
    .maybeSingle();

  if (!order || order.modalita !== "spedizione" || order.spedizione_carrier !== "locale" || order.spedizione_servizio !== "locale") {
    return NextResponse.json({ error: "L'ordine non appartiene al corriere locale." }, { status: 404 });
  }

  const { data: delivery } = await admin
    .from("corrieri_locali")
    .select("stato")
    .eq("ordine_id", ordineId)
    .maybeSingle();
  if (delivery && ["consegnata", "annullata"].includes(delivery.stato)) {
    return NextResponse.json({ error: "La consegna è in uno stato finale e non può essere riassegnata." }, { status: 409 });
  }

  if (corriereUserId && order.stato !== "pronto") {
    return apiError(
      "ORDER_NOT_READY",
      "Il corriere può essere affidato solo quando il venditore ha segnato l'ordine come pronto.",
      409,
    );
  }

  if (corriereUserId) {
    const { data: role } = await admin.from("user_roles").select("user_id").eq("user_id", corriereUserId).eq("role", "courier").maybeSingle();
    const { data: approval } = await admin.from("account_approvazioni").select("user_id").eq("user_id", corriereUserId).eq("stato", "approved").maybeSingle();
    if (!role || !approval) return NextResponse.json({ error: "Il corriere non è approvato." }, { status: 422 });
  }

  const now = new Date().toISOString();
  const payload = corriereUserId
    ? { corriere_user_id: corriereUserId, stato: "assegnata", assegnata_at: now, updated_at: now }
    : { corriere_user_id: null, stato: "da_assegnare", assegnata_at: null, updated_at: now };

  const { error } = await admin.from("corrieri_locali").upsert({ ordine_id: ordineId, ...payload }, { onConflict: "ordine_id" });
  if (error) return NextResponse.json({ error: "Impossibile aggiornare l'assegnazione." }, { status: 500 });

  const { error: orderError } = await admin
    .from("ordini")
    .update({ stato_spedizione: corriereUserId ? "affidata" : "non_affidata", updated_at: now })
    .eq("id", ordineId);
  if (orderError) return NextResponse.json({ error: "Assegnazione aggiornata, ma impossibile sincronizzare lo stato della spedizione." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
