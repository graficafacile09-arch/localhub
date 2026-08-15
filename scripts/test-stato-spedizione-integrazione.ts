/**
 * Test INTEGRAZIONE — STATO SPEDIZIONE + TRACKING (RPC aggiorna_stato_spedizione).
 *
 * Crea negozio + ordini TEMPORANEI (spedizione, ritiro, cancellato), verifica
 * la RPC end-to-end (transizioni, tracking obbligatorio, ownership, storico
 * eventi), poi pulisce tutto (self-cleaning).
 *
 * Uso: npx tsx scripts/test-stato-spedizione-integrazione.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

try {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!URL || !KEY) {
  console.error("Manca NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  process.exit(2);
}

const db = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passati = 0;
let falliti = 0;
function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

function rpcSpedizione(
  ordineId: string,
  stato: string,
  opts: {
    trackingCode?: string | null;
    trackingUrl?: string | null;
    consegnaStimata?: string | null;
    merchantUserId?: string | null;
  } = {}
) {
  return db.rpc("aggiorna_stato_spedizione", {
    p_ordine_id: ordineId,
    p_nuovo_stato: stato,
    p_tracking_code: opts.trackingCode ?? null,
    p_tracking_url: opts.trackingUrl ?? null,
    p_consegna_stimata: opts.consegnaStimata ?? null,
    p_merchant_user_id: opts.merchantUserId ?? null,
  });
}

async function main() {
  const ts = Date.now();
  let userId = "";
  let negozioId = "";
  const ordiniCreati: string[] = [];

  try {
    // ── Setup: utente temporaneo (owner) + negozio ────────────────────────
    const { data: u, error: uErr } = await db.auth.admin.createUser({
      email: `sped-stato-${ts}@example.com`,
      password: "TestPass123!",
      email_confirm: true,
    });
    if (uErr || !u.user) throw new Error("createUser fallito: " + (uErr?.message ?? "no user"));
    userId = u.user.id;

    const { data: n, error: nErr } = await db
      .from("negozi")
      .insert({ nome: `SpedStato-${ts}`, slug: `sped-stato-${ts}`, attivo: true, is_demo: true, owner_user_id: userId })
      .select("id")
      .single();
    if (nErr || !n) throw new Error("Setup negozio fallito: " + (nErr?.message ?? "no data"));
    negozioId = String(n.id);

    async function creaOrdine(stato: string, modalita: "ritiro" | "spedizione", key: string): Promise<string> {
      const { data: o, error: oErr } = await db
        .from("ordini")
        .insert({
          idempotency_key: key,
          modalita,
          stato,
          totale: 10,
          negozio_id: negozioId,
          negozio_nome: "SpedStato",
          cliente_nome: "Test",
          cliente_cognome: "Integrazione",
          cliente_user_id: userId,
        })
        .select("id")
        .single();
      if (oErr || !o) throw new Error("Setup ordine fallito: " + (oErr?.message ?? "no data"));
      ordiniCreati.push(String(o.id));
      return String(o.id);
    }

    const ordineSped = await creaOrdine("pronto", "spedizione", `sped-${ts}-1`);
    const ordineSped2 = await creaOrdine("pronto", "spedizione", `sped-${ts}-2`);
    const ordineRitiro = await creaOrdine("pronto", "ritiro", `sped-${ts}-3`);
    const ordineCancellato = await creaOrdine("cancellato", "spedizione", `sped-${ts}-4`);

    // ── A) affida SENZA tracking → KO ─────────────────────────────────────
    const a = await rpcSpedizione(ordineSped, "affidata", { merchantUserId: userId });
    check("A) affida senza tracking → TRACKING_OBBLIGATORIO", a?.data?.codice === "TRACKING_OBBLIGATORIO", a?.data);

    // ── B) affida con tracking → OK, affidata_at valorizzato ───────────────
    const b = await rpcSpedizione(ordineSped, "affidata", { merchantUserId: userId, trackingCode: "TRK123" });
    check("B) affida con tracking → ok", b?.data?.ok === true, b?.data);
    const statoB = await db.from("ordini").select("stato_spedizione, affidata_at, tracking_code").eq("id", ordineSped).single();
    check("B) stato_spedizione = affidata", statoB.data?.stato_spedizione === "affidata", statoB.data);
    check("B) affidata_at valorizzato", Boolean(statoB.data?.affidata_at));
    check("B) tracking_code salvato", statoB.data?.tracking_code === "TRK123");

    // ── C) affidata → in_transito → OK ─────────────────────────────────────
    const c = await rpcSpedizione(ordineSped, "in_transito", { merchantUserId: userId });
    check("C) in_transito → ok", c?.data?.ok === true, c?.data);

    // ── D) in_transito → consegnata → OK, consegnata_at valorizzato ────────
    const d = await rpcSpedizione(ordineSped, "consegnata", { merchantUserId: userId });
    check("D) consegnata → ok", d?.data?.ok === true, d?.data);
    const statoD = await db.from("ordini").select("stato_spedizione, consegnata_at").eq("id", ordineSped).single();
    check("D) consegnata_at valorizzato", Boolean(statoD.data?.consegnata_at));

    // ── E) transizione saltata (NULL → consegnata) → KO ────────────────────
    const e = await rpcSpedizione(ordineSped2, "consegnata", { merchantUserId: userId });
    check("E) salto NULL→consegnata → TRANSIZIONE_NON_CONSENTITA", e?.data?.codice === "TRANSIZIONE_NON_CONSENTITA", e?.data);

    // ── F) affidata → problema → affidata (riassegna) ──────────────────────
    await rpcSpedizione(ordineSped2, "affidata", { merchantUserId: userId, trackingCode: "TRK456" });
    const f1 = await rpcSpedizione(ordineSped2, "problema", { merchantUserId: userId });
    check("F) affidata→problema → ok", f1?.data?.ok === true, f1?.data);
    const f2 = await rpcSpedizione(ordineSped2, "affidata", { merchantUserId: userId, trackingCode: "TRK789" });
    check("F) problema→affidata (riassegna) → ok", f2?.data?.ok === true, f2?.data);

    // ── G) ordine cancellato → KO ──────────────────────────────────────────
    const g = await rpcSpedizione(ordineCancellato, "affidata", { merchantUserId: userId, trackingCode: "TRK" });
    check("G) ordine cancellato → ORDINE_CANCELLATO", g?.data?.codice === "ORDINE_CANCELLATO", g?.data);

    // ── H) modalita ritiro → KO ────────────────────────────────────────────
    const h = await rpcSpedizione(ordineRitiro, "affidata", { merchantUserId: userId, trackingCode: "TRK" });
    check("H) ritiro → MODALITA_NON_SPEDIZIONE", h?.data?.codice === "MODALITA_NON_SPEDIZIONE", h?.data);

    // ── I) ownership: merchant non proprietario → KO ───────────────────────
    const i = await rpcSpedizione(ordineSped2, "in_transito", {
      merchantUserId: "00000000-0000-0000-0000-000000000000",
    });
    check("I) merchant non proprietario → FORBIDDEN", i?.data?.codice === "FORBIDDEN", i?.data);

    // ── J) tracking URL invalido → KO ──────────────────────────────────────
    const j = await rpcSpedizione(ordineSped2, "in_transito", {
      merchantUserId: userId,
      trackingUrl: "non-un-url",
    });
    check("J) tracking URL invalido → TRACKING_URL_NON_VALIDA", j?.data?.codice === "TRACKING_URL_NON_VALIDA", j?.data);

    // ── K) storico eventi: il trigger registra gli eventi spedizione ───────
    const { data: eventi } = await db.from("ordini_eventi").select("evento").eq("ordine_id", ordineSped);
    const codici = (eventi ?? []).map((ev) => String(ev.evento));
    check("K) evento spedizione_affidata registrato", codici.includes("spedizione_affidata"), codici);
    check("K) evento spedizione_in_transito registrato", codici.includes("spedizione_in_transito"), codici);
    check("K) evento spedizione_consegnata registrato", codici.includes("spedizione_consegnata"), codici);
  } catch (err) {
    falliti++;
    console.error("  ❌ ERRORE nel test:", err instanceof Error ? err.message : String(err));
  } finally {
    // ── Cleanup (self-cleaning) ───────────────────────────────────────────
    if (ordiniCreati.length > 0) {
      await db.from("ordini_eventi").delete().in("ordine_id", ordiniCreati);
      await db.from("ordini").delete().in("id", ordiniCreati);
    }
    if (negozioId) {
      await db.from("negozi").delete().eq("id", negozioId);
    }
    if (userId) {
      await db.auth.admin.deleteUser(userId).catch(() => {});
    }
  }

  console.log(`\nTest integrazione stato spedizione: ${passati} passati, ${falliti} falliti.`);
  if (falliti > 0) process.exit(1);
}

main();
