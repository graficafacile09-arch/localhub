import { hashTokenSessioneRadiciScan, leggiTokenSessioneRadiciScan } from "@/lib/radiscan/sessione-anonima";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function risposta(dati: unknown, status = 200): Response {
  return new Response(JSON.stringify(dati), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      Vary: "Cookie",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  let utenteId: string | null = null;
  try {
    const sessione = await createServerSupabaseClient();
    const { data, error } = await sessione.auth.getUser();
    if (data?.user?.id) {
      utenteId = data.user.id;
    } else if (error) {
      const messaggio = (error.message ?? "").toLowerCase();
      if (!messaggio.includes("session missing") && !messaggio.includes("no session")) {
        return risposta({ success: false, errore: "SESSIONE_NON_VALIDA" }, 401);
      }
    }
  } catch {
    return risposta({ success: false, errore: "IDENTITA_NON_DISPONIBILE" }, 503);
  }

  const admin = createAdminSupabaseClient();
  let query = admin
    .from("radiscan_analisi")
    .select("id, creato_il, livello, denominazione_verificata, esito, provider, modello")
    .order("creato_il", { ascending: false })
    .limit(25);

  if (utenteId) {
    query = query.eq("modalita", "autenticato").eq("utente_id", utenteId);
  } else {
    const token = leggiTokenSessioneRadiciScan(request);
    if (!token) return risposta({ success: true, analisi: [] });
    query = query
      .eq("modalita", "anonimo")
      .eq("sessione_anonima_hash", hashTokenSessioneRadiciScan(token));
  }

  const { data, error } = await query;
  if (error) return risposta({ success: false, errore: "STORICO_NON_DISPONIBILE" }, 503);
  return risposta({ success: true, analisi: data ?? [] });
}
