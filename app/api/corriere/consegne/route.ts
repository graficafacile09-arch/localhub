import { NextResponse } from "next/server";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET() {
  const gate = await requireApiArea("courier");
  if (!gate.sessione) return gate.error;
  const db = createAdminSupabaseClient();
  const { data, error } = await db.from("corrieri_locali").select("ordine_id,corriere_user_id,stato,latitudine,longitudine,assegnata_at,accettata_at,ritirata_at,in_consegna_at,consegnata_at,problema_at,problema_nota,note_corriere,ordini(numero,negozio_nome,cliente_nome,cliente_cognome,cliente_telefono,spedizione_indirizzo,spedizione_cap,spedizione_citta,spedizione_provincia,spedizione_note,totale,stato_spedizione)").eq("corriere_user_id", gate.sessione.user.id).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Impossibile leggere le consegne." }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(request: Request) {
  const gate = await requireApiArea("courier");
  if (!gate.sessione) return gate.error;
  const body = await request.json().catch(() => null);
  const ordineId = typeof body?.ordineId === "string" ? body.ordineId : "";
  const stato = typeof body?.stato === "string" ? body.stato : "";
  const allowed = ["accettata", "ritirata", "in_consegna", "consegnata", "problema_consegna", "annullata"];
  if (!ordineId || !allowed.includes(stato)) return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  const db = createAdminSupabaseClient();
  const { data: current, error: readError } = await db.from("corrieri_locali").select("ordine_id,corriere_user_id,stato").eq("ordine_id", ordineId).maybeSingle();
  if (readError || !current || current.corriere_user_id !== gate.sessione.user.id) return NextResponse.json({ error: "Consegna non disponibile." }, { status: 404 });
  const transitions: Record<string,string[]> = { assegnata: ["accettata","problema_consegna"], accettata: ["ritirata","problema_consegna"], ritirata: ["in_consegna","problema_consegna"], in_consegna: ["consegnata","problema_consegna"], problema_consegna: ["accettata","annullata"] };
  if (!(transitions[current.stato] ?? []).includes(stato)) return NextResponse.json({ error: "Passaggio di stato non consentito." }, { status: 409 });
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { stato, updated_at: now };
  if (stato === "accettata") patch.accettata_at = now;
  if (stato === "ritirata") patch.ritirata_at = now;
  if (stato === "in_consegna") patch.in_consegna_at = now;
  if (stato === "consegnata") patch.consegnata_at = now;
  if (stato === "problema_consegna") patch.problema_at = now;
  const { error } = await db.from("corrieri_locali").update(patch).eq("ordine_id", ordineId);
  if (error) return NextResponse.json({ error: "Impossibile aggiornare la consegna." }, { status: 500 });

  // Mantiene sincronizzato anche lo stato di spedizione dell'ordine locale.
  const orderShippingState: Record<string, string | null> = {
    accettata: "affidata",
    ritirata: "affidata",
    in_consegna: "in_transito",
    consegnata: "consegnata",
    problema_consegna: "problema",
    annullata: "non_affidata",
  };
  const shippingState = orderShippingState[stato];
  const orderPatch: Record<string, unknown> = { stato_spedizione: shippingState, updated_at: now };
  if (stato === "consegnata") {
    orderPatch.stato = "consegnato";
    orderPatch.consegnata_at = now;
  } else if (stato === "in_consegna") {
    orderPatch.stato = "in_consegna";
  }
  const { error: orderError } = await db.from("ordini").update(orderPatch).eq("id", ordineId);
  if (orderError) return NextResponse.json({ error: "Consegna aggiornata, ma impossibile sincronizzare lo stato dell'ordine." }, { status: 500 });

  return NextResponse.json({ ok: true, stato });
}