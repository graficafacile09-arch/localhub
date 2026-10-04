import { NextResponse } from "next/server";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET() {
  const gate = await requireApiArea("courier");
  if (!gate.sessione) return gate.error;

  const db = createAdminSupabaseClient();
  const userId = gate.sessione.user.id;
  const { data, error } = await db
    .from("corrieri_locali")
    .select("ordine_id,corriere_user_id,stato,latitudine,longitudine,assegnata_at,accettata_at,ritirata_at,in_consegna_at,consegnata_at,problema_at,note_corriere,ordini(numero,negozio_nome,cliente_nome,cliente_cognome,cliente_telefono,spedizione_indirizzo,spedizione_cap,spedizione_citta,spedizione_provincia,spedizione_note,totale,stato,stato_spedizione)")
    .eq("corriere_user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Impossibile leggere le consegne." }, { status: 500 });

  const items = data ?? [];
  const orderIds = items.map((item) => item.ordine_id);

  let unreadByOrder = new Map<string, number>();
  if (orderIds.length) {
    const { data: messages } = await db
      .from("ordine_comunicazioni")
      .select("id,ordine_id,mittente_user_id")
      .in("ordine_id", orderIds);

    const messageIds = (messages ?? []).map((message) => message.id);
    const { data: reads } = messageIds.length
      ? await db.from("ordine_comunicazioni_letture").select("messaggio_id").eq("user_id", userId).in("messaggio_id", messageIds)
      : { data: [] as { messaggio_id: string }[] };

    const readIds = new Set((reads ?? []).map((read) => read.messaggio_id));
    unreadByOrder = new Map();
    for (const message of messages ?? []) {
      if (message.mittente_user_id !== userId && !readIds.has(message.id)) {
        unreadByOrder.set(message.ordine_id, (unreadByOrder.get(message.ordine_id) ?? 0) + 1);
      }
    }
  }

  return NextResponse.json({
    data: items.map((item) => {
      const ordine = Array.isArray(item.ordini) ? item.ordini[0] : item.ordini;
      return {
        ...item,
        // Il frontend del corriere deve sapere quando il venditore ha
        // effettivamente portato l'ordine a "pronto": solo allora il
        // pulsante "Ritira pacco" deve sostituire l'attesa.
        ordine_stato: ordine?.stato ?? null,
        comunicazioni_non_lette: unreadByOrder.get(item.ordine_id) ?? 0,
      };
    }),
  });
}

export async function PATCH(request: Request) {
  const gate = await requireApiArea("courier");
  if (!gate.sessione) return gate.error;

  const body = await request.json().catch(() => null);
  const ordineId = typeof body?.ordineId === "string" ? body.ordineId : "";
  const stato = typeof body?.stato === "string" ? body.stato : "";
  const allowed = ["accettata", "ritirata", "in_consegna", "consegnata", "problema_consegna", "annullata"];
  if (!ordineId || !allowed.includes(stato)) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const db = createAdminSupabaseClient();
  const { data: current, error: readError } = await db
    .from("corrieri_locali")
    .select("ordine_id,corriere_user_id,stato")
    .eq("ordine_id", ordineId)
    .maybeSingle();

  if (readError || !current || current.corriere_user_id !== gate.sessione.user.id) {
    return NextResponse.json({ error: "Consegna non disponibile." }, { status: 404 });
  }

  const { data: ordine, error: ordineError } = await db
    .from("ordini")
    .select("stato")
    .eq("id", ordineId)
    .maybeSingle();

  if (ordineError || !ordine) {
    return NextResponse.json({ error: "Ordine non disponibile." }, { status: 404 });
  }

  const ordineStato = ordine.stato;

  // Il venditore è il solo soggetto che accetta e prepara l'ordine.
  // Il corriere locale può intervenire operativamente solo quando l'ordine
  // è PRONTO: a quel punto ritira il pacco, senza passare da "accettata".
  if (current.stato === "assegnata" && stato === "accettata") {
    return NextResponse.json(
      { error: "Il corriere locale non deve accettare l'ordine. Il venditore deve prima prepararlo e marcarlo come pronto." },
      { status: 409 },
    );
  }

  if (current.stato === "assegnata" && stato === "ritirata" && ordineStato !== "pronto") {
    return NextResponse.json(
      { error: "Il pacco non è ancora pronto. Il venditore deve accettare e preparare l'ordine prima del ritiro." },
      { status: 409 },
    );
  }

  const transitions: Record<string, string[]> = {
    assegnata: ["ritirata", "problema_consegna"],
    accettata: ["ritirata", "problema_consegna"],
    ritirata: ["in_consegna", "problema_consegna"],
    in_consegna: ["consegnata", "problema_consegna"],
    problema_consegna: ["accettata", "annullata"],
  };

  if (!(transitions[current.stato] ?? []).includes(stato)) {
    return NextResponse.json({ error: "Passaggio di stato non consentito." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { stato, updated_at: now };
  if (stato === "accettata") patch.accettata_at = now;
  if (stato === "ritirata") patch.ritirata_at = now;
  if (stato === "in_consegna") patch.in_consegna_at = now;
  if (stato === "consegnata") patch.consegnata_at = now;
  if (stato === "problema_consegna") patch.problema_at = now;

  const { error } = await db.from("corrieri_locali").update(patch).eq("ordine_id", ordineId);
  if (error) return NextResponse.json({ error: "Impossibile aggiornare la consegna." }, { status: 500 });

  const orderShippingState: Record<string, string | null> = {
    accettata: "affidata",
    ritirata: "affidata",
    in_consegna: "in_transito",
    consegnata: "consegnata",
    problema_consegna: "problema",
    annullata: "non_affidata",
  };

  const orderPatch: Record<string, unknown> = {
    stato_spedizione: orderShippingState[stato],
    updated_at: now,
  };
  if (stato === "consegnata") {
    orderPatch.stato = "consegnato";
    orderPatch.consegnata_at = now;
  } else if (stato === "in_consegna") {
    orderPatch.stato = "in_consegna";
  }

  const { error: orderError } = await db.from("ordini").update(orderPatch).eq("id", ordineId);
  if (orderError) {
    return NextResponse.json(
      { error: "Consegna aggiornata, ma impossibile sincronizzare lo stato dell'ordine." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, stato });
}