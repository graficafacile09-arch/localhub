import { NextResponse } from "next/server";
import { getSessionArea } from "@/lib/auth/session-area";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(_: Request, context: { params: Promise<{ ordineId: string }> }) {
  const sessione = await getSessionArea();
  if (!sessione) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const { ordineId } = await context.params;
  const db = createAdminSupabaseClient();

  const { data: ordine, error } = await db
    .from("ordini")
    .select("id,numero,negozio_id,cliente_user_id,modalita,spedizione_carrier,spedizione_servizio,stato_spedizione,affidata_at,consegnata_at")
    .eq("id", ordineId)
    .maybeSingle();

  if (error || !ordine) return NextResponse.json({ error: "Ordine non trovato." }, { status: 404 });
  if (ordine.modalita !== "spedizione" || ordine.spedizione_carrier !== "locale" || ordine.spedizione_servizio !== "locale") {
    return NextResponse.json({ error: "Il monitoraggio è disponibile per le consegne locali." }, { status: 422 });
  }

  if (sessione.area === "cliente") {
    if (ordine.cliente_user_id !== sessione.user.id) {
      return NextResponse.json({ error: "Non puoi vedere questo ordine." }, { status: 403 });
    }
  } else if (sessione.area === "merchant") {
    const store = await getMerchantStoreForUser(sessione.user.id, ordine.negozio_id);
    if (!store.data) return NextResponse.json({ error: "Non puoi vedere questo ordine." }, { status: 403 });
  } else if (sessione.area === "courier") {
    const { data: consegna } = await db
      .from("corrieri_locali")
      .select("corriere_user_id,stato")
      .eq("ordine_id", ordineId)
      .maybeSingle();
    if (consegna?.corriere_user_id !== sessione.user.id) {
      return NextResponse.json({ error: "Questa consegna non è assegnata al tuo profilo." }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Area non autorizzata." }, { status: 403 });
  }

  return NextResponse.json({
    data: {
      ordineId: ordine.id,
      numero: ordine.numero,
      statoSpedizione: ordine.stato_spedizione,
      affidataAt: ordine.affidata_at,
      consegnataAt: ordine.consegnata_at,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
