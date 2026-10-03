import { NextResponse } from "next/server";
import { getSessionArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const sessione = await getSessionArea();
  if (!sessione || sessione.area !== "admin") return null;
  return sessione;
}

export async function GET() {
  const sessione = await requireAdmin();
  if (!sessione) return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const [{ data: approvals, error: approvalsError }, { data: users, error: usersError }] =
    await Promise.all([
      admin.from("account_approvazioni").select("user_id,stato,richiesto_il,deciso_il,motivo").order("richiesto_il", { ascending: false }),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  if (approvalsError || usersError) {
    return NextResponse.json({ error: "Impossibile leggere le richieste." }, { status: 500 });
  }

  const userMap = new Map(users.users.map((user) => [user.id, user]));
  const { data: roles } = await admin.from("user_roles").select("user_id,role").eq("role", "courier");
  const courierIds = new Set((roles ?? []).map((row) => row.user_id));

  const data = (approvals ?? [])
    .filter((row) => courierIds.has(row.user_id))
    .map((row) => {
      const user = userMap.get(row.user_id);
      return {
        ...row,
        email: user?.email ?? "",
        nome: user?.user_metadata?.nome ?? "",
        cognome: user?.user_metadata?.cognome ?? "",
        telefono: user?.user_metadata?.telefono ?? "",
      };
    });

  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const sessione = await requireAdmin();
  if (!sessione) return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const stato = body?.stato === "approved" || body?.stato === "rejected" ? body.stato : "";
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 500) : null;

  if (!userId || !stato) return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data: role } = await admin.from("user_roles").select("user_id").eq("user_id", userId).eq("role", "courier").maybeSingle();
  if (!role) return NextResponse.json({ error: "Account corriere non trovato." }, { status: 404 });

  const { error } = await admin.from("account_approvazioni").update({
    stato,
    deciso_il: new Date().toISOString(),
    deciso_da: sessione.user.id,
    motivo: motivo || null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  if (error) return NextResponse.json({ error: "Impossibile aggiornare l'approvazione." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
