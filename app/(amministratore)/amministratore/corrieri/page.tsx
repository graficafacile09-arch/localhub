import { redirect } from "next/navigation";
import CorrieriApprovazioni from "@/components/amministratore/CorrieriApprovazioni";
import { getSessionArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function CorrieriPage() {
  const sessione = await getSessionArea();
  if (!sessione || sessione.area !== "admin") redirect("/login?area=admin");

  const admin = createAdminSupabaseClient();
  const [{ data: approvals }, { data: roles }] = await Promise.all([
    admin.from("account_approvazioni").select("user_id,stato,richiesto_il,deciso_il,motivo").order("richiesto_il", { ascending: false }),
    admin.from("user_roles").select("user_id").eq("role", "courier"),
  ]);

  const ids = new Set((roles ?? []).map((row) => row.user_id));
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const userMap = new Map(users.users.map((user) => [user.id, user]));

  const iniziali = (approvals ?? []).filter((row) => ids.has(row.user_id)).map((row) => {
    const user = userMap.get(row.user_id);
    return {
      ...row,
      email: user?.email ?? "",
      nome: user?.user_metadata?.nome ?? "",
      cognome: user?.user_metadata?.cognome ?? "",
      telefono: user?.user_metadata?.telefono ?? "",
    };
  });

  return <CorrieriApprovazioni iniziali={iniziali} />;
}
